import {previewFlyerMigration} from './flyer-migration.js?v=20261124-ux1';
import {flyerLocation,flyerLocationInfo,positionFromUrl,exactAddressPosition,normalizeLocationAddress,flyerLinkConflicts} from './flyer-locations.js?v=20261124-ux1';
import {startEditor,finishEditor,leaveEditor,guardEditor,editorState} from './editor-dialog.js?v=20261124-ux1';
import {cloud} from './cloud.js?v=20261124-ux1';

const statuses=['未依頼','依頼済み','掲示済み','今回は見送り'];
const compare=new Intl.Collator('ja',{numeric:true,sensitivity:'base'}).compare;
const orderName=row=>row.source?.name===row.name&&row.source.reading?row.source.reading:row.name;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const venueKey=row=>JSON.stringify([row.region,row.name].map(value=>value.normalize('NFKC').toLowerCase().replace(/\s+/g,'')));
const mapUrl=row=>/^https:\/\//.test(flyerLocationInfo(row)?.mapUrl)
 ?flyerLocationInfo(row).mapUrl:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(flyerLocation(row)?.join(',')||flyerLocationInfo(row)?.address||row.region+' '+row.name);
function editorChoice(name,label,values,value){
 const entries=[...new Set([...values,value].filter(Boolean))].sort(compare);
 return `<div><label>${label}<select aria-label="${label}" name="${name}">${entries.map(option=>`<option value="${esc(option)}" ${option===value?'selected':''}>${esc(option)}</option>`).join('')}<option value="">新しく追加</option></select></label><label data-custom-${name} hidden>新しい${label}<input name="${name}New" maxlength="80"></label></div>`;
}
function wireChoice(form,name){
 const select=form.elements[name],field=form.elements[name+'New'];
 const change=()=>{field.parentElement.hidden=!!select.value;field.required=!select.value};
 select.onchange=()=>{change();if(!select.value)field.focus()};change();
 return ()=>select.value||field.value.trim();
}
const options=(values,all)=>[new Option(all,''),...values.map(value=>new Option(value,value))];

let catalogPromise;

