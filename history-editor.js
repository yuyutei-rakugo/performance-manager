import {categoryOptions} from './categories.js?v=20261121-today1';
import {readRecords,writeRecords} from './record-transfer.js?v=20261121-today1';
import {cloud} from './cloud.js?v=20261121-today1';
export function historyEditor(getData,refresh){
 const section=document.createElement('section');section.className='record-edit-panel';section.innerHTML='<button id="history-add" class="primary" type="button" disabled>＋ 稽古・公演記録を追加</button><p id="history-edit-status" role="status">共通保存の接続を確認しています…</p>';
 (document.getElementById('history-tools')||document.querySelector('main')).append(section);
 const dialog=document.createElement('dialog');dialog.className='record-dialog';document.body.append(dialog);
 const original=structuredClone(getData().records);
 let revision=0,loaded=false,stop,identity='',busy=false;
 let localReady=true;try{readRecords()}catch{localReady=false}const publicIds=new Set(getData().publicIds||[]);const allowed=()=>cloud.state.ready!==false&&!cloud.state.connectionIssue&&(cloud.state.configured?loaded&&['editor','admin'].includes(cloud.state.role):localReady);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const feedback=message=>section.querySelector('p').textContent=message;
 function controls(){section.querySelector('button').disabled=!allowed();document.querySelectorAll('[data-record-edit]').forEach(el=>el.hidden=!allowed()||(!cloud.state.configured&&publicIds.has(el.dataset.recordEdit)))}
 cloud.onState(s=>{
  const canEditRole=['admin','editor'].includes(s.role);
  section.querySelector('button').hidden=s.ready!==false&&s.configured&&!canEditRole;
  const next=JSON.stringify([s.ready!==false,s.connectionIssue,s.configured,s.user?.uid,s.role]);
  if(next===identity)return;
  identity=next;stop?.();loaded=false;
  dialog.close();getData().records=structuredClone(original);refresh();controls();
  if(s.ready===false){feedback('共通保存の接続を確認しています…');return}
  if(s.connectionIssue){feedback(s.message);return}
  if(!s.configured){
   feedback(localReady?'共通保存は設定されていません。追加・修正した記録はこの端末に保存します。':'端末内の記録を読み込めないため、端末内の編集を停止しています。');
   return;
  }
  if(!s.role){feedback(s.user?'このアカウントには記録の編集権限がありません。':'記録を編集するには会員ログインが必要です。');return}
  feedback('共通の記録を読み込んでいます…');
  let received=false;
  function readFailure(message){
   loaded=false;
   feedback(received?'共通記録を更新できませんでした。前回取得した記録を表示しています。':message);
   controls();
  }
  stop=cloud.watch('history',doc=>{
   if(doc&&(!Array.isArray(doc.items)||!doc.items.every(valid))){readFailure('共通記録の形式を確認してください。');return}
   revision=doc?.revision||0;loaded=true;received=true;
   getData().records=doc?doc.items:structuredClone(original);refresh();
   feedback(canEditRole?'記録を追加・修正できます。保存すると会員の端末に反映されます。':'記録は閲覧のみです。編集権限がありません。');controls();
  },message=>readFailure('共通記録を読み込めませんでした。'+message));
 });
 function valid(r){return r&&typeof r.id==='string'&&typeof r.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&typeof r.kind==='string'&&typeof r.occasion==='string'&&typeof r.note==='string'&&r.pieces&&typeof r.pieces==='object'&&Object.values(r.pieces).every(v=>typeof v==='string')}
 async function persist(items,expected,form){if(busy)return false;busy=true;const controlsToLock=[...form.querySelectorAll('input,select,textarea,button:not([data-cancel])')];controlsToLock.forEach(control=>control.disabled=true);try{if(cloud.state.configured){const savedRevision=await cloud.save('history',{items},expected);if(revision>savedRevision)return true}else writeRecords(items.filter(r=>!publicIds.has(r.id)));getData().records=items;refresh();controls();return true}catch(e){feedback(e.message);if(form.isConnected&&dialog.open)form.querySelector('[role=alert]').textContent=e.message;return false}finally{controlsToLock.forEach(control=>control.disabled=false);busy=false}}
 function edit(id){
  if(!allowed()||(!cloud.state.configured&&id&&publicIds.has(id)))return;const data=getData(),existing=id?data.records.find(r=>r.id===id):null;if(id&&!existing)return;
  const record=existing||{id:crypto.randomUUID(),date:new Date().toLocaleDateString('sv-SE'),kind:'その他公演',occasion:'',pieces:{},note:''};const expected=revision;
  dialog.innerHTML=`<form><h2>${existing?'記録を修正':'稽古・公演記録を追加'}</h2><label>日付<input name="date" type="date" required value="${esc(record.date)}"></label><label>区分<select name="kind">${categoryOptions(record.kind,data.records.map(r=>r.kind))}</select></label><label>公演・稽古名<input name="occasion" required value="${esc(record.occasion)}"></label><p>各演者の演目を入力してください。演目未定の出席は「○」、記録なしは空欄にできます。</p>${data.names.map(n=>`<label>${esc(n)}<input data-piece="${esc(n)}" value="${esc(record.pieces[n]||'')}" placeholder="演目・○・空欄"></label>`).join('')}<label>注記<textarea name="note"></textarea></label><p role="alert"></p><button type="submit">保存する</button> <button type="button" data-cancel>キャンセル</button>${existing?' <button type="button" data-delete>削除する</button>':''}</form>`;
  const form=dialog.querySelector('form');
  form.querySelector('[name=note]').value=record.note;
  dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
  form.onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const next={...record,date:f.get('date'),kind:f.get('kind'),occasion:f.get('occasion').trim(),note:f.get('note'),pieces:Object.fromEntries([...dialog.querySelectorAll('[data-piece]')].map(el=>[el.dataset.piece,el.value.trim()]))};if(!next.occasion)return;if(await persist(existing?data.records.map(r=>r.id===id?next:r):[...data.records,next],expected,form)&&form.isConnected&&dialog.open)dialog.close()};
  if(existing)dialog.querySelector('[data-delete]').onclick=async()=>{if(confirm('この稽古・公演記録を削除しますか？')&&await persist(data.records.filter(r=>r.id!==id),expected,form)&&form.isConnected&&dialog.open)dialog.close()};
  dialog.showModal();
 }
 section.querySelector('button').onclick=()=>edit();
 document.querySelector('#body').addEventListener('click',e=>{const b=e.target.closest('[data-record-edit]');if(b)edit(b.dataset.recordEdit)});
 return {controls,allowed};
}
