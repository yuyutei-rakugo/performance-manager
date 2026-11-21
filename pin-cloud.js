export function createPinClient(endpoint,state,emit){
 const sessionKey='yuitei.session';
 const identityKey=sessionKey+'.identity';
 const viewKey=sessionKey+'.views.v1';
 const identityMaxAge=30*60*1000;
 const freshFor=60*1000,maxViewAge=10*60*1000;

 const readStorage=store=>{try{return store.getItem(sessionKey)||''}catch{return ''}};
 const removeStorage=store=>{try{store.removeItem(sessionKey)}catch{}};
 let token=readStorage(localStorage)||readStorage(sessionStorage),remember=!!readStorage(localStorage),epoch=0,rosterCache=null,rosterRequest=null;
 function forget(){removeStorage(localStorage);removeStorage(sessionStorage);try{sessionStorage.removeItem(sessionKey+'.temporary')}catch{}}
 function persist(){forget();try{(remember?localStorage:sessionStorage).setItem(sessionKey,token);if(!remember)sessionStorage.setItem(sessionKey+'.temporary','yes')}catch{try{sessionStorage.setItem(sessionKey,token)}catch{}}}
 // Upgrade a still-valid tab session without retaining the PIN.
 if(token&&!remember){try{if(sessionStorage.getItem(sessionKey+'.temporary')!=='yes'){remember=true;persist()}}catch{}}

 // This tab may show recent server responses while new authenticated reads are in flight.
 const views=new Map();
 function readViews(){
  try{
   const saved=JSON.parse(sessionStorage.getItem(viewKey));
   if(saved.token!==token||saved.endpoint!==endpoint||!Array.isArray(saved.entries))return;
   for(const [key,entry] of saved.entries){
    const age=Date.now()-entry.time;
    if(age>=0&&age<maxViewAge)views.set(key,entry);
   }
  }catch{}
 }
 function saveView(key,value,time=Date.now()){
  views.delete(key);views.set(key,{value,time});
  flushViews();
 }
 function flushViews(){
  try{
   for(const [key,entry] of views)if(Date.now()-entry.time>=maxViewAge)views.delete(key);
   while(views.size>20)views.delete(views.keys().next().value);
   const serialized=JSON.stringify({token,endpoint,entries:[...views]});
   if(serialized.length<=1500000)sessionStorage.setItem(viewKey,serialized);
   else sessionStorage.removeItem(viewKey);
  }catch{}
 }
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
   return saved.token===token&&saved.endpoint===endpoint&&age>=0&&age<identityMaxAge?saved.member:null;
  }catch{return null}
 }
 function rememberMember(member){
  try{sessionStorage.setItem(identityKey,JSON.stringify({token,endpoint,member,checkedAt:Date.now()}))}catch{}
 }
 function clear(){try{sessionStorage.removeItem(identityKey);sessionStorage.removeItem(viewKey)}catch{}views.clear();epoch++;rosterCache=null;rosterRequest=null;for(const entry of streams.values()){stopTimer(entry);entry.closed=true}streams.clear();pending.clear();attendanceWrites.clear()}
 function identity(member){state.connectionIssue=null;state.user=member?{uid:member.id,email:member.name}:null;state.stageName=member?.name||null;state.role=member?.role||null;state.owner=!!member?.owner;state.ready=true;state.message=member?'共通保存：'+member.name+'（'+({admin:'管理者',editor:'編集可',viewer:'会員'}[member.role])+'）':'登録名と4桁の暗証番号でログインしてください。';emit()}
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
   entry.value=value;entry.hasValue=true;entry.updatedAt=Date.now();entry.error='';entry.attendanceRefresh=false;
   if(state.user)saveView(streamKey(entry.action,entry.args),value,entry.updatedAt);
   deliver(entry,null,changed);
  }catch(error){
   if(!entry.closed&&version===entry.version){entry.error=error.message;deliver(entry,error.message)}
  }finally{
   entry.inFlight=false;
   if(entry.again){entry.again=false;load(entry)}
  }
 }
 function watch(action,args,fn,onError){
  const now=Date.now(),key=streamKey(action,args);
  for(const [id,other] of streams){
   if(!other.subscribers.size&&!other.inFlight&&!attendanceWrites.has(other.args.id)&&now-other.updatedAt>60000)streams.delete(id);
  }
  let entry=streams.get(key);
  if(!entry){
   const saved=views.get(key);
   entry={action,args,subscribers:new Set(),hasValue:!!saved,value:saved?.value,updatedAt:saved?.time||0,error:'',version:0,inFlight:false,closed:false,timer:null};
   streams.set(key,entry);
  }
  const subscriber={fn,onError,needsValue:true};
  entry.subscribers.add(subscriber);
  if(entry.timer===null)entry.timer=setInterval(()=>{if(document.visibilityState!=='hidden')load(entry)},60000);
  if(entry.hasValue&&now-entry.updatedAt<maxViewAge){
   queueMicrotask(()=>{
    if(entry.closed||!entry.hasValue||!entry.subscribers.has(subscriber)||!subscriber.needsValue)return;
    subscriber.needsValue=false;
    fn(structuredClone(entry.value));
    if(entry.error)onError?.(entry.error);
   });
  }
  if(!entry.hasValue||entry.error||entry.attendanceRefresh||now-entry.updatedAt>=freshFor)load(entry);
  return()=>{entry.subscribers.delete(subscriber);if(!entry.subscribers.size)stopTimer(entry)};
 }
 function refresh(action,name){
  for(const key of views.keys()){const [type,args]=JSON.parse(key);if((!action||type===action)&&(!name||args.name===name))views.delete(key)}
  flushViews();
  for(const entry of streams.values())if((!action||entry.action===action)&&(!name||entry.args.name===name)){
   entry.version++;entry.updatedAt=0;
   if(entry.inFlight)entry.again=true;else load(entry);
  }
 }
 function confirmed(action,args,value){
  const key=streamKey(action,args),entry=streams.get(key);
  if(action==='read'&&(entry?.value?.revision??views.get(key)?.value?.revision)>value.revision)return;
  const time=action==='read'?Date.now():(entry?.updatedAt??views.get(key)?.time??Date.now());
  if(state.user)saveView(key,value,time);
  if(!entry)return;
  entry.version++;entry.value=value;entry.hasValue=true;entry.updatedAt=time;if(action==='attendanceRead')entry.error='';deliver(entry);
 }
 window.addEventListener('storage',event=>{if(event.storageArea===localStorage&&(event.key===sessionKey||event.key===null)&&readStorage(localStorage)!==token&&remember){signOut()}});
 function refreshVisible(){
  for(const entry of streams.values())if(entry.subscribers.size&&Date.now()-entry.updatedAt>=freshFor)load(entry);
 }
 window.addEventListener('focus',refreshVisible);
 window.addEventListener('pageshow',event=>{
  if(!event.persisted||!token)return;
  if((readStorage(localStorage)||readStorage(sessionStorage))!==token)signOut();
  else refreshVisible();
 });
 return {
  async start(){
   state.provider='apps-script';
   if(!token){identity(null);return}
   const member=cachedMember();
   if(member){readViews();identity(member);return}
   try{
    const {member}=await call('session',{remember});
    rememberMember(member);readViews();identity(member);
   }catch(error){if(!error.sessionInvalid)throw error}
  },
  async login(name,pin,keep=true){const result=await call('login',{name,pin,remember:keep});clear();token=result.token;remember=keep;persist();rememberMember(result.member);identity(result.member)},
  async logout(){const request=call('logout');signOut();await request},
  async readShared(name){return (await call('read',{name})).doc},
  async readAttendance(id){return (await call('attendanceRead',{id})).rows},
  watch(name,fn,onError){return watch('read',{name},fn,onError)},watchAttendance(id,fn,onError){return watch('attendanceRead',{id},fn,onError)},
  async save(name,payload,revision){
   try{
    const result=await call('save',{name,items:payload.items,revision});
    confirmed('read',{name},{items:payload.items,revision:result.revision});
    return result.revision;
   }catch(error){
    if(/ほかの端末で更新/.test(error.message))refresh('read',name);
    throw error;
   }
  },
  async respondAttendance(id,status){
   if(attendanceWrites.has(id))throw Error('出欠を保存しています。しばらくお待ちください。');
   const version=epoch;
   attendanceWrites.add(id);
   try{
    await call('attendanceSave',{id,status});
    const entry=streams.get(streamKey('attendanceRead',{id}));
    const previous=entry?.hasValue?entry.value:views.get(streamKey('attendanceRead',{id}))?.value;
    if(previous){
     const rows=previous.filter(row=>row.stageName!==state.stageName);
     rows.push({stageName:state.stageName,status});
     confirmed('attendanceRead',{id},rows);
    }else if(entry){
     entry.version++;
    }
    // Reads begun before the acknowledgement are superseded even when the detail is closed.
    // The new read also picks up answers saved by other members during this write.
    if(entry){
     entry.attendanceRefresh=true;
     if(entry.inFlight)entry.again=true;else load(entry);
    }
   }finally{if(version===epoch)attendanceWrites.delete(id)}
  },
  async roster({force=false}={}){
   const key=streamKey('roster',{});
   const cached=views.get(key);
   if(!force&&cached&&Date.now()-cached.time<freshFor)return structuredClone(cached.value);
   if(!force&&rosterCache&&Date.now()-rosterCache.time<freshFor)return structuredClone(rosterCache.members);
   if(rosterRequest)return rosterRequest;
   if(force){rosterCache=null;views.delete(key);flushViews()}
   const version=epoch;
   rosterRequest=call('roster').then(result=>{
    if(version===epoch){rosterCache={time:Date.now(),members:result.members};if(state.user)saveView(key,result.members)}
    return structuredClone(result.members);
   }).finally(()=>{if(version===epoch)rosterRequest=null});
   return rosterRequest;
  },
  async archivePast(data){const result=await call('archivePast',data);refresh('read');return result},
  async importLocal(data){const result=await call('importLocal',data);refresh();return result},
  async members(){return (await call('members')).members},async memberSave(member){const result=await call('memberSave',{member});rosterCache=null;views.delete(streamKey('roster',{}));flushViews();return result.member},
  async changePin(pin){await call('changePin',{pin});signOut()}
 };
}
