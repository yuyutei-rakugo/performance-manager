import {escapeHtml} from './ui-text.js?v=20261128-line2';
import {cloud} from './cloud.js?v=20261128-line2';

const captions={date:'利用日',venue:'施設名',room:'部屋',start:'予約開始',end:'予約終了',issued:'発行日'};
const request=(action,data={})=>cloud.reservation(action,data);
function unique(values){
 const distinct=[...new Set(values)];
 return distinct.length===1?distinct[0]:'';
}
export function readReservationText(raw){
 const text=raw.normalize('NFKC');
 const date=label=>unique([...text.matchAll(new RegExp('(?:^|\\n)[ \\t]*(?:'+label+')[ \\t]*[:：]?[ \\t]*(\\d{4})[年/.-](\\d{1,2})[月/.-](\\d{1,2})日?(?=[ \\t\\n]|$)','g'))].map(([,y,m,d])=>y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0')).filter(value=>{
  const parsed=new Date(value+'T00:00:00Z');return !isNaN(parsed)&&parsed.toISOString().slice(0,10)===value;
 }));
 const field=label=>unique([...text.matchAll(new RegExp('(?:^|\\n)[ \\t]*(?:'+label+')[ \\t]*[:：][ \\t]*([^\\n]+)','g'))].map(match=>match[1].trim()));
 const time=label=>unique([...text.matchAll(new RegExp('(?:^|\\n)[ \\t]*(?:'+label+')[ \\t]*[:：]?[ \\t]*(\\d{1,2}):([0-5]\\d)(?=[ \\t\\n]|$)','g'))].filter(match=>Number(match[1])<=23).map(match=>match[1].padStart(2,'0')+':'+match[2]));
 return {date:date('利用日|使用日'),issued:date('発行日|交付日'),venue:field('施設名|施設'),room:field('部屋|利用室|使用室'),start:time('予約開始|利用開始|開始時刻'),end:time('予約終了|利用終了|終了時刻')};
}
async function preparePhoto(file){
 const bitmap=await createImageBitmap(file);
 try{
  const canvas=document.createElement('canvas'),scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height));
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
  let photo='';
  for(const quality of [.88,.75,.6,.45]){
   photo=canvas.toDataURL('image/jpeg',quality).split(',')[1];
   if(photo?.length<=1200000)break;
  }
  if(!photo||photo.length>1200000)throw Error('写真が大きすぎます。小さい写真を選んでください。');
  let fields={},message='この端末では自動読み取りを利用できません。写真だけでも確認待ちで保存できます。';
  if(typeof window.TextDetector==='function'){
   try{
    const result=await new window.TextDetector().detect(bitmap);
    fields=readReservationText(result.map(item=>item.rawValue).join('\n'));
    message='読み取った内容を表示しました。分からない欄は空のまま保存できます。';
   }catch{message='文字を読み取れませんでした。写真だけでも確認待ちで保存できます。'}
  }
  return {photo,fields,message};
 }finally{bitmap.close()}
}
function inputs(values={}){
 return Object.entries(captions).map(([name,label])=>{
  const type=['date','issued'].includes(name)?'date':['start','end'].includes(name)?'time':'text';
  return `<label>${label}<input name="${name}" type="${type}" maxlength="100" value="${escapeHtml(values[name])}"></label>`;
 }).join('');
}
export function openReservationDocuments(){
 if(document.querySelector('.reservation-dialog[open]'))return;
 const dialog=document.createElement('dialog');
 dialog.className='reservation-dialog';
 dialog.setAttribute('aria-label','予約書類');
 dialog.innerHTML='<div class="dialog-body"><div class="dialog-head"><h2>予約書類</h2><button type="button" data-close aria-label="閉じる">×</button></div><button type="button" class="primary" data-file>撮影・写真を選ぶ</button><input type="file" accept="image/*" hidden><button type="button" data-refresh>一覧を更新</button><p role="status" data-message></p><div data-draft></div><div data-documents></div></div>';
 document.body.append(dialog);
 const q=selector=>dialog.querySelector(selector),file=q('[type=file]'),message=q('[data-message]'),draft=q('[data-draft]'),list=q('[data-documents]');
 const account=cloud.state.user?.uid;
 let busy=false,photo='',data;
 const setBusy=value=>{busy=value;q('[data-file]').disabled=value||!!photo;q('[data-close]').disabled=value;q('[data-refresh]').disabled=value||!!draft.childElementCount;};
 const describe=fields=>[fields.venue,fields.room,fields.start&&fields.end?fields.start+'〜'+fields.end:'',fields.issued?'発行 '+fields.issued:'発行日不明'].filter(Boolean).join(' ／ ');
 function draw(){
  if(!dialog.open)return;
  const rows=[...(data?.documents||[])].sort((a,b)=>(b.fields.date||'').localeCompare(a.fields.date||'')||(b.fields.issued||'').localeCompare(a.fields.issued||''));
  list.innerHTML=rows.map(row=>`<details class="reservation-item" data-reservation="${escapeHtml(row.id)}"><summary>${escapeHtml(row.fields.date||'利用日不明')}　${escapeHtml(row.fields.venue||'施設不明')} <strong>${escapeHtml(row.status)}</strong>${row.latest?'（最新版）':row.older?'（旧版）':''}</summary><p>${escapeHtml(describe(row.fields))}</p>${row.link?`<p>ひも付け先：${escapeHtml(data.schedules.find(s=>s.id===row.link.id&&s.type===row.link.type)?.title||'保存済みの予定')}</p>`:''}<ul>${row.reasons.map(reason=>`<li>${escapeHtml(reason)}</li>`).join('')}</ul><p>施設への連絡：${row.contact?.done?'連絡済み':'未連絡'}${row.contact?`（${escapeHtml(row.contact.name)}）`:''}</p><button type="button" data-photo>写真を見る</button><p data-image-status role="status"></p><div data-image></div>${row.reviewHistory?.length?`<details><summary>確認履歴</summary><ul>${row.reviewHistory.map(review=>`<li>${escapeHtml(review.name)} ／ ${escapeHtml(new Date(review.at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}))} ／ ${escapeHtml(review.reason)}</li>`).join('')}</ul></details>`:''}${data.canReview?`<div class="form-actions"><button type="button" data-review>内容と予定を確認</button><button type="button" data-contact>${row.contact?.done?'未連絡に戻す':'連絡済みにする'}</button></div>`:''}</details>`).join('')||'<p>保存済みの予約書類はありません。</p>';
 }
 function close(){
  if(busy)return;
  if(!photo&&!draft.childElementCount||confirm('保存していない入力を破棄しますか？'))dialog.close();
 }
 q('[data-close]').onclick=close;
 dialog.addEventListener('cancel',event=>{event.preventDefault();close()});
 q('[data-file]').onclick=()=>file.click();
 function bind(form,action,fields,success){
  const submit=form.querySelector('[type=submit]'),status=form.querySelector('[data-status]');
  form.onsubmit=async event=>{
   event.preventDefault();if(busy)return;
   const payload=fields(new FormData(form));
   setBusy(true);submit.disabled=true;status.textContent='保存中…';
   try{
    data=await request(action,payload);
    if(!dialog.open)return;
    photo='';draft.replaceChildren();draw();
    message.textContent=data.duplicate?'同じ写真は登録済みです。':success+(action==='reservationAdd'&&data.documents.at(-1)?.status==='確認待ち'?' 確認待ちに追加しました。':'');
   }catch(error){status.textContent='保存できませんでした。'+error.message+' 入力を残しました。もう一度お試しください。'}
   finally{setBusy(false);submit.disabled=false}
  };
  form.querySelector('[data-cancel]').onclick=()=>{if(!busy&&confirm('保存していない入力を破棄しますか？')){photo='';draft.replaceChildren();setBusy(false)}};
 }
 file.onchange=async()=>{
  const selected=file.files[0];file.value='';
  if(!selected||busy)return;
  setBusy(true);message.textContent='写真を読み取り中…';
  try{
   const prepared=await preparePhoto(selected);
   if(!dialog.open)return;
   photo=prepared.photo;
   draft.innerHTML=`<form><p>${escapeHtml(prepared.message)}</p><details><summary>読み取り内容を開く</summary><div class="fields">${inputs(prepared.fields)}</div></details><div class="form-actions"><button type="submit" class="primary">写真を保存する</button><button type="button" data-cancel>キャンセル</button></div><p role="status" data-status></p></form>`;
   bind(draft.querySelector('form'),'reservationAdd',form=>({photo,fields:Object.fromEntries(form)}),'写真を保存しました。');
   message.textContent='';
  }catch(error){message.textContent='写真を読み込めませんでした。'+error.message+' 写真を選び直してください。'}
  finally{setBusy(false)}
 };
 list.onclick=async event=>{
  const button=event.target.closest('button'),item=button?.closest('[data-reservation]');
  if(!item||busy||draft.childElementCount)return;
  const row=data.documents.find(document=>document.id===item.dataset.reservation);
  if(button.hasAttribute('data-photo')){
   const status=item.querySelector('[data-image-status]');
   button.disabled=true;status.textContent='写真を読み込み中…';
   try{
    const result=await request('reservationPhoto',{id:row.id});
    const image=new Image();image.alt='施設の予約書類';image.src='data:image/jpeg;base64,'+result.photo;
    item.querySelector('[data-image]').replaceChildren(image);status.textContent='';
   }catch(error){status.textContent=error.message+' もう一度お試しください。'}
   finally{button.disabled=false}
  }else if(button.hasAttribute('data-contact')){
   if(!confirm('施設への連絡状況を変更しますか？'))return;
   setBusy(true);message.textContent='保存中…';
   try{data=await request('reservationContact',{id:row.id,revision:row.revision,contacted:!row.contact?.done});draw();message.textContent='連絡状況を保存しました。'}
   catch(error){message.textContent='保存できませんでした。'+error.message}
   finally{setBusy(false)}
  }else{
   draft.innerHTML=`<form><h3>書類を確認する</h3><div class="fields">${inputs(row.fields)}</div><label>ひも付け先<select name="link" required><option value="">予定を選択</option></select></label><details><summary>準備・片付けを含めた必要時間</summary><div class="fields"><label>必要な開始<input name="neededStart" type="time" value="${escapeHtml(row.needed?.start)}"></label><label>必要な終了<input name="neededEnd" type="time" value="${escapeHtml(row.needed?.end)}"></label></div></details><label>確認理由<textarea name="reason" required maxlength="600" rows="3"></textarea></label><div class="form-actions"><button type="submit" class="primary">確認済みにする</button><button type="button" data-cancel>キャンセル</button></div><p data-status role="status"></p></form>`;
   const select=draft.querySelector('select');
   for(const schedule of data.schedules){
    const option=new Option(schedule.date+' '+schedule.title+' ／ '+schedule.venue,JSON.stringify({type:schedule.type,id:schedule.id}));
    option.selected=schedule.id===row.link?.id&&schedule.type===row.link?.type;select.add(option);
   }
   bind(draft.querySelector('form'),'reservationReview',form=>({id:row.id,revision:row.revision,fields:Object.fromEntries(form),link:JSON.parse(form.get('link')),reason:form.get('reason'),seen:data.documents.map(document=>document.id),needed:{start:form.get('neededStart'),end:form.get('neededEnd')}}),'確認内容を保存しました。');
   setBusy(false);draft.scrollIntoView({block:'start'});
  }
 };
 dialog.showModal();
 const onUnload=event=>{if(busy||draft.childElementCount){event.preventDefault();event.returnValue=''}};
 window.addEventListener('beforeunload',onUnload);
 const stop=cloud.onState(state=>{if(!state.role||state.user?.uid!==account)dialog.close()});
 dialog.addEventListener('close',()=>{stop();window.removeEventListener('beforeunload',onUnload);dialog.remove()},{once:true});
 async function refresh(){
  if(busy||draft.childElementCount)return;
  setBusy(true);message.textContent='予約書類を読み込み中…';
  try{data=await request('reservationList');draw();message.textContent=''}
  catch(error){message.textContent=error.message+' 「一覧を更新」で再試行できます。'}
  finally{setBusy(false)}
 }
 q('[data-refresh]').onclick=refresh;
 void refresh();
}
