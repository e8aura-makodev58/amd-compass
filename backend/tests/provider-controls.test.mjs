import test from "node:test";
import assert from "node:assert/strict";
import {
  createProviderControls,
  parseRetryAfter,
  providerControlsFor,
  readProviderControlSettings,
} from "../src/provider-controls.mjs";
import { callChatCompletion } from "../src/model-provider.mjs";

const flush = () => new Promise((resolve) => setImmediate(resolve));

// Fake monotonic clock and timers; advance() fires due timers in order.
function fakeClock() {
  let time = 0;
  const timers = [];
  return {
    now: () => time,
    setTimer: (fn, ms) => {
      const handle = { at: time + ms, fn };
      timers.push(handle);
      return handle;
    },
    clearTimer: (handle) => {
      const index = timers.indexOf(handle);
      if (index >= 0) timers.splice(index, 1);
    },
    async advance(ms) {
      const end = time + ms;
      await flush();
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (!next || next.at > end) break;
        timers.shift();
        time = next.at;
        next.fn();
        await flush();
      }
      time = end;
      await flush();
    },
  };
}

function controlsWith(settings, clock = fakeClock()) {
  return { clock, controls: createProviderControls(settings, { now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, random: () => 0 }) };
}

const httpError = (status, extra = {}) => Object.assign(new Error(`HTTP ${status}`), { status, serviceFailure: status === 429 || status >= 500, ...extra });

function scripted(...steps) {
  const attempt = async () => {
    attempt.calls += 1;
    const step = steps[Math.min(attempt.calls, steps.length) - 1];
    if (step instanceof Error) throw step;
    return step;
  };
  attempt.calls = 0;
  return attempt;
}

test("parseRetryAfter reads delta-seconds and HTTP dates", () => {
  assert.equal(parseRetryAfter("1"), 1000);
  assert.equal(parseRetryAfter("0.5"), 500);
  assert.equal(parseRetryAfter("Thu, 01 Jan 1970 00:01:00 GMT", 30_000), 30_000);
  assert.equal(parseRetryAfter("Thu, 01 Jan 1970 00:00:00 GMT", 30_000), 0);
  assert.equal(parseRetryAfter("soon"), null);
  assert.equal(parseRetryAfter(null), null);
});

test("settings come from the environment with cautious defaults", () => {
  assert.deepEqual(readProviderControlSettings({}), { rpm: 10, concurrency: 2, maxRetries: 2, breakerThreshold: 5, breakerCooldownMs: 60_000, maxQueue: 32 });
  const custom = readProviderControlSettings({
    AMD_TOKEN_FACTORY_APP_RPM: "20",
    AMD_TOKEN_FACTORY_APP_CONCURRENCY: "4",
    AMD_TOKEN_FACTORY_MAX_RETRIES: "0",
    AMD_TOKEN_FACTORY_BREAKER_THRESHOLD: "3",
    AMD_TOKEN_FACTORY_BREAKER_COOLDOWN_MS: "5000",
  });
  assert.deepEqual(custom, { rpm: 20, concurrency: 4, maxRetries: 0, breakerThreshold: 3, breakerCooldownMs: 5000, maxQueue: 32 });
  assert.equal(readProviderControlSettings({ AMD_TOKEN_FACTORY_APP_RPM: "-1" }).rpm, 10);
});

test("a 429 is retried after Retry-After when the wait fits the deadline", async () => {
  const { clock, controls } = controlsWith({});
  const attempt = scripted(httpError(429, { retryAfterMs: 1000 }), "ok");
  const run = controls.run(10_000, attempt);
  await clock.advance(999);
  assert.equal(attempt.calls, 1);
  await clock.advance(1);
  assert.equal(await run, "ok");
  assert.equal(attempt.calls, 2);
});