export function openFlyerVenues(event){
 if(document.querySelector('.flyer-dialog[open]'))return;
 const dialog=document.createElement('dialog');
 dialog.className='flyer-dialog';
 dialog.setAttribute('aria-label','チラシ配布・掲示');
 dialog.innerHTML='<div class="dialog-body"><div class="dialog-head"><h2>チラシ配布・掲示</h2><button type="button" data-close-flyers aria-label="閉じる">×</button></div><p></p><p class="muted">「状況・メモを編集」からまとめて保存できます。</p><div class="flyer-actions form-actions"><button type="button" class="secondary" data-open-map>地図で見る</button><button type="button" data-add>施設を追加</button><button type="button" data-refresh class="secondary">一覧を更新</button></div><p data-message role="status"></p><p data-updated class="muted" role="status"></p><div class="flyer-quick-filters"><label>施設名で検索<input type="search" data-search placeholder="施設名を入力"></label><label>状況<select data-filter-status><option value="">すべて</option><option>未依頼</option><option>依頼済み</option><option>掲示済み</option><option>今回は見送り</option></select></label></div><div data-flyer-migration hidden><button type="button" class="secondary" data-migration-preview>既存施設の共通化を確認</button><div data-migration-plan></div></div><p data-count class="muted" role="status"></p><details class="flyer-tools"><summary>追加・絞り込み・引き継ぎ</summary><p data-position-count class="muted"></p><div class="record-filters flyer-filters"><label>地域<select data-region></select></label><label>区分<select data-category></select></label></div><div class="flyer-actions form-actions"><label>引き継ぎ元<select data-source></select></label><button type="button" data-carry>選んだ公演から引き継ぐ</button></div></details><section data-map-panel hidden></section><div data-list></div><details><summary>お断りの履歴</summary><ul data-refused></ul></details></div>';
 dialog.querySelector('.dialog-head + p').textContent=event.title;
 const q=selector=>dialog.querySelector(selector);
 const message=q('[data-message]'),source=q('[data-source]'),region=q('[data-region]'),category=q('[data-category]');
 const allowed=()=>cloud.state.provider==='apps-script'&&!!cloud.state.role;
 const identity=cloud.state.user?.uid;
 let data,busy=false,editor,editedId,lastRead=0,refreshQueued=false;
 const rowNodes=new Map(),groupNodes=new Map(),rowMessages=new Map();
 const markRead=()=>{lastRead=Date.now();q('[data-updated]').textContent='最終取得 '+new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Asia/Tokyo'}).format(lastRead);};
 let mapView,mapOpening=false,refusedMarkup;
 const snapshotCatalog=()=>catalogPromise||(catalogPromise=fetch('./flyer-candidates.json?v=20261124-ux1').then(response=>{if(!response.ok)throw Error('施設一覧を読み込めませんでした。');return response.json()}).catch(error=>{catalogPromise=null;throw error}));
 const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
 const request=(action,payload={})=>cloud.flyer(action,{eventId:event.id,...payload});
 function redraw(){
  const rows=data?.rows||[];
  const excluded=new Set((data?.refused||[]).filter(row=>!row.restoredAt).flatMap(row=>[venueKey(row),...(row.keys||[])]));
  const visibleOnMap=row=>![venueKey(row),...(row.keys||[])].some(key=>excluded.has(key));
  const registered=rows.filter(visibleOnMap);
  const pastDeclines=new Set((data?.declineHistory||[]).filter(log=>log.eventId!==event.id).flatMap(log=>[venueKey(log),...(log.keys||[])]));
  const confirmed=registered.filter(flyerLocation).length;
  q('[data-position-count]').textContent=data?'掲示対象 '+registered.length+'件 ／ 位置確認済み '+confirmed+'件 ／ 位置未確認 '+(registered.length-confirmed)+'件':'';
  const nextOptions=(select,next)=>{
   const selected=select.value;
   if(JSON.stringify([...select.options].map(item=>[item.value,item.text]))===JSON.stringify(next.map(item=>[item.value,item.text])))return;
   select.replaceChildren(...next);if(next.some(item=>item.value===selected))select.value=selected;
  };
  nextOptions(region,options([...new Set(rows.map(row=>row.region))].sort(compare),'すべての地域'));
  nextOptions(category,options([...new Set(rows.map(row=>row.category))].sort(compare),'すべての区分'));
  nextOptions(source,[new Option('公演を選択',''),...(data?.sources||[]).map(row=>new Option(row.date+' '+row.title,row.id))]);
  const match=rows.filter(row=>(!region.value||row.region===region.value)&&(!category.value||row.category===category.value)&&(!q('[data-filter-status]').value||row.status===q('[data-filter-status]').value)&&normalize(row.name).includes(normalize(q('[data-search]').value)));
  const list=q('[data-list]'),desired=[];
  const scrollTop=dialog.scrollTop;
  let lastGroup;
  for(const row of match.sort((a,b)=>compare(a.region,b.region)||compare(a.category,b.category)||compare(orderName(a),orderName(b)))){
   const group=JSON.stringify([row.region,row.category]);
   if(group!==lastGroup){
    if(!groupNodes.has(group)){const heading=document.createElement('h3');heading.className='flyer-group';heading.textContent=row.region+' ／ '+row.category;groupNodes.set(group,heading)}
    desired.push(groupNodes.get(group));lastGroup=group;
   }
   const mapAllowed=visibleOnMap(row);
   const position=flyerLocationInfo(row);
   const linkConflicts=flyerLinkConflicts(row,rows);
   const aliases=[venueKey(row),...(row.keys||[])];
   const history=aliases.some(key=>pastDeclines.has(key));
   const signature=JSON.stringify([row,!!data.archived,mapAllowed,history,data.declineFields,linkConflicts]);
   let cached=rowNodes.get(row.id);
   if(!cached||cached.signature!==signature){
    const template=document.createElement('template');
    template.innerHTML=`<article class="flyer-item" data-venue-id="${esc(row.id)}" data-status="${statuses.indexOf(row.status)}"><div class="flyer-heading"><span class="flyer-badge">${esc(row.status)}</span><h3>${esc(row.name)}${flyerLocation(row)?'':`<small class="flyer-unlocated" title="${esc(position?.reason||'緯度と経度が登録されていません。')}">位置未確認</small>`}</h3><a class="flyer-map" href="${esc(linkConflicts.length?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(row.region+' '+row.name):mapUrl(row))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(row.name)}をGoogleマップで検索">地図</a></div>${linkConflicts.length?`<p class="flyer-meta">${esc(linkConflicts.join('・'))}と同じ地図リンクです。施設名で検索して場所を確認してください。</p>`:''}${row.memo?`<p class="memo flyer-visible-memo">${esc(row.memo)}</p>`:''}${data.archived?'':`<button type="button" class="secondary" data-edit-flyer="${esc(row.id)}">状況・メモを編集</button>`}${history?'<p class="flyer-meta">以前お断りあり</p>':''}<details class="flyer-row-details" ${cached?.node.querySelector('.flyer-row-details').open?'open':''}><summary class="secondary flyer-disclosure"><span>施設の詳細</span><span>閉じる</span></summary>${mapAllowed&&flyerLocation(row)?`<button type="button" class="secondary" data-focus-pin="${esc(row.id)}">地図でこの施設を見る</button>`: ''}<p data-row-message role="status"></p><p class="flyer-meta">${esc(row.region)} ／ ${esc(row.category)}</p>${position?.address?`<p class="flyer-meta">${esc(position.address)}</p>`:''}${!flyerLocation(row)?`<p class="flyer-meta">${esc(position?.reason||'緯度と経度が登録されていません。')}</p>`:''}${data.archived?'':`<button type="button" class="secondary" data-find-flyer="${esc(row.id)}">場所を登録・変更</button>`}${row.source?`<p><a href="${esc(row.source.url)}" target="_blank" rel="noopener noreferrer">確認元</a> <time>${esc(row.source.date)}</time></p>`:''}</details></article>`;
    cached={signature,node:template.content.firstElementChild};rowNodes.set(row.id,cached);
   }
   const feedback=cached.node.querySelector('[data-row-message]'),result=rowMessages.get(row.id);
   if(feedback.dataset.text!==(result?.text||'')){
    feedback.dataset.text=result?.text||'';
    feedback.textContent=result?.text||'';
   }
   cached.node.classList.toggle('flyer-just-edited',row.id===editedId);
   desired.push(cached.node);
  }
  const keep=new Set(desired);
  for(const node of [...list.children])if(!keep.has(node))node.remove();
  desired.forEach((node,index)=>{if(list.children[index]!==node)list.insertBefore(node,list.children[index]||null)});
  const ids=new Set(rows.map(row=>row.id));
  for(const id of rowNodes.keys())if(!ids.has(id)){rowNodes.delete(id);rowMessages.delete(id)}
  if(!desired.length&&data)list.innerHTML='<p>条件に合う掲示先はありません。</p>';
  q('[data-count]').textContent=data?match.length+'／'+rows.length+'施設':'';
  const refused=(data?.declineHistory||data?.refused||[]).map(row=>`<li><strong>${esc(row.name)}</strong> ／ ${esc(row.eventTitle)} ／ ${esc(row.refusedOn)}${row.memo?`<p class="memo">${esc(row.memo)}</p>`:''}</li>`).join('')||'<li>履歴はありません。</li>';
  const recovery=data?.declineFields&&!data.archived&&cloud.state.role==='admin'?(data.refused||[]).filter(row=>!row.restoredAt):[];
  const restoreMarkup=recovery.map(row=>`<li><button type="button" class="secondary" data-restore-flyer="${esc(row.id)}" data-from="${esc(row.eventId)}">一覧に戻す</button> ${esc(row.region)} ／ ${esc(row.name)}</li>`).join('');
  if(refused+restoreMarkup!==refusedMarkup){q('[data-refused]').innerHTML=refused+restoreMarkup;refusedMarkup=refused+restoreMarkup}
  mapView?.update(match.filter(visibleOnMap),!!data?.archived,busy,rowMessages);
  if(dialog.scrollTop!==scrollTop)dialog.scrollTop=scrollTop;
  updateControls();
 }
 function updateControls(){
  const available=allowed()&&data&&!data.archived&&!busy;
  q('[data-refresh]').disabled=busy||!allowed();
  q('[data-flyer-migration]').hidden=!(data?.migrationRequired===true&&!data?.archived&&cloud.state.role==='admin');
  q('[data-migration-preview]').disabled=busy;
  for(const button of dialog.querySelectorAll('[data-add],[data-edit-flyer],[data-find-flyer],[data-restore-flyer]'))button.disabled=!available;
  source.disabled=!available;region.disabled=category.disabled=busy;
  q('[data-close-flyers]').disabled=busy;
  q('[data-carry]').disabled=!available||!source.value;
 }
 async function run(action,body={},success=''){
  if(busy||!allowed())return;
  busy=true;updateControls();
  message.textContent=action==='flyerRead'?'読み込み中…':'保存中…';
  try{
   const next=await request(action,body);
   if(!dialog.open)return;
   data=next;markRead();redraw();message.textContent=success;return true;
  }catch(error){if(dialog.open){redraw();message.textContent=(action==='flyerRead'?'最新の情報を取得できませんでした。':'保存を確認できませんでした。')+error.message+' 「一覧を更新」で確認してから、もう一度お試しください。'}return false;}
  finally{busy=false;if(dialog.open){redraw();if(refreshQueued&&!editor?.open)void refreshRead()}}
 }
 function edit(row={},openPlace=false){
  if(busy||!data||data.archived||!allowed())return;
  const position=flyerLocationInfo(row);
  editor=document.createElement('dialog');
  editor.setAttribute('aria-label','掲示先を編集');
  editor.dataset.discardLabel='変更を破棄して一覧に戻る';
  editor.innerHTML=`<div class="dialog-body"><h2>${row.id?'状況・メモを編集':'配布・掲示する施設を追加'}</h2>${row.id?`<p class="flyer-editor-name">${esc(row.name)}</p>`:''}<form><div class="editor-bar"><div class="form-actions"><button type="submit" class="primary">変更を保存する</button><button type="button" data-cancel class="secondary">一覧に戻る</button></div><p data-editor-status role="status" hidden></p></div><fieldset class="flyer-choices"><legend>状況（１つ選択）</legend>${statuses.map((status,i)=>`<label class="flyer-choice flyer-status" data-status="${i}"><input type="radio" name="status" value="${status}" ${(row.status||statuses[0])===status?'checked':''} required><span>${status}</span></label>`).join('')}</fieldset>${data.declineFields?`<label class="flyer-decline" data-decline-field><input type="checkbox" name="declined" ${row.declined?'checked':''}>過去または今回、お断りがあったため見送り</label>`:''}<label>自由メモ（任意・この公演のみ）<textarea name="memo" aria-label="自由メモ（任意）" maxlength="2000" rows="4"></textarea></label><details class="quick-help" ${row.id?'':'open'}><summary>施設名・地域・区分</summary><label>施設名<input name="name" required maxlength="120" value="${esc(row.name)}"></label>${data.sharedFacilities?(!row.id||row.facilityId?'<p class="muted">施設情報は他の公演にも反映されます。</p>':!row.source?'<p class="muted">この施設は共通化前です。管理者が一覧で共通化を確認できます。</p>':''):'<p class="muted">共通保存の更新までは、この公演に保存されます。</p>'}${editorChoice('region','地域',['銚子市','神栖市',...(data.regions||[]),...data.rows.map(item=>item.region)],row.region||region.value||'神栖市')}${editorChoice('category','区分',data.categories,row.category||category.value||'その他')}<button type="button" class="secondary" data-find-place>場所を探す</button><div data-place-results aria-live="polite"></div></details><details ${row.id&&!flyerLocation(row)?'open':''}><summary>住所・地図の位置</summary><button type="button" class="secondary" data-pick-place>地図上で位置を指定</button><div data-picker></div><label>住所<input name="address" maxlength="250" value="${esc(position?.address)}"></label><button type="button" class="secondary" data-search-address>住所を地図で確認</button> <button type="button" class="secondary" data-locate-address>完全一致する住所から座標を入れる</button><p data-address-result role="status"></p><label>地図URL<input name="mapUrl" type="url" maxlength="1000" value="${esc(position?.mapUrl)}"></label><p class="muted">住所や地図リンクだけも保存できます。ピンを表示するには、ピンの座標が入った地図URL、または緯度・経度を入力してください。</p><label>緯度<input name="lat" type="number" min="-90" max="90" step="any" value="${esc(position?.lat)}"></label><label>経度<input name="lng" type="number" min="-180" max="180" step="any" value="${esc(position?.lng)}"></label></details></form></div>`;
  const form=editor.querySelector('form'),cancel=form.querySelector('[data-cancel]');
  // Keep the common location task visible, before status and optional metadata.
  const facilityDetails=form.querySelector('.quick-help');
  const locationDetails=form.querySelector('[data-picker]').closest('details');
  const placeSection=document.createElement('section');
  placeSection.className='flyer-place-steps';
  placeSection.innerHTML='<p>施設名で検索 → この画面の地図で確認 → 登録</p>';
  placeSection.append(form.elements.name.closest('label'),form.elements.region.closest('div'),form.querySelector('[data-find-place]'),form.querySelector('[data-place-results]'));
  const pinStatus=document.createElement('p');pinStatus.setAttribute('role','status');
  placeSection.append(pinStatus);
  locationDetails.open=false;
  locationDetails.querySelector('summary').textContent='見つからないとき：住所・地図から指定';
  const coordinates=document.createElement('details');
  coordinates.innerHTML='<summary>詳細入力（地図URL・緯度・経度）</summary>';
  for(const name of ['mapUrl','lat','lng'])coordinates.append(form.elements[name].closest('label'));
  locationDetails.querySelector('.muted').remove();locationDetails.append(coordinates);
  placeSection.append(locationDetails);
  const googleButton=document.createElement('button');
  googleButton.type='button';googleButton.className='secondary';googleButton.textContent='Googleマップで探す';
  const linkInput=placeSection.querySelector('[name=mapUrl]');
  const linkLabel=linkInput.closest('label');
  linkLabel.firstChild.textContent='Googleマップの共有リンク（任意）';
  linkInput.placeholder='コピーしたリンクを貼り付け';
  const hint=document.createElement('p');hint.className='muted';
  hint.textContent='Googleマップの「共有」でリンクをコピーして、ここに貼り付けます。';
  const googleHelp=document.createElement('details');googleHelp.className='flyer-google-help';
  googleHelp.innerHTML='<summary>見つからないとき：Googleマップを使う</summary>';
  googleHelp.append(googleButton,linkLabel,hint);placeSection.append(googleHelp);
  const previewButton=document.createElement('button');
  previewButton.type='button';previewButton.className='secondary';previewButton.textContent='地図を開いて場所を指定';
  placeSection.insertBefore(previewButton,locationDetails);
  const preview=document.createElement('div');placeSection.insertBefore(preview,locationDetails);
  if(row.id&&!openPlace){
   const extra=document.createElement('details');extra.className='flyer-place-settings';
   extra.innerHTML='<summary>施設名・場所を変更</summary>';extra.append(placeSection);
   form.append(extra);
  }else{
   form.querySelector('.editor-bar').after(placeSection);
   const optional=document.createElement('details');optional.innerHTML='<summary>状況・メモも登録する（任意）</summary>';
   const fields=[form.querySelector('.flyer-choices'),form.querySelector('[data-decline-field]'),form.elements.memo.closest('label')].filter(Boolean);
   optional.append(...fields);form.append(optional);
   if(openPlace)editor.querySelector('h2').textContent='施設の場所を登録';
  }
  form.elements.memo.rows=2;
  facilityDetails.querySelector('summary').textContent='区分・施設の共有について';
  facilityDetails.open=false;
  const updatePinStatus=()=>{
   const hasPin=form.elements.lat.value!==''&&form.elements.lng.value!=='';
   pinStatus.textContent=hasPin?'✓ ピンの位置を選択済み。最後に保存してください。':form.elements.mapUrl.value.trim()?'リンクは保存できます。ピンは未設定です。「地図で確認・指定」で場所を押してください。':'場所は後からでも登録できます。';
  };
  form.elements.memo.value=row.memo||'';
  const declineField=form.querySelector('[data-decline-field]');
  const updateStatus=()=>{if(declineField){declineField.hidden=form.elements.status.value!=='今回は見送り';form.elements.declined.disabled=declineField.hidden}};
  form.addEventListener('change',updateStatus);updateStatus();
  const readRegion=wireChoice(form,'region'),readCategory=wireChoice(form,'category');
  const search=form.querySelector('[data-find-place]'),results=form.querySelector('[data-place-results]');
  const picker=form.querySelector('[data-picker]');
  let removePicker,positionChosen=false,candidateSelection;
  function usePlace(lat,lng,address,keepLink=false){
   candidateSelection=null;positionChosen=true;
   [form.elements.lat.value,form.elements.lng.value]=[lat,lng];
   if(!keepLink)form.elements.mapUrl.value='';
   if(address!==undefined)form.elements.address.value=address;
   updateAddressButton();updatePinStatus();
   form.dispatchEvent(new Event('input',{bubbles:true}));
  }
  search.textContent='施設名で場所を検索';search.className='primary';
  googleButton.onclick=()=>{
   const name=form.elements.name.value.trim();
   if(!name){results.textContent='施設名を入力してください。';form.elements.name.focus();return}
   window.open('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent([name,readRegion(),form.elements.address.value.trim()].filter(Boolean).join(' ')),'_blank','noopener,noreferrer');
  };
  const importLink=()=>{
   if(candidateSelection){candidateSelection=null;removePreview?.();removePreview=null;preview.replaceChildren()}
   try{
    const xy=positionFromUrl(form.elements.mapUrl.value.trim());
    if(xy){positionChosen=true;[form.elements.lat.value,form.elements.lng.value]=xy;results.textContent='リンクからピンの位置を読み取りました。地図で確認して保存してください。'}
    else if(form.elements.mapUrl.value.trim())results.textContent='このリンクからはピンの位置を読み取れません。リンクはそのまま保存できます。';
    if(!xy&&form.elements.mapUrl.value.trim()!==(position?.mapUrl||'')){form.elements.lat.value='';form.elements.lng.value='';positionChosen=false}
   }catch(error){results.textContent=error.message}
   const conflicts=flyerLinkConflicts({...row,location:{mapUrl:form.elements.mapUrl.value.trim()}},data.rows);
   if(conflicts.length)results.textContent=conflicts.join('・')+'と同じ地図リンクです。施設が合っているか確認してください。';
   updatePinStatus();
  };
  form.elements.mapUrl.addEventListener('input',importLink);
  form.elements.mapUrl.addEventListener('change',importLink);
  let removePreview;
  previewButton.onclick=async()=>{
   if(removePreview){removePreview();removePreview=null;preview.replaceChildren();return}
   previewButton.disabled=true;
   try{
    const {mountPlacePicker}=await import('./flyer-place-picker.js?v=20261124-ux1');
    const xy=form.elements.lat.value!==''&&form.elements.lng.value!==''?[Number(form.elements.lat.value),Number(form.elements.lng.value)]:null;
    removePreview=await mountPlacePicker(preview,xy,([lat,lng])=>{usePlace(lat,lng,undefined,true);results.textContent='ピンの位置を選びました。最後に保存してください。'});
   }catch{preview.textContent='地図を開けませんでした。リンクだけでも保存できます。'}
   finally{previewButton.disabled=false}
  };
  editor.addEventListener('close',()=>removePreview?.(),{once:true});
  form.elements.name.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();if(!search.disabled)search.click()}});
  search.onclick=async()=>{
   const name=form.elements.name.value.trim(),region=readRegion();
   if(!name||!region){results.textContent='施設名と地域を入力してください。';return}
   search.disabled=true;results.textContent='場所を探しています…';
   try{
    const {searchPlaces,showPlaceCandidates}=await import('./flyer-place-picker.js?v=20261124-ux1');
    const local=(await snapshotCatalog().catch(()=>[])).filter(item=>item.region===region&&normalize(item.name).includes(normalize(name))).flatMap(item=>{
     const location=flyerLocationInfo(item);return location?.lat===undefined?[]:[{name:item.name,...location}];
    });
    const candidates=local.length?local:await searchPlaces(name,region);
    if(!form.isConnected||name!==form.elements.name.value.trim()||region!==readRegion()){results.textContent='施設名または地域が変わりました。もう一度検索してください。';return}
    showPlaceCandidates(results,candidates,async candidate=>{
     if(name!==form.elements.name.value.trim()||region!==readRegion()){results.textContent='施設名または地域が変わりました。もう一度検索してください。';return}
     if(!row.id)form.elements.name.value=candidate.name;
     usePlace(candidate.lat,candidate.lng,candidate.address);
     candidateSelection={name:form.elements.name.value.trim(),region:readRegion()};
     results.textContent='「'+candidate.name+'」の場所を、この下の地図で確認してください。';
     removePreview?.();removePreview=null;preview.replaceChildren();
     try{
      const {mountPlacePicker}=await import('./flyer-place-picker.js?v=20261124-ux1');
      if(!form.isConnected||!candidateSelection)return;
      removePreview=await mountPlacePicker(preview,[candidate.lat,candidate.lng],([lat,lng])=>{
       if(!candidateSelection||candidateSelection.name!==form.elements.name.value.trim()||candidateSelection.region!==readRegion())return;
       const selection=candidateSelection;usePlace(lat,lng,candidate.address);candidateSelection=selection;form.requestSubmit();
      },{submitLabel:row.id?'この場所を保存する':'この場所で登録する'});
      preview.scrollIntoView?.({block:'nearest'});
     }catch{preview.textContent='確認用の地図を開けませんでした。住所を確認し、保存ボタンで登録できます。'}
    });
   }catch{results.textContent='検索できませんでした。「地図を開いて場所を指定」か、下のGoogleマップから場所を確認できます。'}
   finally{search.disabled=false}
  };
  const invalidateCandidate=()=>{
   if(!candidateSelection||candidateSelection.name===form.elements.name.value.trim()&&candidateSelection.region===readRegion())return;
   candidateSelection=null;positionChosen=false;form.elements.lat.value='';form.elements.lng.value='';form.elements.address.value='';
   removePreview?.();removePreview=null;preview.replaceChildren();results.textContent='施設名または地域が変わりました。もう一度検索してください。';updatePinStatus();
  };
  form.elements.name.addEventListener('input',invalidateCandidate);
  form.elements.region.addEventListener('change',invalidateCandidate);
  form.elements.regionNew.addEventListener('input',invalidateCandidate);
  const pickButton=form.querySelector('[data-pick-place]');
  pickButton.onclick=async()=>{
   if(removePicker){removePicker();removePicker=null;picker.replaceChildren();pickButton.textContent='地図上で位置を指定';return}
   picker.closest('details').open=true;
   pickButton.disabled=true;
   try{
    const {mountPlacePicker}=await import('./flyer-place-picker.js?v=20261124-ux1');
    const initial=form.elements.lat.value&&form.elements.lng.value?[Number(form.elements.lat.value),Number(form.elements.lng.value)]:null;
    removePicker=await mountPlacePicker(picker,initial,([lat,lng])=>{
     usePlace(lat,lng);picker.replaceChildren();removePicker?.();removePicker=null;pickButton.textContent='地図上で位置を指定';
     results.textContent='地図で指定した位置を入力しました。';
    });
    pickButton.textContent='地図を閉じる';
   }catch{picker.textContent='地図を開けませんでした。'}
   finally{pickButton.disabled=false}
  };
  const addressButton=form.querySelector('[data-search-address]');
  const locateButton=form.querySelector('[data-locate-address]'),addressResult=form.querySelector('[data-address-result]');
  let locating=false;
  const updateAddressButton=()=>{
   const hasAddress=!!form.elements.address.value.trim();
   addressButton.disabled=!hasAddress;locateButton.disabled=!hasAddress||locating;
  };
  locateButton.onclick=async()=>{
   const address=form.elements.address.value.trim();
   locating=true;updateAddressButton();addressResult.textContent='住所を確認しています…';
   try{
    const response=await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q='+encodeURIComponent(normalizeLocationAddress(address)),{referrerPolicy:'no-referrer'});
    if(!response.ok)throw Error();
    const candidate=exactAddressPosition(address,await response.json());
    if(!editor?.contains(form)||address!==form.elements.address.value.trim())return;
    if(candidate){
     usePlace(candidate[0],candidate[1]);
     addressResult.textContent='住所に一致する座標を入力しました。確認して保存してください。';
    }else addressResult.textContent='住所に完全一致する座標は見つかりませんでした。地図URLまたは緯度・経度を入力してください。';
   }catch{addressResult.textContent='住所を確認できませんでした。もう一度お試しください。'}
   finally{locating=false;updateAddressButton()}
  };
  form.elements.address.addEventListener('input',updateAddressButton);
  addressButton.onclick=()=>window.open('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(form.elements.address.value.trim()),'_blank','noopener,noreferrer');
  updateAddressButton();updatePinStatus();
  for(const name of ['lat','lng'])form.elements[name].addEventListener('input',()=>{positionChosen=true;updatePinStatus()});
  document.body.append(editor);
  editor.classList.add('flyer-editor');
  const saveLabel=row.id?'変更を保存する':'この施設を登録する';
  form.querySelector('button[type="submit"]').dataset.saveLabel=saveLabel;
  const footer=document.createElement('div');footer.className='editor-bar flyer-save-footer';
  footer.innerHTML=`<button type="submit" class="primary">${saveLabel}</button><p data-save-feedback role="status">入力後、このボタンで保存します。</p>`;
  form.append(footer);
  startEditor(editor,form);const unguard=guardEditor(editor);
  // Keep the form open while the confirmed save is outstanding.
  editor.addEventListener('cancel',event=>{if(busy){event.preventDefault();event.stopImmediatePropagation()}},{capture:true});
  cancel.onclick=()=>{if(!busy)leaveEditor(editor,()=>editor.close())};
  const current=editor;
  editor.addEventListener('close',()=>{removePicker?.();unguard();current.remove();if(editor===current)editor=null;if(refreshQueued)void refreshRead()},{once:true});
  form.onsubmit=async event=>{
   event.preventDefault();
   if(busy||!allowed())return;
   if(locating){editorState(form,'住所の確認が終わってから保存してください。');return}
   const {address,mapUrl,lat,lng,regionNew,categoryNew,...entry}=Object.fromEntries(new FormData(form));
   entry.region=readRegion();entry.category=readCategory();
   if(data.declineFields)entry.declined=entry.status==='今回は見送り'&&form.elements.declined.checked;
   const original=row.location;
   const changed=address.trim()!==(position?.address||'')||mapUrl.trim()!==(position?.mapUrl||'')||lat!==String(position?.lat??'')||lng!==String(position?.lng??'');
   if(changed){
    if(!data.locationFields){editorState(form,'位置情報を保存するには共通保存の更新が必要です。');return}
    try{
     if(Boolean(lat)!==Boolean(lng))throw Error('緯度と経度は両方入力してください。');
     const coordinatesChanged=lat!==String(position?.lat??'')||lng!==String(position?.lng??'');
     const addressChanged=address.trim()!==(position?.address||'');
     const manual=lat&&lng&&(!addressChanged||coordinatesChanged||positionChosen)?[Number(lat),Number(lng)]:null;
     const fromUrl=positionFromUrl(mapUrl.trim());
     const changedUrl=mapUrl.trim()!==(position?.mapUrl||'');
     const coordinates=positionChosen&&manual?manual:fromUrl&&changedUrl?fromUrl:manual||(!addressChanged?fromUrl:null);
     const location={address:address.trim(),mapUrl:mapUrl.trim(),...(coordinates?{lat:coordinates[0],lng:coordinates[1]}:{})};
     if(location.address||location.mapUrl||coordinates)entry.location=location;
     else if(original||position)entry.location=null;
    }catch(error){editorState(form,'位置情報を保存できませんでした。'+error.message);return}
   }
   busy=true;cancel.disabled=true;editorState(form,'保存中…',true);
   try{
    const next=await request('flyerSave',{id:row.id,revision:row.revision,sharedFacility:!!data.sharedFacilities,entry});
    if(!dialog.open)return;
    const saved=next.rows.find(item=>row.id?item.id===row.id:venueKey(item)===venueKey(entry));
    if(!saved)throw Error('保存結果に施設が見つかりません。一覧を更新して確認してください。');
    if('location' in entry){
     if(!saved||JSON.stringify(saved.location??null)!==JSON.stringify(entry.location)){
      data=next;
      throw Error('施設情報は保存されましたが、位置情報は保存されませんでした。共通保存の更新後に、位置情報を登録してください。');
     }
    }
    data=next;markRead();refreshQueued=false;editedId=saved?.id;finishEditor(current);current.close();
    if(editedId)rowMessages.set(editedId,{text:flyerLocation(saved)?'施設とピンを保存しました。':'施設を保存しました。ピンはまだ設定されていません。'});
    q('[data-search]').value='';q('[data-filter-status]').value='';region.value='';category.value='';
    redraw();message.textContent='保存しました：'+entry.name;
    rowNodes.get(editedId)?.node.scrollIntoView?.({block:'nearest'});
   }catch(error){
    if(current.open)editorState(form,'保存できませんでした。'+error.message+' 入力はそのままです。競合した場合は、入力を控えてから一覧を更新してください。');
   }finally{busy=false;cancel.disabled=false;if(dialog.open){redraw();if(refreshQueued&&!editor?.open)void refreshRead()}}
  };
  editor.showModal();
  if(openPlace)form.elements.name.focus();
  else if(!row.id)form.elements.name.focus();
 }
 q('[data-search]').oninput=redraw;
 q('[data-filter-status]').onchange=redraw;
 region.onchange=category.onchange=redraw;source.onchange=updateControls;
 q('[data-close-flyers]').onclick=()=>{if(!busy)dialog.close()};
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
 q('[data-refresh]').onclick=()=>void loadAllVenues();
 q('[data-add]').onclick=()=>edit();
 q('[data-migration-preview]').onclick=()=>previewFlyerMigration(q('[data-migration-plan]'),request,async()=>{
  data={...data,migrationRequired:false};redraw();
  if(!await run('flyerRead',{},'共通化しました。一覧を更新しました。'))message.textContent='共通化しました。一覧を更新できませんでした。「一覧を更新」で確認してください。';
 });
 q('[data-refused]').onclick=event=>{
  const button=event.target.closest('[data-restore-flyer]');
  if(!button||busy)return;
  const row=data.refused.find(item=>item.id===button.dataset.restoreFlyer&&item.eventId===button.dataset.from);
  if(row&&confirm(row.region+'の「'+row.name+'」を一覧に戻しますか。以前のお断り履歴は残ります。')){
   void run('flyerRestore',{id:row.id,from:row.eventId},row.name+'を一覧に戻しました。');
  }
 };
 async function loadAllVenues(){
  if(busy||!allowed())return;
  busy=true;updateControls();message.textContent='施設一覧を読み込み中…';
  try{
   data=await request('flyerRead');markRead();
   if(!dialog.open)return;
   redraw();
   if(!data.archived){
    const catalog=await snapshotCatalog();
    if(!Array.isArray(catalog))throw Error('施設一覧を読み込めませんでした。');
    const excluded=new Set([...(data.rows||[]),...(data.refused||[]).filter(row=>!row.restoredAt)].flatMap(row=>[venueKey(row),...(row.keys||[])]));
    const missing=catalog.filter(row=>!excluded.has(venueKey(row)));
    for(let i=0;i<missing.length;i+=50){
     if(!dialog.open||!allowed()||cloud.state.user?.uid!==identity)return;
     message.textContent='施設一覧を準備中…';
     data=await request('flyerImport',{entries:missing.slice(i,i+50)});
     if(!dialog.open)return;
     redraw();
    }
   }
   message.textContent='';
  }catch(error){if(dialog.open){redraw();message.textContent='施設一覧をすべて取得できませんでした。'+error.message+' 「一覧を更新」で再試行してください。登録済みの状況とメモは保持されます。'}}
  finally{busy=false;if(dialog.open){redraw();if(refreshQueued&&!editor?.open)void refreshRead()}}
 }
 q('[data-carry]').onclick=()=>run('flyerCarry',{from:source.value},'引き継ぎを確認しました。未登録の施設のみ追加しました。');
 q('[data-open-map]').onclick=()=>openMap();
 async function openMap(focusId){
  const host=q('[data-map-panel]'),button=q('[data-open-map]');
  if(mapOpening)return;
  if(mapView&&focusId){mapView.focus(focusId);return}
  if(mapView){mapView.destroy();mapView=null;host.hidden=true;button.textContent='地図で見る';return}
  mapOpening=true;host.hidden=false;host.textContent='地図を読み込み中…';
  try{
   const {mountFlyerMap}=await import('./flyer-map.js?v=20261124-ux1');
   if(!dialog.open)return;
   mapView=await mountFlyerMap(host,{
    edit:id=>{const row=data?.rows.find(row=>row.id===id);if(row)edit(row)},
    find:id=>{const row=data?.rows.find(row=>row.id===id);if(row)edit(row,true)}
   });
   if(!dialog.open){mapView.destroy();mapView=null;return}
   button.textContent='地図を閉じる';redraw();
   if(focusId)mapView.focus(focusId);
   else host.querySelector('.flyer-map-canvas').scrollIntoView({block:'center'});
  }catch{if(dialog.open)host.textContent='地図を読み込めませんでした。「地図で見る」で再試行できます。'}
  finally{mapOpening=false}
 };
 q('[data-list]').onclick=event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.focusPin){void openMap(button.dataset.focusPin);return}
  const id=button.dataset.editFlyer||button.dataset.findFlyer;
  const row=data?.rows.find(row=>row.id===id);
  if(!row)return;
  if(button.dataset.editFlyer||button.dataset.findFlyer)edit(row,!!button.dataset.findFlyer);
 };
 // Refresh only reads: returning to the app must never import or write data.
 async function refreshRead(){
  if(!dialog.open||!allowed())return;
  if(busy||editor?.open){refreshQueued=true;return}
  if(!refreshQueued&&Date.now()-lastRead<1000)return;
  refreshQueued=false;
  await run('flyerRead');
 }
 const onVisible=()=>{if(!document.hidden)void refreshRead()};
 document.addEventListener('visibilitychange',onVisible);
 window.addEventListener('focus',onVisible);
 window.addEventListener('pageshow',onVisible);
 const refreshTimer=setInterval(onVisible,60000);
 document.body.append(dialog);
 dialog.showModal();
 const stop=cloud.onState(()=>{if(!allowed()||cloud.state.user?.uid!==identity){editor?.close();dialog.close()}});
 dialog.addEventListener('close',()=>{stop();clearInterval(refreshTimer);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('focus',onVisible);window.removeEventListener('pageshow',onVisible);mapView?.destroy();editor?.close();dialog.remove()},{once:true});
 redraw();void loadAllVenues();
}
