import {startEditor,finishEditor,leaveEditor,guardEditor,editorState,saveRecovery,recoveryScope,recoveredEditState} from './editor-dialog.js?v=20261122-workflow3';
import {performerPicker,updatePerformerPickers,readPerformer,showPerformerRoster} from './performer-picker.js?v=20261122-workflow3';
import {mountMemberHome} from './member-home.js?v=20261122-workflow3';
import {applyConfirmedSchedule} from './schedule-bootstrap.js?v=20261122-workflow3';
import {readCategories,saveCategories,validCategories,categoryOptions,mountCategories,mountCategoryAdder} from './categories.js?v=20261122-workflow3';
import {mountScheduleImport} from './schedule-import.js?v=20261122-workflow3';
import {scheduleChange,scheduleChangeBadge,preparationTemplates,draftTask,duplicateSchedule,copyScheduleInvite,validPerformer,timeline,formatDuration,toRecord,transferRecord,readRecords,mergeRecords,mergedRecords} from './record-transfer.js?v=20261122-workflow3';
import {cloud,startCloud,mountAccount} from './cloud.js?v=20261122-workflow3';
'use strict';

const key = 'yuitei.events.v1';
const tasks = ['会場を予約する', '開催日時を確定する', '出演者に連絡する', '演目を確認する', '出演順を決める', '持ち時間を確認する', 'チラシを作る', '公演を告知する', '予約を確認する', '番組表を作る', '高座と座布団を準備する', '音響を確認する', '受付担当を決める', '当日の進行を共有する', '搬入・撤収の手順を確認する'];
const $ = id => document.getElementById(id);
const eventDialog = $('event-dialog');
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clone = value => JSON.parse(JSON.stringify(value));
const localDate = date => [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part, i) => String(part).padStart(i ? 2 : 4, '0')).join('-');
const today = () => localDate(new Date());
const dateLabel = value => new Intl.DateTimeFormat('ja-JP', {year:'numeric',month:'long',day:'numeric',weekday:'short'}).format(new Date(value + 'T00:00:00'));
const newTasks = () => tasks.map(draftTask);
let cloudLoadError='';
let memberNames=['勇水','小薔薇','懐古','華詩','世喜音','やすゑ','一悟','日光'],cloudRevision=0,cloudLoaded=false,stopCloud,cloudIdentity='',saving=false;
fetch('./history-data.json').then(r=>r.json()).then(d=>{memberNames=d.names.filter(n=>n!=='藤本')}).catch(()=>{});
const editable=()=>!cloud.state.configured||(['admin','editor'].includes(cloud.state.role)&&cloudLoaded);
function assigneePicker(item,i){return `<fieldset class="assignee-picker"><legend>担当者（任意・複数選択可）</legend>${[...new Set([...memberNames,...(item.assignees||[])])].map(n=>`<label><input type="checkbox" data-owner="${i}" value="${esc(n)}" ${(item.assignees||[]).includes(n)?'checked':''}>${esc(n)}</label>`).join('')}</fieldset>`}
function progress(event){
 const applicable=event.checklist.filter(item=>!item.excluded);
 return {done:applicable.filter(item=>item.done).length,total:applicable.length,excluded:event.checklist.length-applicable.length};
}

function copiedTasks() {
  const edited=events.filter(event=>typeof event.checklistUpdatedAt==='string');
  const latest=[...(edited.length?edited:events)].sort((a,b)=>(b.checklistUpdatedAt||b.date+'T'+b.time).localeCompare(a.checklistUpdatedAt||a.date+'T'+a.time))[0];
  return latest?latest.checklist.map(item=>draftTask(item.label)):newTasks();
}

function samples() {
  const sample = (offset, title, time, venue, done) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return {id:'sample-' + offset,title,date:localDate(date),time,venue,memo:'試作用のサンプル公演です。',performers:[{name:'',stageName:'結友亭 こはる',piece:'寿限無',minutes:15}],checklist:newTasks().map((item,i) => ({...item,done:i < done}))};
  };
  return [
    sample(4,'結友亭 定例寄席','14:00','結友会館 和室',9),
    sample(18,'まちかど落語会','13:30','中央公民館 ホール',4),
    sample(42,'結友亭 お楽しみ寄席','15:00','市民文化センター',0)
  ];
}

const isText = value => typeof value === 'string';
function validEvent(event) {
  if (!event || !['id','title','date','time','venue','memo'].every(field => isText(event[field]))) return false;
  if (!event.id.trim() || !event.title.trim() || !event.venue.trim()) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date) || localDate(new Date(event.date + 'T00:00:00')) !== event.date || (event.time!==''&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(event.time))) return false;
  return Array.isArray(event.performers) && event.performers.length<=200 && event.performers.every(validPerformer)
    && Array.isArray(event.checklist) && event.checklist.length > 0 && event.checklist.length <= 200 && event.checklist.every(item => item && isText(item.label) && item.label.trim() && typeof item.done === 'boolean' && (item.excluded===undefined||typeof item.excluded==='boolean'&&!(item.excluded&&item.done)) && (item.dueDate===undefined||item.dueDate===''||(isText(item.dueDate)&&/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate)&&localDate(new Date(item.dueDate+'T00:00:00'))===item.dueDate)) && (item.assignees === undefined || (Array.isArray(item.assignees)&&item.assignees.every(isText))));
}

