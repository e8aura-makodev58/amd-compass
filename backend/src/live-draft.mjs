/** Copy-on-write drafts for plain JSON trees. Never pass a draft to native structuredClone. */
const nodes = new WeakMap();
const object = value => value !== null && typeof value === 'object';
export function cloneDraftValue(value) {
  if (!object(value)) return value;
  const node=nodes.get(value);
  // Published state is frozen and proxy-free, so it can be shared rather than copied.
  if(!node&&Object.isFrozen(value)) return value;
  if(node) return structuredClone(node.finish());
  if(Array.isArray(value)) return value.map(cloneDraftValue);
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,cloneDraftValue(item)]));
}
export function createLiveDraft(base) {
  const writes=new Map(), all=[];
  let closed=false;
  function make(value,parent=null,key=null,path=[]) {
    const node={base:value,copy:null,children:new Map(),parent,key,path};all.push(node);
    const source=()=>node.copy??node.base;
    const mark=()=>{if(!node.copy){node.copy=Array.isArray(value)?value.slice():{...value};if(parent)parent.mark();}};
    node.mark=mark;
    const note=key=>writes.set(JSON.stringify([...path,String(key)]),[...path,String(key)]);
    node.proxy=new Proxy(Array.isArray(value)?[]:{},{
      get(_target,key){
        if(closed)throw Error('Live draft is closed');
        const current=source()[key];
        if(!object(current))return current;
        if(nodes.has(current))return current;
        let child=node.children.get(key);
        if(!child||child.base!==current){child=make(current,node,key,[...path,String(key)]);node.children.set(key,child);}
        return child.proxy;
      },
      set(_target,key,item){
        if(closed)throw Error('Live draft is closed');
        if(Object.is(source()[key],item)&&Object.hasOwn(source(),key))return true;
        mark();node.children.delete(key);Object.defineProperty(node.copy,key,{value:item,writable:true,enumerable:key!=='length'||!Array.isArray(value),configurable:key!=='length'||!Array.isArray(value)});note(key);return true;
      },
      deleteProperty(_target,key){if(closed)throw Error('Live draft is closed');if(Object.hasOwn(source(),key)){mark();delete node.copy[key];node.children.delete(key);note(key);}return true;},
      has(_target,key){return key in source();},
      ownKeys(){return Reflect.ownKeys(source());},
      getOwnPropertyDescriptor(_target,key){const d=Object.getOwnPropertyDescriptor(source(),key);return d?{...d,...(key==='length'&&Array.isArray(value)?{writable:true,configurable:false}:{configurable:true})}:undefined;},
      setPrototypeOf(){throw Error('Live drafts contain plain JSON only');},
      defineProperty(){throw Error('Use ordinary assignment in live drafts');},
    });
    nodes.set(node.proxy,node);
    // A base that is not frozen was built during this transaction and may hold draft
    // proxies (for example a new packet that references a draft row), so detach it.
    const fresh=!Object.isFrozen(value);
    node.finish=()=>{
      if(!node.copy)return fresh?cloneDraftValue(node.base):node.base;
      const result=node.copy;
      for(const k of Object.keys(result)) {
        const child=node.children.get(k),item=result[k];
        if(child&&child.base===item)result[k]=child.finish();
        else if(fresh||item!==node.base[k]||nodes.has(item))result[k]=cloneDraftValue(item);
      }
      return result;
    };
    return node;
  }
  const root=make(base);
  return {draft:root.proxy,
    finish(){
      const state=root.finish();
      const paths=[...writes.values()].sort((a,b)=>a.length-b.length), selected=[];
      for(const path of paths)if(!selected.some(p=>p.length<=path.length&&p.every((v,i)=>v===path[i])))selected.push(path);
      const patches=selected.map(path=>{let parent=state;for(const key of path.slice(0,-1))parent=parent[key];const key=path.at(-1);return Object.hasOwn(parent,key)?{op:'set',path,value:parent[key]}:{op:'remove',path};});
      closed=true;return {state,patches};
    },
    abort(){closed=true;},
  };
}

/** Freeze only newly created branches. Already-published history is not traversed again. */
export function freezeLiveState(value) {
  if(!object(value)||Object.isFrozen(value))return value;
  for(const child of Object.values(value))freezeLiveState(child);
  return Object.freeze(value);
}
