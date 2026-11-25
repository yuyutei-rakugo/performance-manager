/** 結友亭 共通保存 API。Google Apps Script V8・所有者として実行するウェブアプリ。
 * 権限はdrive.fileに限定。必ず同梱appsscript.jsonとセットで配置する。
 * 最初に initializeOwner をエディタで実行。初期PINは1111（OWNER_PINで任意指定も可）。
 * PIN・認証鍵・会員情報を公開リポジトリやログに記録しない。
 */
function initializeOwner(){
 const lock=LockService.getScriptLock();lock.waitLock(20000);
 try{const props=PropertiesService.getScriptProperties();if(props.getProperty('DB_FILE_ID'))throw Error('初期設定済みです。');const pin=props.getProperty('OWNER_PIN')||'1111';checkPin_(pin);const secret=Utilities.getUuid()+Utilities.getUuid();props.setProperty('AUTH_SECRET',secret);const owner={id:'owner',name:'勇水',role:'admin',active:true,epoch:1,salt:Utilities.getUuid(),owner:true};owner.pinHash=hashPin_(owner,pin);const file=Drive.Files.create({name:'結友亭の帳面-共通データ.json',mimeType:'application/json'},Utilities.newBlob(JSON.stringify({version:1,members:[owner],shared:{},attendance:{}}),'application/json'),{fields:'id'});props.setProperty('DB_FILE_ID',file.id);props.deleteProperty('OWNER_PIN');return '勇水を最初の管理者として登録しました。'}finally{lock.releaseLock()}
}
function doGet(){return output_({reservationDocuments:true,ok:true,service:'yuyutei-members',version:1,attendanceProxy:true,rehearsalArchiveToday:true,automaticBackup:true,backupRecoveryRevision:2,checklistExclusion:true,flyerVenues:true,flyerLocationFields:true,flyerSharedFacilities:true,flyerDeclineHistory:true,flyerGoogleShare:true})}
function doPost(event){
 const lock=LockService.getScriptLock();let locked=false;
 try{if(!event||!event.postData||event.postData.contents.length>1500000)throw Error('リクエストを確認してください。');const req=JSON.parse(event.postData.contents);if(!req||typeof req!=='object')throw Error('リクエストを確認してください。');if(req.action==='flyerResolveGoogleLink'){authorize_(readDb_(),req.token);return output_({ok:true,...flyerResolveGoogleLink_(req.url)})}lock.waitLock(20000);locked=true;const db=readDb_();if(req.action==='login')return output_({ok:true,...login_(db,req)});const member=authorize_(db,req.token);let data;
 switch(req.action){
 case 'reservationList':case 'reservationPhoto':case 'reservationAdd':case 'reservationReview':case 'reservationContact':data=reservationRequest_(db,member,req);break;
 case 'flyerMigrationPreview':case 'flyerMigrationApply':admin_(member);data=flyerMigration_(db,req);break;
 case 'flyerRestore':admin_(member);data=flyerRequest_(db,req);break;
 case 'flyerRead':case 'flyerSave':case 'flyerRefuse':case 'flyerCarry':case 'flyerImport':data=flyerRequest_(db,req);break;
 case 'roster':data={members:db.members.filter(m=>m.active).map(m=>({name:m.name}))};break;
 case 'archivePast':admin_(member);data=archivePast_(db,req,member);if(data.count)writeDb_(db);break;
 case 'importLocal':admin_(member);data=importLocal_(db,req,member);if(db.flyers?.facilities)seedFlyerFacilities_(db.flyers,db.shared.events.items);writeDb_(db);break;
 case 'session':if(req.remember===true){const props=PropertiesService.getScriptProperties(),key='SESSION_'+digest_(req.token),session=JSON.parse(props.getProperty(key));session.expires=Date.now()+30*24*60*60*1000;props.setProperty(key,JSON.stringify(session))}data={member:publicMember_(member)};break;
 case 'read':checkCollection_(req.name);data={doc:db.shared[req.name]||null};break;
 case 'save':if(!['admin','editor'].includes(member.role))throw Error('編集権限が必要です。');checkCollection_(req.name);validCollection_(req.name,req.items);if(!Array.isArray(req.items)||req.items.length>500)throw Error('データの形式を確認してください。');const current=db.shared[req.name];if(['events','rehearsals'].includes(req.name)){const old=new Map((current?current.items:[]).map(r=>[r.id,r]));for(const r of req.items){if((r.archivedAt||null)!==(old.get(r.id)?.archivedAt||null))throw Error('記録への移動は管理者ページから行ってください。')}for(const r of old.values())if(r.archivedAt&&!req.items.some(n=>n.id===r.id))throw Error('転記済みの予定は保持してください。')}if((current?current.revision:0)!==req.revision)throw Error('ほかの端末で更新されています。再読み込みしてください。');db.shared[req.name]={items:req.items,revision:req.revision+1,updatedBy:member.id,updatedAt:new Date().toISOString()};if(req.name==='events'&&db.flyers?.facilities)seedFlyerFacilities_(db.flyers,req.items);writeDb_(db);data={revision:req.revision+1};break;
 case 'attendanceRead':checkId_(req.id);data={rows:Object.values(db.attendance[req.id]||{})};break;
 case 'attendanceSave':checkId_(req.id);if(db.shared.rehearsals?.items.some(r=>r.id===req.id&&r.archivedAt))throw Error('この稽古は記録へ移動済みです。');if(typeof req.id!=='string'||!['出席','欠席','未定','未回答'].includes(req.status))throw Error('出欠を確認してください。');db.attendance[req.id]=db.attendance[req.id]||{};db.attendance[req.id][member.id]={stageName:member.name,status:req.status,updatedAt:new Date().toISOString()};writeDb_(db);data={};break;
 case 'attendanceProxy':{
  admin_(member);
  checkId_(req.id);
  if(!['出席','欠席','未定'].includes(req.status))throw Error('出欠を確認してください。');
  if(!db.shared.rehearsals?.items.some(r=>r.id===req.id&&!r.archivedAt))throw Error('有効な稽古予定を確認してください。');
  const target=db.members.find(m=>m.active&&m.name===req.name);
  if(!target||target.id===member.id)throw Error('未登録の会員を選択してください。');
  const rows=db.attendance[req.id]||{};
  const current=rows[target.id]||Object.values(rows).find(r=>r.stageName===target.name&&r.status!=='未回答');
  if(current&&current.status!=='未回答'){data={applied:false};break}
  rows[target.id]={stageName:target.name,status:req.status,delegated:true,updatedAt:new Date().toISOString()};
  db.attendance[req.id]=rows;
  writeDb_(db);data={applied:true};break;
 }
 case 'backupList':admin_(member);data={backups:backupIndex_(),expected:digest_(JSON.stringify({shared:db.shared,attendance:db.attendance}))};break;
 case 'backupCreate':admin_(member);createDataBackup_(db,true);data={backups:backupIndex_(),expected:digest_(JSON.stringify({shared:db.shared,attendance:db.attendance}))};break;
 case 'backupRestore':admin_(member);data=restoreDataBackup_(db,req,member);break;
 case 'members':admin_(member);data={members:db.members.map(publicMember_)};break;
 case 'memberSave':admin_(member);data={member:saveMember_(db,member,req.member)};writeDb_(db);break;
 case 'changePin':checkPin_(req.pin);member.salt=Utilities.getUuid();member.pinHash=hashPin_(member,req.pin);member.epoch++;writeDb_(db);data={};break;
 case 'logout':PropertiesService.getScriptProperties().deleteProperty('SESSION_'+digest_(req.token));data={};break;
 default:throw Error('この操作は利用できません。');
 }
 return output_({ok:true,...data});
 }catch(error){return output_({ok:false,error:error.message||'処理できませんでした。'})}finally{if(locked)lock.releaseLock()}
}
function checkId_(id){if(typeof id!=='string'||['__proto__','constructor','prototype'].includes(id)||!/^[A-Za-z0-9:_-]{1,160}$/.test(id))throw Error('予定のIDを確認してください。')}
function checkPin_(pin){if(typeof pin!=='string'||!/^\d{4}$/.test(pin))throw Error('暗証番号は数字4桁です。')}
function checkCollection_(name){if(!['events','rehearsals','history'].includes(name))throw Error('保存先を確認してください。')}
function admin_(member){if(member.role!=='admin')throw Error('管理者のみ操作できます。')}
function secret_(){const s=PropertiesService.getScriptProperties().getProperty('AUTH_SECRET');if(!s)throw Error('管理者の初期設定が必要です。');return s}
function digest_(value){return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(value),secret_())).replace(/=+$/,'')}
function hashPin_(m,pin){return digest_(m.id+':'+m.salt+':'+pin)}
let previousBackupText_=null;
function readDb_(){const id=PropertiesService.getScriptProperties().getProperty('DB_FILE_ID');if(!id)throw Error('管理者の初期設定が必要です。');const response=UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?alt=media',{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true});if(response.getResponseCode()!==200)throw Error('専用データを読み込めません。Googleの接続設定を確認してください。');const text=response.getContentText('UTF-8');const parsed=JSON.parse(text);previousBackupText_=text;return parsed}
function writeDb_(db){const text=JSON.stringify(db);if(text.length>1500000)throw Error('保存量が増えています。バックアップして管理者に確認してください。');if(previousBackupText_)createDataBackup_(previousBackupText_);Drive.Files.update({},PropertiesService.getScriptProperties().getProperty('DB_FILE_ID'),Utilities.newBlob(text,'application/json'),{fields:'id'});previousBackupText_=text}
function output_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON)}
function publicMember_(m){return {id:m.id,name:m.name,role:m.role,active:m.active,owner:!!m.owner,...(m.role==='admin'?{attendanceProxy:true}:{})}}
function login_(db,req){
 const props=PropertiesService.getScriptProperties(),name=String(req.name||'').trim().normalize('NFKC');if(name.length>40)throw Error('登録名または暗証番号が違います。');const known=db.members.some(m=>m.name===name&&m.active),key='ATTEMPT_'+digest_(known?name:'unknown'),attempt=JSON.parse(props.getProperty(key)||'{"count":0,"until":0}'),now=Date.now();
 if(attempt.until>now)throw Error('しばらく待ってからログインしてください。');const member=db.members.find(m=>m.name===name&&m.active);const good=member&&typeof req.pin==='string'&&/^\d{4}$/.test(req.pin)&&hashPin_(member,req.pin)===member.pinHash;
 if(!good){const count=attempt.count+1;props.setProperty(key,JSON.stringify({count:count>=5?0:count,until:count>=5?now+15*60*1000:0}));throw Error('登録名または暗証番号が違います。')}
 props.deleteProperty(key);const token=Utilities.getUuid()+Utilities.getUuid();const all=props.getProperties();for(const k in all)if(k.indexOf('SESSION_')===0){try{if(JSON.parse(all[k]).expires<=now)props.deleteProperty(k)}catch{props.deleteProperty(k)}}
 const ownSessions=Object.entries(props.getProperties()).filter(([k,v])=>k.indexOf('SESSION_')===0&&JSON.parse(v).id===member.id).sort((a,b)=>JSON.parse(a[1]).expires-JSON.parse(b[1]).expires);while(ownSessions.length>=5)props.deleteProperty(ownSessions.shift()[0]);
 props.setProperty('SESSION_'+digest_(token),JSON.stringify({id:member.id,epoch:member.epoch,expires:now+(req.remember===true?30*24:12)*60*60*1000}));return {token,member:publicMember_(member)};
}
function authorize_(db,token){if(typeof token!=='string'||token.length>100)throw Error('会員ログインが必要です。');const raw=PropertiesService.getScriptProperties().getProperty('SESSION_'+digest_(token));if(!raw)throw Error('会員ログインが必要です。');const session=JSON.parse(raw),member=db.members.find(m=>m.id===session.id&&m.active);if(!member||session.expires<=Date.now()||session.epoch!==member.epoch)throw Error('ログインの期限が切れました。再ログインしてください。');return member}
function saveMember_(db,actor,input){
 if(!input||typeof input.name!=='string'||!input.name.trim()||input.name.length>40||!['admin','editor','viewer'].includes(input.role)||typeof input.active!=='boolean')throw Error('会員情報を確認してください。');const name=input.name.trim().normalize('NFKC');let target=db.members.find(m=>m.id===input.id);
 if(db.members.some(m=>m.name===name&&m.id!==(target&&target.id)))throw Error('同じ登録名が使われています。');
 if(target&&target.owner)throw Error('勇水の管理者権限は変更できません。');if((input.role==='admin'||target&&target.role==='admin')&&!actor.owner)throw Error('管理者の追加・変更は勇水のみ操作できます。');
 if(!target){if(db.members.length>=100)throw Error('会員は100名までです。');const initialPin=input.pin||'1111';checkPin_(initialPin);target={id:Utilities.getUuid(),salt:Utilities.getUuid(),epoch:1,owner:false};target.pinHash=hashPin_(target,initialPin);db.members.push(target)}else if(input.pin){checkPin_(input.pin);target.salt=Utilities.getUuid();target.pinHash=hashPin_(target,input.pin);target.epoch++}
 target.name=name;target.active=input.active;target.role=input.role;return publicMember_(target);
}