let events = [];
let tab = 'list';
let selected = today();
let month = selected.slice(0,7);
let noticeTimer;
let storageReadable = true;

function notify(message) {
  const notice = $('notice');
  notice.textContent = message;
  notice.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 4500);
}
try{await applyConfirmedSchedule()}catch(e){notify(e.message||'予定の自動追加に失敗しました。再読み込みしてください。')}
try {
  const stored = localStorage.getItem(key);
  if (stored === null) events = samples();
  else {
    const saved = JSON.parse(stored);
    if (!Array.isArray(saved) || !saved.every(validEvent)) throw new Error('Invalid storage');
    events = saved;
  }
} catch {
  storageReadable = false;
  notify('保存済みデータを読み込めませんでした。');
}

async function save(next, expectedRevision=cloudRevision,report=notify) {
  if(saving)return false;
  if(cloud.state.configured){
    if(!editable()){report('会員ログインと編集権限、共通データの読み込みが必要です。');return false}
    saving=true;
    let savedRevision;
    try{savedRevision=await cloud.save('events',{items:next},expectedRevision)}
    catch(e){report(e.message);return false}
    finally{saving=false}
    if(cloudRevision<=savedRevision){events=next;cloudRevision=savedRevision;renderSavedList()}
    return true;
  }
  if (!storageReadable) {
    report('保存済みデータを読み込めないため、変更を保存できません。');
    return false;
  }
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    report('変更を保存できませんでした。ブラウザの設定や空き容量をご確認ください。');
    return false;
  }
  events = next;
  window.dispatchEvent(new Event('schedule-data-changed'));
  renderSavedList();
  return true;
}

function renderSavedList(){
 try{render()}
 catch{notify('保存しました。一覧を更新できませんでした。再読み込みして確認してください。')}
}

