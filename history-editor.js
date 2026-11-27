import {startEditor,finishEditor,leaveEditor,guardEditor,editorState,saveRecovery,recoveryScope,recoveredEditState} from './editor-dialog.js?v=20261125-regions1';
import {categoryOptions,mountCategoryAdder} from './categories.js?v=20261125-regions1';
import {readRecords,writeRecords} from './record-transfer.js?v=20261126-push-reliable1';
import {cloud} from './cloud.js?v=20261127-push-onboarding1';
export function historyEditor(getData,refresh,refreshRows=()=>{}){
 const section=document.createElement('section');section.className='record-edit-panel';section.innerHTML='<div class="record-edit-actions"><button id="history-edit-mode" class="secondary" type="button" aria-controls="body" hidden>記録を編集する</button><button id="history-add" class="primary" type="button" disabled hidden>＋ 稽古・公演記録を追加</button></div><p id="history-edit-result" class="save-feedback" role="status"></p><p id="history-edit-status" role="status">共通保存の接続を確認しています…</p>';
 (document.getElementById('history-tools')||document.querySelector('main')).append(section);
 const dialog=document.createElement('dialog');dialog.className='record-dialog';document.body.append(dialog);guardEditor(dialog);
 const original=structuredClone(getData().records);
 let revision=0,loaded=false,stop,identity='',busy=false,editMode=false;
 let localReady=true;try{readRecords()}catch{localReady=false}const publicIds=new Set(getData().publicIds||[]);const allowed=()=>cloud.state.ready!==false&&!cloud.state.connectionIssue&&(cloud.state.configured?loaded&&['editor','admin'].includes(cloud.state.role):localReady);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const feedback=message=>section.querySelector('#history-edit-status').textContent=message;
 const canEdit=id=>allowed()&&(cloud.state.configured||!publicIds.has(id));
 const toggle=section.querySelector('#history-edit-mode'),add=section.querySelector('#history-add');
 function controls(){
  const enabled=allowed();
  if(!enabled)editMode=false;
  toggle.hidden=!enabled;
  toggle.textContent=editMode?'編集を終了':'記録を編集する';
  add.hidden=!enabled||!editMode;
  add.disabled=!enabled;
  recoveryList.render();
  refreshRows();
 }
 toggle.onclick=()=>{
  if(!allowed())return;
  editMode=!editMode;controls();
 };
 const recoveryList=saveRecovery('history',()=>recoveryScope(cloud.state),draft=>{
  if(allowed())edit(getData().records.some(r=>r.id===draft.id)?draft.id:null,draft);
 },allowed);
 cloud.onState(s=>{
  recoveryList.render();
  const canEditRole=['admin','editor'].includes(s.role);
  const next=JSON.stringify([s.ready!==false,s.connectionIssue,s.configured,s.user?.uid,s.role]);
  if(next===identity)return;
  identity=next;stop?.();loaded=false;editMode=false;document.getElementById('history-edit-result').textContent='';
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
   getData().records=doc?.useBuiltInHistory
    ?[...new Map([...structuredClone(original),...doc.items].map(record=>[record.id,record])).values()]
    :doc?doc.items:structuredClone(original);refresh();
   feedback(canEditRole?'記録を追加・修正できます。保存すると会員の端末に反映されます。':'記録は閲覧のみです。編集権限がありません。');controls();
  },message=>readFailure('共通記録を読み込めませんでした。'+message));
 });
 function valid(r){return r&&typeof r.id==='string'&&typeof r.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&typeof r.kind==='string'&&typeof r.occasion==='string'&&typeof r.note==='string'&&r.pieces&&typeof r.pieces==='object'&&Object.values(r.pieces).every(v=>typeof v==='string')}
 async function persist(items,expected,form,draft){
  if(busy)return false;
  busy=true;
  const done=draft?recoveryList.begin(form,draft.value.occasion,draft):()=>{};
  editorState(form,'保存中…',true);
  const controlsToLock=[...form.querySelectorAll('input,select,textarea,button:not([data-cancel])')];
  controlsToLock.forEach(control=>control.disabled=true);
  try{
   if(cloud.state.configured){
    const savedRevision=await cloud.save('history',{items},expected);
    done();
    if(revision>savedRevision)return true;
   }else{writeRecords(items.filter(r=>!publicIds.has(r.id)));done()}
   getData().records=items;refresh();controls();return true;
  }catch(e){
   const message='保存できませんでした。'+e.message+' もう一度保存してください。';
   done(message);
   if(form.isConnected&&dialog.open)editorState(form,message);
   else if(!draft)feedback(message);
   return false;
  }finally{
   controlsToLock.forEach(control=>control.disabled=false);
   busy=false;
   if(form.querySelector('[data-editor-status]').textContent==='保存中…')editorState(form,'');
  }
 }
 function edit(id,recovery){
  if(!allowed()||(!cloud.state.configured&&id&&publicIds.has(id)))return;const data=getData(),existing=id?data.records.find(r=>r.id===id):null;if(id&&!existing)return;
  document.getElementById('history-edit-result').textContent='';
  const record=recovery?.value||existing||{id:crypto.randomUUID(),date:new Date().toLocaleDateString('sv-SE'),kind:'その他公演',occasion:'',pieces:{},note:''};const expected=revision;
  dialog.innerHTML=`<form><h2>${existing?'記録を修正':'稽古・公演記録を追加'}</h2><div class="editor-bar"><div class="form-actions"><button type="submit">変更を保存する</button><button type="button" data-cancel>キャンセル</button></div><p role="alert" data-editor-status hidden></p></div><label>日付<input name="date" type="date" required value="${esc(record.date)}"></label><label>区分<select name="kind">${categoryOptions(record.kind,data.records.map(r=>r.kind))}</select></label><label>公演・稽古名<input name="occasion" required value="${esc(record.occasion)}"></label><p>各演者の演目を入力してください。演目未定の出席は「○」、記録なしは空欄にできます。</p>${data.names.map(n=>`<label>${esc(n)}<input data-piece="${esc(n)}" value="${esc(record.pieces[n]||'')}" placeholder="演目・○・空欄"></label>`).join('')}<label>注記<textarea name="note"></textarea></label>${existing?' <button type="button" data-delete>削除する</button>':''}</form>`;
  const form=dialog.querySelector('form');
  mountCategoryAdder(form.elements.kind,()=>data.records.map(r=>r.kind));
  form.querySelector('[name=note]').value=record.note;
  startEditor(dialog,form);
  const canRetry=recoveredEditState(form,recovery,existing);
  dialog.querySelector('[data-cancel]').onclick=()=>leaveEditor(dialog,()=>dialog.close());
  form.onsubmit=async e=>{e.preventDefault();if(!canRetry)return;const f=new FormData(e.target);const next={...record,date:f.get('date'),kind:f.get('kind'),occasion:f.get('occasion').trim(),note:f.get('note'),pieces:{...record.pieces,...Object.fromEntries([...dialog.querySelectorAll('[data-piece]')].map(el=>[el.dataset.piece,el.value.trim()]))}};if(!next.occasion)return;if(await persist(existing?data.records.map(r=>r.id===id?next:r):[...data.records,next],expected,form,{id:next.id,base:existing,value:next})){if(form.isConnected){if(dialog.open){finishEditor(dialog);dialog.close()}document.getElementById('history-edit-result').textContent='記録を保存しました。'}}};
  if(existing)dialog.querySelector('[data-delete]').onclick=async()=>{if(confirm('この稽古・公演記録を削除しますか？')&&await persist(data.records.filter(r=>r.id!==id),expected,form)&&form.isConnected&&dialog.open)dialog.close()};
  dialog.showModal();
 }
 add.onclick=()=>{if(editMode)edit()};
 return {canSelect:id=>editMode&&canEdit(id),select:id=>{if(editMode&&canEdit(id))edit(id)}};
}
