export const defaultCategories=['通常稽古','師匠稽古','自主稽古','定期落語会','飯沼観音寄席','図書館寄席','その他公演','その他'];
const categoryKey='yuitei.categories.v1';
export function readCategories(extra=[]){let saved=JSON.parse(localStorage.getItem(categoryKey)||'[]');if(!Array.isArray(saved)||!saved.every(n=>typeof n==='string'&&n.trim()))throw Error('区分の保存データを確認してください。');return [...new Set([...saved,...defaultCategories,...extra].filter(Boolean))]}
export function validCategories(names){return Array.isArray(names)&&names.length<=200&&names.every(n=>typeof n==='string'&&n.trim()&&n.length<=80)}
export function saveCategories(names){if(!validCategories(names))throw Error('区分は80文字以内、200件までです。');localStorage.setItem(categoryKey,JSON.stringify([...new Set(names.map(n=>n.trim()))]));window.dispatchEvent(new Event('categories-changed'))}
export function categoryOptions(selected='',extra=[]){return readCategories([...extra,selected]).map(n=>{const o=document.createElement('option');o.value=n;o.textContent=n;o.defaultSelected=n===selected;return o.outerHTML}).join('')}
export function mountCategories(host,extra=()=>[]){
 const button=document.createElement('button');button.type='button';button.className='manage-categories';button.textContent='区分を追加・並べ替え';host.append(button);const result=document.createElement('p');result.className='save-feedback';result.setAttribute('role','status');host.append(result);
 button.onclick=()=>{
  if(document.body.classList.contains('member-view'))return;
  const dialog=document.createElement('dialog');dialog.className='record-dialog';const box=document.createElement('div');box.className='dialog-body';dialog.append(box);document.body.append(dialog);
  const cleanup=()=>{window.removeEventListener('cloud-state',checkAccess);dialog.remove()};
  const checkAccess=()=>{if(document.body.classList.contains('member-view')){dialog.close();cleanup()}};
  dialog.addEventListener('close',cleanup,{once:true});window.addEventListener('cloud-state',checkAccess);
  let names=readCategories(extra());const original=JSON.stringify(names);
  const cancel=()=>{if(JSON.stringify(names)===original||confirm('変更が保存されていません。変更を破棄しますか？')){dialog.close();cleanup()}};
  dialog.addEventListener('cancel',event=>{event.preventDefault();cancel()});
  function draw(){
   box.replaceChildren();const heading=document.createElement('h2');heading.textContent='区分の整理';box.append(heading);
   const bar=document.createElement('div');bar.className='editor-bar';const actions=document.createElement('div');actions.className='form-actions';bar.append(actions);box.append(bar);
   const message=document.createElement('p');message.setAttribute('role','status');message.textContent=JSON.stringify(names)===original?'編集中':'未保存の変更があります。';bar.append(message);
   const save=document.createElement('button');save.type='button';save.className='primary';save.textContent='変更を保存する';actions.append(save);
   save.onclick=()=>{try{if(document.body.classList.contains('member-view'))return;saveCategories(names);result.textContent='保存しました。';dialog.close();cleanup()}catch(error){message.textContent='保存できませんでした。'+error.message}};
   const back=document.createElement('button');back.type='button';back.className='secondary';back.textContent='キャンセル';back.onclick=cancel;actions.append(back);
   names.forEach((name,i)=>{
    const row=document.createElement('div');row.className='form-actions';const label=document.createElement('span');label.textContent=name;row.append(label);
    for(const [text,delta] of [['上へ',-1],['下へ',1]]){const b=document.createElement('button');b.type='button';b.textContent=text;b.disabled=i+delta<0||i+delta>=names.length;b.onclick=()=>{[names[i],names[i+delta]]=[names[i+delta],names[i]];draw()};row.append(b)}box.append(row);
   });
   const form=document.createElement('form'),input=document.createElement('input');input.placeholder='例：来らっせ寄席';input.maxLength=80;input.required=true;input.setAttribute('aria-label','新しい区分');const add=document.createElement('button');add.textContent='区分を追加';form.append(input,add);
   form.onsubmit=e=>{e.preventDefault();const name=input.value.trim();if(!name)return;if(names.includes(name)){message.textContent='この区分は登録済みです。';return}if(names.length>=200){message.textContent='区分は200件までです。';return}names.push(name);draw()};box.append(form);
  }
  draw();dialog.showModal();
 };
}

// Add a category without leaving the editor or submitting its form.
export function mountCategoryAdder(select,extra=()=>[]){
 const box=document.createElement('div');box.className='category-adder';
 box.innerHTML='<button type="button" class="secondary" data-open>＋ 区分を追加</button><div data-entry hidden><label>新しい区分<input type="text" maxlength="80" placeholder="例：来らっせ寄席"></label><button type="button" data-add>追加して選択</button><button type="button" data-cancel-category>キャンセル</button></div><p role="status"></p>';
 select.closest('label').after(box);
 const entry=box.querySelector('[data-entry]'),input=box.querySelector('input'),message=box.querySelector('[role=status]');
 const close=()=>{entry.hidden=true;input.value='';message.textContent=''};
 box.querySelector('[data-open]').onclick=()=>{entry.hidden=false;input.focus()};
 box.querySelector('[data-cancel-category]').onclick=close;
 const add=()=>{
  const name=input.value.trim();if(!name){message.textContent='区分名を入力してください。';input.focus();return}
  try{
   const names=readCategories(extra());if(!names.includes(name))names.push(name);
   saveCategories(names);select.innerHTML=categoryOptions(name,extra());select.value=name;
   select.dispatchEvent(new Event('change',{bubbles:true}));close();
   message.textContent='「'+name+'」を選択しました。予定・記録も保存してください。';select.focus();
  }catch(error){message.textContent=error.message}
 };
 box.querySelector('[data-add]').onclick=add;
 input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();add()}};
 return box;
}
