import {categoryOptions} from './categories.js?v=20261119-organize1';
import {readRecords,writeRecords} from './record-transfer.js?v=20261119-organize1';
import {cloud} from './cloud.js';
export function historyEditor(getData,refresh){
 const section=document.createElement('section');section.className='record-edit-panel';section.innerHTML='<button id="history-add" class="primary" type="button" disabled>＋ 稽古・公演記録を追加</button><p id="history-edit-status">共通保存の設定後、許可された会員が記録を追加・修正できます。</p>';
 (document.getElementById('history-tools')||document.querySelector('main')).append(section);
 const dialog=document.createElement('dialog');dialog.className='record-dialog';document.body.append(dialog);
 const original=structuredClone(getData().records);
 let revision=0,loaded=false,stop,identity='',busy=false;
 let localReady=true;try{readRecords()}catch{localReady=false}const publicIds=new Set(getData().publicIds||[]);const allowed=()=>cloud.state.configured?loaded&&['editor','admin'].includes(cloud.state.role):localReady;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const feedback=message=>section.querySelector('p').textContent=message;
 function controls(){section.querySelector('button').disabled=!allowed();document.querySelectorAll('[data-record-edit]').forEach(el=>el.hidden=!allowed()||(!cloud.state.configured&&publicIds.has(el.dataset.recordEdit)))}
 cloud.onState(s=>{
  const next=`${s.user?.uid||''}:${s.role||''}`;if(next===identity)return;identity=next;stop?.();loaded=false;dialog.close();getData().records=structuredClone(original);refresh();controls();if(!s.configured)feedback('転記した記録はこのブラウザに保存します。転記後の内容も修正できます。');
  if(s.configured&&s.role)stop=cloud.watch('history',doc=>{
   if(doc&&(!Array.isArray(doc.items)||!doc.items.every(valid))){feedback('共通記録の形式を確認してください。');return}
   revision=doc?.revision||0;loaded=true;
   if(doc){getData().records=doc.items;refresh()}
   feedback(s.role==='viewer'?'閲覧のみの会員です。':'記録を追加・修正できます。保存すると会員の端末に反映されます。');controls();
  },message=>{loaded=false;feedback(message);controls()});
 });
 function valid(r){return r&&typeof r.id==='string'&&typeof r.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&typeof r.kind==='string'&&typeof r.occasion==='string'&&typeof r.note==='string'&&r.pieces&&typeof r.pieces==='object'&&Object.values(r.pieces).every(v=>typeof v==='string')}
 async function persist(items,expected){if(busy)return false;busy=true;try{if(cloud.state.configured)await cloud.save('history',{items},expected);else writeRecords(items.filter(r=>!publicIds.has(r.id)));getData().records=items;refresh();controls();return true}catch(e){feedback(e.message);dialog.querySelector('[role=alert]').textContent=e.message;return false}finally{busy=false}}
 function edit(id){
  if(!allowed()||(!cloud.state.configured&&id&&publicIds.has(id)))return;const data=getData(),existing=id?data.records.find(r=>r.id===id):null;if(id&&!existing)return;
  const record=existing||{id:crypto.randomUUID(),date:new Date().toLocaleDateString('sv-SE'),kind:'その他公演',occasion:'',pieces:{},note:''};const expected=revision;
  const kinds=['師匠稽古','定期落語会','飯沼観音寄席','図書館寄席','その他公演','通常稽古','自主稽古','その他'];
  dialog.innerHTML=`<form><h2>${existing?'記録を修正':'稽古・公演記録を追加'}</h2><label>日付<input name="date" type="date" required value="${esc(record.date)}"></label><label>区分<select name="kind">${categoryOptions(record.kind,data.records.map(r=>r.kind))}</select></label><label>公演・稽古名<input name="occasion" required value="${esc(record.occasion)}"></label><p>各演者の演目を入力してください。演目未定の出席は「○」、記録なしは空欄にできます。</p>${data.names.map(n=>`<label>${esc(n)}<input data-piece="${esc(n)}" value="${esc(record.pieces[n]||'')}" placeholder="演目・○・空欄"></label>`).join('')}<label>注記<textarea name="note">${esc(record.note)}</textarea></label><p role="alert"></p><button type="submit">保存する</button> <button type="button" data-cancel>キャンセル</button>${existing?' <button type="button" data-delete>削除する</button>':''}</form>`;
  dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
  dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const next={...record,date:f.get('date'),kind:f.get('kind'),occasion:f.get('occasion').trim(),note:f.get('note'),pieces:Object.fromEntries([...dialog.querySelectorAll('[data-piece]')].map(el=>[el.dataset.piece,el.value.trim()]))};if(!next.occasion)return;if(await persist(existing?data.records.map(r=>r.id===id?next:r):[...data.records,next],expected))dialog.close()};
  if(existing)dialog.querySelector('[data-delete]').onclick=async()=>{if(confirm('この稽古・公演記録を削除しますか？')&&await persist(data.records.filter(r=>r.id!==id),expected))dialog.close()};
  dialog.showModal();
 }
 section.querySelector('button').onclick=()=>edit();
 document.querySelector('#body').addEventListener('click',e=>{const b=e.target.closest('[data-record-edit]');if(b)edit(b.dataset.recordEdit)});
 return {controls,allowed};
}
