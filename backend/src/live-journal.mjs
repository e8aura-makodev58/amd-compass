/** Durable JSON-tree changes. OperationalEvent remains audit-only, never a recovery log. */
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,open,readFile,rename,truncate} from 'node:fs/promises';
import {dirname} from 'node:path';
const metadata='__compassStore';
const hash=text=>createHash('sha256').update(text).digest('hex');
async function syncDirectory(file){const h=await open(dirname(file),'r');try{await h.sync();}finally{await h.close();}}
export async function writeLiveCheckpoint(file,state,sequence=0,hook=async()=>{}) {
  await mkdir(dirname(file),{recursive:true});
  const temporary=`${file}.${process.pid}.${randomUUID()}.tmp`;
  const h=await open(temporary,'w',0o600);
  try{await h.writeFile(JSON.stringify({...state,[metadata]:{version:1,sequence}})+'\n');await h.sync();}finally{await h.close();}
  await hook('snapshot-synced');
  await rename(temporary,file);await syncDirectory(file);
  await hook('snapshot-renamed');
}
export async function readLiveCheckpoint(file) {
  let state;try{state=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}
  const info=state[metadata];delete state[metadata];
  if(info&&(info.version!==1||!Number.isSafeInteger(info.sequence)||info.sequence<0))throw Error('Invalid live checkpoint metadata');
  return {state,sequence:info?.sequence??0};
}
export function applyLivePatches(state,patches) {
  for(const patch of patches){
    if(!['set','remove'].includes(patch.op)||!Array.isArray(patch.path)||patch.path.length>128||patch.path.some(key=>typeof key!=='string'||['__proto__','constructor','prototype'].includes(key)))throw Error('Invalid live journal patch');
    if(!patch.path.length){if(patch.op!=='set'||!patch.value||typeof patch.value!=='object')throw Error('Invalid root replacement');state=patch.value;continue;}
    let parent=state;
    for(const key of patch.path.slice(0,-1)){if(!parent||!Object.hasOwn(parent,key))throw Error('Missing live journal path');parent=parent[key];}
    if(!parent||typeof parent!=='object')throw Error('Invalid live journal target');
    const key=patch.path.at(-1);
    if(patch.op==='remove')delete parent[key];
    else if(Array.isArray(parent)&&key==='length')parent.length=patch.value;
    else Object.defineProperty(parent,key,{value:patch.value,writable:true,enumerable:true,configurable:true});
  }
  return state;
}
export function createLiveJournal(file,{hook=async()=>{}}={}){
  const path=`${file}.journal`;
  let sequence=0,records=0,bytes=0;
  return {
    get sequence(){return sequence;},get records(){return records;},get bytes(){return bytes;},
    async recover(checkpoint){
      let state=checkpoint.state;sequence=checkpoint.sequence;records=0;bytes=0;
      let data;try{data=await readFile(path,'utf8');}catch(error){if(error.code==='ENOENT')return state;throw error;}
      const end=data.lastIndexOf('\n')+1;
      // Only an unterminated final frame can be ignored. Complete corruption fails closed.
      if(end!==data.length){await truncate(path,Buffer.byteLength(data.slice(0,end)));const h=await open(path,'r+');try{await h.sync();}finally{await h.close();}}
      for(const line of data.slice(0,end).split('\n')){
        if(!line)continue;
        const frame=JSON.parse(line);
        if(typeof frame.payload!=='string'||frame.checksum!==hash(frame.payload))throw Error('Live journal checksum mismatch');
        const entry=JSON.parse(frame.payload);
        if(entry.version!==1||!Number.isSafeInteger(entry.sequence)||entry.sequence!==entry.baseSequence+1||!Array.isArray(entry.patches))throw Error('Invalid live journal entry');
        if(entry.sequence<=checkpoint.sequence)continue;
        if(entry.baseSequence!==sequence||entry.baseRevision!==state.revision)throw Error('Live journal sequence mismatch');
        state=applyLivePatches(state,entry.patches);
        if(state.revision!==entry.revision)throw Error('Live journal revision mismatch');
        sequence=entry.sequence;records++;
      }
      bytes=Buffer.byteLength(data.slice(0,end));return state;
    },
    async append(before,state,patches){
      const payload=JSON.stringify({version:1,baseSequence:sequence,sequence:sequence+1,baseRevision:before.revision,revision:state.revision,patches});
      const frame=JSON.stringify({payload,checksum:hash(payload)})+'\n';
      const h=await open(path,'a',0o600);
      try{await h.writeFile(frame);await h.sync();}finally{await h.close();}
      await syncDirectory(path); // Also makes the first creation durable.
      sequence++;records++;bytes+=Buffer.byteLength(frame);
      await hook('journal-synced');
    },
    async checkpoint(state){
      await writeLiveCheckpoint(file,state,sequence,hook);
      const h=await open(path,'w',0o600);try{await h.sync();}finally{await h.close();}
      await syncDirectory(path);records=0;bytes=0;await hook('journal-compacted');
    },
  };
}
/** The durable room state: the checkpoint plus every complete journal entry after it. */
export async function readDurableLiveState(file) {
  const checkpoint=await readLiveCheckpoint(file);
  return checkpoint?createLiveJournal(file).recover(checkpoint):null;
}
