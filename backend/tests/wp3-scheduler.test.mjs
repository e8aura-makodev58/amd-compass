import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLiveStore } from "../src/live-store.mjs";
import { createScheduler, schedulerCadenceByScenario } from "../src/scheduler.mjs";
import { createSimulationClock } from "../src/simulation-clock.mjs";

async function createFixture(handlers = {}) {
  const directory = await mkdtemp(join(tmpdir(), "compass-scheduler-"));
  const filePath = join(directory, "live.json");
  const store = createLiveStore({ filePath });
  return { filePath, store, scheduler: createScheduler(store, handlers), clock: createSimulationClock(store) };
}

test("scheduler emits no event before due time and exactly one at the persisted due time", async () => {
  const fired = [];
  const { store, scheduler, clock } = await createFixture({ onEventDue: async (trigger) => fired.push(trigger) });
  await clock.start();
  assert.equal((await scheduler.tick(14 * 60_000)).result.eventStatus, "NOT_DUE");
  assert.equal(fired.length, 0);
  const due = await scheduler.tick(60_000);
  assert.equal(due.result.eventStatus, "TRIGGERED");
  assert.deepEqual(fired.map((trigger) => trigger.token), ["due-1"]);
  await scheduler.tick(0);
  assert.equal(fired.length, 1);
  const state = await store.snapshot();
  assert.equal(state.simulationState.dueEventToken, "due-2");
  assert.ok(Date.parse(state.simulationState.nextEventAt) > Date.parse(state.simulationState.simulationTime));
});

test("speed changes do not duplicate a pending event", async () => {
  const fired = [];
  const { scheduler, clock } = await createFixture({ onEventDue: async (trigger) => fired.push(trigger.token) });
  await clock.start();
  await clock.setSpeed(1);
  await scheduler.tick(60_000);
  await clock.setSpeed(10);
  await scheduler.tick(60_000);
  await clock.setSpeed(60);
  await scheduler.tick(4_000);
  assert.deepEqual(fired, ["due-1"]);
  await scheduler.tick(0);
  assert.deepEqual(fired, ["due-1"]);
});

test("Force Next Event fires once while paused and advances deterministic cadence state", async () => {
  const fired = [];
  const { store, scheduler } = await createFixture({ onEventDue: async (trigger) => fired.push(trigger) });
  const first = await scheduler.forceNextEvent();
  assert.equal(first.result.status, "TRIGGERED");
  assert.equal(first.result.trigger.forced, true);
  assert.deepEqual(fired.map((trigger) => trigger.token), ["due-1"]);
  const afterFirst = await store.snapshot();
  assert.equal(afterFirst.simulationState.status, "PAUSED");
  assert.equal(afterFirst.simulationState.dueEventToken, "due-2");
  assert.equal(afterFirst.simulationState.rngStreams.fallback, 2718);
  assert.equal(afterFirst.simulationState.rngStreams.resolution, 3141);
  assert.notEqual(afterFirst.simulationState.rngStreams.scheduler, 1729);
});

test("each Live demand scenario uses its own deterministic, bounded arrival cadence and Auto rotates", async () => {
  const { store, scheduler } = await createFixture();
  for (const [scenario, cadence] of Object.entries(schedulerCadenceByScenario)) {
    await store.mutate(`set-${scenario}`, (state) => {
      state.workforceContinuity.scenario.selected = scenario;
      state.simulationState.nextEventAt = state.simulationState.simulationTime;
    });
    await scheduler.forceNextEvent();
    const state = await store.snapshot();
    const delay = (Date.parse(state.simulationState.nextEventAt) - Date.parse(state.simulationState.simulationTime)) / 60_000;
    assert(delay >= cadence.minMinutes && delay <= cadence.maxMinutes, `${scenario} delay ${delay} must stay within its policy`);
  }
  await store.mutate("set-auto", (state) => {
    state.workforceContinuity.scenario.selected = "AUTO";
    state.workforceContinuity.scenario.activeScenario = null;
    state.workforceContinuity.scenario.lastAutoTransitionAt = null;
  });
  await scheduler.forceNextEvent();
  const auto = await store.snapshot();
  assert.ok(Object.hasOwn(schedulerCadenceByScenario, auto.workforceContinuity.scenario.activeScenario));
});

test("active issue demo ceiling records deferred demand for scheduled and forced events", async () => {
  const fired = [];
  const { store, scheduler, clock } = await createFixture({ onEventDue: async (trigger) => fired.push(trigger) });
  await store.mutate("fill-actionable-issue-cap", (state) => {
    for (let i = 0; i < 8; i += 1) state.issues.push({ id: `ISS-10${5 + i}`, equipmentId: `EQ-${String(5 + i).padStart(2, "0")}`, issueClass: "C", status: "PENDING", createdAt: state.simulationState.simulationTime, raisedAt: state.simulationState.simulationTime, downtimeStartedAt: state.simulationState.simulationTime });
  });
  const forced = await scheduler.forceNextEvent();
  assert.equal(forced.result.status, "ACTIVE_ISSUE_CEILING");
  await clock.start();
  const due = await scheduler.tick(45 * 60_000);
  assert.equal(due.result.eventStatus, "ACTIVE_ISSUE_CEILING");
  const after = await store.snapshot();
  assert.equal(after.simulationState.dueEventToken, "due-3");
  assert.equal(after.workforceContinuity.deferredDemand.length, 2);
  assert.equal(fired.length, 0);
});

test("Force Resolve recovers a persisted-but-undispatched assigned resolution", async () => {
  const fired = [];
  const { store, scheduler } = await createFixture({ onResolutionDue: async (trigger) => fired.push(trigger) });
  const first = await scheduler.forceResolve("ISS-103");
  assert.equal(first.result.status, "TRIGGERED");
  assert.equal(first.result.trigger.forced, true);
  assert.equal(first.result.trigger.responderId, "R-OPER142");
  const second = await scheduler.forceResolve("ISS-103");
  assert.equal(second.result.status, "REDISPATCHED");
  assert.deepEqual(fired.map((trigger) => trigger.token), ["resolution-1", "resolution-1"]);
  const attempt = (await store.snapshot()).resolutionAttempts.find((entry) => entry.issueId === "ISS-103");
  assert.equal(attempt.resolutionDueToken, null);
});

test("ordinary due resolution uses the same one-shot scheduler path", async () => {
  const fired = [];
  const { scheduler, clock } = await createFixture({ onResolutionDue: async (trigger) => fired.push(trigger) });
  await clock.start();
  await scheduler.tick(20 * 60_000);
  assert.deepEqual(fired.map((trigger) => [trigger.token, trigger.forced]), [["resolution-1", false]]);
  await scheduler.tick(0);
  assert.equal(fired.length, 1);
});

test("consumed tokens survive restart and dispatch callbacks run outside the store lock", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compass-scheduler-restart-"));
  const filePath = join(directory, "live.json");
  const store = createLiveStore({ filePath });
  let stateSeenByCallback;
  const scheduler = createScheduler(store, {
    onEventDue: async () => { stateSeenByCallback = await store.snapshot(); },
  });
  await scheduler.forceNextEvent();
  assert.equal(stateSeenByCallback.simulationState.dueEventToken, "due-2");

  const reopenedStore = createLiveStore({ filePath });
  const reopenedScheduler = createScheduler(reopenedStore, {
    onEventDue: async () => assert.fail("a consumed token must not fire again after restart"),
  });
  assert.equal((await reopenedScheduler.tick(0)).result.eventStatus, "PAUSED");
  assert.equal((await reopenedStore.snapshot()).simulationState.dueEventToken, "due-2");
});
