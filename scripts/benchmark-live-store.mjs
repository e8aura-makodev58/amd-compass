/** Manual, API-free month-scale benchmark. Never points at a deployment data root. */
import {mkdir, mkdtemp, readFile, writeFile, stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {bootstrapDemoSeed} from '../backend/src/demo-seed-bootstrap.mjs';
import {createControlRoomManager} from '../backend/src/control-room-manager.mjs';
import {createCompassServer} from '../backend/src/server.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(v=>{const [k,...rest]=v.replace(/^--/,'').split('=');return [k,rest.join('=')];}));
const samples=Number(args.samples??10);
if(!Number.isInteger(samples)||samples<3)throw Error('samples must be an integer >= 3');
const parent=resolve('.cache/live-store-bench');await mkdir(parent,{recursive:true});
const dataRoot=await mkdtemp(join(parent,'run-'));
await bootstrapDemoSeed({dataRoot,enabled:true});
const manager=await createControlRoomManager({dataRoot,migrateLegacyData:false,plannerOptions:{mode:'force-failure'},agentOptions:{mode:'force-failure'}});
const room=manager._internalRoomForTests('plant-1');if(room.health!=='READY')throw Error(room.reason);
const timings={},statuses={};
const record=(key,time)=>{(timings[key]??=[]).push(time);};
const mutate=room.liveStore.mutate.bind(room.liveStore);
room.liveStore.mutate=async(label,...rest)=>{const start=performance.now();try{return await mutate(label,...rest);}finally{record(`mutation:${label}`,performance.now()-start);}};
const server=createCompassServer(manager,{log(){}},null);
await new Promise((yes,no)=>{server.once('error',no);server.listen(3121,'127.0.0.1',yes);});
const base='http://127.0.0.1:3121/api/control-rooms/plant-1';
async function request(path,body,measure=true){const start=performance.now();const response=await fetch(base+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const result=await response.json();if(measure){record(path,performance.now()-start);(statuses[path]??=[]).push(response.status);}return result;}
try{
 await request('/simulation/speed',{speed:5},false);await request('/simulation/resume',{},false);
 manager.startProcessScheduler();
 for(let i=0;i<samples;i++){
  for(const path of ['/state','/analytics','/analytics/pareto?level=MONTH'])await request(path);
  await request('/simulation/speed',{speed:5});await request('/simulation/force-event',{});
  const state=await request('/state',null,false);
  const offer=(state.dispatchOffers??[]).find(o=>o.status==='PENDING');
  const rec=state.recommendations?.find(r=>r.id===offer?.recommendationId);
  const candidate=rec?.candidateEvidenceSnapshot?.find(c=>state.responders.some(r=>r.id===c.responderId&&r.availability==='AVAILABLE'));
  if(candidate)await request('/assignments/override',{recommendationId:rec.id,responderId:candidate.responderId});
 }
 manager.stopProcessScheduler();await room.liveRuntime.agentWorkIdle();await room.liveStore.project(()=>null);
 const summary=Object.fromEntries(Object.entries(timings).map(([key,values])=>{const sorted=[...values].sort((a,b)=>a-b),q=p=>sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];return[key,{n:values.length,p50Ms:+q(.5).toFixed(2),p95Ms:+q(.95).toFixed(2)}];}));
 const result={commit:args.label??'working-tree',samples,dataRoot,initialBytes:(await stat(join(dataRoot,'control-rooms/plant-1/live-simulation.json'))).size,speed:5,providers:'force-failure',statuses,metrics:summary,overrideNote:summary['/assignments/override']?'Only currently eligible overrides submitted.':'No pending offer with an available alternative during samples; override not measured.'};
 const json=JSON.stringify(result,null,2);await writeFile(args.out??join(dataRoot,'results.json'),json+'\n');process.stdout.write(json+'\n');
}finally{manager.stopProcessScheduler();await new Promise(yes=>server.close(yes));}
