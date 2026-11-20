export function createPinClient(endpoint,state,emit){
 const sessionKey='yuitei.session';
 const identityKey=sessionKey+'.identity';
 const identityMaxAge=5*60*1000;
 const readStorage=store=>{try{return store.getItem(sessionKey)||''}catch{return ''}};
 const removeStorage=store=>{try{store.removeItem(sessionKey)}catch{}};
 let token=readStorage(localStorage)||readStorage(sessionStorage),remember=!!readStorage(localStorage),epoch=0,rosterCache=null,rosterRequest=null;
 function forget(){removeStorage(localStorage);removeStorage(sessionStorage);try{sessionStorage.removeItem(sessionKey+'.temporary')}catch{}}
 function persist(){forget();try{(remember?localStorage:sessionStorage).setItem(sessionKey,token);if(!remember)sessionStorage.setItem(sessionKey+'.temporary','yes')}catch{try{sessionStorage.setItem(sessionKey,token)}catch{}}}
 // Upgrade a still-valid tab session without retaining the PIN.
 if(token&&!remember){try{if(sessionStorage.getItem(sessionKey+'.temporary')!=='yes'){remember=true;persist()}}catch{}}

 const streams=new Map(),pending=new Map(),attendanceWrites=new Set();
 async function call(action,body={}){
  const version=epoch;
  const read=['session','read','attendanceRead','roster','members'].includes(action),key=JSON.stringify([epoch,action,body]);
  if(read&&pending.has(key))return pending.get(key);
  const request=(async()=>{
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
   try{
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,token,...body}),redirect:'follow',signal:controller.signal});
    if(!response.ok)throw Error('共通保存に接続できません。');
    const result=await response.json();
    if(version!==epoch&&action!=='logout')throw Error('ログイン状態が変わりました。');
    if(!result.ok){
     const error=Error(result.error||'操作できませんでした。');
     error.sessionInvalid=action!=='login'&&/会員ログインが必要|ログインの期限/.test(error.message);
     if(version===epoch&&token&&error.sessionInvalid)signOut();
     throw error;
    }
    return result;
   }catch(error){
    if(error.name==='AbortError')throw Error('接続に時間がかかっています。接続を確認して再度お試しください。');
    throw error;
   }finally{clearTimeout(timeout)}
  })();
  if(read)pending.set(key,request);
  try{return await request}finally{if(read&&pending.get(key)===request)pending.delete(key)}
 }
 // The snapshot only starts the UI. Every data request still sends the token to Apps Script.
 function cachedMember(){
  try{
   const saved=JSON.parse(sessionStorage.getItem(identityKey));
   const age=Date.now()-saved.checkedAt;
   return saved.token===token&&age>=0&&age<identityMaxAge?saved.member:null;
  }catch{return null}
 }
 function rememberMember(member){
  try{sessionStorage.setItem(identityKey,JSON.stringify({token,member,checkedAt:Date.now()}))}catch{}
 }
 function clear(){try{sessionStorage.removeItem(identityKey)}catch{}epoch++;rosterCache=null;rosterRequest=null;for(const entry of streams.values()){stopTimer(entry);entry.closed=true}streams.clear();pending.clear();attendanceWrites.clear()}
 function identity(member){state.user=member?{uid:member.id,email:member.name}:null;state.stageName=member?.name||null;state.role=member?.role||null;state.owner=!!member?.owner;state.ready=true;state.message=member?'共通保存：'+member.name+'（'+({admin:'管理者',editor:'編集可',viewer:'会員'}[member.role])+'）':'登録名と4桁の暗証番号でログインしてください。';emit()}
 function signOut(){
  if(readStorage(localStorage)===token)removeStorage(localStorage);
  if(readStorage(sessionStorage)===token)removeStorage(sessionStorage);
  token='';remember=false;clear();identity(null);
 }
 const streamKey=(action,args)=>JSON.stringify([action,args]);
 function deliver(entry,error,changed=true){
  for(const subscriber of [...entry.subscribers]){
   try{
    if(error){subscriber.needsValue=true;subscriber.onError?.(error)}
    else if(changed||subscriber.needsValue){subscriber.needsValue=false;subscriber.fn(structuredClone(entry.value))}
   }catch{}
  }
 }
 function stopTimer(entry){
  if(entry.timer!==null){clearInterval(entry.timer);entry.timer=null}
 }
 async function load(entry){
  if(entry.closed||!entry.subscribers.size||entry.inFlight)return;
  entry.inFlight=true;
  const version=entry.version;
  try{
   const result=await call(entry.action,entry.args);
   if(entry.closed||version!==entry.version)return;
   const value=entry.action==='read'?result.doc:result.rows;
   const changed=!entry.hasValue||(entry.action==='read'
    ? value?.revision!==entry.value?.revision
    : JSON.stringify(value)!==JSON.stringify(entry.value));
   entry.value=value;entry.hasValue=true;entry.updatedAt=Date.now();
   deliver(entry,null,changed);
  }catch(error){
   if(!entry.closed&&version===entry.version){entry.hasValue=false;deliver(entry,error.message)}
  }finally{
   entry.inFlight=false;
   if(entry.again){entry.again=false;load(entry)}
  }
 }
 function watch(action,args,fn,onError){
  const now=Date.now(),key=streamKey(action,args);
  for(const [id,other] of streams){
   if(!other.subscribers.size&&!other.inFlight&&now-other.updatedAt>60000)streams.delete(id);
  }
  let entry=streams.get(key);
  if(!entry){
   entry={action,args,subscribers:new Set(),hasValue:false,value:null,updatedAt:0,version:0,inFlight:false,closed:false,timer:null};
   streams.set(key,entry);
  }
  const subscriber={fn,onError,needsValue:true};
  entry.subscribers.add(subscriber);
  if(entry.timer===null)entry.timer=setInterval(()=>{if(document.visibilityState!=='hidden')load(entry)},60000);
  if(entry.hasValue&&now-entry.updatedAt<=15000){
   queueMicrotask(()=>{
    if(entry.closed||!entry.hasValue||!entry.subscribers.has(subscriber)||!subscriber.needsValue)return;
    subscriber.needsValue=false;
    fn(structuredClone(entry.value));
   });
  }else load(entry);
  return()=>{entry.subscribers.delete(subscriber);if(!entry.subscribers.size)stopTimer(entry)};
 }
 function refresh(predicate=()=>true){for(const entry of streams.values())if(predicate(entry)){entry.version++;entry.updatedAt=0;if(entry.inFlight)entry.again=true;else load(entry)}}
 function confirmed(action,args,value){const entry=streams.get(streamKey(action,args));if(!entry)return;entry.version++;entry.value=value;entry.hasValue=true;entry.updatedAt=Date.now();deliver(entry)}
 window.addEventListener('storage',event=>{if(event.storageArea===localStorage&&(event.key===sessionKey||event.key===null)&&readStorage(localStorage)!==token&&remember){signOut()}});
 window.addEventListener('focus',()=>{for(const entry of streams.values())if(entry.subscribers.size&&Date.now()-entry.updatedAt>15000)load(entry)});
 return {
  async start(){
   state.provider='apps-script';
   if(!token){identity(null);return}
   const member=cachedMember();
   if(member){identity(member);return}
   try{
    const {member}=await call('session',{remember});
    rememberMember(member);identity(member);
   }catch(error){if(!error.sessionInvalid)throw error}
  },
  async login(name,pin,keep=true){const result=await call('login',{name,pin,remember:keep});clear();token=result.token;remember=keep;persist();rememberMember(result.member);identity(result.member)},
  async logout(){const request=call('logout');signOut();await request},
  async readShared(name){return (await call('read',{name})).doc},
  async readAttendance(id){return (await call('attendanceRead',{id})).rows},
  watch(name,fn,onError){return watch('read',{name},fn,onError)},watchAttendance(id,fn,onError){return watch('attendanceRead',{id},fn,onError)},
  async save(name,payload,revision){const result=await call('save',{name,items:payload.items,revision});confirmed('read',{name},{items:payload.items,revision:result.revision});return result.revision},
  async respondAttendance(id,status){
   if(attendanceWrites.has(id))throw Error('出欠を保存しています。しばらくお待ちください。');
   const version=epoch;
   attendanceWrites.add(id);
   try{
    await call('attendanceSave',{id,status});
    const entry=streams.get(streamKey('attendanceRead',{id}));
    if(entry?.hasValue){
     const rows=entry.value.filter(row=>row.stageName!==state.stageName);
     rows.push({stageName:state.stageName,status});
     confirmed('attendanceRead',{id},rows);
    }else if(entry){
     entry.version++;
     if(entry.inFlight)entry.again=true;else load(entry);
    }
   }finally{if(version===epoch)attendanceWrites.delete(id)}
  },
  async roster(){if(rosterCache&&Date.now()-rosterCache.time<60000)return structuredClone(rosterCache.members);if(rosterRequest)return rosterRequest;const version=epoch;rosterRequest=call('roster').then(result=>{if(version===epoch)rosterCache={time:Date.now(),members:result.members};return structuredClone(result.members)}).finally(()=>{if(version===epoch)rosterRequest=null});return rosterRequest},
  async archivePast(data){const result=await call('archivePast',data);refresh(entry=>entry.action==='read');return result},
  async importLocal(data){const result=await call('importLocal',data);refresh();return result},
  async members(){return (await call('members')).members},async memberSave(member){const result=await call('memberSave',{member});rosterCache=null;return result.member},
  async changePin(pin){await call('changePin',{pin});signOut()}
 };
}