test("a 429 whose Retry-After exceeds the deadline fails at once", async () => {
  const { controls } = controlsWith({});
  const attempt = scripted(httpError(429, { retryAfterMs: 60_000 }), "ok");
  await assert.rejects(controls.run(30_000, attempt), { status: 429 });
  assert.equal(attempt.calls, 1);
});

test("a 429 without Retry-After backs off exponentially", async () => {
  const { clock, controls } = controlsWith({});
  const attempt = scripted(httpError(429), httpError(429), "ok");
  const run = controls.run(60_000, attempt);
  await clock.advance(499);
  assert.equal(attempt.calls, 1);
  await clock.advance(1);
  assert.equal(attempt.calls, 2);
  await clock.advance(999);
  assert.equal(attempt.calls, 2);
  await clock.advance(1);
  assert.equal(await run, "ok");
  assert.equal(attempt.calls, 3);
});

test("the retry budget bounds repeated 429s", async () => {
  const { clock, controls } = controlsWith({ maxRetries: 2 });
  const attempt = scripted(httpError(429, { retryAfterMs: 10 }));
  const run = controls.run(60_000, attempt);
  const settled = assert.rejects(run, { status: 429 });
  await clock.advance(100);
  await settled;
  assert.equal(attempt.calls, 3);
});

test("502, 503, network errors and other 4xx are never retried", async () => {
  for (const error of [httpError(502), httpError(503), httpError(400), httpError(401), httpError(403), httpError(404), httpError(422), Object.assign(new TypeError("fetch failed"), { serviceFailure: true })]) {
    const { controls } = controlsWith({});
    const attempt = scripted(error, "ok");
    await assert.rejects(controls.run(60_000, attempt));
    assert.equal(attempt.calls, 1, error.message);
  }
});

test("the limiter caps concurrency and starts queued requests as slots free", async () => {
  const { clock, controls } = controlsWith({ concurrency: 1 });
  let finishFirst;
  const first = controls.run(60_000, () => new Promise((resolve) => { finishFirst = resolve; }));
  const second = scripted("second");
  const queued = controls.run(60_000, second);
  await clock.advance(0);
  assert.equal(second.calls, 0);
  assert.equal(controls.snapshot().queued, 1);
  finishFirst("first");
  assert.equal(await first, "first");
  assert.equal(await queued, "second");
  assert.equal(second.calls, 1);
});

test("the limiter enforces requests per minute and the caller's deadline", async () => {
  const { clock, controls } = controlsWith({ rpm: 2, concurrency: 5 });
  assert.equal(await controls.run(120_000, scripted("a")), "a");
  assert.equal(await controls.run(120_000, scripted("b")), "b");

  const late = scripted("too late");
  const missed = assert.rejects(controls.run(clock.now() + 10_000, late), { name: "AbortError", code: "deadline" });
  const third = scripted("c");
  const waiting = controls.run(120_000, third);
  await clock.advance(10_000);
  await missed;
  assert.equal(late.calls, 0);
  assert.equal(third.calls, 0);
  await clock.advance(50_000);
  assert.equal(await waiting, "c");
});

test("a full wait queue fails fast", async () => {
  const { clock, controls } = controlsWith({ concurrency: 1, maxQueue: 1 });
  let finish;
  const busy = controls.run(60_000, () => new Promise((resolve) => { finish = resolve; }));
  const queued = controls.run(60_000, scripted("queued"));
  await clock.advance(0);
  const rejected = scripted("never");
  await assert.rejects(controls.run(60_000, rejected), { code: "queue-full" });
  assert.equal(rejected.calls, 0);
  finish("done");
  await busy;
  assert.equal(await queued, "queued");
});

