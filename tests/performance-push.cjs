const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const read = name => fs.readFileSync(require('node:path').join(__dirname,'..',name),'utf8');
const receiver = crypto.createECDH('prime256v1'), sender = crypto.createECDH('prime256v1');
receiver.generateKeys(); sender.generateKeys();
const auth = crypto.randomBytes(16), salt = crypto.randomBytes(16), message = Buffer.from('本日開演！');
const inputs = [receiver.getPublicKey(),auth,sender.getPrivateKey(),salt,message].map(x=>[...x]);
const jwt = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJodHRwczovL2V4YW1wbGUuY29tIn0';
const context=vm.createContext({inputs,jwt});
vm.runInContext(read('google-backend/PushCrypto.gs'),context);
const encrypted=Buffer.from(vm.runInContext('NotebookPushCrypto.seal(...inputs.map(x=>Uint8Array.from(x)))',context));
const point=sender.getPublicKey();
assert.deepEqual(encrypted.subarray(0,16),salt);
assert.equal(encrypted.readUInt32BE(16),4096);
assert.deepEqual(encrypted.subarray(21,86),point);
const hkdf=(ikm,salt,info,size)=>Buffer.from(crypto.hkdfSync('sha256',ikm,salt,info,size));
const shared=receiver.computeSecret(point);
const ikm=hkdf(shared,auth,Buffer.concat([Buffer.from('WebPush: info\0'),receiver.getPublicKey(),point]),32);
const decipher=crypto.createDecipheriv('aes-128-gcm',
  hkdf(ikm,salt,'Content-Encoding: aes128gcm\0',16),
  hkdf(ikm,salt,'Content-Encoding: nonce\0',12));
decipher.setAuthTag(encrypted.subarray(-16));
assert.deepEqual(Buffer.concat([decipher.update(encrypted.subarray(86,-16)),decipher.final()]),
  Buffer.concat([message,Buffer.of(2)]));
const signature=Buffer.from(vm.runInContext('NotebookPushCrypto.signVapid(jwt,Uint8Array.from(inputs[2]))',context));
const key=crypto.createPublicKey({key:{kty:'EC',crv:'P-256',x:point.subarray(1,33).toString('base64url'),
  y:point.subarray(33).toString('base64url')},format:'jwk'});
assert(crypto.verify('sha256',Buffer.from(jwt),{key,dsaEncoding:'ieee-p1363'},signature));

