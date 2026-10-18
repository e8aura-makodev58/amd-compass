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

test('Offline fix fixtures and interrupted-request migration preserve the privacy boundary', async()=>{
 const {createDemoRuntime}=await import('../src/offline-runtime.mjs');
 const offline=createDemoRuntime({mode:'fixture'},{create:async()=>{},updateDecision:async()=>{}});
 await offline.raiseIssue('ISS-104');const snapshot=offline.snapshot();
 assertNoResponderSkill(snapshot);assertNoFaultTruth(snapshot);
 assert.equal(snapshot.issues.find(i=>i.id==='ISS-104').fixRecommendation.source,'FIXTURE');
 const seed=createLiveSeed();const issue=seed.issues.find(i=>i.id==='ISS-104');
 issue.fixRecommendation={...deterministicFixRecommendation(seed,issue),status:'PENDING_MODEL',modelAttempted:true,requestToken:'interrupted'};
 const migrated=migrateLiveState(seed);const rec=migrated.issues.find(i=>i.id===issue.id).fixRecommendation;
 assert.equal(rec.status,'INTERRUPTED');assert.equal(rec.modelAttempted,false);assert.equal(rec.requestToken,undefined);
 assert.deepEqual(migrated.faultTruth,seed.faultTruth);assert.deepEqual(migrated.simulationState.rngStreams,seed.simulationState.rngStreams);
});

test('first-time fix and agreement metrics exclude legacy retries and suppress thin samples',()=>{
 const state=createLiveSeed();const issue=state.issues.find(i=>i.id==='ISS-104');
 issue.fixRecommendation={...deterministicFixRecommendation(state,issue),modelAttempted:true};
 for(let n=0;n<2;n++)state.resolutionHistory.push({id:`metric-${n}`,issueId:`metric-issue-${n}`,issueClass:'B',equipmentId:issue.equipmentId,fixApplied:fixesFor('B')[0],fixAttemptNumber:1,legacyFix:false,success:n===0,resolutionMinutes:10,resolvedAt:state.simulationState.simulationTime,responderId:'R-ENGR028'});
 let f=buildAnalytics(state).fixes;assert.equal(f.firstTimeFixRate.denominator,2);assert.equal(f.firstTimeFixRate.numerator,1);assert.equal(f.firstTimeFixRate.status,'INSUFFICIENT_DATA');assert.equal(f.firstTimeFixRate.rate,null);
 state.resolutionHistory.push({...state.resolutionHistory.at(-1),id:'metric-retry',fixAttemptNumber:2,success:true});
 assert.equal(buildAnalytics(state).fixes.firstTimeFixRate.denominator,2);
 state.resolutionHistory.push({...state.resolutionHistory.at(-1),id:'metric-third',fixAttemptNumber:1,success:true});
 f=buildAnalytics(state).fixes;assert.equal(f.firstTimeFixRate.denominator,3);assert.equal(f.firstTimeFixRate.rate,2/3);assert.equal(f.recommendedVsBaselineAgreement.denominator,1);assert.equal(f.recommendedVsBaselineAgreement.status,'INSUFFICIENT_DATA');
});