function archivePast_(db,req,actor){
 if(!Array.isArray(req.transfers)||req.transfers.length>500||!req.revisions)throw Error('転記する予定を確認してください。');
 const detail=req.rehearsalDetail===true;
 if(detail&&(req.transfers.length!==1||req.transfers[0]?.type!=='rehearsal'))throw Error('稽古を1件選択してください。');
 const today=Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd'),changed={};
 const history=db.shared.history||{items:[],revision:0},rehearsals=db.shared.rehearsals;
 const map=new Map(history.items.map(r=>[r.id,r]));
 if(detail){
  const id=req.transfers[0].id;checkId_(id);
  if(rehearsals?.items.some(r=>r.id===id&&r.archivedAt)&&map.has('transferred:rehearsal:'+id))return {count:0,rehearsals};
 }
 if(history.revision!==req.revisions.history)throw Error('記録が更新されています。再読み込みしてください。');
 let count=0;
 for(const t of req.transfers){
  const collection=t.type==='event'?'events':t.type==='rehearsal'?'rehearsals':null;
  if(!collection)throw Error('予定の種類を確認してください。');
  const doc=db.shared[collection];
  if(!doc||doc.revision!==req.revisions[collection])throw Error('予定が更新されています。再読み込みしてください。');
  const source=doc.items.find(r=>r.id===t.id);
  if(!source||source.archivedAt||(detail?source.date>today:source.date>=today))throw Error(detail?'当日以前の未転記の稽古を選択してください。':'日付が過ぎた未転記の予定だけを選択してください。');
  if(!t.record||t.record.id!=='transferred:'+t.type+':'+source.id||t.record.date!==source.date||typeof t.record.kind!=='string'||typeof t.record.note!=='string'||!t.record.pieces)throw Error('転記内容を確認してください。');
  if(detail){
   const actual=Object.fromEntries(Object.values(db.attendance[source.id]||{}).map(row=>[row.stageName,row.status]));
   const snapshot=t.record.attendance||{};
   if(Object.keys(actual).length!==Object.keys(snapshot).length||Object.keys(actual).some(name=>actual[name]!==snapshot[name]))throw Error('出欠が更新されました。もう一度お試しください。');
  }
  validCollection_('history',[t.record]);map.set(t.record.id,t.record);
  source.archivedAt=new Date().toISOString();changed[collection]=true;count++;
 }
 if(map.size>500)throw Error('記録は500件までです。');
 if(count){
  db.shared.history={items:Array.from(map.values()),revision:history.revision+1,updatedBy:actor.id,updatedAt:new Date().toISOString(),...(history.useBuiltInHistory===true?{useBuiltInHistory:true}:{})};
  for(const name in changed){db.shared[name].revision++;db.shared[name].updatedBy=actor.id;db.shared[name].updatedAt=new Date().toISOString()}
 }
 return detail?{count,rehearsals}:{count};
}
function importLocal_(db,req,actor){
 if(!req.documents||!req.attendance||typeof req.attendance!=='object')throw Error('移行データを確認してください。');for(const name of ['events','rehearsals','history']){const incoming=req.documents[name];validCollection_(name,incoming);if(!Array.isArray(incoming)||!incoming.every(r=>r&&typeof r.id==='string'&&typeof r.date==='string'))throw Error('予定・記録の形式を確認してください。');const current=db.shared[name]||{items:[],revision:0};const merged=new Map(current.items.map(r=>[r.id,r]));incoming.forEach(r=>{if(!merged.has(r.id)&&!(name!=='history'&&current.items.some(old=>old.date===r.date)))merged.set(r.id,r)});if(merged.size>500)throw Error('各一覧は500件までです。');db.shared[name]={items:Array.from(merged.values()),revision:current.revision+1,updatedBy:actor.id,updatedAt:new Date().toISOString()}}
 for(const id in req.attendance){const dest=db.attendance[id]||{};for(const name in req.attendance[id]){const status=req.attendance[id][name];if(!['出席','欠席','未定','未回答'].includes(status))throw Error('出欠の形式を確認してください。');if(!Object.values(dest).some(r=>r.stageName===name)){const m=db.members.find(m=>m.name===name);dest[m?m.id:'imported-'+name]={stageName:name,status,updatedAt:new Date().toISOString()}}}db.attendance[id]=dest}return {imported:true};
}
function validCollection_(name,items){
 if(!Array.isArray(items)||items.length>500)throw Error('保存するデータを確認してください。');const ids=new Set();for(const r of items){if(!r||typeof r.id!=='string'||!r.id||ids.has(r.id)||typeof r.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.date))throw Error('日付・IDを確認してください。');ids.add(r.id);if(name==='history'){if(!['kind','occasion','note'].every(k=>typeof r[k]==='string')||!r.pieces||typeof r.pieces!=='object'||Array.isArray(r.pieces)||!Object.values(r.pieces).every(v=>typeof v==='string'))throw Error('記録の形式を確認してください。')}else{if(!['title','time','venue',name==='events'?'memo':'notes'].every(k=>typeof r[k]==='string')||!r.title.trim()||!r.venue.trim()||!(name==='events'&&r.time==='')&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time))throw Error('予定の形式を確認してください。');if(name==='events'&&(!Array.isArray(r.performers)||!Array.isArray(r.checklist)||!r.checklist.length||r.checklist.length>200||!r.checklist.every(t=>t&&typeof t.label==='string'&&t.label.trim()&&typeof t.done==='boolean'&&(t.excluded===undefined||typeof t.excluded==='boolean'&&!(t.excluded&&t.done)))))throw Error('出演者・準備項目を確認してください。')}}
}

