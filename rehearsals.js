import {performerPicker,updatePerformerPickers,readPerformer,showPerformerRoster} from './performer-picker.js?v=20261120-audit1';
import {mountMemberHome} from './member-home.js?v=20261120-audit1';
import {applyConfirmedSchedule} from './schedule-bootstrap.js?v=20261120-audit1';
import {readCategories,saveCategories,validCategories} from './categories.js?v=20261120-audit1';
import {mountScheduleImport} from './schedule-import.js?v=20261120-audit1';
import {toRecord,transferRecord,rehearsalTitle,readRecords,mergeRecords,mergedRecords} from './record-transfer.js?v=20261120-audit1';
import {cloud,startCloud,mountAccount} from './cloud.js?v=20261120-audit1';
import {statuses,rehearsalNames,validRehearsal,validAttendance,attendanceSummary} from './rehearsal-model.js?v=20261120-audit1';
const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key='yuitei.rehearsals.v1';let items=[],attendance={},names=[],revision=0,loaded=false,storageOK=true,stop,stopAttendance,opened=null,detailRevision=0,busy=false;
let noticeTimer;
const notify=s=>{clearTimeout(noticeTimer);$('notice').textContent=s;$('notice').hidden=false;noticeTimer=setTimeout(()=>$('notice').hidden=true,6000)};
const canEdit=()=>!cloud.state.configured||loaded&&['admin','editor'].includes(cloud.state.role);
const dialog=$('rehearsal-dialog');
let accountGeneration=0,rosterState='loading',attendanceState='loading',scheduleError='';
let requestedDetail=new URL(location.href).searchParams.get('detail')||'';
window.addEventListener('rehearsal-detail',event=>{const id=event.detail?.id;if(typeof id!=='string')return;requestedDetail=id;openRequestedDetail()});
function openRequestedDetail(){if(!requestedDetail||cloud.state.configured&&!loaded||!cloud.state.configured&&cloud.state.ready===false)return;const id=requestedDetail;requestedDetail='';if(items.some(item=>item.id===id))detail(id);else notify('指定の稽古予定は見つかりませんでした。')}
try{await applyConfirmedSchedule()}catch(e){notify(e.message||'予定の自動追加に失敗しました。再読み込みしてください。')}
try{const raw=JSON.parse(localStorage.getItem(key)||'{"items":[],"attendance":{}}');if(!Array.isArray(raw.items)||!raw.items.every(validRehearsal)||!raw.attendance||!Object.values(raw.attendance).every(validAttendance))throw Error();items=raw.items;attendance=raw.attendance}catch{storageOK=false;notify('保存済みの稽古予定を読み込めません。上書きを停止しています。')}
let localItems=structuredClone(items),localAttendance=structuredClone(attendance);
async function save(next,expected=revision,nextAttendance=attendance){
 if(busy)return false;
 if(!canEdit()){notify('編集権限が必要です。');return false}
 busy=true;
 try{
  if(cloud.state.configured){
   const savedRevision=await cloud.save('rehearsals',{items:next},expected);
   if(!(revision>savedRevision))items=next;
  }else{
   if(!storageOK)throw Error('保存済みデータを確認してください。');
   localStorage.setItem(key,JSON.stringify({items:next,attendance:nextAttendance}));
   items=next;attendance=nextAttendance;
   localItems=structuredClone(items);localAttendance=structuredClone(attendance);
   window.dispatchEvent(new Event('schedule-data-changed'));
  }
  render();return true;
 }catch(error){notify(error.message||'保存できませんでした。');return false}
 finally{busy=false}
}