const properties=new Map();
let now=Date.parse('2026-12-06T08:00:00+09:00');
const owner={id:'owner',active:true,owner:true,role:'admin',epoch:1};
const member={id:'member',active:true,role:'viewer',epoch:1};
const event={id:'test',date:'2026-12-20',time:'14:00',title:'落語会',memo:'管理用メモ'};
const endpoint='https://web.push.apple.com/token';
const keyData={p256dh:receiver.getPublicKey().toString('base64url'),auth:auth.toString('base64url')};
let delivered=0;
Object.assign(context,{
 properties,owner,member,event,endpoint,keyData,
 Date:class extends Date {static now(){return now}},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.get(k),setProperty:(k,v)=>properties.set(k,v),
   deleteProperty:k=>properties.delete(k),getKeys:()=>[...properties.keys()]})},
 LockService:{getScriptLock:()=>({tryLock:()=>true,waitLock(){},releaseLock(){}})},
 Utilities:{formatDate:(d,t,pattern)=>{
   const japan=new Date(+d+9*3600000).toISOString();
   return pattern==='HH'?japan.slice(11,13):japan.slice(0,10);
 },base64DecodeWebSafe:s=>Buffer.from(s,'base64url'),
   base64EncodeWebSafe:bytes=>Buffer.from(bytes).toString('base64url'),getUuid:()=>crypto.randomUUID(),
   newBlob:s=>({getBytes:()=>Buffer.from(s)})},
 digest_:s=>crypto.createHash('sha256').update(s).digest('base64url'),
 readDb_:()=>({members:[owner,member],shared:{events:{items:[event]}}}),
 UrlFetchApp:{fetch:(url,options)=>{
   assert.equal(url,endpoint);
   assert.equal(options.followRedirects,false);
   assert.match(options.headers.Authorization,/^vapid t=/);
   delivered++;
   return {getResponseCode:()=>201};
 }},
});
properties.set('PUSH_PRIVATE_KEY',sender.getPrivateKey().toString('base64url'));
properties.set('SESSION_session',JSON.stringify({id:owner.id,epoch:1,expires:now+86400000}));
vm.runInContext(read('google-backend/Push.gs'),context);
const run=source=>vm.runInContext(source,context);
assert.equal(run("pushRequest_(owner,'session',{action:'pushConfig'}).allowed"),false);
properties.set('PUSH_MODE','pilot');
assert.equal(run("pushRequest_(member,'session',{action:'pushConfig'}).allowed"),false);
assert.equal(run("pushRequest_(owner,'session',{action:'pushConfig'}).pilot"),true);
assert.throws(()=>run("pushEndpoint_('https://web.push.apple.com.example.org/token')"),/対応/);
assert.throws(()=>run("pushEndpoint_('https://web.push.apple.com@other.example/token')"),/対応/);
run("pushRequest_(owner,'session',{action:'pushEnable',endpoint,keys:keyData})");
const claim=run("pushRequest_(owner,'session',{action:'pushTest',endpoint},[event]).test");
assert.equal(claim.payload.detail,event.id);
context.claim=claim;
assert.equal(run("pushSendClaimed_(claim.id,claim.payload,120,'session')"),201);
assert.throws(()=>run("pushRequest_(member,'session',{action:'pushOpened',endpoint,receipt:claim.payload.receipt})"),/一致/);
assert.throws(()=>run("pushRequest_(owner,'session',{action:'pushOpened',endpoint,receipt:'wrong'})"),/一致/);
run("pushRequest_(owner,'session',{action:'pushOpened',endpoint,receipt:claim.payload.receipt})");
assert(run('pushReport_(readDb_()).devices[0].openedAt'));
assert.equal(run('pushReport_(readDb_()).devices[0].accepted'),true);
assert(!JSON.stringify(run('pushReport_(readDb_())')).includes(endpoint));
assert.throws(()=>run("pushRequest_(owner,'session',{action:'pushTest',endpoint},[event])"),/1分/);
run('sendPerformanceNotifications()');
assert.equal(delivered,1);
properties.set('PUSH_MODE','members');
assert.equal(run('pushDue_([event],Date.now())[0].title'),'公演まであと2週間！');
assert.equal(run('pushDue_([event],Date.now())[0].body'),'落語会｜2026/12/20 14:00');
for(const field of ['cancelled','archivedAt']){
 event[field]=true;
 run('sendPerformanceNotifications()');
 assert.equal(delivered,1);
 delete event[field];
}
event.date='2026-12-21';run('sendPerformanceNotifications()');assert.equal(delivered,1);
event.date='2026-12-20';
run('sendPerformanceNotifications();sendPerformanceNotifications()');assert.equal(delivered,2);
run("pushRequest_(owner,'session',{action:'pushDisable',endpoint})");
assert.equal(run("pushRequest_(owner,'session',{action:'pushStatus',endpoint}).enabled"),false);
console.log('PASS Web Push encryption, VAPID, endpoint validation, pilot access, timing, deduplication, schedule changes and opt-out');