function upcoming(event) {
  return new Date(event.date + 'T' + (event.time||'23:59')) >= new Date();
}
function sortedEvents(list) {
  const filter=document.getElementById('event-kind-filter'),order=document.getElementById('event-sort');list=list.filter(e=>!filter?.value||(e.kind||'その他公演')===filter.value);if(order?.value==='kind'){const kinds=readCategories(events.map(e=>e.kind));return [...list].sort((a,b)=>kinds.indexOf(a.kind||'その他公演')-kinds.indexOf(b.kind||'その他公演')||(a.date+a.time).localeCompare(b.date+b.time))}
  return [...list].sort((a,b) => (a.date + a.time).localeCompare(b.date + b.time));
}
function progressMarkup(event) {
  const {done,total,excluded}=progress(event);
  const label=total?done+'／'+total+'件 完了':'対象作業なし';
  return `<div class="progress"><div class="progress-label"><span>${label}</span>${excluded?`<small>対象外 ${excluded}件</small>`:''}</div>${total?`<progress aria-label="準備進捗" value="${done}" max="${total}"></progress>`:''}</div>`;
}
function card(event) {
  const [year, mon, day] = event.date.split('-');
  return `<article class="event-card"><div class="date-badge" aria-hidden="true"><small>${Number(mon)}月</small><strong>${Number(day)}</strong></div><div><h3>${esc(event.title)}</h3>${scheduleChangeBadge(event,esc)}<div class="meta"><span>${year}/${mon}/${day} ${esc(event.time||'時間未定')}</span><span>＠ ${esc(event.venue)}</span></div></div>${progressMarkup(event)}<div class="event-actions"><button class="secondary" data-event="${esc(event.id)}" aria-label="${esc(event.title)}の詳細">詳細 ›</button></div></article>`;
}
let requestedEvent=new URLSearchParams(location.search).get('detail');
function render() {
  if(requestedEvent&&cloud.state.ready!==false&&(!cloud.state.configured||cloudLoaded)){
    const id=requestedEvent;requestedEvent='';
    if(events.some(item=>item.id===id&&!item.archivedAt))queueMicrotask(()=>renderDetails(id));
    else notify('指定の公演予定は見つかりませんでした。');
  }
  eventRecovery.render();
  $('new-event').disabled=!editable();
  const filter=document.getElementById('event-kind-filter');if(filter){const value=filter.value;filter.innerHTML='<option value="">全区分</option>'+categoryOptions(value,events.map(e=>e.kind));filter.value=value;}
  const scheduled = events.filter(e=>!e.archivedAt&&upcoming(e));
  const stats = [['▦','予定の公演',scheduled.length],['◷','準備未完了',scheduled.filter(event=>{const {done,total}=progress(event);return done<total}).length],['✓','準備完了',scheduled.filter(event=>{const {done,total}=progress(event);return total>0&&done===total}).length]];
  if($('stats'))$('stats').innerHTML = stats.map(([icon,label,count]) => `<div class="stat"><span class="stat-icon" aria-hidden="true">${icon}</span><div><small>${label}</small><strong>${count}</strong><span class="unit">件</span></div></div>`).join('');
  $('list-tab').setAttribute('aria-pressed', tab === 'list');
  $('calendar-tab').setAttribute('aria-pressed', tab === 'calendar');
  const warning=cloudLoaded&&cloudLoadError?'<p class="sync-warning" role="status">更新できませんでした。前回取得した公演予定を表示しています。</p>':'';
  $('schedule').innerHTML = cloud.state.configured&&!cloudLoaded ? '<p class="empty">'+(cloud.state.role?esc(cloudLoadError||'公演予定を読み込んでいます。'):'公演予定を見るには会員ログインしてください。端末内のデータは保持しています。')+'</p>' : tab === 'list'
    ? sortedEvents(events.filter(e=>!e.archivedAt)).map(card).join('') || '<p class="empty">公演がありません。「公演を登録」から追加できます。</p>'
    : calendar();

  if(warning)$('schedule').insertAdjacentHTML('afterbegin',warning);
}
function calendar() {
  const [year, mon] = month.split('-').map(Number);
  const first = new Date(year, mon - 1, 1).getDay();
  const days = new Date(year, mon, 0).getDate();
  const counts = new Map();
  events.forEach(({date}) => counts.set(date, (counts.get(date) || 0) + 1));
  const labels = [...'日月火水木金土'].map(day => `<span class="weekday">${day}</span>`).join('');
  const cells = Array.from({length:days}, (_,i) => {
    const date = month + '-' + String(i + 1).padStart(2,'0');
    const count = counts.get(date);
    return `<button class="day" data-day="${date}" aria-label="${dateLabel(date)}${count ? ' 公演' + count + '件' : ''}" aria-pressed="${date === selected}" ${date === today() ? 'aria-current="date"' : ''}>${i + 1}${count ? '<span>' + count + '件</span>' : ''}</button>`;
  }).join('');
  const cards = sortedEvents(events.filter(event => event.date === selected)).map(card).join('');
  return `<div class="calendar"><div class="calendar-head"><button data-month="-1" aria-label="前の月">‹</button><h3>${year}年${mon}月</h3><button data-month="1" aria-label="次の月">›</button></div><div class="calendar-grid">${labels}${'<span></span>'.repeat(first)}${cells}</div></div><div class="calendar-results"><h3>${dateLabel(selected)}</h3>${cards || '<p class="empty">この日の公演はありません。</p>'}</div>`;
}
function showEvent() {
  if (!eventDialog.open) eventDialog.showModal();
  eventDialog.scrollTop = 0;
}
function renderDetails(id,message='') {
  const event = events.find(item => item.id === id);
  if (!event) {eventDialog.close();return}
  eventDialog.dataset.eventId=id;
  const rows=timeline(event.time,event.performers);
  const program=rows.length?`<div class="program-scroll"><table class="program-table event-program-table"><colgroup><col class="program-order"><col class="program-performer"><col><col class="program-duration"><col class="program-end"></colgroup><thead><tr><th>順</th><th>演者・仲入り</th><th>ネタ・演し物</th><th class="duration-value">持ち時間</th><th>終了予定</th></tr></thead><tbody>${rows.map((p,i)=>`<tr><td>${i+1}</td><td>${esc(p.type==='break'?'仲入り':p.stageName)}</td><td>${esc(p.piece)}</td><td class="duration-value">${formatDuration(Number.isFinite(p.minutes)?p.minutes*60:null)}</td><td>${p.end}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">出演者は未登録です。</p>';

  eventDialog.innerHTML = `<div class="dialog-body"><div class="dialog-head"><h2 id="event-heading">${esc(event.title)}</h2><button type="button" data-close="event-dialog" aria-label="閉じる">×</button></div>
    ${scheduleChangeBadge(event,esc)}<p>${dateLabel(event.date)} ${esc(event.time||'時間未定')}<br>会場　${esc(event.venue)}<br>区分　${esc(event.kind||'その他公演')}</p>${editable()?'<div class="form-actions"><button class="primary" data-edit>編集する</button><button type="button" class="secondary" data-duplicate>予定を複製</button></div>':''}<p class="save-feedback" role="status">${esc(message)}</p>
    <div class="form-actions"><button type="button" class="secondary" data-copy-invite>LINE案内文をコピー</button></div><section class="block" id="event-program"><h3>出演順・演目</h3>${program}${rows.length?'<button type="button" class="secondary" id="print-program">番組表を印刷</button>':''}</section>
    <section class="block"><h3>準備チェックリスト</h3>${progressMarkup(event)}${event.checklist.map(item => `<div class="check-row task-summary ${item.excluded?'is-excluded':item.done?'is-complete':'is-pending'}"><span class="task-status">${item.excluded?'対象外':item.done?'✓ 完了':'未完了'}</span><strong>${esc(item.label)}</strong><small>担当：${esc((item.assignees||[]).join('・')||'未設定')} ／ 完了予定：${esc(item.dueDate||'未設定')}</small></div>`).join('')}</section>
    <section class="block"><h3>メモ</h3><p class="memo">${esc(event.memo) || 'メモはありません。'}</p></section><section class="block" hidden><button type="button" class="primary" id="transfer-event" ${editable()?'':'disabled'}>${event.archivedAt?'記録を更新する':'終了して記録へ移す'}</button><p class="muted">終了した内容を記録に保存します。元データは転記済みの一覧に残ります。</p>${event.archivedAt?'<button type="button" class="secondary" id="unarchive-event">公演一覧に戻す</button>':''}</section></div>`;
  if($('print-program'))$('print-program').onclick=()=>{
    document.body.classList.add('print-program');
    window.addEventListener('afterprint',()=>document.body.classList.remove('print-program'),{once:true});
    window.print();
  };
  $('transfer-event').onclick=async()=>{if(cloud.state.role!=='admin'||event.date>=today()||!confirm('終了した公演を稽古・公演記録へ移しますか？同じ公演は重複せず更新されます。'))return;try{await transferRecord(toRecord('event',event,memberNames));if(await save(events.map(e=>e.id===id?{...e,archivedAt:new Date().toISOString()}:e))){eventDialog.close();notify('稽古・公演記録へ移しました。')}else notify('記録への保存は完了しましたが、転記済み表示を保存できませんでした。再実行しても重複しません。')}catch(e){notify(e.message)}};
  if($('unarchive-event'))$('unarchive-event').onclick=async()=>{if(await save(events.map(e=>e.id===id?{...e,archivedAt:null}:e))){eventDialog.close();notify('公演一覧に戻しました。転記した記録は残しています。')}};
  eventDialog.querySelector('[data-edit]')?.addEventListener('click',()=>renderForm(events.find(item=>item.id===id)));
  eventDialog.querySelector('[data-copy-invite]').onclick=()=>copyScheduleInvite('event',event,notify);
  eventDialog.querySelector('[data-duplicate]')?.addEventListener('click',()=>{const value=duplicateSchedule('event',event);renderForm(null,{value,duplicated:true});notify('日時を確認して保存してください。演目と出欠は引き継ぎません。')});
  showEvent();
}