test("the breaker opens, fails fast, probes once when half-open, then closes", async () => {
  const { clock, controls } = controlsWith({ breakerThreshold: 2, breakerCooldownMs: 1000 });
  await assert.rejects(controls.run(60_000, scripted(httpError(502))));
  await assert.rejects(controls.run(60_000, scripted(httpError(503))));
  assert.equal(controls.snapshot().state, "open");

  const blocked = scripted("blocked");
  await assert.rejects(controls.run(60_000, blocked), { code: "circuit-open" });
  assert.equal(blocked.calls, 0);

  await clock.advance(1000);
  let finishProbe;
  const probe = controls.run(60_000, () => new Promise((resolve) => { finishProbe = resolve; }));
  await clock.advance(0);
  const duringProbe = scripted("during");
  await assert.rejects(controls.run(60_000, duringProbe), { code: "circuit-open" });
  assert.equal(duringProbe.calls, 0);
  finishProbe("probe ok");
  assert.equal(await probe, "probe ok");
  assert.equal(controls.snapshot().state, "closed");
  assert.equal(await controls.run(60_000, scripted("normal")), "normal");
});

test("a failed half-open probe reopens the breaker", async () => {
  const { clock, controls } = controlsWith({ breakerThreshold: 1, breakerCooldownMs: 1000 });
  await assert.rejects(controls.run(60_000, scripted(httpError(502))));
  await clock.advance(1000);
  await assert.rejects(controls.run(60_000, scripted(httpError(502))), { status: 502 });
  assert.equal(controls.snapshot().state, "open");
  await assert.rejects(controls.run(60_000, scripted("x")), { code: "circuit-open" });
});

test("only service failures count toward the breaker", async () => {
  const { controls } = controlsWith({ breakerThreshold: 2, rpm: 100 });
  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(controls.run(60_000, scripted(httpError(400))));
    await assert.rejects(controls.run(60_000, scripted(Object.assign(new SyntaxError("bad json"), { serviceFailure: false }))));
  }
  assert.equal(controls.snapshot().state, "closed");
  await assert.rejects(controls.run(60_000, scripted(httpError(502))));
  assert.equal(await controls.run(60_000, scripted("ok")), "ok");
  await assert.rejects(controls.run(60_000, scripted(httpError(502))));
  assert.equal(controls.snapshot().state, "closed", "a success resets the consecutive count");
});

const baseCall = {
  modelId: "test-model",
  apiKey: "rc-test",
  timeoutMs: 5000,
  systemInstruction: "x",
  userContent: "{}",
  jsonSchemaName: "s",
  jsonSchema: {},
  errorLabel: "Test provider",
};

const response = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  text: async () => body,
  json: async () => JSON.parse(body),
});

test("callChatCompletion retries an AMD 429 that carries Retry-After", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return calls === 1
      ? response(429, JSON.stringify({ error: { message: "Model is at its concurrency limit" } }), { "retry-after": "0" })
      : response(200, JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "{\"ok\":true}" } }] }));
  };
  assert.deepEqual(await callChatCompletion({ ...baseCall, fetchImpl }), { ok: true });
  assert.equal(calls, 2);
});

test("callChatCompletion does not retry a 502 and reports it", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return response(502, "Bad gateway"); };
  await assert.rejects(callChatCompletion({ ...baseCall, fetchImpl }), { status: 502, message: /HTTP 502/ });
  assert.equal(calls, 1);
});

test("callChatCompletion fails fast with a clear reason while the breaker is open", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return response(503, "Service unavailable"); };
  for (let i = 0; i < 5; i += 1) await assert.rejects(callChatCompletion({ ...baseCall, fetchImpl }), { status: 503 });
  await assert.rejects(callChatCompletion({ ...baseCall, fetchImpl }), { code: "circuit-open", message: /^Test provider: AMD circuit breaker is open/ });
  assert.equal(calls, 5);
});

test("the real fetch transport shares one set of controls; injected transports are isolated", () => {
  assert.equal(providerControlsFor(globalThis.fetch), providerControlsFor(globalThis.fetch));
  const fakeA = async () => {};
  const fakeB = async () => {};
  assert.notEqual(providerControlsFor(fakeA), providerControlsFor(fakeB));
  assert.notEqual(providerControlsFor(fakeA), providerControlsFor(globalThis.fetch));
});
