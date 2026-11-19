import {applyConfirmedSchedule} from './schedule-bootstrap.js?v=20261119-share1';
import {readCategories,saveCategories,categoryOptions,mountCategories} from './categories.js?v=20261119-share1';
import {mountScheduleImport} from './schedule-import.js?v=20261119-share1';
import {validPerformer,timeline,toRecord,transferRecord,readRecords,mergeRecords,validRecord} from './record-transfer.js?v=20261119-share1';
import {cloud,startCloud,mountAccount} from './cloud.js?v=20261119-share1';
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
const newTasks = () => tasks.map(label => ({label, done:false,assignees:[],dueDate:''}));
let memberNames=['勇水','小薔薇','懐古','華詩','世喜音','やすゑ','一悟','日光'],cloudRevision=0,cloudLoaded=false,stopCloud,cloudIdentity='',saving=false;
fetch('./history-data.json').then(r=>r.json()).then(d=>{memberNames=d.names.filter(n=>n!=='藤本')}).catch(()=>{});
const editable=()=>!cloud.state.configured||(['admin','editor'].includes(cloud.state.role)&&cloudLoaded);
function assigneePicker(item,i){return `<fieldset class="assignee-picker"><legend>担当者（任意・複数選択可）</legend>${[...new Set([...memberNames,...(item.assignees||[])])].map(n=>`<label><input type="checkbox" data-owner="${i}" value="${esc(n)}" ${(item.assignees||[]).includes(n)?'checked':''}>${esc(n)}</label>`).join('')}</fieldset>`}
const progress = event => event.checklist.filter(item => item.done).length;

function copiedTasks() {
  const edited=events.filter(event=>typeof event.checklistUpdatedAt==='string');
  const latest=[...(edited.length?edited:events)].sort((a,b)=>(b.checklistUpdatedAt||b.date+'T'+b.time).localeCompare(a.checklistUpdatedAt||a.date+'T'+a.time))[0];
  return latest?latest.checklist.map(item=>({label:item.label,done:false,assignees:[],dueDate:''})):newTasks();
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
    && Array.isArray(event.checklist) && event.checklist.length > 0 && event.checklist.length <= 200 && event.checklist.every(item => item && isText(item.label) && item.label.trim() && typeof item.done === 'boolean' && (item.dueDate===undefined||item.dueDate===''||(isText(item.dueDate)&&/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate)&&localDate(new Date(item.dueDate+'T00:00:00'))===item.dueDate)) && (item.assignees === undefined || (Array.isArray(item.assignees)&&item.assignees.every(isText))));
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

async function save(next, expectedRevision=cloudRevision) {
  if(saving)return false;
  if(cloud.state.configured){
    if(!editable()){notify('会員ログインと編集権限、共通データの読み込みが必要です。');return false}
    saving=true;try{await cloud.save('events',{items:next},expectedRevision);events=next;render();return true}catch(e){notify(e.message);return false}finally{saving=false}
  }
  if (!storageReadable) {
    notify('保存済みデータを読み込めないため、変更を保存できません。');
    return false;
  }
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    notify('変更を保存できませんでした。ブラウザの設定や空き容量をご確認ください。');
    return false;
  }
  events = next;
  render();
  return true;
}

