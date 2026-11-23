import {startEditor,finishEditor,leaveEditor,guardEditor,editorState} from './editor-dialog.js?v=20261123-flyers4';
import {cloud} from './cloud.js?v=20261123-flyers4';

const statuses=['未依頼','依頼済み','掲示済み','今回は見送り'];
const compare=new Intl.Collator('ja',{numeric:true,sensitivity:'base'}).compare;
const orderName=row=>row.source?.name===row.name&&row.source.reading?row.source.reading:row.name;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const venueKey=row=>JSON.stringify([row.region,row.name].map(value=>value.normalize('NFKC').toLowerCase().replace(/\s+/g,'')));
const options=(values,all)=>[new Option(all,''),...values.map(value=>new Option(value,value))];

export function openFlyerVenues(event){
 const dialog=document.createElement('dialog');
 dialog.className='flyer-dialog';
 dialog.setAttribute('aria-label','チラシの掲示先');
 dialog.innerHTML='<div class="dialog-body"><div class="dialog-head"><h2>チラシの掲示先</h2><button type="button" data-close-flyers aria-label="閉じる">×</button></div><p></p><p class="muted">状況を1つチェックしてください（自動保存）</p><div class="flyer-actions form-actions"><button type="button" data-import>施設を追加</button><button type="button" data-refresh class="secondary">最新を取得</button></div><p data-message role="status"></p><details class="flyer-tools"><summary>追加・絞り込み・引き継ぎ</summary><div class="flyer-actions form-actions"><button type="button" data-add>名前を入力して追加</button></div><div class="record-filters flyer-filters"><label>地域<select data-region></select></label><label>区分<select data-category></select></label></div><div class="flyer-actions form-actions"><label>引き継ぎ元<select data-source></select></label><button type="button" data-carry>選んだ公演から引き継ぐ</button></div></details><div data-list></div><details><summary>断られた施設の履歴</summary><ul data-refused></ul></details></div>';
 dialog.querySelector('.dialog-head + p').textContent=event.title;
 const q=selector=>dialog.querySelector(selector);
 const message=q('[data-message]'),source=q('[data-source]'),region=q('[data-region]'),category=q('[data-category]');
 const allowed=()=>cloud.state.provider==='apps-script'&&!!cloud.state.role;
 const identity=cloud.state.user?.uid;
 let data,busy=false,editor;
 const request=(action,payload={})=>cloud.flyer(action,{eventId:event.id,...payload});
 function redraw(){
  const rows=data?.rows||[];
  const selectedRegion=region.value,selectedCategory=category.value,selectedSource=source.value;
  region.replaceChildren(...options([...new Set(rows.map(row=>row.region))].sort(compare),'すべての地域'));
  category.replaceChildren(...options([...new Set(rows.map(row=>row.category))].sort(compare),'すべての区分'));
  source.replaceChildren(new Option('公演を選択',''),...(data?.sources||[]).map(row=>new Option(row.date+' '+row.title,row.id)));
  for(const [select,value] of [[region,selectedRegion],[category,selectedCategory],[source,selectedSource]])if([...select.options].some(option=>option.value===value))select.value=value;
  const match=rows.filter(row=>(!region.value||row.region===region.value)&&(!category.value||row.category===category.value));
  q('[data-list]').innerHTML=match.sort((left,right)=>compare(orderName(left),orderName(right))||compare(left.region,right.region)).map(row=>`<article class="flyer-item"><h3>${esc(row.name)}</h3><fieldset class="flyer-choices"><legend>状況</legend>${statuses.map((status,i)=>`<label class="flyer-choice flyer-status ${row.status===status?'is-selected':''}" data-status="${i}"><input type="checkbox" data-status-choice="${esc(row.id)}" value="${esc(status)}" ${row.status===status?'checked':''}><span>${esc(status)}</span></label>`).join('')}</fieldset><p data-row-message role="status"></p><details class="flyer-row-details"><summary>メモ・その他</summary><p class="flyer-meta">${esc(row.region)} ／ ${esc(row.category)}</p>${row.memo?`<p class="memo">${esc(row.memo)}</p>`:''}${data.archived?'':`<button type="button" class="secondary" data-edit-flyer="${esc(row.id)}">編集する</button> <button type="button" class="secondary" data-refuse-flyer="${esc(row.id)}">断られたため一覧から外す</button>`}${row.source?`<p><a href="${esc(row.source.url)}" target="_blank" rel="noopener noreferrer">確認元</a> <time>${esc(row.source.date)}</time></p>`:''}</details></article>`).join('')||(data?'<p>表示する掲示先はありません。「追加・絞り込み・引き継ぎ」から登録できます。</p>':'');
  q('[data-refused]').innerHTML=(data?.refused||[]).map(row=>`<li><strong>${esc(row.name)}</strong> ／ ${esc(row.eventTitle)} ／ ${esc(row.refusedOn)}${row.memo?`<p class="memo">${esc(row.memo)}</p>`:''}</li>`).join('')||'<li>履歴はありません。</li>';
  updateControls();
 }
 function updateControls(){
  const available=allowed()&&data&&!data.archived&&!busy;
  q('[data-refresh]').disabled=busy||!allowed();
  for(const button of dialog.querySelectorAll('[data-add],[data-import],[data-edit-flyer],[data-refuse-flyer],[data-status-choice]'))button.disabled=!available;
  source.disabled=!available;region.disabled=category.disabled=busy;
  q('[data-close-flyers]').disabled=busy;
  q('[data-carry]').disabled=!available||!source.value;
 }
 async function run(action,body={},success='',before){
  if(busy||!allowed())return;
  busy=true;updateControls();
  message.textContent=action==='flyerRead'?'読み込み中…':'保存中…';
  try{
   const payload=before?await before():body;
   const next=await request(action,payload);
   if(!dialog.open)return;
   data=next;redraw();message.textContent=success;return true;
  }catch(error){if(dialog.open){redraw();message.textContent=(action==='flyerRead'?'最新の情報を取得できませんでした。':'保存を確認できませんでした。')+error.message+' 「最新を取得」で確認してから、もう一度お試しください。'}return false;}
  finally{busy=false;if(dialog.open)updateControls()}
 }
 function edit(row={}){
  if(busy||!data||data.archived||!allowed())return;
  editor=document.createElement('dialog');
  editor.setAttribute('aria-label','掲示先を編集');
  editor.innerHTML=`<div class="dialog-body"><h2>${row.id?'掲示先を編集':'掲示先を追加'}</h2><form><div class="editor-bar"><div class="form-actions"><button type="submit" class="primary">変更を保存する</button><button type="button" data-cancel>キャンセル</button></div><p data-editor-status role="status" hidden></p></div><label>施設名<input name="name" required maxlength="120" value="${esc(row.name)}"></label><label>地域<input name="region" required maxlength="80" value="${esc(row.region||region.value||'神栖市')}"></label><label>区分<input name="category" list="flyer-category-options" required maxlength="80" value="${esc(row.category||category.value||'その他')}"></label><datalist id="flyer-category-options">${data.categories.map(value=>`<option value="${esc(value)}"></option>`).join('')}</datalist><label>状況<select name="status">${statuses.map(status=>`<option ${(row.status||statuses[0])===status?'selected':''}>${status}</option>`).join('')}</select></label><label>自由メモ（任意）<textarea name="memo" maxlength="2000" rows="4"></textarea></label></form></div>`;
  const form=editor.querySelector('form'),cancel=form.querySelector('[data-cancel]');
  form.elements.memo.value=row.memo||'';
  document.body.append(editor);
  startEditor(editor,form);const unguard=guardEditor(editor);
  // Keep the form open while the confirmed save is outstanding.
  editor.addEventListener('cancel',event=>{if(busy){event.preventDefault();event.stopImmediatePropagation()}},{capture:true});
  cancel.onclick=()=>{if(!busy)leaveEditor(editor,()=>editor.close())};
  const current=editor;
  editor.addEventListener('close',()=>{unguard();current.remove();if(editor===current)editor=null},{once:true});
  form.onsubmit=async event=>{
   event.preventDefault();
   if(busy||!allowed())return;
   const entry=Object.fromEntries(new FormData(form));
   busy=true;cancel.disabled=true;editorState(form,'保存中…',true);
   try{
    const next=await request('flyerSave',{id:row.id,revision:row.revision,entry});
    if(!dialog.open)return;
    data=next;finishEditor(current);current.close();redraw();message.textContent='掲示先を保存しました。';
   }catch(error){
    if(current.open)editorState(form,'保存できませんでした。'+error.message+' 入力はそのままです。競合した場合は、入力を控えてから一覧を更新してください。');
   }finally{busy=false;cancel.disabled=false;if(dialog.open)updateControls()}
  };
  editor.showModal();
 }
 region.onchange=category.onchange=redraw;source.onchange=updateControls;
 q('[data-close-flyers]').onclick=()=>{if(!busy)dialog.close()};
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
 q('[data-refresh]').onclick=()=>run('flyerRead');
 q('[data-add]').onclick=()=>edit();
 async function chooseCandidates(){
  if(busy||!allowed()||!data||data.archived)return;
  busy=true;updateControls();message.textContent='施設候補を読み込み中…';
  let candidates;
  try{
   const response=await fetch('./flyer-candidates.json?v=20261123-flyers4');
   if(!response.ok)throw Error('施設候補を読み込めませんでした');
   candidates=await response.json();
  }catch(error){message.textContent=error.message+' もう一度お試しください。';return}
  finally{busy=false;if(dialog.open)updateControls()}
  if(!dialog.open||!allowed())return;
  const excluded=new Set([...(data.rows||[]),...(data.refused||[])].flatMap(row=>[venueKey(row),...(row.keys||[])]));
  candidates=candidates.filter(row=>!excluded.has(venueKey(row))).sort((a,b)=>compare(a.reading||a.name,b.reading||b.name));
  const picker=document.createElement('dialog');editor=picker;
  picker.className='flyer-dialog';picker.setAttribute('aria-label','施設候補から選ぶ');
  picker.innerHTML='<div class="dialog-body"><h2>施設候補から選ぶ</h2><p>追加したい施設にチェックしてください。掲示の許可は未確認です。</p><div class="editor-bar"><div class="form-actions"><button type="button" data-save-candidates class="primary">選んだ施設を追加</button><button type="button" data-cancel-candidates>キャンセル</button></div><p data-candidate-message role="status"></p></div><div class="record-filters flyer-filters"><label>地域<select data-candidate-region></select></label><label>種類<select data-candidate-category></select></label></div><div data-candidate-list></div></div>';
  const pr=picker.querySelector('[data-candidate-region]'),pc=picker.querySelector('[data-candidate-category]'),list=picker.querySelector('[data-candidate-list]'),note=picker.querySelector('[data-candidate-message]'),save=picker.querySelector('[data-save-candidates]'),cancel=picker.querySelector('[data-cancel-candidates]');
  pr.replaceChildren(...options([...new Set(candidates.map(row=>row.region))].sort(compare),'すべての地域'));
  pc.replaceChildren(...options([...new Set(candidates.map(row=>row.category))].sort(compare),'すべての種類'));
  const selected=new Set();let saving=false;
  function selection(){save.disabled=saving||!selected.size||selected.size>50;save.textContent=selected.size?'選んだ'+selected.size+'件を追加':'選んだ施設を追加';note.textContent=selected.size>50?'一度に追加できるのは50件までです。':selected.size+'件選択中（地域・種類を変えても選択を保持）'}
  function draw(){
   list.innerHTML=candidates.map((row,index)=>({row,index})).filter(({row})=>(!pr.value||row.region===pr.value)&&(!pc.value||row.category===pc.value)).map(({row,index})=>`<label class="flyer-candidate"><input type="checkbox" data-candidate="${index}" ${selected.has(index)?'checked':''}><span><strong>${esc(row.name)}</strong><small>${esc(row.region)} ／ ${esc(row.category)}</small></span></label>`).join('')||'<p>追加できる候補はありません。登録済み・除外済みの施設は表示しません。</p>';
   selection();
  }
  pr.onchange=pc.onchange=draw;
  list.onchange=e=>{const input=e.target.closest('[data-candidate]');if(!input||saving)return;const index=Number(input.dataset.candidate);if(input.checked)selected.add(index);else selected.delete(index);selection()};
  cancel.onclick=()=>{if(!saving)picker.close()};
  picker.addEventListener('cancel',e=>{if(saving)e.preventDefault()});
  picker.addEventListener('close',()=>{picker.remove();if(editor===picker)editor=null},{once:true});
  save.onclick=async()=>{
   if(saving||!selected.size||selected.size>50)return;
   saving=true;for(const input of picker.querySelectorAll('input,select,button'))input.disabled=true;
   note.textContent='保存中…';
   const ok=await run('flyerImport',{entries:[...selected].map(index=>candidates[index])},'施設を追加しました。状況をチェックできます。');
   if(ok){picker.close();q('.flyer-tools').open=false}
   else if(picker.open){saving=false;for(const input of picker.querySelectorAll('input,select,button'))input.disabled=false;save.disabled=false;note.textContent='追加を確認できませんでした。選択は残っています。一覧の「最新を取得」で確認してください。'}
  };
  message.textContent='';document.body.append(picker);draw();picker.showModal();
 }
 q('[data-import]').onclick=()=>void chooseCandidates();
 q('[data-carry]').onclick=()=>run('flyerCarry',{from:source.value},'引き継ぎを確認しました。未登録の施設のみ追加しました。');
 q('[data-list]').onchange=async event=>{
  const checkbox=event.target.closest('[data-status-choice]');if(!checkbox)return;
  const row=data?.rows.find(row=>row.id===checkbox.dataset.statusChoice);
  if(!row||busy||data.archived||!allowed()){redraw();return}
  const status=checkbox.value;
  if(!checkbox.checked||status===row.status){redraw();return}
  for(const input of checkbox.closest('.flyer-choices').querySelectorAll('input'))input.checked=input===checkbox;
  const entry={name:row.name,region:row.region,category:row.category,memo:row.memo,status};
  checkbox.closest('.flyer-item').querySelector('[data-row-message]').textContent='保存中…';
  const saved=await run('flyerSave',{id:row.id,revision:row.revision,entry},status+'で保存しました。');
  if(saved===false&&dialog.open){
   const input=[...dialog.querySelectorAll('[data-status-choice]')].find(input=>input.dataset.statusChoice===row.id);
   if(input){const warning=document.createElement('p');warning.className='sync-warning';warning.setAttribute('role','alert');warning.textContent='保存を確認できませんでした。「最新を取得」で確認してください。';input.closest('.flyer-item').append(warning)}
  }
 };
 q('[data-list]').onclick=event=>{
  const button=event.target.closest('button');if(!button)return;
  const row=data.rows.find(row=>row.id===(button.dataset.editFlyer||button.dataset.refuseFlyer));
  if(!row)return;
  if(button.dataset.editFlyer)edit(row);
  else if(confirm('「'+row.name+'」を一覧から外して履歴に残しますか？ 今後の引き継ぎや候補取り込みでも追加されません。'))run('flyerRefuse',{id:row.id,revision:row.revision},'一覧から外し、履歴に残しました。');
 };
 document.body.append(dialog);
 dialog.showModal();
 const stop=cloud.onState(()=>{if(!allowed()||cloud.state.user?.uid!==identity){editor?.close();dialog.close()}});
 dialog.addEventListener('close',()=>{stop();editor?.close();dialog.remove()},{once:true});
 redraw();void run('flyerRead');
}