function render(){
 const upcoming=items.filter(r=>!r.archivedAt&&r.date>=new Date().toLocaleDateString('sv-SE'));if($('stats'))$('stats').innerHTML=[['予定の稽古',upcoming.length],['師匠稽古',upcoming.filter(r=>r.title==='師匠稽古').length],['自主稽古',upcoming.filter(r=>r.title==='自主稽古').length]].map(([label,count])=>`<div class="stat"><span class="stat-icon">▦</span><div><small>${label}</small><strong>${count}</strong><span class="unit">件</span></div></div>`).join('');
 $('add').disabled=!canEdit();$('mode').textContent=cloud.state.configured?(cloud.state.role?'予定ごとに「出欠・詳細」から回答・一覧を確認できます。':'出欠は会員ログイン後に回答できます。'):'現在はこのブラウザに保存します。自分の名前を選んで出欠を入力します。本人認証・端末間の同期はまだ有効ではありません。';
 $('rehearsals').innerHTML=items.filter(r=>!r.archivedAt).sort((a,b)=>(!!a.archivedAt-!!b.archivedAt)||(a.date+a.time).localeCompare(b.date+b.time)).map(r=>{const s=cloud.state.configured?null:attendanceSummary(names,attendance[r.id]||{});return `<article class="event-card rehearsal-card"><div class="date-badge" aria-hidden="true"><small>${Number(r.date.slice(5,7))}月</small><strong>${Number(r.date.slice(8))}</strong></div><div><h3>${esc(rehearsalTitle(r))}${r.archivedAt?' <small>（記録へ移動済み）</small>':''}</h3><div class="meta"><span>${r.date.replaceAll('-','/')} ${r.time}</span><span>＠ ${esc(r.venue)}</span></div></div>${s?`<div class="progress"><span class="progress-label">出席 ${s.count}人 ／ 未回答 ${s.unanswered}人</span></div>`:''}<div class="event-actions"><button class="secondary" data-detail="${esc(r.id)}">出欠・詳細</button></div></article>`}).join('')||(cloud.state.configured&&!loaded?'<p class="empty">'+(cloud.state.role?esc(scheduleError||'稽古予定を読み込み中…'):'稽古予定を見るには会員ログインしてください。')+'</p>':'<p class="empty">稽古予定はまだありません。</p>');
 if(loaded&&scheduleError)$('rehearsals').insertAdjacentHTML('afterbegin','<p class="sync-warning" role="status">更新できませんでした。前回取得した稽古予定を表示しています。</p>');
 openRequestedDetail();
}
function form(existing){if(!canEdit())return;stopAttendance?.();opened=null;const version=revision,r=existing?{...existing,title:existing.title==='その他稽古'?'その他':existing.title}:{title:rehearsalNames[0],date:new Date().toLocaleDateString('sv-SE'),time:'14:00',venue:'',notes:''};dialog.innerHTML=`<div class="dialog-body"><div class="dialog-head"><h2>${existing?'稽古を編集':'稽古を登録'}</h2><button type="button" data-close aria-label="閉じる">×</button></div><form id="rehearsal-form"><div class="fields"><label class="wide">稽古名<select name="title" required>${[...new Set([...rehearsalNames,...(r.title&&!rehearsalNames.includes(r.title)?[r.title]:[])])].map(n=>`<option value="${esc(n)}" ${n===r.title?'selected':''}>${esc(n)}</option>`).join('')}</select></label><label class="wide" id="other-content-field">その他の内容<input name="otherContent" value="${esc(r.otherContent||'')}" placeholder="例：交流会、打ち合わせ"></label><label>開催日<input name="date" type="date" required value="${r.date}"></label><label>開演・開始時刻<input name="time" type="time" required value="${r.time}"></label><label class="wide">会場・場所<input name="venue" required value="${esc(r.venue)}"></label></div><label>内容・連絡事項（任意）<textarea name="notes" rows="4"></textarea></label><div class="form-actions"><button class="primary">保存する</button><button class="secondary" type="button" data-close>キャンセル</button></div>${existing?'<details class="delete-zone"><summary>この稽古を削除する</summary><label><input type="checkbox" id="delete-confirm">削除することを確認しました</label><button class="danger" type="button" id="delete-rehearsal" disabled>削除する</button></details>':''}</form></div>`;dialog.querySelector('textarea').value=r.notes;const toggleOther=()=>{const yes=$('rehearsal-form').elements.title.value==='その他';$('other-content-field').hidden=!yes;$('rehearsal-form').elements.otherContent.required=yes};$('rehearsal-form').elements.title.onchange=toggleOther;toggleOther();
 const editor=$('rehearsal-form');
 editor.onsubmit=async e=>{
  e.preventDefault();
  if(busy)return;
  const values=Object.fromEntries(new FormData(editor));
  const next={...existing,...values,id:existing?.id||crypto.randomUUID()};
  for(const key of ['title','venue'])next[key]=next[key].trim();
  if(next.title==='その他'&&!next.otherContent.trim()){notify('その他の内容を入力してください。');return}
  if(!validRehearsal(next)){notify('稽古名・日時・場所を確認してください。');return}
  editor.inert=true;
  try{
   if(await save(existing?items.map(x=>x.id===next.id?next:x):[...items,next],version)){
    if(editor.isConnected&&dialog.open)dialog.close();
    notify('稽古予定を保存しました。');
   }
  }finally{editor.inert=false}
 };
 if(existing){
  $('delete-confirm').onchange=e=>$('delete-rehearsal').disabled=!e.target.checked;
  $('delete-rehearsal').onclick=async()=>{
   if(!$('delete-confirm').checked||busy||!confirm(`「${r.title}」を削除しますか？予定と出欠への入口が一覧から消えます。既に転記した記録は残ります。`))return;
   if(await save(items.filter(x=>x.id!==r.id),version)){
    if(editor.isConnected&&dialog.open)dialog.close();
    notify('稽古予定を削除しました。');
   }
  };
 }
 if(!dialog.open)dialog.showModal();
}
function detail(id){const r=items.find(x=>x.id===id);if(!r)return;stopAttendance?.();opened=id;attendanceState=cloud.state.configured?'loading':'ready';detailRevision=revision;dialog.innerHTML=`<div class="dialog-body"><div class="dialog-head"><h2>${esc(rehearsalTitle(r))}</h2><button data-close aria-label="閉じる">×</button></div><p>${r.date} ${r.time}<br>場所：${esc(r.venue)}</p><p class="memo">${esc(r.notes)}</p><div class="form-actions"><button type="button" class="primary" id="edit-rehearsal-inside" ${canEdit()?'':'disabled'}>編集する</button></div><section id="attendance"></section><section class="block" id="practice-section"></section><section class="block" hidden><button class="primary" type="button" id="transfer-rehearsal" ${canEdit()?'':'disabled'}>${r.archivedAt?'記録を更新する':'終了して記録へ移す'}</button><p class="muted">終了後、稽古したネタと長さ・出欠・連絡事項を記録へ保存します。元の予定も残ります。</p></section></div>`;$('edit-rehearsal-inside').onclick=()=>form(items.find(x=>x.id===id));practiceView(id);$('transfer-rehearsal').onclick=async()=>{if($('practice-form')?.dataset.dirty==='true'){notify('入力したネタ・時間を保存してから記録へ移してください。');return}if(cloud.state.role!=='admin'||r.date>=new Date().toLocaleDateString('sv-SE')||!confirm('終了した稽古を稽古・公演記録へ移しますか？ネタ・時間は保存した内容を転記します。'))return;try{const current=items.find(x=>x.id===id);await transferRecord(toRecord('rehearsal',current,names,attendance[id]||{}));if(await save(items.map(x=>x.id===id?{...x,archivedAt:new Date().toISOString()}:x),detailRevision)){dialog.close();notify('稽古・公演記録へ移しました。')}else notify('記録には保存しましたが、予定側の転記済み表示を保存できませんでした。再実行しても重複しません。')}catch(e){notify(e.message)}};if(!dialog.open)dialog.showModal();if(cloud.state.configured&&cloud.state.role)watchDetailAttendance(id);else attendanceView(id)}
function watchDetailAttendance(id){
 stopAttendance?.();
 attendanceState='loading';attendanceView(id);
 stopAttendance=cloud.watchAttendance(id,rows=>{
  if(opened!==id)return;
  attendance[id]=Object.fromEntries(rows.map(x=>[x.stageName,x.status]));
  attendanceState='ready';attendanceView(id);
 },()=>{
  if(opened!==id)return;
  attendanceState=Object.hasOwn(attendance,id)?'stale':'error';attendanceView(id);
 });
}
function drawRoster(){
 const form=$('practice-form');
 if(form){
  updatePerformerPickers(form,names);
  showPerformerRoster(form,rosterState,names,()=>loadRoster(true));
 }
 if(opened)attendanceView(opened);
}
function loadRoster(force=false){
 const generation=accountGeneration;
 rosterState='loading';drawRoster();
 const request=cloud.state.configured&&cloud.state.provider==='apps-script'
  ? cloud.roster({force}).then(rows=>rows.map(row=>row.name))
  : fetch('./history-data.json').then(r=>r.json()).then(data=>data.names.filter(name=>name!=='藤本'));
 request.then(next=>{
  if(generation!==accountGeneration)return;
  names=next;rosterState='ready';drawRoster();
  if(!cloud.state.configured)render();
 }).catch(()=>{
  if(generation!==accountGeneration)return;
  rosterState='error';drawRoster();
 });
}
function practiceView(id){
 const r=items.find(x=>x.id===id),section=$('practice-section');
 if(!canEdit()){
  const entries=(r.practices||[]).map(p=>`<li>${esc(p.stageName)}　${esc(p.piece)}${p.durationSeconds===null?'':'　'+Math.floor(p.durationSeconds/60)+'分'+p.durationSeconds%60+'秒'}</li>`).join('');
  section.innerHTML='<h3>稽古したネタ・長さ</h3>'+(entries?'<ul>'+entries+'</ul>':'<p>ネタの記録はありません。</p>');
  return;
 }
 section.innerHTML=`<h3>稽古したネタ・長さ</h3><p class="muted">会員またはゲストに複数のネタを追加できます。長さは任意です。</p><form id="practice-form"><p class="muted" role="status" data-roster-status></p><button type="button" class="secondary" data-roster-retry hidden>名簿を更新</button><div id="practice-rows"></div><div class="form-actions"><button class="secondary" type="button" id="add-practice" ${canEdit()?'':'disabled'}>＋ ネタを追加</button><button class="primary" type="submit" ${canEdit()?'':'disabled'}>ネタ・時間を保存</button></div></form>`;
 const editor=$('practice-form'),list=$('practice-rows');editor.oninput=()=>{$('practice-form').dataset.dirty='true'};
 function row(p={stageName:'',piece:'',durationSeconds:null}){
  const el=document.createElement('div');
  el.className='practice-row';
  el.innerHTML=`<div class="fields"><div data-performer-slot></div><label>稽古したネタ<input name="piece" required value="${esc(p.piece)}"></label><label>長さ（分・任意）<input name="minutes" type="number" min="0" max="1440" step="1" value="${p.durationSeconds===null?'':Math.floor(p.durationSeconds/60)}"></label><label>秒（任意）<input name="seconds" type="number" min="0" max="59" step="1" value="${p.durationSeconds===null?'':p.durationSeconds%60}"></label></div><button type="button" class="secondary" data-remove-practice>このネタを外す</button>`;
  el.querySelector('[data-performer-slot]').replaceWith(performerPicker(p,names));
  el.querySelector('[data-remove-practice]').onclick=()=>{el.remove();$('practice-form').dataset.dirty='true'};
  list.append(el);
 }
 (r.practices||[]).forEach(row);
 showPerformerRoster($('practice-form'),rosterState,names,()=>loadRoster(true));$('add-practice').onclick=()=>{if(list.children.length>=200){notify('ネタは200件までです。');return}row();$('practice-form').dataset.dirty='true'};
 editor.onsubmit=async e=>{e.preventDefault();if(!canEdit()||busy)return;const practices=[...list.children].map(el=>{const input=n=>el.querySelector(`[name=${n}]`).value;return {...readPerformer(el),piece:input('piece').trim(),durationSeconds:input('minutes')===''&&input('seconds')===''?null:Number(input('minutes')||0)*60+Number(input('seconds')||0)}});const current=items.find(x=>x.id===id),next={...current,practices};if(!validRehearsal(next)){notify('ネタ名と長さを確認してください。');return}editor.inert=true;
 try{
  if(await save(items.map(x=>x.id===id?next:x),detailRevision)){
   notify('稽古したネタ・時間を保存しました。');
   if(editor.isConnected&&dialog.open)detail(id);
  }
 }finally{editor.inert=false}};
}

