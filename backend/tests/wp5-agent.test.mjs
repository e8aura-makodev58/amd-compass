import assert from "node:assert/strict";
import test from "node:test";
import { createInitialDemoState } from "../src/demo-state.mjs";
import {
  buildCandidatePacket,
  getNaiveScoreBaseline,
  getNearestAvailableBaseline,
} from "../src/context-engine.mjs";
import {
  AGENT_RESULT_JSON_SCHEMA,
  SYSTEM_INSTRUCTION,
  requestAgentRecommendation,
  validateAgentResult,
} from "../src/agent.mjs";
import { EVENT_PLANNER_JSON_SCHEMA } from "../src/event-planner.mjs";

function scenarioAPacket(requestId = "rec-scenario-a-test") {
  const state = createInitialDemoState();
  return buildCandidatePacket(state, state.activeIssueId, requestId);
}

function validAgentResult(overrides = {}) {
  const packet = scenarioAPacket();
  return {
    schemaVersion: "1.0",
    recommendationRequestId: packet.recommendationRequestId,
    rankedCandidates: [
      {
        rank: 1,
        responderId: "R-ENGR028",
        recommendationSummary: "Strong supported record.",
        evidenceReferences: ["sameIssuePerformance"],
        tradeoff: { comparedToResponderId: "R-TECH216", explanation: "The alternative's record is too lightly supported." },
      },
      { rank: 2, responderId: "R-ENGR104", recommendationSummary: "Fast but less compelling.", evidenceReferences: ["travelTime"] },
      { rank: 3, responderId: "R-OPER088", recommendationSummary: "Credible middle option.", evidenceReferences: ["evidenceStrength"] },
      { rank: 4, responderId: "R-TECH216", recommendationSummary: "Promising but weakly supported.", evidenceReferences: ["evidenceStrength"] },
    ],
    topRecommendation: { responderId: "R-ENGR028", rationale: "Best balance of supported evidence." },
    uncertaintyNote: "Accepts a longer trip for stronger evidence.",
    ...overrides,
  };
}

/**
 * The output schemas travel to the model as the contract it must follow, so
 * every object node must be closed (additionalProperties:false) and list EVERY
 * declared property in `required`. An open or partial schema would invite the
 * model to omit or invent fields. This walker is the hermetic guard for that.
 */
