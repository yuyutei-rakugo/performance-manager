import {performerPicker,updatePerformerPickers,readPerformer,showPerformerRoster} from './performer-picker.js?v=20261121-today1';
import {mountMemberHome} from './member-home.js?v=20261121-today1';
import {applyConfirmedSchedule} from './schedule-bootstrap.js?v=20261121-today1';
import {readCategories,saveCategories,validCategories} from './categories.js?v=20261121-today1';
import {mountScheduleImport} from './schedule-import.js?v=20261121-today1';
import {toRecord,transferRecord,rehearsalTitle,readRecords,mergeRecords,mergedRecords} from './record-transfer.js?v=20261121-today1';
import {cloud,startCloud,mountAccount} from './cloud.js?v=20261121-today1';
import {statuses,rehearsalNames,validRehearsal,validAttendance,attendanceSummary,japanDate,rehearsalBadge,rehearsalDateTime} from './rehearsal-model.js?v=20261121-today1';
const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key='yuitei.rehearsals.v1';let items=[],attendance={},names=[],revision=0,loaded=false,storageOK=true,stop,stopAttendance,opened=null,detailRevision=0,busy=false;
let noticeTimer;
const notify=s=>{clearTimeout(noticeTimer);$('notice').textContent=s;$('notice').hidden=false;noticeTimer=setTimeout(()=>$('notice').hidden=true,6000)};
const canEdit=()=>!cloud.state.configured||loaded&&['admin','editor'].includes(cloud.state.role);
const dialog=$('rehearsal-dialog');
let accountGeneration=0,rosterState='loading',attendanceState='loading',scheduleError='';
const attendanceTimes=new Map(),practiceSaves=new Map();
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
 const upcoming=items.filter(r=>!r.archivedAt&&r.date>=japanDate());if($('stats'))$('stats').innerHTML=[['予定の稽古',upcoming.length],['師匠稽古',upcoming.filter(r=>r.title==='師匠稽古').length],['自主稽古',upcoming.filter(r=>r.title==='自主稽古').length]].map(([label,count])=>`<div class="stat"><span class="stat-icon">▦</span><div><small>${label}</small><strong>${count}</strong><span class="unit">件</span></div></div>`).join('');
 $('add').disabled=!canEdit();$('mode').textContent=cloud.state.configured?(cloud.state.role?'予定ごとに「出欠・詳細」から回答・一覧を確認できます。':'出欠は会員ログイン後に回答できます。'):'現在はこのブラウザに保存します。自分の名前を選んで出欠を入力します。本人認証・端末間の同期はまだ有効ではありません。';
 $('rehearsals').innerHTML=items.filter(r=>!r.archivedAt).sort((a,b)=>(!!a.archivedAt-!!b.archivedAt)||(a.date+a.time).localeCompare(b.date+b.time)).map(r=>{const s=cloud.state.configured?null:attendanceSummary(names,attendance[r.id]||{});return `<article class="event-card rehearsal-card"><div class="date-badge" aria-hidden="true"><small>${Number(r.date.slice(5,7))}月</small><strong>${Number(r.date.slice(8))}</strong></div><div><h3>${rehearsalBadge(r,rehearsalTitle(r),esc)}${r.archivedAt?' <small>（記録へ移動済み）</small>':''}</h3><div class="meta"><span>${r.date.replaceAll('-','/')} ${r.time}</span><span>＠ ${esc(r.venue)}</span></div></div>${s?`<div class="progress"><span class="progress-label">出席 ${s.count}人 ／ 未回答 ${s.unanswered}人</span></div>`:''}<div class="event-actions"><button class="secondary" data-detail="${esc(r.id)}">出欠・詳細</button></div></article>`}).join('')||(cloud.state.configured&&!loaded?'<p class="empty">'+(cloud.state.role?esc(scheduleError||'稽古予定を読み込み中…'):'稽古予定を見るには会員ログインしてください。')+'</p>':'<p class="empty">稽古予定はまだありません。</p>');
 if(loaded&&scheduleError)$('rehearsals').insertAdjacentHTML('afterbegin','<p class="sync-warning" role="status">更新できませんでした。前回取得した稽古予定を表示しています。</p>');
 openRequestedDetail();
}
function form(existing,onCancel=()=>dialog.close()){if(!canEdit())return;stopAttendance?.();opened=null;const version=revision,r=existing?{...existing,title:existing.title==='その他稽古'?'その他':existing.title}:{title:rehearsalNames[0],date:new Date().toLocaleDateString('sv-SE'),time:'14:00',venue:'',notes:''};dialog.innerHTML=`<div class="dialog-body"><div class="dialog-head"><h2>${existing?'稽古を編集':'稽古を登録'}</h2><button type="button" data-close aria-label="閉じる">×</button></div><form id="rehearsal-form"><div class="fields"><label class="wide">稽古名<select name="title" required>${[...new Set([...rehearsalNames,...(r.title&&!rehearsalNames.includes(r.title)?[r.title]:[])])].map(n=>`<option value="${esc(n)}" ${n===r.title?'selected':''}>${esc(n)}</option>`).join('')}</select></label><label class="wide" id="other-content-field">その他の内容<input name="otherContent" value="${esc(r.otherContent||'')}" placeholder="例：交流会、打ち合わせ"></label><label>開催日<input name="date" type="date" required value="${r.date}"></label><label>開演・開始時刻<input name="time" type="time" required value="${r.time}"></label><label class="wide">会場・場所<input name="venue" required value="${esc(r.venue)}"></label></div><label>内容・連絡事項（任意）<textarea name="notes" rows="4"></textarea></label><div class="form-actions"><button class="primary">保存する</button><button class="secondary" type="button" data-cancel-edit>キャンセル</button></div>${existing?'<details class="delete-zone"><summary>この稽古を削除する</summary><label><input type="checkbox" id="delete-confirm">削除することを確認しました</label><button class="danger" type="button" id="delete-rehearsal" disabled>削除する</button></details>':''}</form></div>`;dialog.querySelector('textarea').value=r.notes;const toggleOther=()=>{const yes=$('rehearsal-form').elements.title.value==='その他';$('other-content-field').hidden=!yes;$('rehearsal-form').elements.otherContent.required=yes};$('rehearsal-form').elements.title.onchange=toggleOther;toggleOther();
 const editor=$('rehearsal-form');
 editor.querySelector('[data-cancel-edit]').onclick=onCancel;
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
function detail(id){const r=items.find(x=>x.id===id);if(!r)return;stopAttendance?.();opened=id;attendanceState=cloud.state.configured?'loading':'ready';detailRevision=revision;dialog.innerHTML=`<div class="dialog-body"><div class="dialog-head"><h2>${rehearsalBadge(r,rehearsalTitle(r),esc)}</h2><button data-close aria-label="閉じる">×</button></div><p>${rehearsalDateTime(r,esc)}<br>場所：${esc(r.venue)}</p><p class="muted">予定ID：${esc(r.id)}</p><p class="memo">${esc(r.notes)}</p><div class="form-actions"><button type="button" class="primary" id="edit-rehearsal-inside" ${canEdit()?'':'disabled'}>編集する</button></div><section id="attendance"></section><section class="block" id="practice-section"></section><section class="block" hidden><button class="primary" type="button" id="transfer-rehearsal" ${canEdit()?'':'disabled'}>${r.archivedAt?'記録を更新する':'終了して記録へ移す'}</button><p class="muted">終了後、稽古したネタと長さ・出欠・連絡事項を記録へ保存します。元の予定も残ります。</p></section></div>`;$('edit-rehearsal-inside').onclick=()=>form(items.find(x=>x.id===id),()=>{
 if(items.some(item=>item.id===id&&!item.archivedAt))detail(id);else dialog.close();
});practiceView(id);$('transfer-rehearsal').onclick=async()=>{if($('practice-form')?.dataset.dirty==='true'){notify('入力したネタ・時間を保存してから記録へ移してください。');return}if(cloud.state.role!=='admin'||r.date>=new Date().toLocaleDateString('sv-SE')||!confirm('終了した稽古を稽古・公演記録へ移しますか？ネタ・時間は保存した内容を転記します。'))return;try{const current=items.find(x=>x.id===id);await transferRecord(toRecord('rehearsal',current,names,attendance[id]||{}));if(await save(items.map(x=>x.id===id?{...x,archivedAt:new Date().toISOString()}:x),detailRevision)){dialog.close();notify('稽古・公演記録へ移しました。')}else notify('記録には保存しましたが、予定側の転記済み表示を保存できませんでした。再実行しても重複しません。')}catch(e){notify(e.message)}};if(!dialog.open)dialog.showModal();if(cloud.state.configured&&cloud.state.role){watchDetailAttendance(id);if(cloud.state.provider==='apps-script'){loadRoster(true);refreshDetailPractices(id)}}else attendanceView(id)}
function watchDetailAttendance(id){
 stopAttendance?.();
 attendanceState='loading';delete attendance[id];attendanceView(id);
 stopAttendance=cloud.watchAttendance(id,(rows,fetchedAt)=>{
  if(opened!==id)return;
  attendance[id]=Object.fromEntries(rows.map(x=>[x.stageName,x.status]));
  attendanceTimes.set(id,fetchedAt||Date.now());attendanceState='ready';attendanceView(id);
 },()=>{
  if(opened!==id)return;
  delete attendance[id];attendanceState='error';attendanceView(id);
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
function samePractices(left=[],right=[]){
 return left.length===right.length&&left.every((item,i)=>{
  const other=right[i];
  return item.stageName===other.stageName&&item.piece===other.piece&&item.durationSeconds===other.durationSeconds&&!!item.guest===!!other.guest;
 });
}
async function refreshDetailPractices(id){
 const section=$('practice-section'),generation=accountGeneration;
 const original=items.find(item=>item.id===id)?.practices;
 try{
  const doc=await cloud.readShared('rehearsals');
  if(generation!==accountGeneration||opened!==id||section!==$('practice-section'))return;
  if(!doc||!Array.isArray(doc.items)||!doc.items.every(validRehearsal)||!Number.isInteger(doc.revision))throw Error('稽古予定を取得できませんでした。');
  if(doc.revision>=revision){items=doc.items;revision=doc.revision;render()}
  const current=items.find(item=>item.id===id&&!item.archivedAt);
  if(!current){dialog.close();notify('この稽古は一覧から移動または削除されました。');return}
  const editor=$('practice-form');
  if(!samePractices(original,current.practices)&&editor?.dataset.dirty!=='true'&&!practiceSaves.get(id)?.pending)practiceView(id);
 }catch{
  if(generation!==accountGeneration||opened!==id||section!==$('practice-section'))return;
  const warning=$('practice-read-warning');
  if(warning){warning.hidden=false;warning.textContent='最新のネタを取得できませんでした。詳細を開き直して確認してください。';}
 }
}
async function saveSharedPractices(id,original,practices,generation){
 for(let attempt=0;attempt<2;attempt++){
  const doc=await cloud.readShared('rehearsals');
  if(generation!==accountGeneration||!canEdit())throw Error('ログイン状態が変わりました。');
  if(!doc||!Array.isArray(doc.items)||!doc.items.every(validRehearsal)||!Number.isInteger(doc.revision))throw Error('最新の稽古予定を取得できませんでした。');
  const current=doc.items.find(item=>item.id===id&&!item.archivedAt);
  if(!current)throw Error('この稽古は一覧から移動または削除されました。');
  if(!samePractices(current.practices,original)&&!samePractices(current.practices,practices)){
   throw Error('別の端末でこの稽古のネタが更新されています。入力を控え、開き直して最新の内容を確認してください。');
  }
  const next=doc.items.map(item=>item.id===id?{...item,practices}:item);
  try{
   const savedRevision=await cloud.save('rehearsals',{items:next},doc.revision);
   if(generation!==accountGeneration)return;
   if(revision<=savedRevision){items=next;revision=savedRevision;render()}
   return;
  }catch(error){
   if(attempt===1||!/ほかの端末で更新/.test(error.message))throw error;
  }
 }
}
function showPracticeSave(id){
 if(opened!==id)return;
 const editor=$('practice-form'),status=$('practice-save-feedback');
 if(!editor||!status)return;
 const save=practiceSaves.get(id);
 editor.inert=!!save?.pending;
 status.textContent=save?.message||'';
}
function practiceView(id){
 const r=items.find(x=>x.id===id),section=$('practice-section');
 if(!canEdit()){
  const entries=(r.practices||[]).map(p=>`<li>${esc(p.stageName)}　${esc(p.piece)}${p.durationSeconds===null?'':'　'+Math.floor(p.durationSeconds/60)+'分'+p.durationSeconds%60+'秒'}</li>`).join('');
  section.innerHTML='<h3>稽古したネタ・長さ</h3><p class="sync-warning" id="practice-read-warning" role="status" hidden></p>'+(entries?'<ul>'+entries+'</ul>':'<p>ネタの記録はありません。</p>');
  return;
 }
 section.innerHTML=`<h3>稽古したネタ・長さ</h3><p class="muted">会員またはゲストに複数のネタを追加できます。長さは任意です。</p><p class="sync-warning" id="practice-read-warning" role="status" hidden></p><p class="save-feedback" id="practice-save-feedback" role="status"></p><form id="practice-form"><p class="muted" role="status" data-roster-status></p><button type="button" class="secondary" data-roster-retry hidden>名簿を更新</button><div id="practice-rows"></div><div class="form-actions"><button class="secondary" type="button" id="add-practice" ${canEdit()?'':'disabled'}>＋ ネタを追加</button><button class="primary" type="submit" ${canEdit()?'':'disabled'}>ネタ・時間を保存</button></div></form>`;
 const editor=$('practice-form'),list=$('practice-rows');const markDirty=()=>{
  editor.dataset.dirty='true';
  practiceSaves.set(id,{message:'未保存の変更があります。'});
  showPracticeSave(id);
 };
 editor.oninput=markDirty;
 function row(p={stageName:'',piece:'',durationSeconds:null}){
  const el=document.createElement('div');
  el.className='practice-row';
  el.innerHTML=`<div class="fields"><div data-performer-slot></div><label>稽古したネタ<input name="piece" required value="${esc(p.piece)}"></label><label>長さ（分・任意）<input name="minutes" type="number" min="0" max="1440" step="1" value="${p.durationSeconds===null?'':Math.floor(p.durationSeconds/60)}"></label><label>秒（任意）<input name="seconds" type="number" min="0" max="59" step="1" value="${p.durationSeconds===null?'':p.durationSeconds%60}"></label></div><button type="button" class="secondary" data-remove-practice>このネタを外す</button>`;
  el.querySelector('[data-performer-slot]').replaceWith(performerPicker(p,names));
  el.querySelector('[data-remove-practice]').onclick=()=>{el.remove();markDirty()};
  list.append(el);
 }
 (r.practices||[]).forEach(row);
 showPerformerRoster($('practice-form'),rosterState,names,()=>loadRoster(true));$('add-practice').onclick=()=>{if(list.children.length>=200){notify('ネタは200件までです。');return}row();markDirty()};
 const original=structuredClone(r.practices||[]);
 showPracticeSave(id);
 editor.addEventListener('invalid',()=>{
  practiceSaves.set(id,{message:'演者・ネタ・長さの入力を確認し、もう一度保存してください。'});
  showPracticeSave(id);
 },true);
 editor.onsubmit=async e=>{
  e.preventDefault();
  if(!canEdit()||busy||practiceSaves.get(id)?.pending)return;
  const practices=[...list.children].map(el=>{
   const input=name=>el.querySelector(`[name=${name}]`).value;
   const minutes=input('minutes'),seconds=input('seconds');
   return {...readPerformer(el),piece:input('piece').trim(),durationSeconds:minutes===''&&seconds===''?null:Number(minutes||0)*60+Number(seconds||0)};
  });
  const current=items.find(item=>item.id===id),next={...current,practices};
  if(!validRehearsal(next)){
   practiceSaves.set(id,{message:'演者・ネタ・長さを確認し、もう一度保存してください。'});showPracticeSave(id);return;
  }
  const generation=accountGeneration,shared=cloud.state.configured&&cloud.state.provider==='apps-script';
  practiceSaves.set(id,{pending:true,message:'保存中…'});showPracticeSave(id);
  try{
   if(shared){
    busy=true;
    await saveSharedPractices(id,original,practices,generation);
   }else if(!await save(items.map(item=>item.id===id?next:item),detailRevision)){
    throw Error('稽古したネタ・時間を保存できませんでした。');
   }
   if(generation!==accountGeneration)return;
   practiceSaves.set(id,{message:'稽古したネタ・時間を保存しました。'});
   notify('稽古したネタ・時間を保存しました。');
   if(opened===id&&dialog.open)practiceView(id);
   if(shared){
    const saved=practiceSaves.get(id);
    const note=message=>{
     if(generation!==accountGeneration||practiceSaves.get(id)!==saved)return;
     practiceSaves.set(id,{message});showPracticeSave(id);
    };
    cloud.readShared('rehearsals').then(doc=>{
     if(!Array.isArray(doc?.items))throw Error('一覧を取得できませんでした。');
     if(!doc.items.some(item=>item.id===id&&samePractices(item.practices,practices)))note('保存しました。その後、共通保存の内容が変更されました。詳細を開き直して確認してください。');
    }).catch(()=>note('保存しました。保存後の一覧を取得できませんでした。詳細を開き直して確認してください。'));
   }
  }catch(error){
   if(generation===accountGeneration)practiceSaves.set(id,{message:'保存できませんでした。'+error.message+' 入力はそのままです。'});
  }finally{
   if(shared)busy=false;
   if(generation===accountGeneration)showPracticeSave(id);
  }
 };

}

let responding=false;
const responseMessages=new Map();
function attendanceView(id){
 if(opened!==id)return;
 const panel=$('attendance'),shared=cloud.state.configured;
 const self=shared?cloud.state.stageName:localStorage.getItem('yuitei.attendance.person')||'';
 const canAnswer=!!self&&(shared?!!cloud.state.role:names.includes(self));
 const save=shared?cloud.attendanceFeedback?.(id):null;
 const responses=attendance[id]||{};
 const key=JSON.stringify([id,self,canAnswer,shared,shared?null:names]);
 if(panel.dataset.view!==key){
  panel.dataset.view=key;
  panel.innerHTML=`<h3>出欠一覧</h3>
   ${!shared?`<label>自分の名前<select id="attendance-person"><option value="">選んでください</option>${names.map(n=>`<option value="${esc(n)}" ${n===self?'selected':''}>${esc(n)}</option>`).join('')}</select></label><p class="muted">端末内保存です。この名前選択は本人認証ではありません。</p>`:''}
   ${canAnswer?`<label>自分の出欠（${esc(self)}）<select data-person="${esc(self)}"><option value="" disabled>確認中…</option>${statuses.map(v=>`<option value="${v}">${v==='未回答'?'未登録':v}</option>`).join('')}</select></label><div class="rsvp-buttons">${['出席','欠席','未定'].map(v=>`<button type="button" class="secondary" data-self-status="${v}">${v}</button>`).join('')}</div>`:'<p>自分の出欠を回答するには、'+(shared?'会員ログインと高座名の登録が必要です。':'自分の名前を選んでください。')+'</p>'}
   <p class="save-feedback" id="attendance-feedback" role="status"></p>
   <p class="sync-warning" data-attendance-message role="status" hidden></p>
   <p class="muted" data-attendance-time hidden></p><button type="button" class="secondary" data-retry-attendance hidden>出欠一覧を更新</button>
   <div class="attendance-summary"></div>`;
 }
 const pending=responding||save?.phase==='pending';
 const own=responses[self]||(!shared||Object.hasOwn(attendance,id)&&attendanceState==='ready'?'未回答':'');
 const select=panel.querySelector('[data-person]');
 if(select){
  // Keep the native select and buttons in place during polling and roster updates.
  if(select.dataset.confirmed!==own||pending){
   select.value=own;select.dataset.confirmed=own;
  }
  select.disabled=pending;
 }
 for(const button of panel.querySelectorAll('[data-self-status]')){
  button.disabled=pending;
  button.setAttribute('aria-pressed',String(own===button.dataset.selfStatus));
 }
 $('attendance-feedback').textContent=save?.message||(responseMessages.get(id)||'');
 const canList=!shared||rosterState==='ready'&&attendanceState==='ready';
 const failed=shared&&[rosterState,attendanceState].includes('error');
 const message=panel.querySelector('[data-attendance-message]');
 message.textContent=failed?'出欠一覧を取得できませんでした。「出欠一覧を更新」で再試行してください。':canList?'':'出欠を読み込んでいます。';
 message.hidden=!message.textContent;
 const updated=panel.querySelector('[data-attendance-time]');
 updated.hidden=!shared;
 const attendanceFetchedAt=attendanceTimes.get(id);
 updated.textContent=attendanceFetchedAt?'最終取得：'+new Date(attendanceFetchedAt).toLocaleString('ja-JP',{hour12:false}):'最終取得：未取得';
 const reload=panel.querySelector('[data-retry-attendance]');
 reload.hidden=!shared;
 reload.disabled=!failed&&attendanceState==='loading';
 const groups=canList?statuses.map(status=>({label:status==='未回答'?'未登録':status,people:names.filter(n=>(responses[n]||'未回答')===status)})):[];
 panel.querySelector('.attendance-summary').innerHTML=groups.map(g=>`<section><h4>${g.label} ${g.people.length}人</h4><p>${g.people.length?esc(g.people.join('・')):'なし'}</p></section>`).join('');
 panel.onclick=async e=>{
  if(e.target.closest('[data-retry-attendance]')){
   if(rosterState==='error'||cloud.state.provider==='apps-script')loadRoster(true);
   watchDetailAttendance(id);
   return;
  }
  const button=e.target.closest('[data-self-status]');
  if(button)await respondSelf(id,self,button.dataset.selfStatus);
 };
 panel.onchange=async e=>{
  if(e.target.id==='attendance-person'){localStorage.setItem('yuitei.attendance.person',e.target.value);attendanceView(id);return}
  const name=e.target.dataset.person;
  if(name===self)await respondSelf(id,name,e.target.value);
 };
}
async function respondSelf(id,name,status){
 const shared=cloud.state.configured;
 const self=shared?cloud.state.stageName:localStorage.getItem('yuitei.attendance.person');
 if(responding||opened!==id||!name||name!==self||!(shared?cloud.state.role:names.includes(name))||!statuses.includes(status)||cloud.attendanceFeedback?.(id)?.phase==='pending')return;
 const generation=accountGeneration;
 responding=true;responseMessages.set(id,'保存中…');attendanceView(id);
 try{
  if(shared){
   await cloud.respondAttendance(id,status);
   if(generation!==accountGeneration)return;
   if(!cloud.attendanceFeedback)attendance[id]={...attendance[id],[self]:status};
  }else{
   const next=structuredClone(attendance);next[id]={...next[id],[self]:status};
   if(!await save(items,detailRevision,next))throw Error('保存に失敗しました。');
  }
  responseMessages.set(id,(status==='未回答'?'回答を未登録に戻しました。':status+'で登録しました。')+(shared?'':'この端末に保存しました。'));
 }catch(error){
  if(generation===accountGeneration)responseMessages.set(id,'保存できませんでした。'+error.message+' もう一度回答してください。');
 }finally{
  if(generation===accountGeneration){responding=false;if(opened)attendanceView(opened)}
 }
}
window.addEventListener('attendance-save-state',event=>{
 const id=event.detail.id,save=cloud.attendanceFeedback?.(id);
 if(save?.phase==='saved'&&cloud.state.provider==='apps-script'){delete attendance[id];if(opened===id)attendanceState='loading'}
 if(opened===id)attendanceView(id);
});
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
 stop?.();stopAttendance?.();opened=null;loaded=false;responding=false;responseMessages.clear();attendanceTimes.clear();practiceSaves.clear();scheduleError='';dialog.close();
 if(s.configured){
  if($('data-dialog').open)$('data-dialog').close();
  items=[];attendance={};names=[];rosterState='loading';
  if(s.role)stop=cloud.watch('rehearsals',doc=>{
   if(generation!==accountGeneration||loaded&&doc?.revision<revision)return;
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
