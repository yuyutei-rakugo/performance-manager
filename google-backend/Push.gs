// Script properties are private. Leave PUSH_MODE unset until a pilot is ready.
const pushMessages_ = {
  14:'公演まであと2週間！', 7:'いよいよあと一週間！',
  3:'あと3日！', 1:'いよいよ明日！', 0:'本日開演！',
};
const pushDayMs_ = 86400000;
function pushMode_() {
 const mode=PropertiesService.getScriptProperties().getProperty('PUSH_MODE');
 return mode==='pilot'||mode==='members'?mode:'off';
}
function pushAllowed_(member) {
 const mode=pushMode_();
 return member.active&&(mode==='members'||mode==='pilot'&&member.owner&&member.role==='admin');
}
function pushBytes_(value) {
 return Uint8Array.from(Utilities.base64DecodeWebSafe(value.padEnd(Math.ceil(value.length/4)*4,'=')));
}
function pushBase64_(bytes) {
 return Utilities.base64EncodeWebSafe(Array.from(bytes,n=>n>127?n-256:n)).replace(/=+$/,'');
}
function pushUtf8_(text) {
 return Uint8Array.from(Utilities.newBlob(text).getBytes());
}
function pushKey_() {
 const props=PropertiesService.getScriptProperties();
 const key=pushBytes_(props.getProperty('PUSH_PRIVATE_KEY')||'');
 if(key.length!==32)throw Error('通知の初期設定が必要です。');
 return key;
}
function pushEndpoint_(value) {
 // Match a complete trusted host, insist on a token path, and never follow redirects.
 if(typeof value!=='string'||value.length>2000||!/^https:\/\/(?:fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\/[a-zA-Z0-9._~%/+=:-]+$/.test(value))
  throw Error('このブラウザの通知先には対応していません。');
 return value;
}
function pushSubscription_(input) {
 const endpoint=pushEndpoint_(input?.endpoint);
 const key=input?.keys?.p256dh, auth=input?.keys?.auth;
 if(!/^[\w-]{87}$/.test(key||'')||!(/^[\w-]{22}$/).test(auth||''))
  throw Error('通知先を確認してください。');
 return {endpoint,key,auth};
}
function pushRequest_(member,session,req,events) {
 const props=PropertiesService.getScriptProperties();
 const allowed=pushAllowed_(member);
 if(req.action==='pushConfig') {
  if(!allowed)return {allowed:false};
  return {allowed:true,pilot:pushMode_()==='pilot',publicKey:pushBase64_(NotebookPushCrypto.publicKey(pushKey_()))};
 }
 const endpoint=pushEndpoint_(req.endpoint);
 const id='PUSH_SUB_'+digest_(endpoint), stored=JSON.parse(props.getProperty(id)||'null');
 const owns=stored?.memberId===member.id&&stored.epoch===member.epoch;
 if(req.action==='pushStatus'){
  if(owns&&allowed&&stored.session!==session){
   stored.session=session;
   props.setProperty(id,JSON.stringify(stored));
  }
  return {enabled:owns&&allowed,differentMember:!!stored&&stored.memberId!==member.id};
 }
 if(req.action==='pushDisable'){
  if(owns)props.deleteProperty(id);
  return {};
 }
 if(!allowed)throw Error('この会員は現在、通知を設定できません。');
 if(req.action==='pushEnable') {
  if(owns&&stored.session===session)return {};
  if(!stored&&props.getKeys().filter(k=>k.startsWith('PUSH_SUB_')).length>=50)
   throw Error('通知端末の登録上限に達しました。');
  const subscription=pushSubscription_({endpoint,keys:req.keys});
  // Validate the P-256 point before storing it.
  NotebookPushCrypto.validatePublicKey(pushBytes_(subscription.key));
  props.setProperty(id,JSON.stringify({...subscription,memberId:member.id,epoch:member.epoch,session,sent:{},registration:Utilities.getUuid()}));
  return {};
 }
 if(req.action==='pushTest'&&owns&&stored.session===session) {
  const now=Date.now();
  if(now-(stored.testAt||0)<60000)throw Error('1分待ってからお試しください。');
  stored.testAt=now;
  props.setProperty(id,JSON.stringify(stored));
  const today=Utilities.formatDate(new Date(now),'Asia/Tokyo','yyyy-MM-dd');
  const next=(events||[]).filter(event=>event.date>=today&&!pushCancelled_(event))
   .sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time))[0];
  const payload=next
   ? {id:'notebook-push-test',kind:'test',detail:next.id,title:'帳面のテスト通知',body:pushEventLabel_(next)}
   : {id:'notebook-push-test',kind:'test',title:'帳面のテスト通知',body:'通知を押すと帳面が開きます。'};
  return {test:{id,payload}};
 }
 throw Error('この通知操作は利用できません。');
}
function pushDeliver_(row,payload,ttl) {
 const endpoint=pushEndpoint_(row.endpoint), audience=endpoint.split('/').slice(0,3).join('/');
 const key=pushKey_();
 // Derive fresh material from a private key and independent unique UUID inputs.
 const salt=pushBytes_(digest_('push-salt:'+Utilities.getUuid())).slice(0,16);
 const ephemeral=pushBytes_(digest_('push-key:'+Utilities.getUuid()));
 const claims=pushBase64_(pushUtf8_('{"typ":"JWT","alg":"ES256"}'))+'.'+pushBase64_(pushUtf8_(JSON.stringify({
  aud:audience,exp:Math.floor(Date.now()/1000)+3600,
  sub:'https://yuyutei-rakugo.github.io/performance-manager/',
 })));
 const signature=pushBase64_(NotebookPushCrypto.signVapid(claims,key));
 const encrypted=NotebookPushCrypto.seal(pushBytes_(row.key),pushBytes_(row.auth),ephemeral,salt,pushUtf8_(JSON.stringify(payload)));
 const response=UrlFetchApp.fetch(endpoint,{method:'post',followRedirects:false,muteHttpExceptions:true,
  contentType:'application/octet-stream',payload:Array.from(encrypted,n=>n>127?n-256:n),headers:{
   Authorization:'vapid t='+claims+'.'+signature+', k='+pushBase64_(NotebookPushCrypto.publicKey(key)),
   'Content-Encoding':'aes128gcm',TTL:String(ttl),Topic:digest_(payload.id).slice(0,32),
  }});
 return response.getResponseCode();
}
function pushCancelled_(event) {
 return event.archivedAt||event.cancelled||event.canceled||event.status==='中止';
}
function pushEventLabel_(event) {
 return String(event.title).slice(0,120)+'｜'+event.date.replace(/-/g,'/')+' '+(event.time||'開演時刻未定');
}
function pushDue_(events,now) {
 const date=Utilities.formatDate(new Date(now),'Asia/Tokyo','yyyy-MM-dd');
 return events.flatMap(event=>{
  if(pushCancelled_(event))return [];
  const days=(Date.parse(event.date)-Date.parse(date))/pushDayMs_, title=pushMessages_[days];
  if(!title)return [];
  if(days===0&&event.time&&now>Date.parse(event.date+'T'+event.time+'+09:00'))return [];
  return [{id:digest_(JSON.stringify(['performance',event.id,event.date,days])),detail:event.id,title,
   body:pushEventLabel_(event)}];
 });
}
function pushAvailableRow_(props,id,db) {
 const row=JSON.parse(props.getProperty(id)||'null');
 if(!row)return null;
 const member=db.members.find(m=>m.id===row.memberId);
 if(!member?.active||member.epoch!==row.epoch){props.deleteProperty(id);return null}
 return pushAllowed_(member)?row:null;
}
function pushRemoveSession_(props,session) {
 for(const id of props.getKeys().filter(key=>key.startsWith('PUSH_SUB_'))) {
  const row=JSON.parse(props.getProperty(id)||'null');
  if(row?.session===session)props.deleteProperty(id);
 }
}
function pushSameRegistration_(a,b) {
 return a&&b&&a.registration===b.registration&&a.session===b.session&&a.key===b.key;
}
function pushTryDelivery_(row,payload,ttl) {
 try{return pushDeliver_(row,payload,ttl)}
 catch{return 0}
}
function pushSendClaimed_(id,payload,ttl,expected) {
 const props=PropertiesService.getScriptProperties();
 const lock=LockService.getScriptLock();lock.waitLock(10000);
 let row;
 try {
  row=pushAvailableRow_(props,id,readDb_());
  if(!row||row.session!==expected)return 0;
 }finally{lock.releaseLock()}
 const code=pushTryDelivery_(row,payload,ttl);
 lock.waitLock(10000);
 try {
  const current=JSON.parse(props.getProperty(id)||'null');
  if(pushSameRegistration_(current,row)&&(code===404||code===410))props.deleteProperty(id);
  props.setProperty('PUSH_LAST_TEST',JSON.stringify({at:new Date().toISOString(),code,
   accepted:code>=200&&code<300}));
 }finally{lock.releaseLock()}
 return code;
}
function pushReport_() {
 const props=PropertiesService.getScriptProperties();
 const rows=props.getKeys().filter(key=>key.startsWith('PUSH_SUB_'));
 return {mode:pushMode_(),registered:rows.length,limit:50,
  lastTest:JSON.parse(props.getProperty('PUSH_LAST_TEST')||'null'),
  lastRun:JSON.parse(props.getProperty('PUSH_LAST_RUN')||'null')};
}
function pushClaim_(props,id,candidate,today,now) {
 const prior=JSON.parse(props.getProperty(id)||'null');
 if(!prior)return null;
 const previous=prior.sentDate===today?prior.sent?.[candidate.id]:null;
 if(previous===true||previous&&(!['retry','sending'].includes(previous.state)||previous.nextAt>now||previous.attempts>=3))return null;
 const db=readDb_();
 const row=pushAvailableRow_(props,id,db);
 if(!row)return null;
 const payload=pushDue_(db.shared.events?.items||[],now).find(item=>item.id===candidate.id);
 if(!payload)return null;
 if(row.sentDate!==today){row.sent={};row.sentDate=today}
 const claim={state:'sending',attempts:(previous?.attempts||0)+1,nextAt:now+10*60000};
 row.sent[payload.id]=claim;
 props.setProperty(id,JSON.stringify(row));
 return {row,payload,claim};
}
function pushRecordResult_(props,id,work,code,now) {
 const {row,payload,claim}=work;
 const current=JSON.parse(props.getProperty(id)||'null');
 if(!pushSameRegistration_(current,row)||current.sentDate!==row.sentDate||
    current.sent?.[payload.id]?.attempts!==claim.attempts)return 'skipped';
 if(code===404||code===410){props.deleteProperty(id);return 'expired'}
 const accepted=code>=200&&code<300;
 const temporary=code===0||code===408||code===429||code>=500;
 const state=accepted?'accepted':temporary&&claim.attempts<3?'retry':'failed';
 current.sent[payload.id]={state,attempts:claim.attempts,nextAt:now+5*60000};
 props.setProperty(id,JSON.stringify(current));
 return state;
}
// A time-driven trigger checks the Japanese 08:00 hour.
function sendPerformanceNotifications() {
 const started=Date.now();
 if(pushMode_()!=='members'||Utilities.formatDate(new Date(started),'Asia/Tokyo','HH')!=='08')return;
 const props=PropertiesService.getScriptProperties();
 const due=pushDue_(readDb_().shared.events?.items||[],started);
 const today=Utilities.formatDate(new Date(started),'Asia/Tokyo','yyyy-MM-dd');
 const totals={accepted:0,retry:0,failed:0,expired:0,skipped:0};
 const lock=LockService.getScriptLock();
 try {
  for(const id of props.getKeys().filter(key=>key.startsWith('PUSH_SUB_'))) {
   for(const candidate of due) {
    const now=Date.now();
    if(now-started>90000||Utilities.formatDate(new Date(now),'Asia/Tokyo','HH')!=='08'||pushMode_()!=='members')return;
    if(!lock.tryLock(1000))return;
    let work;
    try{work=pushClaim_(props,id,candidate,today,now)}
    finally{lock.releaseLock()}
    if(!work)continue;
    const code=pushTryDelivery_(work.row,work.payload,900);
    lock.waitLock(10000);
    try{totals[pushRecordResult_(props,id,work,code,Date.now())]++}
    finally{lock.releaseLock()}
   }
  }
 }finally{
  if(Object.values(totals).some(Boolean))
   props.setProperty('PUSH_LAST_RUN',JSON.stringify({at:new Date().toISOString(),...totals}));
 }
}
