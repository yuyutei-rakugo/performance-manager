const editors=new WeakMap();

export function startEditor(dialog,form){
 const snapshot=()=>JSON.stringify([...form.querySelectorAll('input,select,textarea')].filter(field=>!field.closest('.delete-zone')).map(field=>[
  field.name,field.type,field.value,field.type==='checkbox'||field.type==='radio'?field.checked:null
 ]));
 const baseline=snapshot();
 const editor={form,pending:false,committed:false,dirty:()=>snapshot()!==baseline};
 editors.set(dialog,editor);
 const status=form.querySelector('[data-editor-status]');
 const changed=()=>{
  if(editor.pending||editor.committed||editors.get(dialog)!==editor)return;
  const dirty=editor.dirty();
  if(status){status.hidden=false;status.dataset.savePhase=dirty?'dirty':'ready';status.textContent=dirty?'未保存':'編集中'}
  const feedback=form.querySelector('[data-save-feedback]');
  if(feedback)feedback.textContent=dirty?'内容を確認して保存してください。':'入力後、このボタンで保存します。';
 };
 form.addEventListener('input',changed);form.addEventListener('change',changed);
 if(status&&!status.textContent){status.hidden=false;status.dataset.savePhase='ready';status.textContent='編集中'}
 const actions=form.querySelector('.editor-bar .form-actions');
 if(actions){for(const button of actions.querySelectorAll('button')){
  if(button.type==='submit'){button.textContent=button.dataset.saveLabel||'変更を保存する';button.classList.add('primary')}
  else if(button.textContent.trim()==='キャンセル')button.classList.add('secondary');
 }}
 return editor;
}

export function editorState(form,message,pending=false){
 const dialog=form.closest('dialog'),editor=dialog&&editors.get(dialog);
 if(editor?.form===form){
  editor.pending=pending;form.setAttribute('aria-busy',String(pending));
  for(const child of form.children){
   if(!child.classList.contains('editor-bar'))child.inert=pending;
  }
  for(const button of form.querySelectorAll('.editor-bar button[type=submit],.editor-bar button:not([type])'))button.disabled=pending;
 }
 const feedback=form.querySelector('[data-save-feedback]');
 if(feedback)feedback.textContent=message;
 const status=form.querySelector('[data-editor-status]');
 if(status){status.textContent=message;status.hidden=!message;status.dataset.savePhase=pending?'pending':/できません|失敗|確認してください|更新されています/.test(message)?'error':/保存しました/.test(message)?'saved':'ready'}
}

export function finishEditor(dialog){
 const editor=editors.get(dialog);
 if(editor)editor.committed=true;
}

export function hasEditorDraft(dialog){
 const editor=editors.get(dialog);
 return dialog.open&&editor?.form.isConnected&&!editor.committed&&(editor.pending||editor.dirty());
}

export function leaveEditor(dialog,leave){
 if(!hasEditorDraft(dialog)){leave();return}
 if(document.querySelector('.discard-dialog[open]'))return;
 const prompt=document.createElement('dialog');
 prompt.className='discard-dialog';
 prompt.setAttribute('aria-label','変更が保存されていません');
 prompt.innerHTML='<div class="dialog-body"><p>変更が保存されていません。</p><div class="form-actions"><button type="button" class="primary" autofocus>編集を続ける</button><button type="button" class="secondary">変更を破棄する</button></div></div>';
 if(dialog.dataset.discardLabel)prompt.querySelector('.secondary').textContent=dialog.dataset.discardLabel;
 const pending=editors.get(dialog).pending;
 if(pending){
  prompt.querySelector('p').textContent='保存結果はまだ確定していません。閉じた後も、この画面で保存結果と復元用の入力を確認できます。';
  prompt.setAttribute('aria-label','保存結果はまだ確定していません');
  prompt.querySelector('.secondary').textContent='保存結果を待たずに閉じる';
 }
 const [stay,discard]=prompt.querySelectorAll('button');
 stay.onclick=()=>prompt.close();
 discard.onclick=()=>{prompt.close();if(!pending){editors.get(dialog)?.discardFailedSave?.();finishEditor(dialog)}leave()};
 prompt.addEventListener('close',()=>prompt.remove(),{once:true});
 document.body.append(prompt);
 prompt.showModal();
}

