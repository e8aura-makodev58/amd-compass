import assert from "node:assert/strict";
import test from "node:test";
import { createInitialDemoState } from "../src/demo-state.mjs";
import { createTempAuditStore } from "./helpers/temp-audit-store.mjs";
import { assignResponder } from "../src/assignment-service.mjs";
import { createDemoRuntime } from "../src/server.mjs";

test("assignment mutation changes canonical issue and responder only when eligible", () => {
  const state = createInitialDemoState();
  const result = assignResponder(state, "ISS-104", "R-ENGR028");
  assert.deepEqual(result, { status: "assigned", issueId: "ISS-104", responderId: "R-ENGR028" });
  assert.equal(state.issues[0].assignedResponderId, "R-ENGR028");
  assert.equal(state.issues[0].status, "ASSIGNED");
  const responder = state.responders.find((entry) => entry.id === "R-ENGR028");
  const equipment = state.equipment.find((entry) => entry.id === "EQ-04");
  assert.equal(responder.availability, "ASSIGNED");
  assert.equal(responder.floor, equipment.floor);
  assert.ok(Math.hypot(responder.x - equipment.x, responder.y - equipment.y) <= 14, "assigned responder is placed beside the affected station");
  assert.equal(state.operationalEvents.at(-1).eventType, "RESPONDER_MOVED");
  assert.equal(state.operationalEvents.at(-1).payload.reason, "ASSIGNMENT");
});

test("unavailable responder produces a stale result without mutation", () => {
  const state = createInitialDemoState();
  const before = structuredClone(state);
  const result = assignResponder(state, "ISS-104", "R-TECH073");
  assert.deepEqual(result, { status: "stale", reason: "responder-not-available", responderId: "R-TECH073" });
  assert.deepEqual(state, before);
});

test("runtime confirms Compass recommendation and supports an eligible override", async () => {
  const runtime = createDemoRuntime({ mode: "fixture" }, createTempAuditStore());
  await runtime.raiseIssue("ISS-104");
  await runtime.requestRecommendation("ISS-104");
  const confirmed = await runtime.decideAssignment("ISS-104", "R-ENGR028", "CONFIRMED");
  assert.equal(confirmed.workflow.decision.status, "CONFIRMED");
  assert.equal(confirmed.issues[0].assignedResponderId, "R-ENGR028");

  runtime.reset();
  await runtime.raiseIssue("ISS-104");
  await runtime.requestRecommendation("ISS-104");
  const overridden = await runtime.decideAssignment("ISS-104", "R-ENGR104", "OVERRIDDEN");
  assert.equal(overridden.workflow.decision.status, "OVERRIDDEN");
  assert.equal(overridden.issues[0].assignedResponderId, "R-ENGR104");
  assert.equal(overridden.responders.find((responder) => responder.id === "R-ENGR104").availability, "ASSIGNED");
});