async function deleteEvent(id) {
  if (!editable()) { notify('編集できる会員でログインしてください。'); return; }
  const event = events.find(item => item.id === id);
  if (!event) return;
  const dialogContent=eventDialog.firstElementChild;
  if (confirm('「' + event.title + '」を削除しますか？既に転記した記録は残ります。'+(event.preparationTemplate?' この公演だけに保存したひな形は候補から外れます。':'')) && await save(events.filter(item => item.id !== id))) {
    if(eventDialog.open&&eventDialog.firstElementChild===dialogContent)eventDialog.close();
    notify('公演を削除しました。');
  }
}

let performerNames=[];
function loadPerformerRoster(form,force=false){
  if(!cloud.state.configured||cloud.state.provider!=='apps-script'){
    performerNames=memberNames;
    updatePerformerPickers(form,performerNames);
    showPerformerRoster(form,'ready',performerNames,()=>loadPerformerRoster(form,true));
    return;
  }
  const retry=()=>loadPerformerRoster(form,true);
  showPerformerRoster(form,'loading',performerNames,retry);
  cloud.roster({force}).then(rows=>{
    if($('event-form')!==form||!eventDialog.open)return;
    performerNames=rows.map(row=>row.name);
    updatePerformerPickers(form,performerNames);
    showPerformerRoster(form,'ready',performerNames,retry);
  }).catch(()=>{
    if($('event-form')!==form||!eventDialog.open)return;
    showPerformerRoster(form,'error',performerNames,retry);
  });
}
function programMinutes(row){
  const minutes=row.querySelector('[name=minutes]').valueAsNumber,seconds=row.querySelector('[name=seconds]').valueAsNumber||0;
  const original=Number(row.dataset.originalMinutes);
  return minutes*60+seconds===Math.round(original*60)?original:minutes+seconds/60;
}

