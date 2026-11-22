export const defaultCategories=['通常稽古','師匠稽古','自主稽古','定期落語会','飯沼観音寄席','図書館寄席','その他公演','その他'];
const categoryKey='yuitei.categories.v1';
export function readCategories(extra=[]){let saved=JSON.parse(localStorage.getItem(categoryKey)||'[]');if(!Array.isArray(saved)||!saved.every(n=>typeof n==='string'&&n.trim()))throw Error('区分の保存データを確認してください。');return [...new Set([...saved,...defaultCategories,...extra].filter(Boolean))]}
export function validCategories(names){return Array.isArray(names)&&names.length<=200&&names.every(n=>typeof n==='string'&&n.trim()&&n.length<=80)}
export function saveCategories(names){if(!validCategories(names))throw Error('区分は80文字以内、200件までです。');localStorage.setItem(categoryKey,JSON.stringify([...new Set(names.map(n=>n.trim()))]));window.dispatchEvent(new Event('categories-changed'))}
export function categoryOptions(selected='',extra=[]){return readCategories([...extra,selected]).map(n=>{const o=document.createElement('option');o.value=n;o.textContent=n;o.defaultSelected=n===selected;return o.outerHTML}).join('')}
export function mountCategories(host,extra=()=>[]){const button=document.createElement('button');button.type='button';button.className='manage-categories';button.textContent='区分を追加・並べ替え';host.append(button);button.onclick=()=>{if(document.body.classList.contains('member-view'))return;const dialog=document.createElement('dialog');dialog.className='record-dialog';const box=document.createElement('div');box.className='dialog-body';dialog.append(box);document.body.append(dialog);const cleanup=()=>{window.removeEventListener('cloud-state',checkAccess);dialog.remove()};const checkAccess=()=>{if(document.body.classList.contains('member-view')){dialog.close();cleanup()}};dialog.addEventListener('close',cleanup,{once:true});window.addEventListener('cloud-state',checkAccess);let names=readCategories(extra());function draw(){box.replaceChildren();const h=document.createElement('h2');h.textContent='区分の整理';box.append(h);names.forEach((n,i)=>{const row=document.createElement('div');row.className='form-actions';const label=document.createElement('span');label.textContent=n;row.append(label);for(const [text,delta] of [['上へ',-1],['下へ',1]]){const b=document.createElement('button');b.type='button';b.textContent=text;b.disabled=i+delta<0||i+delta>=names.length;b.onclick=()=>{[names[i],names[i+delta]]=[names[i+delta],names[i]];draw()};row.append(b)}box.append(row)});const form=document.createElement('form'),input=document.createElement('input');input.placeholder='例：来らっせ寄席';input.maxLength=80;input.required=true;input.setAttribute('aria-label','新しい区分');const add=document.createElement('button');add.textContent='区分を追加';form.append(input,add);form.onsubmit=e=>{e.preventDefault();const n=input.value.trim();if(n&&!names.includes(n)){names.push(n);draw()}};box.append(form);const message=document.createElement('p');message.setAttribute('role','alert');box.append(message);for(const label of ['保存する','キャンセル']){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{try{if(label==='保存する'&&!document.body.classList.contains('member-view'))saveCategories(names);dialog.close();cleanup()}catch(e){message.textContent=e.message}};box.append(b)}}draw();dialog.showModal()}}

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