// Private Drive snapshots. The first changed save each JST day preserves the pre-change data.
// Manual and pre-restore snapshots also run under the same script lock.
function storedBackups_(){
 const raw=PropertiesService.getScriptProperties().getProperty('DATA_BACKUPS');
 const rows=JSON.parse(raw||'[]');
 if(!Array.isArray(rows))throw Error('バックアップ管理情報を確認してください。');
 return rows;
}
function backupIndex_(){return storedBackups_().slice(0,14)}
function createDataBackup_(snapshot,force=false){
 const props=PropertiesService.getScriptProperties(),day=Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd');
 if(!force&&props.getProperty('DATA_BACKUP_DAY')===day)return;
 let rows=storedBackups_();
 const createdAt=new Date().toISOString();
 let file;
 try{file=Drive.Files.create({name:'結友亭の帳面-バックアップ-'+createdAt.replace(/[:.]/g,'-')+'.json',mimeType:'application/json'},Utilities.newBlob(typeof snapshot==='string'?snapshot:JSON.stringify(snapshot),'application/json'),{fields:'id'})}
 catch{throw Error('バックアップを作成できないため保存を中止しました。時間をおいて再試行してください。')}
 rows=[{id:file.id,createdAt},...rows];
 try{props.setProperty('DATA_BACKUPS',JSON.stringify(rows))}
 catch{
  try{Drive.Files.remove(file.id)}catch{}
  throw Error('バックアップを登録できないため保存を中止しました。');
 }
 props.setProperty('DATA_BACKUP_DAY',day);
 // Retain IDs whose cleanup failed so the next backup can retry.
 const remaining=rows.slice(0,14);
 for(const row of rows.slice(14)){
  try{Drive.Files.update({trashed:true},row.id,null,{fields:'id'})}
  catch{remaining.push(row)}
 }
 if(remaining.length!==rows.length){
  try{props.setProperty('DATA_BACKUPS',JSON.stringify(remaining))}catch{}
 }
 return rows[0];
}
function restoreDataBackup_(db,req,actor){
 const entry=backupIndex_().find(row=>row.id===req.id);
 if(!entry)throw Error('バックアップを選択し直してください。');
 if(req.expected!==digest_(JSON.stringify({shared:db.shared,attendance:db.attendance})))throw Error('ほかの会員が更新しました。最新の内容を確認してからやり直してください。');
 const response=UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(entry.id)+'?alt=media',{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true});
 if(response.getResponseCode()!==200)throw Error('バックアップを読み込めませんでした。');
 const snapshot=JSON.parse(response.getContentText('UTF-8'));
 if(!snapshot||snapshot.version!==1||!isBackupMap_(snapshot.shared)||!isBackupMap_(snapshot.attendance))throw Error('バックアップの形式を確認してください。');
 for(const name of Object.keys(snapshot.shared)){checkCollection_(name);validCollection_(name,snapshot.shared[name].items)}
 for(const id of Object.keys(snapshot.attendance)){checkId_(id);if(!isBackupMap_(snapshot.attendance[id]))throw Error('出欠の形式を確認してください。');for(const row of Object.values(snapshot.attendance[id]))if(!row||typeof row.stageName!=='string'||!['出席','欠席','未定','未回答'].includes(row.status))throw Error('出欠の形式を確認してください。')}
 createDataBackup_(db,true);
 const shared={};
 for(const name of ['events','rehearsals','history']){
  shared[name]={items:snapshot.shared[name]?.items||[],revision:Math.max(db.shared[name]?.revision||0,snapshot.shared[name]?.revision||0)+1,updatedBy:actor.id,updatedAt:new Date().toISOString()};
 }
 if(!snapshot.shared.history||snapshot.shared.history.useBuiltInHistory===true)shared.history.useBuiltInHistory=true;
 const names=new Map(db.members.map(member=>[member.id,member.name]));
 for(const rows of Object.values(snapshot.attendance)){
  for(const [id,row] of Object.entries(rows))if(names.has(id))row.stageName=names.get(id);
 }
 db.shared=shared;db.attendance=snapshot.attendance;
 writeDb_(db);
 return {restored:true};
}