function performerRow(person) {
  const seconds=Math.round(person.minutes*60);

  const row = document.createElement('div');
  row.className = 'performer';
  row.dataset.originalMinutes=person.minutes;
  row.innerHTML = `<div class="performer-head"><strong></strong><button type="button" class="icon-button" data-move="-1" aria-label="出演順を上げる">↑</button><button type="button" class="icon-button" data-move="1" aria-label="出演順を下げる">↓</button><button type="button" class="danger" data-remove>削除</button></div>
    <div class="performance-fields"><input type="hidden" name="type" value="${person.type||'performance'}">
    ${person.type==='break'?'<p>演者・仲入り<strong class="break-name">仲入り</strong><input type="hidden" name="stageName" value="'+esc(person.stageName)+'"></p>':'<div data-performer-slot></div>'}
    <label>ネタ・演し物<input name="piece" value="${esc(person.piece)}" required></label>
    <fieldset class="duration-fields"><legend>持ち時間</legend><label>分<input name="minutes" type="number" inputmode="numeric" min="0" max="1440" step="1" value="${Math.floor(seconds/60)}" required></label><label>秒<input name="seconds" type="number" inputmode="numeric" min="0" max="59" step="1" value="${seconds%60}"></label></fieldset>
    <label>氏名（任意）<input name="name" value="${esc(person.name)}"></label><label>終了予定時刻（任意）<input name="endTime" type="time" value="${esc(person.endTime||'')}"></label><p class="performance-end">終了予定（自動計算・指定反映） <output data-end-time></output></p></div>`;
  row.querySelector('[data-performer-slot]')?.replaceWith(performerPicker(person,performerNames));
  return row;
}
const eventRecovery=saveRecovery('events',()=>recoveryScope(cloud.state),draft=>{
 if(editable())renderForm(events.find(item=>item.id===draft.id),draft);
},editable);
function renderForm(existing,recovery) {
  if(!editable()){notify('編集できる会員でログインしてください。');return}
  const formRevision=cloudRevision;
  const submissionId=existing?.id||recovery?.id||(globalThis.crypto.randomUUID?.() ?? 'event-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  const event = recovery?.value || existing || {title:'',date:tab === 'calendar' ? selected : today(),time:'14:00',venue:'',memo:'',performers:[],checklist:copiedTasks()};
  eventDialog.onchange = null;
  eventDialog.innerHTML = `<div class="dialog-body"><div class="dialog-head"><h2 id="event-heading">${existing ? '公演を編集' : '公演を登録'}</h2><button type="button" data-close="event-dialog" aria-label="閉じる">×</button></div>
    <form id="event-form"><div class="editor-bar"><div class="form-actions"><button class="primary" type="submit">変更を保存する</button><button class="secondary" type="button" id="cancel-edit">キャンセル</button></div><p id="form-feedback" role="status" data-editor-status hidden></p></div><div class="fields"><label class="wide">公演名<input name="title" value="${esc(event.title)}" required></label><label>区分<select name="kind">${categoryOptions(event.kind||'その他公演',events.map(e=>e.kind))}</select></label><label>開催日<input name="date" type="date" value="${event.date}" required></label><label>開始時刻（空欄は時間未定）<input name="time" type="time" value="${esc(event.time)}"></label><label class="wide">会場<input name="venue" value="${esc(event.venue)}" required></label></div>
    <section class="block"><h3>出演順・演目</h3><p class="muted">会員を選ぶか、「ゲスト演者を入力」から高座名を入力できます。終了予定は開演時刻と持ち時間から計算します。</p><p class="muted" role="status" data-roster-status></p><button type="button" class="secondary" data-roster-retry hidden>名簿を更新</button><div id="performers"></div><button type="button" class="secondary" id="add-performer">＋ 出演者を追加</button> <button type="button" class="secondary" id="add-break">＋ 仲入りを追加</button></section>
    <section class="block"><h3>準備チェックリスト</h3>${!existing?'<p class="muted">最新のリストの項目をコピーしました。完了・対象外・担当者・完了予定日はリセットしています。</p>':''}<div id="task-rows"></div><button type="button" class="secondary" id="add-task">＋ 末尾に項目を追加</button></section>
    <section class="block"><label>公演メモ<textarea name="memo" rows="4"></textarea></label></section>${existing?'<section class="delete-zone"><button type="button" class="secondary" id="show-delete" aria-expanded="false" aria-controls="delete-confirmation">この公演を削除する…</button><div id="delete-confirmation" hidden><p>削除すると、この公演の出演者・準備リスト・メモも削除されます。</p><label><input type="checkbox" id="confirm-delete">この公演を削除することを確認しました</label><button type="button" class="danger" id="delete-event" disabled>公演を削除する</button></div></section>':''}</form></div>`;
  mountCategoryAdder($('event-form').elements.kind,()=>events.map(e=>e.kind));
  $('event-form').elements.memo.value = event.memo;
  const taskRows=$('task-rows');
  let templateValue=event.preparationTemplate||null;
  const templates=preparationTemplates(events);
  const templateBox=document.createElement('details');templateBox.className='template-tools';
  templateBox.innerHTML='<summary>準備項目のひな形</summary><p class="muted">作業名だけを使います。完了・対象外・担当・期限は引き継ぎません。</p><label>ひな形を選ぶ<select data-template-choice><option value="">選んでください</option><option value="standard">標準の準備項目</option>'+templates.map((t,i)=>'<option value="'+i+'">'+esc(t.name)+'</option>').join('')+'</select></label><button type="button" class="secondary" data-template-apply>このひな形を使う</button><label>ひな形の名前<input data-template-name maxlength="80" placeholder="例：来らっせ寄席用"></label><button type="button" class="secondary" data-template-create>この作業内容をひな形にする</button><p role="status"></p>';
  taskRows.before(templateBox);
  const templateMessage=templateBox.querySelector('[role=status]');
  templateBox.querySelector('[data-template-create]').onclick=()=>{
   const name=templateBox.querySelector('[data-template-name]').value.trim();
   const labels=[...taskRows.querySelectorAll('[name=label]')].map(el=>el.value.trim());
   if(!name||!labels.length||labels.some(label=>!label||label.length>500)){templateMessage.textContent='名前とすべての作業名を入力してください。';return}
   if(templates.some(t=>t.name===name)&&!confirm('同じ名前のひな形を今回の作業内容で更新しますか？'))return;
   templateValue={name,labels,updatedAt:new Date().toISOString()};
   templateMessage.textContent='「変更を保存する」を押すと、この公演と一緒にひな形を共有保存します。';
  };
  templateBox.querySelector('[data-template-apply]').onclick=()=>{
   const value=templateBox.querySelector('[data-template-choice]').value;
   const labels=value==='standard'?tasks:templates[Number(value)]?.labels;
   if(value===''||!labels){templateMessage.textContent='ひな形を選んでください。';return}
   if(!confirm('現在の準備項目をひな形に置き換えます。完了・対象外・担当・期限は解除されます。よろしいですか？'))return;
   taskRows.replaceChildren();labels.forEach(label=>addTask(draftTask(label)));
   if(value!=='standard')templateValue=templates[Number(value)];
   taskRows.dispatchEvent(new Event('change',{bubbles:true}));
   templateMessage.textContent='ひな形を適用しました。確認して「変更を保存する」を押してください。';
  };
  function addTask(item,before=null) {
    const row=document.createElement('div');row.className='check-row task-edit-row';
    row.innerHTML=`<label class="task-toggle"><input type="checkbox" data-done ${item.done?'checked':''}><span data-task-title>${esc(item.label||'新しい準備項目')}</span></label><span class="task-edit-status" data-task-status></span><label class="task-toggle"><input type="checkbox" data-excluded ${item.excluded?'checked':''}>今回は対象外</label><label>作業名を変更<input name="label" value="${esc(item.label)}" required></label>${assigneePicker(item,0)}<label>完了予定日（任意）<input type="date" data-due value="${esc(item.dueDate||'')}"></label><div class="task-row-actions"><button type="button" class="secondary" data-insert-before>＋ 前に挿入</button><button type="button" class="secondary" data-insert-after>＋ 後に挿入</button><button type="button" class="secondary" data-remove-task>項目を外す</button></div>`;
    const done=row.querySelector('[data-done]'),excluded=row.querySelector('[data-excluded]');
    const showStatus=()=>{
      row.querySelector('[data-task-status]').textContent=excluded.checked?'対象外':done.checked?'完了':'未完了';
      row.dataset.taskState=excluded.checked?'excluded':done.checked?'complete':'pending';
    };
    done.onchange=()=>{if(done.checked)excluded.checked=false;showStatus()};
    excluded.onchange=()=>{if(excluded.checked)done.checked=false;showStatus()};
    row.querySelector('[name=label]').oninput=event=>row.querySelector('[data-task-title]').textContent=event.target.value||'新しい準備項目';
    showStatus();
    taskRows.insertBefore(row,before);return row;
  }
  event.checklist.forEach(item=>addTask(item));
  const blankTask=()=>draftTask('');
  $('add-task').onclick=()=>{if(taskRows.children.length>=200){notify('準備項目は200件までです。');return}addTask(blankTask()).querySelector('[name="label"]').focus()};
  taskRows.onclick=click=>{
    const button=click.target.closest('button');if(!button)return;const row=button.closest('.task-edit-row');
    if(button.hasAttribute('data-remove-task')){if(taskRows.children.length===1){notify('準備項目を1件以上残してください。');return}if(confirm('この準備項目をリストから外しますか？'))row.remove();return}
    if(taskRows.children.length>=200){notify('準備項目は200件までです。');return}
    addTask(blankTask(),button.hasAttribute('data-insert-before')?row:row.nextElementSibling).querySelector('[name="label"]').focus();
  };
  if(existing){
    $('show-delete').onclick=()=>{const panel=$('delete-confirmation');panel.hidden=!panel.hidden;$('show-delete').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)panel.scrollIntoView?.({block:'nearest'});};
    $('confirm-delete').onchange=e=>{$('delete-event').disabled=!e.target.checked};
    $('delete-event').onclick=()=>{if($('confirm-delete').checked)deleteEvent(existing.id)};
  }

  const list = $('performers');
  function updateTimes(){const people=[...list.children].map(row=>({minutes:programMinutes(row),endTime:row.querySelector('[name=endTime]').value}));timeline($('event-form').elements.time.value,people).forEach((p,i)=>list.children[i].querySelector('[data-end-time]').textContent=p.end)}
  list.oninput=updateTimes;$('event-form').elements.time.oninput=updateTimes;
  function renumber() {
    [...list.children].forEach((row,i) => {
      row.querySelector('.performer-head strong').textContent = '出演順 ' + (i + 1);
      row.querySelector('[data-move="-1"]').disabled = i === 0;
      row.querySelector('[data-move="1"]').disabled = i === list.children.length - 1;
    });updateTimes();
  }
  event.performers.forEach(person => list.append(performerRow(person)));
  renumber();
  list.onclick = click => {
    const button = click.target.closest('button');
    if (!button) return;
    const row = button.closest('.performer');
    if (button.hasAttribute('data-remove')) row.remove();
    else if (button.dataset.move === '-1' && row.previousElementSibling) list.insertBefore(row,row.previousElementSibling);
    else if (row.nextElementSibling) list.insertBefore(row.nextElementSibling,row);
    renumber();
    if (!button.disabled && button.isConnected) button.focus();
    else if (row.isConnected) row.querySelector('select, input:not([type=hidden])').focus();
    else $('add-performer').focus();
  };
  $('add-performer').onclick = () => {
    const row = performerRow({name:'',stageName:'',piece:'',minutes:15});
    list.append(row);
    renumber();
    row.querySelector('select, input:not([type=hidden])').focus();
  };
  $('add-break').onclick=()=>{list.append(performerRow({type:'break',name:'',stageName:'仲入り',piece:'休憩',minutes:10}));renumber()};
  $('cancel-edit').onclick = () => leaveEditor(eventDialog,()=>existing ? renderDetails(existing.id) : eventDialog.close());
  startEditor(eventDialog,$('event-form'));
  const canRetry=recovery?.duplicated?true:recoveredEditState($('event-form'),recovery,existing);
  if(recovery?.duplicated)editorState($('event-form'),'複製した予定です。開催日を入力して保存してください。');
  $('event-form').onsubmit = async submit => {
    submit.preventDefault();
    if(saving||!canRetry)return;
    const form = new FormData(submit.currentTarget);
    const text = field => form.get(field).trim();
    const next = {
      ...existing,
      id:submissionId,
      kind:text('kind'),title:text('title'),date:text('date'),time:text('time'),venue:text('venue'),memo:form.get('memo'),
      performers:[...list.children].map(row => {
        const input=name=>row.querySelector(`[name=${name}]`);
        const type=input('type').value;
        return {
          type,...(type==='break'?{stageName:input('stageName').value}:readPerformer(row)),
          name:input('name').value.trim(),piece:input('piece').value.trim(),
          minutes:programMinutes(row),endTime:input('endTime').value
        };
      }),
      checklist:[...taskRows.children].map(row=>({label:row.querySelector('[name="label"]').value.trim(),done:row.querySelector('[data-done]').checked,excluded:row.querySelector('[data-excluded]').checked,dueDate:row.querySelector('[data-due]').value,assignees:[...row.querySelectorAll('[data-owner]:checked')].map(el=>el.value)}))
    };
    if(templateValue)next.preparationTemplate=templateValue;
    next.scheduleChange=scheduleChange(existing,next);
    const checklistShape=items=>items.map(({label,done,excluded,dueDate,assignees})=>[label,done,!!excluded,dueDate||'',assignees||[]]);
    if(!existing||JSON.stringify(checklistShape(existing.checklist))!==JSON.stringify(checklistShape(next.checklist)))next.checklistUpdatedAt=new Date().toISOString();
    const feedback = $('form-feedback');
    if (!validEvent(next)) {
      feedback.textContent = '必須項目と日時・持ち時間を確認してください。';
      feedback.hidden = false;
      return;
    }
    const updated = existing ? events.map(item => item.id === next.id ? next : item) : [...events,next];
    const activeForm=submit.currentTarget;
    const done=eventRecovery.begin(activeForm,next.title,{id:next.id,base:existing,value:next});
    editorState(activeForm,'保存中…',true);
    const saved=await save(updated,formRevision,reason=>editorState(activeForm,'保存できませんでした。'+reason+' 入力を確認し、もう一度保存してください。'));
    const failure=feedback.textContent==='保存中…'?'保存できませんでした。もう一度保存してください。':feedback.textContent;
    done(saved?null:failure);
    if(!activeForm.isConnected||!eventDialog.open){
      if(saved)notify('公演を保存しました。');
      return;
    }
    if(!saved){
      editorState(activeForm,failure);
      return;
    }
    if(tab==='calendar'){
      selected=next.date;month=next.date.slice(0,7);render();
    }
    finishEditor(eventDialog);
    renderDetails(next.id,'公演を保存しました。');
  };
  showEvent();
  loadPerformerRoster($('event-form'));
}

