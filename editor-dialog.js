const editors=new WeakMap();

export function startEditor(dialog,form){
 const snapshot=()=>JSON.stringify([...form.querySelectorAll('input,select,textarea')].filter(field=>!field.closest('.delete-zone')).map(field=>[
  field.name,field.type,field.value,field.type==='checkbox'||field.type==='radio'?field.checked:null
 ]));
 const baseline=snapshot();
 const editor={form,pending:false,committed:false,dirty:()=>snapshot()!==baseline};
 editors.set(dialog,editor);
 return editor;
}

export function editorState(form,message,pending=false){
 const dialog=form.closest('dialog'),editor=dialog&&editors.get(dialog);
 if(editor?.form===form){
  editor.pending=pending;
  for(const child of form.children){
   if(!child.classList.contains('editor-bar'))child.inert=pending;
  }
  form.querySelector('.editor-bar button:not([type=button])').disabled=pending;
 }
 const status=form.querySelector('[data-editor-status]');
 if(status){status.textContent=message;status.hidden=!message}
}

export function finishEditor(dialog){
 const editor=editors.get(dialog);
 if(editor)editor.committed=true;
}

function hasDraft(dialog){
 const editor=editors.get(dialog);
 return dialog.open&&editor?.form.isConnected&&!editor.pending&&!editor.committed&&editor.dirty();
}

export function leaveEditor(dialog,leave){
 if(!hasDraft(dialog)){leave();return}
 if(document.querySelector('.discard-dialog[open]'))return;
 const prompt=document.createElement('dialog');
 prompt.className='discard-dialog';
 prompt.setAttribute('aria-label','変更が保存されていません');
 prompt.innerHTML='<div class="dialog-body"><p>変更が保存されていません。</p><div class="form-actions"><button type="button" class="primary" autofocus>編集を続ける</button><button type="button" class="secondary">変更を破棄する</button></div></div>';
 const [stay,discard]=prompt.querySelectorAll('button');
 stay.onclick=()=>prompt.close();
 discard.onclick=()=>{prompt.close();finishEditor(dialog);leave()};
 prompt.addEventListener('close',()=>prompt.remove(),{once:true});
 document.body.append(prompt);
 prompt.showModal();
}

export function guardEditor(dialog){
 dialog.addEventListener('cancel',event=>{
  if(!hasDraft(dialog))return;
  event.preventDefault();
  leaveEditor(dialog,()=>dialog.close());
 });
 // Also cover reload, history navigation and browser close when supported.
 window.addEventListener('beforeunload',event=>{
  if(!hasDraft(dialog))return;
  event.preventDefault();
  event.returnValue='';
 });
}