function collectStrictModeViolations(node, path = "$") {
  const violations = [];
  if (!node || typeof node !== "object") return violations;
  if (node.type === "object") {
    const properties = node.properties ?? {};
    const propertyKeys = Object.keys(properties);
    if (node.additionalProperties !== false) {
      violations.push(`${path} must set additionalProperties:false`);
    }
    if (!Array.isArray(node.required)) {
      violations.push(`${path} must declare a required array`);
    } else {
      for (const key of propertyKeys) {
        if (!node.required.includes(key)) violations.push(`${path}.required is missing declared property '${key}'`);
      }
      for (const key of node.required) {
        if (!propertyKeys.includes(key)) violations.push(`${path}.required lists undeclared property '${key}'`);
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      violations.push(...collectStrictModeViolations(child, `${path}.properties.${key}`));
    }
  }
  if (node.items) violations.push(...collectStrictModeViolations(node.items, `${path}.items`));
  return violations;
}

test("output schemas declare closed objects with every property required", () => {
  for (const [name, schema] of [
    ["AGENT_RESULT_JSON_SCHEMA", AGENT_RESULT_JSON_SCHEMA],
    ["EVENT_PLANNER_JSON_SCHEMA", EVENT_PLANNER_JSON_SCHEMA],
  ]) {
    const violations = collectStrictModeViolations(schema, name);
    assert.deepEqual(violations, [], `${name} violates strict mode: ${violations.join("; ")}`);
  }
});

test("system instruction matches the SOW contract text and forbids fabrication/numeric prose", () => {
  assert.match(SYSTEM_INSTRUCTION, /Rank only the supplied eligible candidates/);
  assert.match(SYSTEM_INSTRUCTION, /Do not invent facts or candidates/);
  assert.match(SYSTEM_INSTRUCTION, /Do not repeat numeric evidence in generated prose/);
  assert.match(SYSTEM_INSTRUCTION, /Do not reproduce responder IDs or display codes in prose/);
  assert.match(SYSTEM_INSTRUCTION, /using no digits at all/);
  assert.match(SYSTEM_INSTRUCTION, /Every ranked candidate must include a tradeoff/);
});

test("validation grounds every candidate's tradeoff, not just rank one", () => {
  const packet = scenarioAPacket();

  const unknownReference = validAgentResult();
  unknownReference.rankedCandidates[2].tradeoff = { comparedToResponderId: "R-UNKNOWN", explanation: "Compared against someone absent." };
  const unknown = validateAgentResult(packet, unknownReference);
  assert.equal(unknown.valid, false);
  assert.ok(unknown.errors.some((error) => error.includes("R-OPER088") && error.includes("unknown or ineligible candidate")));

  const selfReference = validAgentResult();
  selfReference.rankedCandidates[2].tradeoff = { comparedToResponderId: "R-OPER088", explanation: "Compared against itself." };
  const self = validateAgentResult(packet, selfReference);
  assert.equal(self.valid, false);
  assert.ok(self.errors.some((error) => error.includes("R-OPER088") && error.includes("different candidate")));

  const allTradeoffs = validAgentResult();
  allTradeoffs.rankedCandidates[1].tradeoff = { comparedToResponderId: "R-ENGR028", explanation: "Quicker to arrive but less proven here." };
  allTradeoffs.rankedCandidates[2].tradeoff = { comparedToResponderId: "R-ENGR104", explanation: "Steadier record but a longer trip." };
  allTradeoffs.rankedCandidates[3].tradeoff = { comparedToResponderId: "R-ENGR028", explanation: "Apparent speed rests on too little history." };
  const complete = validateAgentResult(packet, allTradeoffs);
  assert.equal(complete.valid, true, complete.errors.join("; "));
});

test("Scenario A runs 10/10 in fixture mode: Engr028 ranks first and every result validates", async () => {
  const packet = scenarioAPacket();
  for (let run = 0; run < 10; run += 1) {
    const outcome = await requestAgentRecommendation(packet, { mode: "fixture" });
    assert.equal(outcome.status, "ok", `run ${run} should succeed`);
    assert.equal(outcome.result.topRecommendation.responderId, "R-ENGR028", `run ${run} must rank Engr028 first`);
    const { valid, errors } = validateAgentResult(packet, outcome.result);
    assert.equal(valid, true, `run ${run} should be schema-valid: ${errors.join("; ")}`);
  }
});

test("Scenario A packet excludes Tech073 and Oper142 and keeps Tech216 weaker than Engr028", () => {
  const packet = scenarioAPacket();
  const ids = packet.candidates.map((candidate) => candidate.responderId);
  assert.equal(ids.includes("R-TECH073"), false);
  assert.equal(ids.includes("R-OPER142"), false);
  const chen = packet.candidates.find((candidate) => candidate.responderId === "R-TECH216");
  const priya = packet.candidates.find((candidate) => candidate.responderId === "R-ENGR028");
  assert.equal(chen.evidenceStrengthLabel, "WEAK");
  assert.equal(priya.evidenceStrengthLabel, "STRONG");

  const state = createInitialDemoState();
  assert.equal(getNearestAvailableBaseline(state, state.activeIssueId).responderId, "R-ENGR104");
  assert.equal(getNaiveScoreBaseline(state, state.activeIssueId).responderId, "R-TECH216");
});

test("validation rejects an unknown candidate ID", () => {
  const packet = scenarioAPacket();
  const tampered = validAgentResult();
  tampered.rankedCandidates[3].responderId = "R-UNKNOWN";
  const { valid, errors } = validateAgentResult(packet, tampered);
  assert.equal(valid, false);
  assert.ok(errors.some((error) => error.includes("unknown or ineligible candidate")));
});

test("validation rejects a mismatched recommendation request ID", () => {
  const packet = scenarioAPacket("rec-original");
  const tampered = validAgentResult({ recommendationRequestId: "rec-different" });
  const { valid, errors } = validateAgentResult(packet, tampered);
  assert.equal(valid, false);
  assert.ok(errors.some((error) => error.includes("recommendationRequestId")));
});

test("validation rejects a rank-1 candidate with no tradeoff or a self-referencing tradeoff", () => {
  const packet = scenarioAPacket();
  const missingTradeoff = validAgentResult();
  delete missingTradeoff.rankedCandidates[0].tradeoff;
  assert.equal(validateAgentResult(packet, missingTradeoff).valid, false);

  const selfTradeoff = validAgentResult();
  selfTradeoff.rankedCandidates[0].tradeoff.comparedToResponderId = "R-ENGR028";
  const { valid, errors } = validateAgentResult(packet, selfTradeoff);
  assert.equal(valid, false);
  assert.ok(errors.some((error) => error.includes("different candidate")));
});

test("validation rejects generated prose that leaks numeric evidence", () => {
  const packet = scenarioAPacket();
  const leaked = validAgentResult();
  leaked.topRecommendation.rationale = "Engr028 is 22 meters away and 91% successful.";
  const { valid, errors } = validateAgentResult(packet, leaked);
  assert.equal(valid, false);
  assert.ok(errors.some((error) => error.includes("numeric evidence")));
});

test("validation rejects an incomplete or duplicated ranking", () => {
  const packet = scenarioAPacket();
  const incomplete = validAgentResult();
  incomplete.rankedCandidates.pop();
  assert.equal(validateAgentResult(packet, incomplete).valid, false);

  const duplicated = validAgentResult();
  duplicated.rankedCandidates[3].responderId = duplicated.rankedCandidates[1].responderId;
  assert.equal(validateAgentResult(packet, duplicated).valid, false);
});

test("forced provider failure produces the explicit unavailable state", async () => {
  const packet = scenarioAPacket();
  const outcome = await requestAgentRecommendation(packet, { mode: "force-failure" });
  assert.equal(outcome.status, "unavailable");
  assert.equal(outcome.reason, "forced-failure");
  assert.equal(outcome.result, undefined);
});

test("live mode without an API key fails closed to the explicit unavailable state", async () => {
  const packet = scenarioAPacket();
  const outcome = await requestAgentRecommendation(packet, { mode: "live", apiKey: undefined });
  assert.equal(outcome.status, "unavailable");
  assert.equal(outcome.reason, "provider-error");
});

test("live mode times out and fails closed rather than hanging", async () => {
  const packet = scenarioAPacket();
  const hangsUntilAborted = (url, init) =>
    new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => {
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      });
    });
  const outcome = await requestAgentRecommendation(packet, {
    mode: "live",
    apiKey: "test-key",
    timeoutMs: 10,
    fetchImpl: hangsUntilAborted,
  });
  assert.equal(outcome.status, "unavailable");
  assert.equal(outcome.reason, "timeout");
});