function isBackupMap_(value){return value&&typeof value==='object'&&!Array.isArray(value)}

// Owner's editor action: create an initial checkpoint without changing the database.
function backupNow(){
 const lock=LockService.getScriptLock();lock.waitLock(20000);
 try{createDataBackup_(readDb_(),true);return '現在の内容をバックアップしました。'}finally{lock.releaseLock()}
}

const flyerStatuses_=['未依頼','依頼済み','掲示済み','今回は見送り'];
const flyerCategories_=['コンビニ','スーパー・商店','公共施設','飲食店','その他のお店・施設','その他'];

function flyerText_(value,max,optional=false){
 if(typeof value!=='string'||value.length>max||!optional&&!value.trim())throw Error('掲示先の入力内容を確認してください。');
 return optional?value:value.trim();
}
function flyerKey_(name,region){
 return JSON.stringify([region,name].map(value=>value.normalize('NFKC').toLowerCase().replace(/\s+/g,'')));
}
function flyerLocation_(input){
 if(input===null)return null;
 if(!input||typeof input!=='object')throw Error('位置情報を確認してください。');
 const address=flyerText_(input.address,250,true),mapUrl=flyerText_(input.mapUrl,1000,true);
 const lat=input.lat,lng=input.lng;
 if(mapUrl&&!/^https:\/\/[^\s]+$/.test(mapUrl))throw Error('地図URLはhttpsで始めてください。');
 if(lat===undefined&&lng===undefined)return address||mapUrl?{address,mapUrl}:null;
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)throw Error('緯度・経度を確認してください。');
 return {address,mapUrl,lat,lng};
}
function flyerEntry_(input){
 if(!input||!flyerStatuses_.includes(input.status))throw Error('掲示先の状況を選んでください。');
 const name=flyerText_(input.name,120),region=flyerText_(input.region,80);
 return {name,region,category:flyerText_(input.category,80),status:input.status,memo:flyerText_(input.memo,2000,true),...(input.location===undefined?{}:{location:flyerLocation_(input.location)})};
}
function flyerKeys_(row){return row.keys||[flyerKey_(row.name,row.region)]}
function flyerBlocked_(flyers){return new Set(flyers.refused.filter(row=>!row.restoredAt).flatMap(flyerKeys_))}
function flyerUpcoming_(event,now){
 return !event.archivedAt&&event.date+(event.time||'23:59')>=now;
}
function flyerNow_(){return Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-ddHH:mm')}
function flyerFacility_(row){
 const {name,region,category,location}=row;
 return {name,region,category,...(location===undefined?{}:{location})};
}
function flyerPriorDecline_(flyers,keys,event,events){
 return [...flyers.refused,...(flyers.declines||[])].some(log=>{
  const date=log.eventDate||events.find(item=>item.id===log.eventId)?.date||log.refusedOn;
  const time=log.eventTime||events.find(item=>item.id===log.eventId)?.time||'23:59';
  return date&&date+time<event.date+(event.time||'23:59')&&flyerKeys_(log).some(key=>keys.includes(key));
 });
}
function flyerRecordDecline_(flyers,row,event,wasDeclined){
 const logs=flyers.declines||(flyers.declines=[]);
 const previous=logs.slice().reverse().find(item=>item.eventId===event.id&&item.rowId===row.id);
 if(wasDeclined&&previous){previous.memo=row.memo;return}
 logs.push({id:Utilities.getUuid(),rowId:row.id,name:row.name,region:row.region,keys:flyerKeys_(row),eventId:event.id,eventTitle:event.title,eventDate:event.date,eventTime:event.time,refusedOn:Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd'),memo:row.memo});
}
function seedFlyerFacilities_(flyers,events,now=flyerNow_()){
 const blocked=flyerBlocked_(flyers);
 for(const event of events){
  if(!flyerUpcoming_(event,now))continue;
  const rows=(flyers.events[event.id]||[]).slice();
  const keys=new Set(rows.flatMap(flyerKeys_));
  for(const facility of Object.values(flyers.facilities||{})){
   if(facility.keys.some(key=>blocked.has(key)||keys.has(key)))continue;
   rows.push({...flyerFacility_(facility),keys:facility.keys,facilityId:facility.id,id:Utilities.getUuid(),revision:1,status:flyerPriorDecline_(flyers,facility.keys,event,events)?'今回は見送り':'未依頼',memo:''});
   facility.keys.forEach(key=>keys.add(key));
  }
  if(rows.length>200)throw Error('掲示先は公演ごとに200件までです。');
  if(rows.length)flyers.events[event.id]=rows;
 }
}
function flyerMigration_(db,req){
 const flyers=db.flyers||{events:{},refused:[]};
 const now=flyerNow_(),events=(db.shared.events?.items||[]).filter(event=>flyerUpcoming_(event,now));
 const groups=new Map(),blocked=flyerBlocked_(flyers),choices=[],skipped=[];
 const registered=new Set(Object.values(flyers.facilities||{}).flatMap(flyerKeys_));
 for(const event of events)for(const row of flyers.events[event.id]||[]){
  if(row.source||row.facilityId||flyerKeys_(row).some(key=>blocked.has(key)))continue;
  const key=flyerKey_(row.name,row.region);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push({eventId:event.id,row});
 }
 for(const group of groups.values()){
  const first=group[0].row;
  const signature=row=>JSON.stringify(flyerFacility_(row));
  const other=group.some(({row})=>signature(row)!==signature(first));
  const aliases=[...new Set(group.flatMap(({row})=>flyerKeys_(row)))];
  const identifier=first.region+' ／ '+first.name;
  const outside=events.some(event=>(flyers.events[event.id]||[]).some(row=>!group.some(link=>link.row===row)&&flyerKeys_(row).some(key=>aliases.includes(key))));
  const confirmed=first.location&&Number.isFinite(first.location.lat)&&Number.isFinite(first.location.lng);
  if(other||outside||aliases.some(key=>registered.has(key))||(group.length>1&&!confirmed)){
   skipped.push(identifier);continue;
  }
  aliases.forEach(key=>registered.add(key));
  choices.push({group,aliases,identifier});
 }
 const preview={completed:!!flyers.initialMigrationCompletedAt,expected:digest_(JSON.stringify({flyers,events:events.map(event=>[event.id,event.date,event.time])})),
  targets:events.map(({title,date})=>({title,date})),facilities:choices.map(choice=>({name:choice.identifier,existing:choice.group.length,added:events.length-choice.group.length})),skipped};
 if(req.action==='flyerMigrationPreview')return preview;
 if(req.expected!==preview.expected)throw Error('データが変更されました。もう一度対象を確認してください。');
 if(!choices.length&&flyers.initialMigrationCompletedAt)return {...preview,applied:0};
 const before=JSON.stringify(db);
 flyers.facilities=flyers.facilities||{};
 for(const {group,aliases} of choices){
  const id=Utilities.getUuid();
  flyers.facilities[id]={...flyerFacility_(group[0].row),id,keys:aliases};
  for(const {eventId,row} of group){
   flyers.events[eventId]=flyers.events[eventId].map(current=>current===row?{...row,facilityId:id,revision:row.revision+1}:current);
  }
 }
 seedFlyerFacilities_(flyers,events,now);
 const backup=createDataBackup_(before,true);
 flyers.initialMigrationCompletedAt=new Date().toISOString();
 db.flyers=flyers;writeDb_(db);
 return {...preview,completed:true,applied:choices.length,backupCreatedAt:backup.createdAt};
}

function flyerGoogleUrl_(raw){
 const url=typeof raw==='string'?raw.trim():'';
 const parts=url.length<=1000&&url.match(/^https:\/\/((?:www\.|maps\.)?google\.(?:com|co\.jp)|maps\.app\.goo\.gl|goo\.gl)(\/[^\s\\]*)$/i);
 if(!parts)throw Error('Googleマップの共有リンクを入れてください。');
 const host=parts[1].toLowerCase(),path=parts[2];
 const short=host==='maps.app.goo.gl'||host==='goo.gl';
 if(short?!/^(?:\/maps)?\/[a-z0-9_-]+(?:[?#].*)?$/i.test(path):!/^\/maps(?:[/?#]|$)/.test(path)&&!(host.startsWith('maps.')&&path.startsWith('/?')))throw Error('Googleマップの共有リンクを入れてください。');
 return {url,host,path,short};
}
function flyerDecodeGoogle_(text){
 try{return decodeURIComponent(text.replace(/\+/g,' '))}catch{return ''}
}
function flyerResolveGoogleLink_(input){
 let link=flyerGoogleUrl_(input);
 for(let redirects=0;link.short&&redirects<4;redirects++){
  const response=UrlFetchApp.fetch(link.url,{followRedirects:false,muteHttpExceptions:true});
  const headers=response.getAllHeaders();
  const next=headers[Object.keys(headers).find(key=>key.toLowerCase()==='location')];
  if(response.getResponseCode()<300||response.getResponseCode()>=400||typeof next!=='string')throw Error('短縮リンクを開けませんでした。地図で位置を指定してください。');
  link=flyerGoogleUrl_(next);
 }
 if(link.short)throw Error('短縮リンクを展開できませんでした。地図で位置を指定してください。');
 const decode=flyerDecodeGoogle_;
 const path=link.path.split(/[?#]/)[0];
 const params={};
 for(const part of (link.path.split('?')[1]||'').split('#')[0].split('&')){
  const [key,...value]=part.split('=');
  if(['query','q','query_place_id'].includes(key))params[key]=decode(value.join('='));
 }
 const query=params.query||params.q||'';
 const numeric='(-?\\d+(?:\\.\\d+)?)';
 const marker=/^(?:\/|\/maps(?:\/search)?\/?)$/.test(path)&&!params.query_place_id&&query.match(new RegExp('^'+numeric+'\\s*,\\s*'+numeric+'$'));
 const explicit=path.startsWith('/maps/place/')?[...decode(path).matchAll(new RegExp('!8m2!3d'+numeric+'!4d'+numeric+'(?=!|$)','g'))]:[];
 const xy=explicit.length===1?explicit[0]:marker;
 const label=decode(path.match(/^\/maps\/place\/([^/]+)/)?.[1]||'');
 const name=label&&!/^[-+0-9.,°'" NSEW]+$/i.test(label)?label.slice(0,120):'';
 return {name,address:'',...(xy&&Math.abs(Number(xy[1]))<=90&&Math.abs(Number(xy[2]))<=180?{lat:Number(xy[1]),lng:Number(xy[2])}:{})};
}

function flyerRequest_(db,req){
 checkId_(req.eventId);
 const events=db.shared.events?.items||[];
 const event=events.find(item=>item.id===req.eventId);
 if(!event)throw Error('公演が見つかりません。');
 const flyers=db.flyers||{events:{},refused:[]};
 const now=flyerNow_(),upcoming=flyerUpcoming_(event,now);
 const saved=flyers.events[event.id]||[],rows=saved.slice();
 const scheduleKey=item=>item.date+(item.time||'23:59');
 const sources=events.filter(item=>scheduleKey(item)<scheduleKey(event)&&flyers.events[item.id]?.length);
 const view=()=>{
 const blocked=flyerBlocked_(flyers);
 return {
  rows:upcoming?rows.filter(row=>!row.facilityId||!flyerKeys_(row).some(key=>blocked.has(key))):rows,
  refused:flyers.refused,
  declineHistory:[...flyers.refused,...(flyers.declines||[])].map(({name,keys,region,eventTitle,eventId,refusedOn,memo})=>({name,keys,region,eventTitle,eventId,refusedOn,memo})),
  declineFields:true,
  migrationRequired:!flyers.initialMigrationCompletedAt&&events.some(item=>flyerUpcoming_(item,now)&&(flyers.events[item.id]||[]).some(row=>!row.source&&!row.facilityId&&!flyerKeys_(row).some(key=>blocked.has(key)))),
  categories:[...new Set([...flyerCategories_,...Object.values(flyers.events).flat().map(row=>row.category),...rows.map(row=>row.category)])],
  sources:sources.map(({id,title,date})=>({id,title,date})),
  locationFields:true,
  googleShare:true,
  sharedFacilities:true,
  regions:[...new Set(['銚子市','神栖市',...Object.values(flyers.events).flat().map(row=>row.region)])],
  archived:!upcoming
 };
 };
 if(req.action==='flyerRead')return view();
 if(!upcoming)throw Error('開催済みの公演は閲覧のみです。');
 const blocked=flyerBlocked_(flyers);
 const keys=flyerKeys_;
 const indexOf=key=>rows.findIndex(row=>keys(row).includes(key));
 const push=(entry,related=[],source)=>{
  const key=flyerKey_(entry.name,entry.region),aliases=[...new Set([key,...related])];
  if(aliases.some(value=>blocked.has(value)||indexOf(value)>=0))return false;
  rows.push({...entry,id:Utilities.getUuid(),revision:1,keys:aliases,...(source?{source}:{})});
  return true;
 };
 let sync=false,restored=false;
 if(req.action==='flyerRestore'){
  const legacy=flyers.refused.find(row=>row.id===req.id&&row.eventId===req.from&&!row.restoredAt);
  if(!legacy)throw Error('復帰対象が変わりました。一覧を更新してください。');
  const aliases=keys(legacy);
  if(flyers.refused.some(row=>row!==legacy&&!row.restoredAt&&keys(row).some(key=>aliases.includes(key))))throw Error('同じ名前の履歴が複数あります。施設を確認してください。');
  const linked=Object.values(flyers.facilities||{}).find(row=>row.id===legacy.facilityId);
  const collision=events.filter(item=>flyerUpcoming_(item,now)).some(item=>(flyers.events[item.id]||[]).some(row=>(!linked||row.facilityId!==linked.id)&&keys(row).some(key=>aliases.includes(key))));
  if(collision)throw Error('同名の施設がすでにあります。施設を確認してください。');
  createDataBackup_(db,true);
  legacy.restoredAt=new Date().toISOString();
  const id=linked?.id||Utilities.getUuid();
  flyers.facilities=flyers.facilities||{};
  if(!linked)flyers.facilities[id]={...flyerFacility_(legacy),id,keys:aliases};
  if(!rows.some(row=>row.facilityId===id))rows.push({...flyerFacility_(flyers.facilities[id]),keys:keys(flyers.facilities[id]),id:Utilities.getUuid(),facilityId:id,revision:1,status:'今回は見送り',memo:''});
  sync=restored=true;
 }else if(req.action==='flyerSave'){
  const value=flyerEntry_(req.entry),key=flyerKey_(value.name,value.region);
  if(req.entry.declined!==undefined&&typeof req.entry.declined!=='boolean')throw Error('見送りのチェックを確認してください。');
  const markDecline=current=>value.status==='今回は見送り'&&(req.entry.declined??!!current?.declined);
  if(req.id){
   const index=rows.findIndex(row=>row.id===req.id);
   if(index<0||rows[index].revision!==req.revision)throw Error('この掲示先は更新されました。最新の内容を確認してください。');
   const current=rows[index];
   if(key!==flyerKey_(current.name,current.region)&&(blocked.has(key)||rows.some((row,i)=>i!==index&&keys(row).includes(key))))throw Error('同じ施設が登録済み、または一覧から除外済みです。');
   rows[index]={...current,...value,revision:current.revision+1,keys:[...new Set([...keys(current),key])]};
   rows[index].declined=markDecline(current);
   if(rows[index].declined)flyerRecordDecline_(flyers,rows[index],event,current.declined);
   if(current.facilityId){
    const facility=flyers.facilities[current.facilityId];
    const updated=flyerFacility_(rows[index]);
    if(!facility||blocked.has(key))throw Error('一覧から除外済みです。');
    if(JSON.stringify(flyerFacility_(facility))!==JSON.stringify(updated)){
     const aliases=[...new Set([...facility.keys,key])];
     for(const other of events.filter(item=>flyerUpcoming_(item,now))){
      const otherRows=other.id===event.id?rows:flyers.events[other.id]||[];
      if(otherRows.some(row=>row.facilityId!==facility.id&&keys(row).some(alias=>aliases.includes(alias))))throw Error('別の公演に同名の施設があります。施設名と場所を確認してください。');
     }
     flyers.facilities[facility.id]={...updated,id:facility.id,keys:aliases};
     for(const other of events.filter(item=>item.id!==event.id&&flyerUpcoming_(item,now))){
      if(flyers.events[other.id])flyers.events[other.id]=flyers.events[other.id].map(row=>row.facilityId===facility.id?{...row,...updated,keys:aliases,revision:row.revision+1}:row);
     }
     sync=true;
    }
   }
  }else{
   if(req.sharedFacility&&events.some(other=>flyerUpcoming_(other,now)&&(flyers.events[other.id]||[]).some(row=>keys(row).includes(key))))throw Error('別の公演に同名の施設があります。重複を確認してください。');
   if(!push(value))throw Error('同じ施設が登録済み、または一覧から除外済みです。');
   const row=rows[rows.length-1];
   row.declined=markDecline();
   if(row.declined)flyerRecordDecline_(flyers,row,event,false);
   if(req.sharedFacility){
    row.facilityId=row.id;
    flyers.facilities=flyers.facilities||{};
    flyers.facilities[row.id]={...flyerFacility_(row),id:row.id,keys:row.keys};
    sync=true;
   }
  }
 }else if(req.action==='flyerRefuse'){
  throw Error('アプリを更新し、状況を「今回は見送り」にしてください。');
 }else if(req.action==='flyerCarry'){
  const source=sources.find(item=>item.id===req.from);
  if(!source)throw Error('引き継ぎ元の公演を選んでください。');
  for(const row of flyers.events[source.id])push({...flyerEntry_(row),status:flyerPriorDecline_(flyers,keys(row),event,events)?'今回は見送り':'未依頼',memo:row.memo},keys(row),row.source);
 }else if(req.action==='flyerImport'){
  if(!Array.isArray(req.entries)||req.entries.length>50)throw Error('施設候補を確認してください。');
  for(const row of req.entries){
   const url=flyerText_(row?.url,500),date=flyerText_(row?.date,10);
   if(!/^https:\/\/[^\s]+$/.test(url)||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('候補の確認元を確認してください。');
   push(flyerEntry_({...row,memo:'',status:flyerPriorDecline_(flyers,[flyerKey_(row.name,row.region)],event,events)?'今回は見送り':'未依頼'}),[],{url,date,reading:flyerText_(row.reading||'',120,true),name:row.name});
  }
 }
 if(rows.length>200)throw Error('掲示先は公演ごとに200件までです。');
 if(restored||rows.length!==saved.length||rows.some((row,i)=>row!==saved[i])){
  flyers.events[event.id]=rows;
  if(sync)seedFlyerFacilities_(flyers,events,now);
  db.flyers=flyers;writeDb_(db);
 }
 return view();
}

function reservationFields_(input){
 const result={};
 for(const [key,limit] of Object.entries({date:10,venue:100,room:100,start:5,end:5,issued:10})){
  const value=input?.[key]??'';
  if(typeof value!=='string'||value.length>limit)throw Error('読み取り内容を確認してください。');
  const text=value.trim();
  if(text&&(key==='date'||key==='issued')){
   const day=new Date(text+'T00:00:00Z');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||isNaN(day)||day.toISOString().slice(0,10)!==text)throw Error('日付を確認してください。');
  }
  if(text&&['start','end'].includes(key)&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(text))throw Error('時刻を確認してください。');
  result[key]=text;
 }
 return result;
}
function reservationNormalize_(value){return (value||'').normalize('NFKC').replace(/\s+/g,'')}
function reservationSchedules_(db,today){
 return ['events','rehearsals'].flatMap(type=>(db.shared[type]?.items||[])
  .filter(row=>!row.archivedAt&&row.date>=today)
  .map(row=>({type,id:row.id,title:row.title,date:row.date,venue:row.venue,room:row.room||'',start:row.time,end:row.endTime||''})));
}
function reservationMatch_(fields,schedules,needed){
 const sameDate=schedules.filter(row=>row.date===fields.date);
 const candidates=sameDate.filter(row=>fields.venue&&reservationNormalize_(row.venue)===reservationNormalize_(fields.venue));
 const reasons=[];
 if(!fields.issued)reasons.push('発行日が分かりません。');
 if(!fields.date||!fields.venue)reasons.push('利用日または施設名が分かりません。');
 if(candidates.length!==1){
  if(fields.date&&fields.venue)reasons.push(candidates.length>1?'候補が複数あります。':sameDate.length?'同じ日の予定と施設名が異なります。':'該当する予定がありません。');
  return {reasons};
 }
 const target=candidates[0];
 if(!fields.room||!target.room)reasons.push('部屋を比較できません。');
 else if(reservationNormalize_(target.room)!==reservationNormalize_(fields.room))reasons.push('予約書類と予定の部屋が異なります。');
 const start=needed?.start||target.start,end=needed?.end||target.end;
 const minutes=time=>Number(time.slice(0,2))*60+Number(time.slice(3));
 const elapsed=total=>[Math.floor(total/60)?Math.floor(total/60)+'時間':'',total%60?total%60+'分':''].join('');
 if(!fields.start||!fields.end||!start||!end||fields.start>=fields.end||start>=end)reasons.push('予約時間と必要な利用時間を比較できません。');
 else{
  const starts=minutes(fields.start)-minutes(start),ends=minutes(fields.end)-minutes(end);
  if(starts)reasons.push('予約開始が必要な利用開始より'+elapsed(Math.abs(starts))+(starts<0?'早くなっています。':'遅くなっています。'));
  if(ends)reasons.push('予約終了が必要な利用終了より'+elapsed(Math.abs(ends))+(ends<0?'早くなっています。':'遅くなっています。'));
 }
 return {target:reasons.length?null:{type:target.type,id:target.id},reasons};
}
function reservationCanReview_(db,member){
 if(['admin','editor'].includes(member.role))return true;
 const props=PropertiesService.getScriptProperties();
 return ['ICHIGO','YASUE'].some((key,i)=>{
  const id=props.getProperty('RESERVATION_REVIEWER_'+key+'_ID');
  if(id)return id===member.id;
  return member.name===['一悟','やすゑ'][i]&&db.members.filter(row=>row.name===member.name).length===1;
 });
}
function reservationSignature_(fields){
 return JSON.stringify([fields.date,reservationNormalize_(fields.venue),reservationNormalize_(fields.room)]);
}
function reservationView_(book,schedules){
 const resolved=book.map(row=>{
  const match=reservationMatch_(row.fields,schedules,row.needed);
  const resolvedLink=row.review?.link||row.initialLink||match.target;
  const schedule=resolvedLink&&schedules.find(item=>item.type===resolvedLink.type&&item.id===resolvedLink.id);
  // Facility, room and use date identify each reservation independently of upload time.
  const identified=!!(row.fields.date&&row.fields.venue&&row.fields.room);
  const group=identified?reservationSignature_(row.fields):row.id;
  return {row,match,group,identified,schedule,resolvedLink};
 });
 const groups=new Map();
 for(const entry of resolved){
  if(!groups.has(entry.group))groups.set(entry.group,[]);
  groups.get(entry.group).push(entry);
 }
 return resolved.map(({row,match,group,identified,schedule,resolvedLink})=>{
  const {photoId,hash,originalFields,...visible}=row;
  const peers=groups.get(group);
  const newest=peers.reduce((date,entry)=>entry.row.fields.issued>date?entry.row.fields.issued:date,'');
  const sameDay=peers.filter(entry=>entry.row.fields.issued&&entry.row.fields.issued===row.fields.issued);
  const conflict=sameDay.some(entry=>JSON.stringify(entry.row.fields)!==JSON.stringify(row.fields));
  const reasons=[...match.reasons];
  if(conflict)reasons.push('同じ発行日の書類で内容が異なります。');
  if(resolvedLink&&!schedule&&!row.review)reasons.push('保存時の予定を再確認してください。');
  return {...visible,latest:identified&&!!newest&&row.fields.issued===newest&&!conflict,older:!!row.fields.issued&&row.fields.issued<newest,
   status:row.review&&(!conflict||sameDay.every(entry=>entry.row.id===row.id||row.review.comparedIds?.includes(entry.row.id)))?'確認済み':reasons.length?'確認待ち':'一致',
   reasons,link:resolvedLink||null};
 });
}
function reservationRequest_(db,member,req){
 const book=db.reservationDocuments||[];
 const today=Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd');
 const schedules=reservationSchedules_(db,today),canReview=reservationCanReview_(db,member);
 const view=()=>({documents:reservationView_(book,schedules),schedules,canReview});
 if(req.action==='reservationList')return view();
 const row=book.find(item=>item.id===req.id);
 if(req.action==='reservationPhoto'){
  if(!row)throw Error('書類が見つかりません。');
  const response=UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(row.photoId)+'?alt=media',{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true});
  if(response.getResponseCode()!==200)throw Error('写真を読み込めませんでした。');
  return {photo:Utilities.base64Encode(response.getBlob().getBytes())};
 }
 if(req.action==='reservationAdd'){
  if(typeof req.photo!=='string'||req.photo.length>1200000||!/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(req.photo))throw Error('写真の形式または容量を確認してください。');
  const hash=digest_(req.photo);
  if(book.some(item=>item.hash===hash))return {...view(),duplicate:true};
  if(book.length>=350)throw Error('書類の保存上限に達しました。管理者にご確認ください。');
  const fields=reservationFields_(req.fields),match=reservationMatch_(fields,schedules);
  const id=Utilities.getUuid();
  const file=Drive.Files.create({name:'結友亭-予約書類-'+id+'.jpg',mimeType:'image/jpeg'},Utilities.newBlob(Utilities.base64Decode(req.photo),'image/jpeg'),{fields:'id'});
  book.push({id,photoId:file.id,hash,fields,originalFields:{...fields},revision:1,initialLink:match.target||null});
  db.reservationDocuments=book;
  try{writeDb_(db)}catch(error){try{Drive.Files.update({trashed:true},file.id,null,{fields:'id'})}catch{}throw error}
  return view();
 }
 if(!canReview)throw Error('この書類を確認する権限がありません。');
 if(!row||row.revision!==req.revision)throw Error('書類が更新されました。最新の内容を確認してください。');
 const now=new Date().toISOString();
 if(req.action==='reservationContact'){
  if(typeof req.contacted!=='boolean')throw Error('連絡状況を確認してください。');
  row.contact={done:req.contacted,by:member.id,name:member.name,at:now};
 }else{
  const fields=reservationFields_(req.fields);
  const needed=reservationFields_({start:req.needed?.start,end:req.needed?.end});
  if(needed.start&&needed.end&&needed.start>=needed.end)throw Error('必要な利用時間を確認してください。');
  const target=schedules.find(item=>item.type===req.link?.type&&item.id===req.link?.id);
  const reason=typeof req.reason==='string'?req.reason.trim():'';
  if(!target||!reason||reason.length>600)throw Error('対象の予定と確認理由を入力してください。');
  const comparedIds=book.filter(item=>item.fields.issued===fields.issued&&reservationSignature_(item.fields)===reservationSignature_(fields)).map(item=>item.id);
  if(comparedIds.some(id=>id!==row.id&&(!Array.isArray(req.seen)||!req.seen.includes(id))))throw Error('同じ発行日の書類が追加されました。最新の一覧を確認してください。');
  const review={by:member.id,name:member.name,at:now,reason,link:{type:target.type,id:target.id},comparedIds};
  row.reviewHistory=[...(row.reviewHistory||[]),{...review,fields,needed}];
  row.review=review;row.fields=fields;row.needed={start:needed.start,end:needed.end};
 }
 row.revision++;
 writeDb_(db);
 return view();
}