function attendanceView(id){
 if(opened!==id)return;
 const panel=$('attendance');
 if(cloud.state.configured&&(!cloud.state.role||!['ready','stale'].includes(attendanceState)||rosterState!=='ready')){
  const failed=attendanceState==='error'||rosterState==='error';
  panel.innerHTML='<h3>出欠一覧</h3><p role="status">'+(!cloud.state.role?'会員ログインが必要です。':failed?'出欠一覧を取得できませんでした。':'出欠を読み込んでいます。')+'</p>'+(failed?'<button type="button" class="secondary">再読み込み</button>':'');
  panel.onchange=null;
  panel.onclick=event=>{
   if(!event.target.closest('button'))return;
   if(rosterState==='error')loadRoster(true);
   if(attendanceState==='error')watchDetailAttendance(id);
  };
  return;
 }
 const stale=attendanceState==='stale';
 const responses=attendance[id]||{},self=cloud.state.configured?cloud.state.stageName:localStorage.getItem('yuitei.attendance.person')||'';
 const groups=statuses.map(status=>({status,label:status==='未回答'?'未登録':status,people:names.filter(n=>(responses[n]||'未回答')===status)}));
 $('attendance').innerHTML=`<h3>出欠一覧</h3>${stale?'<p class="sync-warning" role="status">更新できませんでした。前回取得した出欠を表示しています。</p><button type="button" class="secondary" data-retry-attendance>再読み込み</button>':''}${!cloud.state.configured?`<label>自分の名前<select id="attendance-person"><option value="">選んでください</option>${names.map(n=>`<option value="${esc(n)}" ${n===self?'selected':''}>${esc(n)}</option>`).join('')}</select></label><p class="muted">端末内保存です。この名前選択は本人認証ではありません。共通保存に接続すると、ログインした本人だけが回答できます。</p>`:''}${self&&names.includes(self)?`<label>自分の出欠（${esc(self)}）<select data-person="${esc(self)}">${statuses.map(v=>`<option value="${v}" ${v===(responses[self]||'未回答')?'selected':''}>${v==='未回答'?'未登録':v}</option>`).join('')}</select></label>`:'<p>自分の出欠を回答するには、'+(cloud.state.configured?'会員ログインと高座名の登録が必要です。':'自分の名前を選んでください。')+'</p>'}<div class="rsvp-buttons">${self&&names.includes(self)?['出席','欠席','未定'].map(v=>`<button type="button" class="secondary" data-self-status="${v}" aria-pressed="${responses[self]===v}">${v}</button>`).join(''):''}</div><p class="save-feedback" id="attendance-feedback" role="status"></p><div class="attendance-summary">${groups.map(g=>`<section><h4>${g.label} ${g.people.length}人</h4><p>${g.people.length?esc(g.people.join('・')):'なし'}</p></section>`).join('')}</div>`;
 if(responding||stale)panel.querySelectorAll('select,[data-self-status]').forEach(el=>el.disabled=true);
 $('attendance').onclick=async e=>{if(e.target.closest('[data-retry-attendance]')){watchDetailAttendance(id);return}const b=e.target.closest('[data-self-status]');if(b)await respondSelf(id,self,b.dataset.selfStatus)};
 $('attendance').onchange=async e=>{
  if(e.target.id==='attendance-person'){localStorage.setItem('yuitei.attendance.person',e.target.value);attendanceView(id);return}
  const n=e.target.dataset.person;if(!n||n!==self||!names.includes(n)||!statuses.includes(e.target.value))return;
  await respondSelf(id,n,e.target.value);

 };
}
let responding=false;
async function respondSelf(id,name,status){
 const self=cloud.state.configured?cloud.state.stageName:localStorage.getItem('yuitei.attendance.person');
 if(responding||opened!==id||cloud.state.configured&&(rosterState!=='ready'||attendanceState!=='ready')||!name||name!==self||!names.includes(name)||!statuses.includes(status))return;
 const generation=accountGeneration;responding=true;let message='';document.querySelectorAll('#attendance select,#attendance button').forEach(el=>el.disabled=true);
 try{if(cloud.state.configured){await cloud.respondAttendance(id,status);if(generation!==accountGeneration)return;attendance[id]={...attendance[id],[self]:status}}
 else{const next=structuredClone(attendance);next[id]={...next[id],[self]:status};if(!await save(items,detailRevision,next))throw Error('保存に失敗しました。')}
 message=(status==='未回答'?'未登録':status)+'で登録しました。'+(cloud.state.configured?'':'この端末に保存しました。');notify(message)
 }catch(ex){if(generation===accountGeneration){message='保存できませんでした。'+ex.message+' もう一度回答してください。';notify(message)}}finally{if(generation===accountGeneration){responding=false;if(opened){attendanceView(opened);const feedback=$('attendance-feedback');if(feedback&&opened===id)feedback.textContent=message}}}
}
window.addEventListener('member-person-changed',()=>{if(opened)attendanceView(opened)});
window.addEventListener('schedule-data-changed',()=>{if(cloud.state.configured)return;try{const data=JSON.parse(localStorage.getItem(key));if(data&&Array.isArray(data.items)&&data.items.every(validRehearsal)&&validAttendanceMaps(data.attendance)){items=data.items;attendance=data.attendance;localItems=structuredClone(items);localAttendance=structuredClone(attendance);render();if(opened)attendanceView(opened)}}catch{}});
function validAttendanceMaps(value){return value&&typeof value==='object'&&Object.values(value).every(validAttendance)}
if($('data-open'))$('data-open').onclick=()=>$('data-dialog').showModal();if($('data-close'))$('data-close').onclick=()=>$('data-dialog').close();
$('add').onclick=()=>form();$('rehearsals').onclick=e=>{const b=e.target.closest('button');if(b?.dataset.detail)detail(b.dataset.detail);if(b?.dataset.edit)form(items.find(x=>x.id===b.dataset.edit))};dialog.onclick=e=>{if(e.target.closest('[data-close]'))dialog.close()};dialog.onclose=()=>{if(!dialog.open){opened=null;stopAttendance?.()}};
$('backup').onclick=()=>{try{if(cloud.state.configured&&!loaded){notify('会員ログインと読み込みが必要です。');return}const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,type:'yuyutei-rehearsals',categories:readCategories(),records:readRecords(),items,attendance:cloud.state.configured?{}:attendance},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='yuyutei-rehearsals.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);if(cloud.state.configured)notify('稽古予定を保存しました。会員の出欠は共通保存先に保持されます。')}catch(e){notify(e.message)}};
$('restore').onchange=async e=>{
 const input=e.target,file=input.files[0];if(!file)return;
 input.disabled=true;
 try{
  const data=JSON.parse(await file.text());
  if(data.type!=='yuyutei-rehearsals'||!Array.isArray(data.items)||!data.items.every(validRehearsal)||new Set(data.items.map(x=>x.id)).size!==data.items.length||!validAttendanceMaps(data.attendance))throw Error('稽古予定用のJSONを選んでください。');
  if(data.records!==undefined)mergedRecords(data.records);
  if(data.categories!==undefined&&!validCategories(data.categories))throw Error('区分の形式を確認してください。');
  const map=new Map(items.map(x=>[x.id,x]));data.items.forEach(x=>map.set(x.id,x));
  if(map.size>500)throw Error('稽古予定は500件までです。');
  if(!confirm('稽古予定を取り込みます。同じIDの予定は更新されます。'))return;
  if(!await save([...map.values()],revision,cloud.state.configured?attendance:{...attendance,...data.attendance}))return;
  try{
   if(data.records!==undefined)mergeRecords(data.records);
   if(data.categories!==undefined)saveCategories(data.categories);
   notify('稽古予定を取り込みました。'+(cloud.state.configured&&data.records?.length?' 同梱の記録はこの端末に取り込みました。':''));
  }catch(error){notify('稽古予定は保存しました。記録または区分を取り込めませんでした。'+error.message)}
 }catch(err){notify(err.message)}
 finally{input.value='';input.disabled=false}
};

cloud.onState(s=>{
 const generation=++accountGeneration;
 stop?.();stopAttendance?.();opened=null;loaded=false;responding=false;scheduleError='';dialog.close();
 if(s.configured){
  if($('data-dialog').open)$('data-dialog').close();
  items=[];attendance={};names=[];rosterState='loading';
  if(s.role)stop=cloud.watch('rehearsals',doc=>{
   if(generation!==accountGeneration)return;
   if(doc&&(!Array.isArray(doc.items)||!doc.items.every(validRehearsal))){notify('稽古予定のデータ形式を確認してください。');return}
   items=doc?.items||[];revision=doc?.revision||0;loaded=true;scheduleError='';
   if(opened&&!items.some(item=>item.id===opened&&!item.archivedAt)){opened=null;stopAttendance?.();dialog.close();notify('この稽古予定は一覧から移動または削除されました。')}
   render();
  },message=>{if(generation===accountGeneration){scheduleError=message;notify(message);render()}});
 }else{items=structuredClone(localItems);attendance=structuredClone(localAttendance)}
 if(s.ready!==false&&(!s.configured||s.role))loadRoster();

 render();
});
mountMemberHome();mountAccount();startCloud();

mountScheduleImport(document.querySelector('#data-dialog .dialog-body'),'rehearsals',()=>items,save,notify);