test("live mode sends the documented request shape and validates the parsed response", async () => {
  const packet = scenarioAPacket();
  let capturedUrl;
  let capturedInit;
  const fixtureResult = validAgentResult();
  const fetchImpl = async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(fixtureResult) } }] }),
    };
  };

  const outcome = await requestAgentRecommendation(packet, {
    mode: "live",
    modelId: "pinned-model-v1",
    apiKey: "test-key",
    fetchImpl,
  });

  assert.equal(outcome.status, "ok");
  assert.equal(outcome.result.topRecommendation.responderId, "R-ENGR028");
  assert.equal(capturedUrl, "https://developer.amd.com.cn/radeon/api/v1/chat/completions");
  assert.equal(capturedInit.headers.authorization, "Bearer test-key");
  const body = JSON.parse(capturedInit.body);
  assert.equal(body.model, "pinned-model-v1");
  assert.ok(body.messages[0].content.startsWith(SYSTEM_INSTRUCTION));
  assert.deepEqual(JSON.parse(body.messages[1].content), packet);
  assert.equal(body.response_format.type, "json_object");
});

test("live mode fails closed when the provider returns an invalid result", async () => {
  const packet = scenarioAPacket();
  const invalid = validAgentResult();
  invalid.rankedCandidates[0].responderId = "R-UNKNOWN";
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(invalid) } }] }),
  });

  const outcome = await requestAgentRecommendation(packet, { mode: "live", apiKey: "test-key", fetchImpl });
  assert.equal(outcome.status, "unavailable");
  assert.equal(outcome.reason, "validation-failed");
  assert.ok(outcome.errors.length > 0);
});

test("live mode surfaces the provider's own error body in the unavailable outcome", async () => {
  const packet = scenarioAPacket();
  const providerBody = '{"error":{"message":"Invalid schema for response_format \'compass_agent_result\': In context=(\'properties\',\'rankedCandidates\',\'items\'), \'required\' is required to be supplied and to be an array including every key in properties. Missing \'tradeoff\'."}}';
  const fetchImpl = async () => ({ ok: false, status: 400, text: async () => providerBody });

  const outcome = await requestAgentRecommendation(packet, { mode: "live", apiKey: "test-key", fetchImpl });
  assert.equal(outcome.status, "unavailable");
  assert.equal(outcome.reason, "provider-error");
  assert.match(outcome.message, /400/);
  assert.match(outcome.message, /Missing 'tradeoff'/);
  assert.ok(outcome.message.length < 600, "provider detail must stay bounded");
  assert.doesNotMatch(outcome.message, /test-key/, "the credential must never reach the failure message");
});

test("live mode still fails closed when the provider error body cannot be read", async () => {
  const packet = scenarioAPacket();
  const fetchImpl = async () => ({ ok: false, status: 503, text: async () => { throw new Error("stream closed"); } });
  const outcome = await requestAgentRecommendation(packet, { mode: "live", apiKey: "test-key", fetchImpl });
  assert.equal(outcome.status, "unavailable");
  assert.equal(outcome.reason, "provider-error");
  assert.match(outcome.message, /503/);
});

test("fixture mode fails closed rather than guessing when no fixture matches the packet", async () => {
  const foreignPacket = {
    schemaVersion: "1.0",
    recommendationRequestId: "rec-other",
    issue: { issueId: "ISS-999", equipmentId: "EQ-99", issueClass: "A", existingPriority: "LOW" },
    candidates: [
      { responderId: "R-NEW", displayName: "New", distanceToIssue: 1, travelTimeMinutes: 0.01, sameIssueHistoricalCount: 0, medianResolutionMinutes: null, successRate: null, reopenRate: null, evidenceStrengthLabel: "NONE" },
    ],
  };
  const outcome = await requestAgentRecommendation(foreignPacket, { mode: "fixture" });
  assert.equal(outcome.status, "unavailable");
  assert.equal(outcome.reason, "no-fixture-for-packet");
});
