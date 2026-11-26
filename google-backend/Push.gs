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
 const owns=stored?.memberId===member.id;
 if(req.action==='pushStatus')return {enabled:owns&&stored.session===session};
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
  props.setProperty(id,JSON.stringify({...subscription,memberId:member.id,epoch:member.epoch,session,sent:{}}));
  return {};
 }
 if(req.action==='pushTest'&&pushMode_()==='pilot'&&owns&&stored.session===session) {
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
function pushAvailableRow_(props,id,now) {
 const row=JSON.parse(props.getProperty(id)||'null');
 if(!row)return null;
 const session=JSON.parse(props.getProperty('SESSION_'+row.session)||'null');
 if(!session||session.expires<=now||session.id!==row.memberId||session.epoch!==row.epoch){
  props.deleteProperty(id);return null;
 }
 const member=readDb_().members.find(m=>m.id===row.memberId);
 if(!member||member.epoch!==row.epoch||!pushAllowed_(member))return null;
 return row;
}
function pushSendClaimed_(id,payload,ttl,expected) {
 const props=PropertiesService.getScriptProperties();
 const row=pushAvailableRow_(props,id,Date.now());
 if(!row||row.session!==expected)return 0;
 if(payload.detail&&payload.kind!=='test'&&!pushDue_(readDb_().shared.events?.items||[],Date.now()).some(item=>item.id===payload.id&&item.body===payload.body))return 0;
 const code=pushDeliver_(row,payload,ttl);
 if(code===404||code===410){
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
   const current=JSON.parse(props.getProperty(id)||'null');
   if(current?.session===row.session&&current.key===row.key)props.deleteProperty(id);
  }finally{lock.releaseLock()}
 }
 return code;
}
// Install a 5-minute time-driven trigger. Only the Japanese 08:00 hour is eligible.
function sendPerformanceNotifications() {
 if(pushMode_()!=='members')return;
 const now=Date.now();
 if(Utilities.formatDate(new Date(now),'Asia/Tokyo','HH')!=='08')return;
 const props=PropertiesService.getScriptProperties();
 const due=pushDue_(readDb_().shared.events?.items||[],now);
 if(!due.length)return;
 const today=Utilities.formatDate(new Date(now),'Asia/Tokyo','yyyy-MM-dd');
 for(const id of props.getKeys().filter(key=>key.startsWith('PUSH_SUB_'))) {
  for(const candidate of due) {
   if(Date.now()-now>90000)return;
   const lock=LockService.getScriptLock();
   if(!lock.tryLock(1000))return;
   let row, payload;
   try {
    row=pushAvailableRow_(props,id,Date.now());
    if(!row)continue;
    if(row.sentDate!==today){row.sent={};row.sentDate=today}
    if(row.sent[candidate.id])continue;
    // Re-read before claiming so a cancellation or reschedule isn't sent from a stale batch.
    payload=pushDue_(readDb_().shared.events?.items||[],Date.now()).find(item=>item.id===candidate.id);
    if(!payload)continue;
    row.sent[payload.id]=true;
    props.setProperty(id,JSON.stringify(row));
   }finally{lock.releaseLock()}
   try{pushSendClaimed_(id,payload,900,row.session)}
   catch{console.warn('公演通知を送信できませんでした。')}
  }
 }
}
