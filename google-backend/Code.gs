/** 結友亭 共通保存 API。Google Apps Script V8・所有者として実行するウェブアプリ。
 * 権限はdrive.fileに限定。必ず同梱appsscript.jsonとセットで配置する。
 * 最初に initializeOwner をエディタで実行。初期PINは1111（OWNER_PINで任意指定も可）。
 * PIN・認証鍵・会員情報を公開リポジトリやログに記録しない。
 */
function initializeOwner(){
 const lock=LockService.getScriptLock();lock.waitLock(20000);
 try{const props=PropertiesService.getScriptProperties();if(props.getProperty('DB_FILE_ID'))throw Error('初期設定済みです。');const pin=props.getProperty('OWNER_PIN')||'1111';checkPin_(pin);const secret=Utilities.getUuid()+Utilities.getUuid();props.setProperty('AUTH_SECRET',secret);const owner={id:'owner',name:'勇水',role:'admin',active:true,epoch:1,salt:Utilities.getUuid(),owner:true};owner.pinHash=hashPin_(owner,pin);const file=Drive.Files.create({name:'結友亭の帳面-共通データ.json',mimeType:'application/json'},Utilities.newBlob(JSON.stringify({version:1,members:[owner],shared:{},attendance:{}}),'application/json'),{fields:'id'});props.setProperty('DB_FILE_ID',file.id);props.deleteProperty('OWNER_PIN');return '勇水を最初の管理者として登録しました。'}finally{lock.releaseLock()}
}
function doGet(){return output_({ok:true,service:'yuyutei-members',version:1,attendanceProxy:true,rehearsalArchiveToday:true})}
function doPost(event){
 const lock=LockService.getScriptLock();let locked=false;
 try{if(!event||!event.postData||event.postData.contents.length>1500000)throw Error('リクエストを確認してください。');const req=JSON.parse(event.postData.contents);if(!req||typeof req!=='object')throw Error('リクエストを確認してください。');lock.waitLock(20000);locked=true;const db=readDb_();if(req.action==='login')return output_({ok:true,...login_(db,req)});const member=authorize_(db,req.token);let data;
 switch(req.action){
 case 'roster':data={members:db.members.filter(m=>m.active).map(m=>({name:m.name}))};break;
 case 'archivePast':admin_(member);data=archivePast_(db,req,member);if(data.count)writeDb_(db);break;
 case 'importLocal':admin_(member);data=importLocal_(db,req,member);writeDb_(db);break;
 case 'session':if(req.remember===true){const props=PropertiesService.getScriptProperties(),key='SESSION_'+digest_(req.token),session=JSON.parse(props.getProperty(key));session.expires=Date.now()+30*24*60*60*1000;props.setProperty(key,JSON.stringify(session))}data={member:publicMember_(member)};break;
 case 'read':checkCollection_(req.name);data={doc:db.shared[req.name]||null};break;
 case 'save':if(!['admin','editor'].includes(member.role))throw Error('編集権限が必要です。');checkCollection_(req.name);validCollection_(req.name,req.items);if(!Array.isArray(req.items)||req.items.length>500)throw Error('データの形式を確認してください。');const current=db.shared[req.name];if(['events','rehearsals'].includes(req.name)){const old=new Map((current?current.items:[]).map(r=>[r.id,r]));for(const r of req.items){if((r.archivedAt||null)!==(old.get(r.id)?.archivedAt||null))throw Error('記録への移動は管理者ページから行ってください。')}for(const r of old.values())if(r.archivedAt&&!req.items.some(n=>n.id===r.id))throw Error('転記済みの予定は保持してください。')}if((current?current.revision:0)!==req.revision)throw Error('ほかの端末で更新されています。再読み込みしてください。');db.shared[req.name]={items:req.items,revision:req.revision+1,updatedBy:member.id,updatedAt:new Date().toISOString()};writeDb_(db);data={revision:req.revision+1};break;
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
function readDb_(){const id=PropertiesService.getScriptProperties().getProperty('DB_FILE_ID');if(!id)throw Error('管理者の初期設定が必要です。');const response=UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?alt=media',{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true});if(response.getResponseCode()!==200)throw Error('専用データを読み込めません。Googleの接続設定を確認してください。');return JSON.parse(response.getContentText('UTF-8'))}
function writeDb_(db){const text=JSON.stringify(db);if(text.length>1500000)throw Error('保存量が増えています。バックアップして管理者に確認してください。');Drive.Files.update({},PropertiesService.getScriptProperties().getProperty('DB_FILE_ID'),Utilities.newBlob(text,'application/json'),{fields:'id'})}
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
  db.shared.history={items:Array.from(map.values()),revision:history.revision+1,updatedBy:actor.id,updatedAt:new Date().toISOString()};
  for(const name in changed){db.shared[name].revision++;db.shared[name].updatedBy=actor.id;db.shared[name].updatedAt=new Date().toISOString()}
 }
 return detail?{count,rehearsals}:{count};
}
function importLocal_(db,req,actor){
 if(!req.documents||!req.attendance||typeof req.attendance!=='object')throw Error('移行データを確認してください。');for(const name of ['events','rehearsals','history']){const incoming=req.documents[name];validCollection_(name,incoming);if(!Array.isArray(incoming)||!incoming.every(r=>r&&typeof r.id==='string'&&typeof r.date==='string'))throw Error('予定・記録の形式を確認してください。');const current=db.shared[name]||{items:[],revision:0};const merged=new Map(current.items.map(r=>[r.id,r]));incoming.forEach(r=>{if(!merged.has(r.id)&&!(name!=='history'&&current.items.some(old=>old.date===r.date)))merged.set(r.id,r)});if(merged.size>500)throw Error('各一覧は500件までです。');db.shared[name]={items:Array.from(merged.values()),revision:current.revision+1,updatedBy:actor.id,updatedAt:new Date().toISOString()}}
 for(const id in req.attendance){const dest=db.attendance[id]||{};for(const name in req.attendance[id]){const status=req.attendance[id][name];if(!['出席','欠席','未定','未回答'].includes(status))throw Error('出欠の形式を確認してください。');if(!Object.values(dest).some(r=>r.stageName===name)){const m=db.members.find(m=>m.name===name);dest[m?m.id:'imported-'+name]={stageName:name,status,updatedAt:new Date().toISOString()}}}db.attendance[id]=dest}return {imported:true};
}
function validCollection_(name,items){
 if(!Array.isArray(items)||items.length>500)throw Error('保存するデータを確認してください。');const ids=new Set();for(const r of items){if(!r||typeof r.id!=='string'||!r.id||ids.has(r.id)||typeof r.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.date))throw Error('日付・IDを確認してください。');ids.add(r.id);if(name==='history'){if(!['kind','occasion','note'].every(k=>typeof r[k]==='string')||!r.pieces||typeof r.pieces!=='object'||Array.isArray(r.pieces)||!Object.values(r.pieces).every(v=>typeof v==='string'))throw Error('記録の形式を確認してください。')}else{if(!['title','time','venue',name==='events'?'memo':'notes'].every(k=>typeof r[k]==='string')||!r.title.trim()||!r.venue.trim()||!(name==='events'&&r.time==='')&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time))throw Error('予定の形式を確認してください。');if(name==='events'&&(!Array.isArray(r.performers)||!Array.isArray(r.checklist)||!r.checklist.length||!r.checklist.every(t=>t&&typeof t.label==='string'&&t.label.trim()&&typeof t.done==='boolean')))throw Error('出演者・準備項目を確認してください。')}}
}