function upcoming(event) {
  return new Date(event.date + 'T' + (event.time||'23:59')) >= new Date();
}
function sortedEvents(list) {
  const filter=document.getElementById('event-kind-filter'),order=document.getElementById('event-sort');list=list.filter(e=>!filter?.value||(e.kind||'その他公演')===filter.value);if(order?.value==='kind'){const kinds=readCategories(events.map(e=>e.kind));return [...list].sort((a,b)=>kinds.indexOf(a.kind||'その他公演')-kinds.indexOf(b.kind||'その他公演')||(a.date+a.time).localeCompare(b.date+b.time))}
  return [...list].sort((a,b) => (a.date + a.time).localeCompare(b.date + b.time));
}
function progressMarkup(event) {
  const done = progress(event);
  return `<div class="progress"><div class="progress-label"><span>準備進捗</span><span>${done} / ${event.checklist.length}</span></div><progress aria-label="準備進捗" value="${done}" max="${event.checklist.length}"></progress></div>`;
}
function card(event) {
  const [year, mon, day] = event.date.split('-');
  return `<article class="event-card"><div class="date-badge" aria-hidden="true"><small>${Number(mon)}月</small><strong>${Number(day)}</strong></div><div><h3>${esc(event.title)}</h3><div class="meta"><span>${year}/${mon}/${day} ${esc(event.time||'時間未定')}</span><span>＠ ${esc(event.venue)}</span></div></div>${progressMarkup(event)}<div class="event-actions"><button class="secondary" data-event="${esc(event.id)}" aria-label="${esc(event.title)}の詳細">詳細 ›</button><button class="secondary" data-edit-event="${esc(event.id)}" aria-label="${esc(event.title)}を編集" ${editable()?'':'disabled'}>編集</button></div></article>`;
}
function render() {
  const filter=document.getElementById('event-kind-filter');if(filter){const value=filter.value;filter.innerHTML='<option value="">全区分</option>'+categoryOptions(value,events.map(e=>e.kind));filter.value=value;}
  const scheduled = events.filter(e=>!e.archivedAt&&upcoming(e));
  const stats = [['▦','予定の公演',scheduled.length],['◷','準備未完了',scheduled.filter(event => progress(event) < event.checklist.length).length],['✓','準備完了',scheduled.filter(event => progress(event) === event.checklist.length).length]];
  if($('stats'))$('stats').innerHTML = stats.map(([icon,label,count]) => `<div class="stat"><span class="stat-icon" aria-hidden="true">${icon}</span><div><small>${label}</small><strong>${count}</strong><span class="unit">件</span></div></div>`).join('');
  $('list-tab').setAttribute('aria-pressed', tab === 'list');
  $('calendar-tab').setAttribute('aria-pressed', tab === 'calendar');
  $('schedule').innerHTML = tab === 'list'
    ? sortedEvents(events.filter(e=>!e.archivedAt)).map(card).join('') || '<p class="empty">公演がありません。「公演を登録」から追加できます。</p>'
    : calendar();

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
function renderDetails(id) {
  const event = events.find(item => item.id === id);
  if (!event) return;
  const rows=timeline(event.time,event.performers);
  const program=rows.length?`<div class="program-scroll"><table class="program-table"><thead><tr><th>順</th><th>演者・仲入り</th><th>ネタ・演し物</th><th>持ち時間</th><th>終了予定</th></tr></thead><tbody>${rows.map((p,i)=>`<tr><td>${i+1}</td><td>${esc(p.type==='break'?'仲入り':p.stageName)}</td><td>${esc(p.piece)}</td><td>${p.minutes}分</td><td>${p.end}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">出演者は未登録です。</p>';

  eventDialog.innerHTML = `<div class="dialog-body"><div class="dialog-head"><h2 id="event-heading">${esc(event.title)}</h2><button type="button" data-close="event-dialog" aria-label="閉じる">×</button></div>
    <p>${dateLabel(event.date)} ${esc(event.time||'時間未定')}<br>会場　${esc(event.venue)}</p><div class="form-actions"><button class="primary" data-edit ${editable()?'':'disabled'}>編集する</button></div>
    <section class="block"><h3>出演順・演目</h3>${program}</section>
    <section class="block"><h3>準備チェックリスト</h3>${progressMarkup(event)}${event.checklist.map((item,i) => `<div class="check-row"><label><input type="checkbox" data-check="${i}" ${editable()?'':'disabled'} ${item.done ? 'checked' : ''}>${esc(item.label)}</label><small>担当：${esc((item.assignees||[]).join('・')||'未設定')} ／ 完了予定：${esc(item.dueDate||'未設定')}</small></div>`).join('')}</section>
    <section class="block"><h3>メモ</h3><p class="memo">${esc(event.memo) || 'メモはありません。'}</p></section><section class="block" hidden><button type="button" class="primary" id="transfer-event" ${editable()?'':'disabled'}>${event.archivedAt?'記録を更新する':'終了して記録へ移す'}</button><p class="muted">終了した内容を記録に保存します。元データは転記済みの一覧に残ります。</p>${event.archivedAt?'<button type="button" class="secondary" id="unarchive-event">公演一覧に戻す</button>':''}</section></div>`;
  $('transfer-event').onclick=async()=>{if(cloud.state.role!=='admin'||event.date>=today()||!confirm('終了した公演を稽古・公演記録へ移しますか？同じ公演は重複せず更新されます。'))return;try{await transferRecord(toRecord('event',event,memberNames));if(await save(events.map(e=>e.id===id?{...e,archivedAt:new Date().toISOString()}:e))){eventDialog.close();notify('稽古・公演記録へ移しました。')}else notify('記録への保存は完了しましたが、転記済み表示を保存できませんでした。再実行しても重複しません。')}catch(e){notify(e.message)}};
  if($('unarchive-event'))$('unarchive-event').onclick=async()=>{if(await save(events.map(e=>e.id===id?{...e,archivedAt:null}:e))){eventDialog.close();notify('公演一覧に戻しました。転記した記録は残しています。')}};
  eventDialog.querySelector('[data-edit]').onclick = () => renderForm(events.find(item => item.id === id));
  eventDialog.onchange = async change => {
    if (!change.target.matches('[data-check]')) return;
    const current = events.find(item => item.id === id);
    const next = clone(current);
    next.checklist[Number(change.target.dataset.check)].done = change.target.checked;
    if (await save(events.map(item => item.id === id ? next : item))) {
      eventDialog.querySelector('.progress').outerHTML = progressMarkup(next);
    } else change.target.checked = !change.target.checked;
  };
  showEvent();
}

async function deleteEvent(id) {
  if (!editable()) { notify('編集できる会員でログインしてください。'); return; }
  const event = events.find(item => item.id === id);
  if (!event) return;
  if (confirm('「' + event.title + '」を削除しますか？') && await save(events.filter(item => item.id !== id))) {
    if (eventDialog.open) eventDialog.close();
    notify('公演を削除しました。');
  }
}

function performerRow(person) {
  const row = document.createElement('div');
  row.className = 'performer';
  row.innerHTML = `<div class="performer-head"><strong></strong><button type="button" class="icon-button" data-move="-1" aria-label="出演順を上げる">↑</button><button type="button" class="icon-button" data-move="1" aria-label="出演順を下げる">↓</button><button type="button" class="danger" data-remove>削除</button></div>
    <div class="fields"><input type="hidden" name="type" value="${person.type||'performance'}"><label>演者（会員・ゲスト）<input list="member-options" name="stageName" value="${esc(person.stageName)}" required></label><label>氏名（任意）<input name="name" value="${esc(person.name)}"></label><label>ネタ・演し物<input name="piece" value="${esc(person.piece)}" required></label><label>持ち時間（分）<input name="minutes" type="number" min="0.1" max="1440" step="0.1" value="${person.minutes}" required></label><label>終了予定時刻（任意）<input name="endTime" type="time" value="${esc(person.endTime||'')}"></label><p class="wide">終了予定（自動計算・指定反映）：<output data-end-time></output></p></div>`;
  return row;
}
function renderForm(existing) {
  if(!editable()){notify('編集できる会員でログインしてください。');return}
  const formRevision=cloudRevision;
  const event = existing || {title:'',date:tab === 'calendar' ? selected : today(),time:'14:00',venue:'',memo:'',performers:[],checklist:copiedTasks()};
  eventDialog.onchange = null;
  eventDialog.innerHTML = `<div class="dialog-body"><div class="dialog-head"><h2 id="event-heading">${existing ? '公演を編集' : '公演を登録'}</h2><button type="button" data-close="event-dialog" aria-label="閉じる">×</button></div>
    <form id="event-form"><div class="fields"><label class="wide">公演名<input name="title" value="${esc(event.title)}" required></label><label>区分<select name="kind">${categoryOptions(event.kind||'その他公演',events.map(e=>e.kind))}</select></label><label>開催日<input name="date" type="date" value="${event.date}" required></label><label>開始時刻（空欄は時間未定）<input name="time" type="time" value="${esc(event.time)}"></label><label class="wide">会場<input name="venue" value="${esc(event.venue)}" required></label></div>
    <section class="block"><h3>出演順・演目</h3><datalist id="member-options">${memberNames.map(n=>`<option value="${esc(n)}"></option>`).join('')}</datalist><p class="muted">会員名を選ぶか、ゲストの高座名を自由に入力できます。終了予定は開演時刻と持ち時間から計算します。時刻を指定して調整することもできます。</p><div id="performers"></div><button type="button" class="secondary" id="add-performer">＋ 出演者を追加</button> <button type="button" class="secondary" id="add-break">＋ 仲入りを追加</button></section>
    <section class="block"><h3>準備チェックリスト</h3>${!existing?'<p class="muted">最新のリストの項目をコピーしました。完了・担当者・完了予定日はリセットしています。</p>':''}<div id="task-rows"></div><button type="button" class="secondary" id="add-task">＋ 末尾に項目を追加</button></section>
    <section class="block"><label>公演メモ<textarea name="memo" rows="4"></textarea></label></section><p class="muted" id="form-feedback" role="alert" hidden></p>
    <div class="form-actions"><button class="primary" type="submit">保存する</button><button class="secondary" type="button" id="cancel-edit">キャンセル</button></div>${existing?'<details class="delete-zone"><summary>この公演を削除する</summary><p>削除すると、この公演の出演者・準備リスト・メモも削除されます。</p><label><input type="checkbox" id="confirm-delete">この公演を削除することを確認しました</label><button type="button" class="danger" id="delete-event" disabled>公演を削除する</button></details>':''}</form></div>`;
  $('event-form').elements.memo.value = event.memo;
  const taskRows=$('task-rows');
  function addTask(item,before=null) {
    const row=document.createElement('div');row.className='check-row task-edit-row';row.dataset.done=String(item.done);
    row.innerHTML=`<label>準備項目<input name="label" value="${esc(item.label)}" required></label>${assigneePicker(item,0)}<label>完了予定日（任意）<input type="date" data-due value="${esc(item.dueDate||'')}"></label><div class="task-row-actions"><button type="button" class="secondary" data-insert-before>＋ 前に挿入</button><button type="button" class="secondary" data-insert-after>＋ 後に挿入</button><button type="button" class="secondary" data-remove-task>項目を外す</button></div>`;
    taskRows.insertBefore(row,before);return row;
  }
  event.checklist.forEach(item=>addTask(item));
  const blankTask=()=>({label:'',done:false,assignees:[],dueDate:''});
  $('add-task').onclick=()=>{if(taskRows.children.length>=200){notify('準備項目は200件までです。');return}addTask(blankTask()).querySelector('[name="label"]').focus()};
  taskRows.onclick=click=>{
    const button=click.target.closest('button');if(!button)return;const row=button.closest('.task-edit-row');
    if(button.hasAttribute('data-remove-task')){if(taskRows.children.length===1){notify('準備項目を1件以上残してください。');return}if(confirm('この準備項目をリストから外しますか？'))row.remove();return}
    if(taskRows.children.length>=200){notify('準備項目は200件までです。');return}
    addTask(blankTask(),button.hasAttribute('data-insert-before')?row:row.nextElementSibling).querySelector('[name="label"]').focus();
  };
  if(existing){
    $('confirm-delete').onchange=e=>{$('delete-event').disabled=!e.target.checked};
    $('delete-event').onclick=()=>{if($('confirm-delete').checked)deleteEvent(existing.id)};
  }

  const list = $('performers');
  function updateTimes(){const people=[...list.children].map(row=>({minutes:Number(row.querySelector('[name=minutes]').value),endTime:row.querySelector('[name=endTime]').value}));timeline($('event-form').elements.time.value,people).forEach((p,i)=>list.children[i].querySelector('[data-end-time]').textContent=p.end)}
  list.oninput=updateTimes;$('event-form').elements.time.oninput=updateTimes;
  function renumber() {
    [...list.children].forEach((row,i) => {
      row.querySelector('strong').textContent = '出演順 ' + (i + 1);
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
    else if (row.isConnected) row.querySelector('input').focus();
    else $('add-performer').focus();
  };
  $('add-performer').onclick = () => {
    const row = performerRow({name:'',stageName:'',piece:'',minutes:15});
    list.append(row);
    renumber();
    row.querySelector('input').focus();
  };
  $('add-break').onclick=()=>{list.append(performerRow({type:'break',name:'',stageName:'仲入り',piece:'休憩',minutes:10}));renumber()};
  $('cancel-edit').onclick = () => existing ? renderDetails(existing.id) : eventDialog.close();
  $('event-form').onsubmit = async submit => {
    submit.preventDefault();
    const form = new FormData(submit.currentTarget);
    const text = field => form.get(field).trim();
    const next = {
      ...existing,
      id:existing?.id || (globalThis.crypto.randomUUID?.() ?? 'event-' + Date.now() + '-' + Math.random().toString(36).slice(2)),
      checklistUpdatedAt:new Date().toISOString(),
      kind:text('kind'),title:text('title'),date:text('date'),time:text('time'),venue:text('venue'),memo:form.get('memo'),
      performers:[...list.children].map(row => Object.fromEntries([...row.querySelectorAll('input')].map(input => [input.name,input.type === 'number' ? input.valueAsNumber : input.value.trim()]))),
      checklist:[...taskRows.children].map(row=>({label:row.querySelector('[name="label"]').value.trim(),done:row.dataset.done==='true',dueDate:row.querySelector('[data-due]').value,assignees:[...row.querySelectorAll('[data-owner]:checked')].map(el=>el.value)}))
    };
    const feedback = $('form-feedback');
    if (!validEvent(next)) {
      feedback.textContent = '必須項目と日時・持ち時間を確認してください。';
      feedback.hidden = false;
      return;
    }
    const updated = existing ? events.map(item => item.id === next.id ? next : item) : [...events,next];
    if (!await save(updated,formRevision)) {
      feedback.textContent = '公演を保存できませんでした。';
      feedback.hidden = false;
      return;
    }
    if (tab === 'calendar') {
      selected = next.date;
      month = next.date.slice(0,7);
      render();
    }
    renderDetails(next.id);
  };
  showEvent();
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
$('calendar-tab').onclick = () => {location.href = 'rehearsals.html?v=20261119-share1';};
$('new-event').onclick = () => renderForm();
$('data-open').onclick = () => $('data-dialog').showModal();
document.addEventListener('click', click => {
  const button = click.target.closest('[data-close]');
  if (button) $(button.dataset.close).close();
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
  const input = $('import-file');
  const feedback = $('import-feedback');
  const file = input.files[0];
  if (!file) {
    feedback.textContent = 'JSONファイルを選んでください。';
    return;
  }
  let incoming;
  try {
    const data = JSON.parse(await file.text());
    if (data?.version !== 1 || !Array.isArray(data.events) || !data.events.every(validEvent) || new Set(data.events.map(event => event.id)).size !== data.events.length) throw new Error('Invalid import');
    if(data.records!==undefined){if(!Array.isArray(data.records)||!data.records.every(validRecord))throw Error('Invalid records');mergeRecords(data.records);}
    if(data.categories)saveCategories(data.categories);incoming = data.events;
  } catch {
    feedback.textContent = '取り込めませんでした。JSONの形式と必須項目を確認してください。';
    return;
  }
  const merged = new Map(events.map(event => [event.id,event]));
  incoming.forEach(event => merged.set(event.id,event));
  if (await save([...merged.values()])) {
    feedback.textContent = incoming.length + '件の公演を取り込みました。';
    input.value = '';
  } else feedback.textContent = '取り込んだデータを保存できませんでした。';
};
render();

mountAccount();
cloud.onState(state=>{
 const identity=state.configured?`${state.user?.uid||''}:${state.role||''}`:'local';
 if(identity===cloudIdentity)return;cloudIdentity=identity;stopCloud?.();cloudLoaded=false;
 if(state.configured){events=[];eventDialog.close();render();if(state.role){stopCloud=cloud.watch('events',doc=>{if(doc&&(!Array.isArray(doc.items)||!doc.items.every(validEvent))){notify('共通データの形式を確認してください。');return}events=doc?.items||[];cloudRevision=doc?.revision||0;cloudLoaded=true;render()},notify)}}
});
startCloud();

const organize=document.createElement('div');organize.className='record-filters';organize.innerHTML='<label>区分<select id="event-kind-filter"><option value="">全区分</option></select></label><label>表示順<select id="event-sort"><option value="date">日付順</option><option value="kind">区分順</option></select></label>';$('schedule').before(organize);mountCategories(organize,()=>events.map(e=>e.kind));organize.onchange=()=>render();window.addEventListener('categories-changed',()=>render());mountScheduleImport(document.querySelector('#data-dialog .dialog-body')||organize,'events',()=>events,save,notify,copiedTasks);render();