export function guardEditor(dialog){
 const onCancel=event=>{
  if(!hasEditorDraft(dialog))return;
  event.preventDefault();
  leaveEditor(dialog,()=>dialog.close());
 };
 const onUnload=event=>{
  if(!hasEditorDraft(dialog))return;
  event.preventDefault();
  event.returnValue='';
 };
 dialog.addEventListener('cancel',onCancel);
 window.addEventListener('beforeunload',onUnload);
 return ()=>{
  dialog.removeEventListener('cancel',onCancel);
  window.removeEventListener('beforeunload',onUnload);
 };
}

// Drafts stay in this browser tab and are visible only to the account that started the save.
export function saveRecovery(kind,scope,restore,canRestore){
 const key='yuitei.interrupted-save.'+kind;
 let entries=[];
 try{entries=JSON.parse(sessionStorage.getItem(key)||'[]');if(!Array.isArray(entries))entries=[]}catch{}
 entries=entries.map(entry=>({...entry,pending:false,message:entry.pending?'保存結果を確認できませんでした。最新の内容を確認してから再試行してください。':entry.message}));
 const panel=document.createElement('section');
 panel.className='save-recovery';
 panel.hidden=true;
 (document.querySelector('main')||document.body).prepend(panel);
 let rendered;
 function render(){
  const owner=scope(),ready=!!canRestore();
  const state=JSON.stringify([owner,ready,entries]);
  if(state===rendered)return;
  rendered=state;
  panel.replaceChildren();
  for(const entry of entries.filter(entry=>owner&&entry.owner===owner)){
   const row=document.createElement('div'),status=document.createElement('p');
   status.setAttribute('role','status');
   status.textContent=entry.label+'：'+entry.message;
   row.append(status);
   if(!entry.pending){
    const retry=document.createElement('button'),discard=document.createElement('button');
    retry.textContent='入力を復元する';discard.textContent='復元用の入力を削除';
    for(const button of [retry,discard]){button.type='button';button.className='secondary'}
    retry.disabled=!ready;
    retry.onclick=()=>restore(entry.data);
    discard.onclick=()=>{if(confirm('復元用の入力を削除しますか？'))update(entries.filter(item=>item!==entry))};
    row.append(retry,discard);
   }
   panel.append(row);
  }
  panel.hidden=!panel.childElementCount;
 }
 window.addEventListener('beforeunload',event=>{
  if(entries.some(entry=>entry.pending&&entry.owner===scope())){
   event.preventDefault();
   event.returnValue='';
  }
 });
 function update(next){
  entries=next;
  try{sessionStorage.setItem(key,JSON.stringify(entries))}catch{}
  render();
 }
 return {
  render,
  begin(form,label,data){
   const owner=scope();
   if(!owner)return ()=>{};
   const entry={owner,label,data,pending:true,message:'保存中…'};
   update([...entries.filter(item=>item.owner!==owner||item.data.id!==data.id),entry]);
   const editor=editors.get(form.closest('dialog'));
   if(editor?.form===form)editor.discardFailedSave=()=>update(entries.filter(item=>item!==entry));
   return error=>{
    if(!entries.includes(entry))return;
    if(error){
     entry.pending=false;
     entry.message=/Failed to fetch|NetworkError|Load failed/.test(error)
      ?'通信が切れたため保存結果を確認できませんでした。最新の内容を確認してから再試行してください。':error;
     update(entries);
    }
    else update(entries.filter(item=>item!==entry));
   };
  }
 };
}

export function recoveryScope(state){
 if(state.ready===false)return null;
 return state.configured?(state.user?.uid&&['admin','editor'].includes(state.role)?'member:'+state.user.uid:null):'device';
}

export function recoveredEditState(form,recovery,current){
 if(!recovery)return true;
 const known=JSON.stringify(current??null);
 const unchanged=known===JSON.stringify(recovery.base??null);
 editorState(form,unchanged?'入力を復元しました。内容を確認して保存してください。':
  '保存先の内容が変わっています。最新の内容を確認し、必要な箇所を入力し直してください。');
 if(!unchanged)form.querySelector('.editor-bar button:not([type=button])').disabled=true;
 return unchanged;
}
