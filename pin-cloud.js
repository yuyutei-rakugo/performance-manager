export function createPinClient(endpoint,state,emit){
 let token=sessionStorage.getItem('yuitei.session')||'',epoch=0,rosterCache=null,rosterRequest=null;
 const streams=new Map(),pending=new Map();
 async function call(action,body={}){
  const read=['session','read','attendanceRead','roster','members'].includes(action),key=JSON.stringify([epoch,action,body]);
  if(read&&pending.has(key))return pending.get(key);
  const request=(async()=>{const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,token,...body}),redirect:'follow',signal:controller.signal});if(!response.ok)throw Error('共通保存に接続できません。');const result=await response.json();if(!result.ok){const error=Error(result.error||'操作できませんでした。');error.sessionInvalid=/会員ログインが必要|ログインの期限/.test(error.message);throw error}return result}catch(error){if(error.name==='AbortError')throw Error('接続に時間がかかっています。接続を確認して再度お試しください。');throw error}finally{clearTimeout(timeout)}})();
  if(read)pending.set(key,request);
  try{return await request}finally{if(read&&pending.get(key)===request)pending.delete(key)}
 }
 function clear(){epoch++;rosterCache=null;rosterRequest=null;for(const entry of streams.values()){clearInterval(entry.timer);entry.closed=true}streams.clear();pending.clear()}
 function identity(member){state.user=member?{uid:member.id,email:member.name}:null;state.stageName=member?.name||null;state.role=member?.role||null;state.owner=!!member?.owner;state.ready=true;state.message=member?'共通保存：'+member.name+'（'+({admin:'管理者',editor:'編集可',viewer:'会員'}[member.role])+'）':'登録名と4桁の暗証番号でログインしてください。';emit()}
 const streamKey=(action,args)=>JSON.stringify([action,args]);
 function deliver(entry,error){for(const subscriber of [...entry.subscribers]){try{if(error)subscriber.onError?.(error);else subscriber.fn(structuredClone(entry.value))}catch{}}}
 async function load(entry){
  if(entry.closed)return;if(entry.inFlight){entry.again=true;return}entry.inFlight=true;const version=entry.version;
  try{const result=await call(entry.action,entry.args);if(entry.closed||version!==entry.version)return;entry.value=entry.action==='read'?result.doc:result.rows;entry.hasValue=true;entry.updatedAt=Date.now();deliver(entry)}catch(error){if(!entry.closed&&version===entry.version)deliver(entry,error.message)}finally{entry.inFlight=false;if(entry.again&&!entry.closed){entry.again=false;load(entry)}}
 }
 function watch(action,args,fn,onError){
  const key=streamKey(action,args);let entry=streams.get(key);
  if(!entry){entry={action,args,subscribers:new Set(),hasValue:false,value:null,updatedAt:0,version:0,inFlight:false,closed:false};streams.set(key,entry);entry.timer=setInterval(()=>{if(entry.subscribers.size&&document.visibilityState!=='hidden')load(entry)},60000)}
  const subscriber={fn,onError};entry.subscribers.add(subscriber);
  if(entry.hasValue)queueMicrotask(()=>{if(!entry.closed&&entry.subscribers.has(subscriber))fn(structuredClone(entry.value))});
  if(!entry.hasValue||Date.now()-entry.updatedAt>15000){if(!entry.inFlight)load(entry)}
  return()=>{entry.subscribers.delete(subscriber)};
 }
 function refresh(predicate=()=>true){for(const entry of streams.values())if(predicate(entry)){entry.version++;entry.updatedAt=0;if(entry.subscribers.size)load(entry)}}
 function confirmed(action,args,value){const entry=streams.get(streamKey(action,args));if(!entry)return;entry.version++;entry.value=value;entry.hasValue=true;entry.updatedAt=Date.now();deliver(entry)}
 const refreshAttendance=id=>refresh(entry=>entry.action==='attendanceRead'&&entry.args.id===id);
 window.addEventListener('focus',()=>{for(const entry of streams.values())if(entry.subscribers.size&&Date.now()-entry.updatedAt>15000)load(entry)});
 return {
  async start(){state.provider='apps-script';if(token)try{identity((await call('session')).member);return}catch(error){if(!error.sessionInvalid)throw error;token='';sessionStorage.removeItem('yuitei.session');clear()}identity(null)},
  async login(name,pin){const result=await call('login',{name,pin});clear();token=result.token;sessionStorage.setItem('yuitei.session',token);identity(result.member)},
  async logout(){try{await call('logout')}finally{token='';sessionStorage.removeItem('yuitei.session');clear();identity(null)}},
  watch(name,fn,onError){return watch('read',{name},fn,onError)},watchAttendance(id,fn,onError){return watch('attendanceRead',{id},fn,onError)},
  async save(name,payload,revision){const result=await call('save',{name,items:payload.items,revision});confirmed('read',{name},{items:payload.items,revision:result.revision});return result.revision},
  async respondAttendance(id,status){await call('attendanceSave',{id,status});const entry=streams.get(streamKey('attendanceRead',{id}));if(entry?.hasValue){const rows=entry.value.filter(row=>row.stageName!==state.stageName);rows.push({stageName:state.stageName,status});confirmed('attendanceRead',{id},rows)}refreshAttendance(id)},
  async roster(){if(rosterCache&&Date.now()-rosterCache.time<60000)return structuredClone(rosterCache.members);if(rosterRequest)return rosterRequest;const version=epoch;rosterRequest=call('roster').then(result=>{if(version===epoch)rosterCache={time:Date.now(),members:result.members};return structuredClone(result.members)}).finally(()=>{if(version===epoch)rosterRequest=null});return rosterRequest},
  async archivePast(data){const result=await call('archivePast',data);refresh(entry=>entry.action==='read');return result},
  async importLocal(data){const result=await call('importLocal',data);refresh();return result},
  async members(){return (await call('members')).members},async memberSave(member){const result=await call('memberSave',{member});rosterCache=null;return result.member},
  async changePin(pin){await call('changePin',{pin});token='';sessionStorage.removeItem('yuitei.session');clear();identity(null)}
 };
}
