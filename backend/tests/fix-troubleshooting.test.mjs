import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveSeed } from '../seed/live-simulation.mjs';
import { fixesFor, validateFixCatalog, FIX_CATALOG } from '../src/fix-catalog.mjs';
import { initializeFaults, assertNoFaultTruth, faultEffect } from '../src/fault-truth.mjs';
import { buildFixPacket, fallbackFixOrder, baselineFix, deterministicFixRecommendation } from '../src/fix-evidence.mjs';
import { createPublicLiveSnapshot, createIssueAuditRecord, assertNoResponderSkill } from '../src/live-schema.mjs';
import { buildEventPlannerPacket } from '../src/event-planner.mjs';
import { buildCandidatePacket } from '../src/context-engine.mjs';
import { buildAnalytics } from '../src/analytics-service.mjs';
import { migrateLiveState } from '../src/live-migration.mjs';
import { createAttempt } from '../src/attempt-engine.mjs';
import { finalizeResolutionAttemptState } from '../src/resolution-engine.mjs';

function readyState(fixIndex) {
  const state = createLiveSeed(), issue = state.issues.find((i) => i.id === 'ISS-104');
  state.faultTruth.causes[issue.id] = 'hidden-cause-B-0';
  issue.fixRecommendation = deterministicFixRecommendation(state, issue);
  const rows = issue.fixRecommendation.rankedFixes;
  issue.fixRecommendation.rankedFixes = [rows[fixIndex], ...rows.filter((r) => r !== rows[fixIndex])];
  state.assignments.push({id:'assignment-002',issueId:issue.id,responderId:'R-ENGR028',role:'PRIMARY',status:'ACTIVE',joinedAt:state.simulationState.simulationTime,roleHistory:[]});
  const attempt = createAttempt(state,issue.id);state.assignments.at(-1).attemptId=attempt.id;
  return {state,issue,attempt};
}

test('public fix catalog is complete and rejects hidden or malformed fields', () => {
  assert.equal(validateFixCatalog(), true);
  for(const kind of ['A','B','C']) assert.equal(fixesFor(kind).length,6);
  const bad=structuredClone(FIX_CATALOG);bad.A[0].successMultiplier=1;
  assert.throws(()=>validateFixCatalog(bad));
});

test('latent cause assignment is seeded, stable on migration, and absent from public/model boundaries', () => {
  const state=createLiveSeed();assert.deepEqual(createLiveSeed(),state);
  const legacy=structuredClone(state);delete legacy.faultTruth;delete legacy.simulationState.rngStreams.fault;for(const i of legacy.issues)delete i.symptom;
  const migrated=migrateLiveState(legacy);assert.deepEqual(migrateLiveState(migrated),migrated);
  assert.ok(migrated.issues.every(i=>i.symptom));
  const payloads=[createPublicLiveSnapshot(migrated),createIssueAuditRecord(migrated,'ISS-104'),buildEventPlannerPacket(migrated),buildCandidatePacket(migrated,'ISS-104','privacy'),buildFixPacket(migrated,'ISS-104'),buildAnalytics(migrated)];
  for(const p of payloads){assertNoResponderSkill(p);assertNoFaultTruth(p);}
  assert.throws(()=>assertNoFaultTruth({nested:{causeId:'x'}}));
  assert.throws(()=>assertNoFaultTruth({text:'hidden-cause-A-0'}));
});

test('the applied fix multiplies team success and duration without rerolling randomness', () => {
  const good=readyState(0),bad=readyState(1);
  assert.equal(good.attempt.successDraw,bad.attempt.successDraw);
  assert.equal(good.attempt.durationFactor,bad.attempt.durationFactor);
  const g=good.attempt.segments[0],b=bad.attempt.segments[0];
  assert.ok(g.successProbability>b.successProbability);assert.ok(g.teamRate>b.teamRate);
  const ge=faultEffect(good.state,good.issue,good.attempt.fixApplied.id),be=faultEffect(bad.state,bad.issue,bad.attempt.fixApplied.id);
  assert.ok(Math.abs(g.teamRate/b.teamRate-be.durationMultiplier/ge.durationMultiplier)<1e-10);
  for(const run of [good,bad]) {
    run.attempt.successDraw=(g.successProbability+b.successProbability)/2;
    run.state.simulationState.simulationTime=run.attempt.resolutionDueAt;
    finalizeResolutionAttemptState(run.state,run.attempt);
    const row=run.state.resolutionHistory.at(-1);
    assert.equal(row.fixApplied.id,run.attempt.fixApplied.id);assert.equal(row.legacyFix,false);assert.match(row.actionTaken,/FIX-B-/);
  }
  assert.equal(good.attempt.status,'SUCCEEDED');assert.equal(bad.attempt.status,'FAILED');
  // Reopened work uses the next untried fix in the stored troubleshooting order.
  bad.state.assignments.at(-1).status='ACTIVE';
  const next=createAttempt(bad.state,bad.issue.id);assert.notEqual(next.fixApplied.id,bad.attempt.fixApplied.id);
});

test('fallback uses observed same-symptom smoothing, counts and catalog ties; legacy actions do not enter evidence', () => {
  const s=createLiveSeed(),issue=s.issues.find((i)=>i.id==='ISS-104');const first=buildFixPacket(s,issue.id);
  assert.equal(fallbackFixOrder(first)[0].fixId,fixesFor('B')[0].id);assert.equal(first.candidates[0].sameClass.attempts,0);
  for(let i=0;i<4;i++)s.resolutionHistory.push({issueId:`other-${i}`,issueClass:'B',equipmentId:issue.equipmentId,symptomCode:issue.symptom.code,fixApplied:fixesFor('B')[2],fixAttemptNumber:1,success:true,resolutionMinutes:8,resolvedAt:s.simulationState.simulationTime});
  const packet=buildFixPacket(s,issue.id);assert.equal(fallbackFixOrder(packet)[0].fixId,fixesFor('B')[2].id);assert.equal(baselineFix(packet),fixesFor('B')[2].id);assert.equal(packet.candidates[2].sameSymptom.firstTimeSuccesses,4);
});