$('schedule').onclick = async click => {
  const button = click.target.closest('button');
  if (!button) return;
  if (button.dataset.editEvent !== undefined) { renderForm(events.find(item => item.id === button.dataset.editEvent)); return; }
  if (button.dataset.deleteEvent !== undefined) { await deleteEvent(button.dataset.deleteEvent); return; }
  if (button.dataset.event !== undefined) renderDetails(button.dataset.event);
  if (button.dataset.day) {
    selected = button.dataset.day;
    render();
    $('schedule').querySelector('[aria-pressed="true"]').focus();
  }
  if (button.dataset.month) {
    const [year, mon] = month.split('-').map(Number);
    const next = new Date(year,mon - 1 + Number(button.dataset.month),1);
    month = localDate(next).slice(0,7);
    selected = month === today().slice(0,7) ? today() : localDate(next);
    render();
    $('schedule').querySelector(`[data-month="${button.dataset.month}"]`).focus();
  }
};
$('list-tab').onclick = () => {tab = 'list'; render();};
$('calendar-tab').onclick = () => {location.href = 'rehearsals.html?v=20261122-workflow3';};
$('new-event').onclick = () => renderForm();
$('data-open').onclick = () => $('data-dialog').showModal();
guardEditor(eventDialog);
document.addEventListener('click', click => {
  const button = click.target.closest('[data-close]');
  if (!button) return;
  const dialog=$(button.dataset.close);
  if(dialog===eventDialog)leaveEditor(dialog,()=>dialog.close());
  else dialog.close();
});
$('export-file').onclick = () => {try{
  const url = URL.createObjectURL(new Blob([JSON.stringify({version:1,categories:readCategories(events.map(e=>e.kind)),events,records:readRecords()},null,2)],{type:'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'yuitei-' + today() + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}catch(e){notify(e.message)}};
$('import-submit').onclick = async () => {
  const button=$('import-submit');
  if(saving||button.disabled)return;
  const input=$('import-file'),feedback=$('import-feedback'),file=input.files[0];
  if(!file){
    feedback.textContent='JSONファイルを選んでください。';
    return;
  }
  button.disabled=true;
  try{
    let data;
    try{
      data=JSON.parse(await file.text());
      if(data?.version!==1||!Array.isArray(data.events)||!data.events.every(validEvent)||new Set(data.events.map(event=>event.id)).size!==data.events.length)throw Error('Invalid import');
      if(data.records!==undefined)mergedRecords(data.records);
      if(data.categories!==undefined&&!validCategories(data.categories))throw Error('Invalid categories');
    }catch{
      feedback.textContent='取り込めませんでした。JSONの形式と必須項目を確認してください。';
      return;
    }
    const merged=new Map(events.map(event=>[event.id,event]));
    data.events.forEach(event=>merged.set(event.id,event));
    if(!await save([...merged.values()])){
      feedback.textContent='取り込んだデータを保存できませんでした。';
      return;
    }
    input.value='';
    try{
      if(data.records!==undefined)mergeRecords(data.records);
      if(data.categories!==undefined)saveCategories(data.categories);
      feedback.textContent=data.events.length+'件の公演を取り込みました。';
      if(cloud.state.configured&&data.records?.length)feedback.textContent+=' 同梱の記録はこの端末に取り込みました。';
    }catch(error){feedback.textContent='公演は保存しました。記録または区分を取り込めませんでした。'+error.message}
  }finally{button.disabled=false}
};

render();

mountMemberHome();mountAccount();
cloud.onState(state=>{
 eventRecovery.render();
 const identity=state.configured?`${state.user?.uid||''}:${state.role||''}`:'local';
 if(identity===cloudIdentity){if(state.ready!==false&&requestedEvent)render();return;}cloudIdentity=identity;performerNames=[];stopCloud?.();cloudLoaded=false;cloudLoadError='';
 if(state.configured){events=[];eventDialog.close();if($('data-dialog').open)$('data-dialog').close();render();if(state.role){stopCloud=cloud.watch('events',doc=>{if(doc&&(!Array.isArray(doc.items)||!doc.items.every(validEvent))){notify('共通データの形式を確認してください。');return}const detailId=eventDialog.open&&!$('event-form')?eventDialog.dataset.eventId:'';
 const previous=detailId&&events.find(item=>item.id===detailId);
 events=doc?.items||[];cloudRevision=doc?.revision||0;cloudLoaded=true;cloudLoadError='';render();
 if(detailId&&JSON.stringify(previous)!==JSON.stringify(events.find(item=>item.id===detailId)))renderDetails(detailId)},message=>{cloudLoadError=message;notify(message);render()})}}
});
startCloud();

const organize=document.createElement('div');organize.className='record-filters';organize.innerHTML='<label>区分<select id="event-kind-filter"><option value="">全区分</option></select></label><label>表示順<select id="event-sort"><option value="date">日付順</option><option value="kind">区分順</option></select></label>';$('schedule').before(organize);mountCategories(organize,()=>events.map(e=>e.kind));organize.onchange=()=>render();window.addEventListener('categories-changed',()=>render());mountScheduleImport(document.querySelector('#data-dialog .dialog-body')||organize,'events',()=>events,save,notify,copiedTasks);render();