const listeners={};
let notification, opened, navigated, focused, openPages=[];
const worker=vm.createContext({URL,self:{
 addEventListener:(name,callback)=>{listeners[name]=callback},
 registration:{scope:'https://notebook.example/performance-manager/',
  showNotification:async(title,options)=>{notification={title,...options,close(){}}}},
 clients:{matchAll:async()=>openPages,openWindow:async url=>{opened=url}},
}});
vm.runInContext(read('sw.js'),worker);
(async()=>{
 let done;
 const waitUntil=promise=>{done=promise};
 listeners.push({data:{json:()=>claim.payload},waitUntil});
 await done;
 assert.equal(notification.tag,'notebook-push-test');
 listeners.notificationclick({notification,waitUntil});
 await done;
 assert.equal(opened,'https://notebook.example/performance-manager/?notification=test#push-open='+claim.payload.receipt);
 opened=undefined;
 notification.data={url:'https://notebook.example/performance-manager/?detail=test'};
 openPages=[{url:'https://notebook.example/performance-manager/?source=homescreen',navigate:async url=>{
  navigated=url;return {focus:async()=>{focused=true}};
 }}];
 notification.data={receipt:claim.payload.receipt};
 listeners.notificationclick({notification,waitUntil});
 await done;
 assert.equal(navigated,'https://notebook.example/performance-manager/?notification=test#push-open='+claim.payload.receipt);
 notification.data={url:'https://notebook.example/performance-manager/?detail=test'};
 listeners.notificationclick({notification,waitUntil});
 await done;
 assert.equal(navigated,'https://notebook.example/performance-manager/');
 assert.equal(focused,true);
 assert.equal(opened,undefined);
 openPages=[];
 opened=undefined;
 listeners.push({data:{json:()=>({id:'performance',title:'本日開演！',body:'落語会',detail:'test'})},waitUntil});
 await done;
 listeners.notificationclick({notification,waitUntil});
 await done;
 assert.equal(opened,'https://notebook.example/performance-manager/');
 console.log('PASS test, scheduled and older notifications open the performance list');
})().catch(error=>{console.error(error);process.exitCode=1});

// Login expiration is independent of delivery; stops and PIN changes are permanent.
properties.set('PUSH_MODE','members');
properties.set('SESSION_session',JSON.stringify({id:owner.id,epoch:1,expires:now-1}));
run("pushRequest_(owner,'session',{action:'pushEnable',endpoint,keys:keyData})");
const subId=[...properties.keys()].find(k=>k.startsWith('PUSH_SUB_'));
context.subId=subId;
assert.equal(run("pushRequest_(owner,'fresh',{action:'pushStatus',endpoint}).enabled"),true);
assert(run('pushAvailableRow_(PropertiesService.getScriptProperties(),subId,readDb_())'));
const originalRow=properties.get(subId);
run("pushRemoveSession_(PropertiesService.getScriptProperties(),'fresh')");
assert(!properties.has(subId));
properties.set(subId,originalRow);
owner.active=false;
assert.equal(run('pushAvailableRow_(PropertiesService.getScriptProperties(),subId,readDb_())'),null);
assert(!properties.has(subId));
owner.active=true;
properties.set(subId,originalRow);
owner.epoch++;
assert.equal(run('pushAvailableRow_(PropertiesService.getScriptProperties(),subId,readDb_())'),null);
assert(!properties.has(subId));
owner.epoch--;

let responseCode=503, attempts=0;
context.UrlFetchApp.fetch=()=>{attempts++;return {getResponseCode:()=>responseCode}};
run("pushRequest_(owner,'session',{action:'pushEnable',endpoint,keys:keyData})");
run('sendPerformanceNotifications();sendPerformanceNotifications()');
assert.equal(attempts,1);
assert.equal(run('pushReport_().lastRun.retry'),1);
now+=5*60000;
run('sendPerformanceNotifications()');
assert.equal(attempts,2);
now+=5*60000;
responseCode=201;
run('sendPerformanceNotifications();sendPerformanceNotifications()');
assert.equal(attempts,3);
assert.equal(run('pushReport_().lastRun.accepted'),1);
run("pushRequest_(owner,'session',{action:'pushDisable',endpoint})");
run("pushRequest_(owner,'session',{action:'pushEnable',endpoint,keys:keyData})");
responseCode=410;
run('sendPerformanceNotifications()');
assert(!properties.has(subId));
assert.equal(run('pushReport_().lastRun.expired'),1);
console.log('PASS expired login, opt-out, account stop, PIN revision, bounded retry, acceptance report and expired endpoint');
