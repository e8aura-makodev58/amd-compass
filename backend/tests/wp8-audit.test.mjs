import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuditStore } from "../src/audit-store.mjs";
import { createApplicationLogger, createApplicationLogStore } from "../src/application-log-store.mjs";
import { createDemoRuntime, createRequestHandler } from "../src/server.mjs";
import { roomUrl, wrapRuntimeAsSingleRoomManager } from "./helpers/single-room-manager.mjs";

test("WP8 persists a reconstructable recommendation event and updates it after confirmation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compass-audit-"));
  const runtime = createDemoRuntime({ mode: "fixture" }, createAuditStore(join(directory, "events.json")));
  await runtime.raiseIssue("ISS-104");
  const recommended = await runtime.requestRecommendation("ISS-104");
  const requestId = recommended.workflow.candidatePacket.recommendationRequestId;
  const beforeDecision = await runtime.getAuditEvent(requestId);
  assert.equal(beforeDecision.issueId, "ISS-104");
  assert.equal(beforeDecision.candidateEvidenceSnapshot.length, 4);
  assert.equal(beforeDecision.nearestBaseline.responderId, "R-ENGR104");
  assert.equal(beforeDecision.naiveScoreBaseline.responderId, "R-TECH216");
  assert.equal(beforeDecision.structuredAgentOutput.topRecommendation.responderId, "R-ENGR028");
  assert.equal(beforeDecision.humanDecision, null);

  await runtime.decideAssignment("ISS-104", "R-ENGR028", "CONFIRMED");
  const afterDecision = await runtime.getAuditEvent(requestId);
  assert.equal(afterDecision.humanDecision, "CONFIRMED");
  assert.equal(afterDecision.assignedResponderId, "R-ENGR028");
  assert.equal(afterDecision.decisionResponderId, "R-ENGR028");
});

test("audit route retrieves an event by its generated request ID", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compass-audit-route-"));
  const runtime = createDemoRuntime({ mode: "fixture" }, createAuditStore(join(directory, "events.json")));
  await runtime.raiseIssue("ISS-104");
  const state = await runtime.requestRecommendation("ISS-104");
  const requestId = state.workflow.candidatePacket.recommendationRequestId;
  const handler = createRequestHandler(wrapRuntimeAsSingleRoomManager(runtime));
  const response = { status: null, body: null, writeHead(status) { this.status = status; }, end(body) { this.body = body; } };
  await handler({ method: "GET", url: roomUrl(`/audit/${requestId}`), headers: { host: "localhost" } }, response);
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).requestId, requestId);
});

test("Scenario A can recommend, confirm, and reset repeatedly without manual repair", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compass-reset-"));
  const runtime = createDemoRuntime({ mode: "fixture" }, createAuditStore(join(directory, "events.json")));
  const initial = runtime.snapshot();
  for (let cycle = 0; cycle < 3; cycle += 1) {
    await runtime.raiseIssue("ISS-104");
    const recommendation = await runtime.requestRecommendation("ISS-104");
    assert.equal(recommendation.workflow.agentOutcome.result.topRecommendation.responderId, "R-ENGR028");
    const assigned = await runtime.decideAssignment("ISS-104", "R-ENGR028", "CONFIRMED");
    assert.equal(assigned.issues.find((issue) => issue.id === "ISS-104").assignedResponderId, "R-ENGR028");
    assert.deepEqual(runtime.reset(), initial);
  }
});

test("application logs persist lifecycle and workflow events and are retrievable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compass-runtime-logs-"));
  const logger = createApplicationLogger(createApplicationLogStore(join(directory, "events.json")));
  const runtime = createDemoRuntime({ mode: "fixture" }, createAuditStore(join(directory, "audit.json")), logger);
  const handler = createRequestHandler(wrapRuntimeAsSingleRoomManager(runtime), logger);
  const response = { status: null, body: null, writeHead(status) { this.status = status; }, end(body) { this.body = body; } };

  await runtime.raiseIssue("ISS-104");
  await runtime.requestRecommendation("ISS-104");
  await runtime.decideAssignment("ISS-104", "R-ENGR028", "CONFIRMED");
  await handler({ method: "GET", url: "/api/logs?limit=20", headers: { host: "localhost" } }, response);

  assert.equal(response.status, 200);
  const events = JSON.parse(response.body).events;
  assert.ok(events.some((event) => event.event === "context_prepared"));
  assert.ok(events.some((event) => event.event === "recommendation_completed"));
  assert.ok(events.some((event) => event.event === "assignment_completed" && event.assignedResponderId === "R-ENGR028"));
});
