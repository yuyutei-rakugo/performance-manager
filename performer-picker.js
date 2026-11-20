const pickerUpdates=new WeakMap();

export function performerPicker(person,names){
 const picker=document.createElement('div');
 picker.className='performer-picker';
 picker.innerHTML='<label>演者<select name="stageName" required></select></label><label hidden>ゲストの高座名<input name="guestStageName" autocomplete="off"></label>';
 const select=picker.querySelector('select'),input=picker.querySelector('input');
 const guestOption=document.createElement('option');
 guestOption.textContent='ゲスト演者を入力';
 // A nonempty option value lets required validation work in guest mode.
 guestOption.value='guest';
 let chosen=person.stageName||'',guest=person.guest===true;
 input.value=guest?chosen:'';
 function sync(){
  input.parentElement.hidden=!guest;
  input.disabled=!guest;
  input.required=guest;
 }
 function update(next){
  if(select.options.length){guest=select.selectedOptions[0]===guestOption;if(!guest)chosen=select.value}
  const options=[new Option('会員を選択',''),...next.map(name=>new Option(name,name))];
  if(!guest&&chosen&&!next.includes(chosen))options.push(new Option(chosen+'（保存済み）',chosen));
  select.replaceChildren(...options,guestOption);
  if(guest)guestOption.selected=true;
  else select.value=chosen;
  sync();
 }
 select.addEventListener('change',()=>{
  guest=select.selectedOptions[0]===guestOption;
  chosen=guest?'':select.value;
  sync();
  if(guest)input.focus();
 });
 pickerUpdates.set(picker,update);
 update(names);
 return picker;
}

export function updatePerformerPickers(container,names){
 for(const picker of container.querySelectorAll('.performer-picker'))pickerUpdates.get(picker)(names);
}

export function readPerformer(row){
 const picker=row.querySelector('.performer-picker');
 const select=picker.querySelector('select'),input=picker.querySelector('input');
 return select.selectedOptions[0]===select.lastElementChild
  ? {stageName:input.value.trim(),guest:true}
  : {stageName:select.value.trim()};
}

export function showPerformerRoster(container,state,names,retry){
 const status=container.querySelector('[data-roster-status]');
 if(!status)return;
 status.textContent=state==='loading'?'会員名簿を取得中です。':state==='error'?'会員名簿を取得できませんでした。':
  names.length===0?'有効な登録会員はいません。':names.length===1?'登録済みの有効な会員は1人です。':'登録済みの有効な会員：'+names.length+'人';
 const button=container.querySelector('[data-roster-retry]');
 button.hidden=state==='loading';
 button.textContent=state==='error'?'名簿を再試行':'名簿を更新';
 button.onclick=retry;
}
