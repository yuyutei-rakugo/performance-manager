import {flyerLocation,flyerLocationInfo,positionFromUrl,exactAddressPosition} from './flyer-locations.js?v=20261124-map3';
import {startEditor,finishEditor,leaveEditor,guardEditor,editorState} from './editor-dialog.js?v=20261124-map3';
import {cloud} from './cloud.js?v=20261124-map3';

const statuses=['未依頼','依頼済み','掲示済み','今回は見送り'];
const compare=new Intl.Collator('ja',{numeric:true,sensitivity:'base'}).compare;
const orderName=row=>row.source?.name===row.name&&row.source.reading?row.source.reading:row.name;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const venueKey=row=>JSON.stringify([row.region,row.name].map(value=>value.normalize('NFKC').toLowerCase().replace(/\s+/g,'')));
const mapUrl=row=>/^https:\/\//.test(flyerLocationInfo(row)?.mapUrl)
 ?flyerLocationInfo(row).mapUrl:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(flyerLocation(row)?.join(',')||flyerLocationInfo(row)?.address||row.region+' '+row.name);
const options=(values,all)=>[new Option(all,''),...values.map(value=>new Option(value,value))];

let catalogPromise;

export function openFlyerVenues(event){
 const dialog=document.createElement('dialog');
 dialog.className='flyer-dialog';
 dialog.setAttribute('aria-label','チラシの掲示先');
 dialog.innerHTML='<div class="dialog-body"><div class="dialog-head"><h2>チラシの掲示先</h2><button type="button" data-close-flyers aria-label="閉じる">×</button></div><p></p><p class="muted">「状況を変更・メモ」を開いてチェック（自動保存）</p><div class="flyer-actions form-actions"><button type="button" class="secondary" data-open-map>地図で見る</button><button type="button" data-add>施設を追加</button><button type="button" data-refresh class="secondary">最新を取得</button></div><p data-message role="status"></p><div class="flyer-quick-filters"><label>施設名で検索<input type="search" data-search placeholder="施設名を入力"></label><label>状況<select data-filter-status><option value="">すべて</option><option>未依頼</option><option>依頼済み</option><option>掲示済み</option><option>今回は見送り</option></select></label></div><p data-count class="muted" role="status"></p><p data-position-count class="muted"></p><details class="flyer-tools"><summary>追加・絞り込み・引き継ぎ</summary><div class="record-filters flyer-filters"><label>地域<select data-region></select></label><label>区分<select data-category></select></label></div><div class="flyer-actions form-actions"><label>引き継ぎ元<select data-source></select></label><button type="button" data-carry>選んだ公演から引き継ぐ</button></div></details><section data-map-panel hidden></section><div data-list></div><details><summary>断られた施設の履歴</summary><ul data-refused></ul></details></div>';
 dialog.querySelector('.dialog-head + p').textContent=event.title;
 const q=selector=>dialog.querySelector(selector);
 const message=q('[data-message]'),source=q('[data-source]'),region=q('[data-region]'),category=q('[data-category]');
 const allowed=()=>cloud.state.provider==='apps-script'&&!!cloud.state.role;
 const identity=cloud.state.user?.uid;
 let data,busy=false,editor;
 const rowNodes=new Map(),groupNodes=new Map(),rowMessages=new Map();
 let mapView,mapOpening=false,refusedMarkup;
 const snapshotCatalog=()=>catalogPromise||(catalogPromise=fetch('./flyer-candidates.json?v=20261124-map3').then(response=>{if(!response.ok)throw Error('施設一覧を読み込めませんでした。');return response.json()}).catch(error=>{catalogPromise=null;throw error}));
 const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
 const request=(action,payload={})=>cloud.flyer(action,{eventId:event.id,...payload});
 function redraw(){
  const rows=data?.rows||[];
  const excluded=new Set((data?.refused||[]).flatMap(row=>[venueKey(row),...(row.keys||[])]));
  const visibleOnMap=row=>![venueKey(row),...(row.keys||[])].some(key=>excluded.has(key));
  const registered=rows.filter(visibleOnMap);
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
   const signature=JSON.stringify([row,!!data.archived,mapAllowed]);
   let cached=rowNodes.get(row.id);
   if(!cached||cached.signature!==signature){
    const template=document.createElement('template');
    template.innerHTML=`<article class="flyer-item" data-venue-id="${esc(row.id)}" data-status="${statuses.indexOf(row.status)}"><div class="flyer-heading"><span class="flyer-badge">${esc(row.status)}</span><h3>${esc(row.name)}${flyerLocation(row)?'':`<small class="flyer-unlocated" title="${esc(position?.reason||'緯度と経度が登録されていません。')}">位置未確認</small>`}</h3><a class="flyer-map" href="${esc(mapUrl(row))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(row.name)}をGoogleマップで検索">地図</a></div><details class="flyer-row-details" ${cached?.node.querySelector('.flyer-row-details').open?'open':''}><summary>状況を変更・メモ</summary>${mapAllowed&&flyerLocation(row)?`<button type="button" class="secondary" data-focus-pin="${esc(row.id)}">地図でこの施設を見る</button>`: ''}<fieldset class="flyer-choices"><legend>状況</legend>${statuses.map((status,i)=>`<label class="flyer-choice flyer-status ${row.status===status?'is-selected':''}" data-status="${i}"><input type="checkbox" data-status-choice="${esc(row.id)}" value="${esc(status)}" ${row.status===status?'checked':''}><span>${esc(status)}</span></label>`).join('')}</fieldset><p data-row-message role="status"></p><p class="flyer-meta">${esc(row.region)} ／ ${esc(row.category)}</p>${position?.address?`<p class="flyer-meta">${esc(position.address)}</p>`:''}${!flyerLocation(row)?`<p class="flyer-meta">${esc(position?.reason||'緯度と経度が登録されていません。')}</p>`:''}${row.memo?`<p class="memo">${esc(row.memo)}</p>`:''}${data.archived?'':`<button type="button" class="secondary" data-edit-flyer="${esc(row.id)}">編集する</button> <button type="button" class="secondary" data-refuse-flyer="${esc(row.id)}">断られたため一覧から外す</button>`}${row.source?`<p><a href="${esc(row.source.url)}" target="_blank" rel="noopener noreferrer">確認元</a> <time>${esc(row.source.date)}</time></p>`:''}</details></article>`;
    cached={signature,node:template.content.firstElementChild};rowNodes.set(row.id,cached);
   }
   // Restore the confirmed checkbox state after failed saves or a re-click.
   for(const input of cached.node.querySelectorAll('[data-status-choice]'))input.checked=input.value===row.status;
   const feedback=cached.node.querySelector('[data-row-message]'),result=rowMessages.get(row.id);
   if(feedback.dataset.text!==(result?.text||'')){
    feedback.dataset.text=result?.text||'';
    feedback.textContent=result?.text||'';
    if(result?.retry){
     const button=document.createElement('button');button.type='button';button.dataset.retryFlyer=row.id;button.textContent='再試行';feedback.append(' ',button);
    }
   }
   desired.push(cached.node);
  }
  const keep=new Set(desired);
  for(const node of [...list.children])if(!keep.has(node))node.remove();
  desired.forEach((node,index)=>{if(list.children[index]!==node)list.insertBefore(node,list.children[index]||null)});
  const ids=new Set(rows.map(row=>row.id));
  for(const id of rowNodes.keys())if(!ids.has(id)){rowNodes.delete(id);rowMessages.delete(id)}
  if(!desired.length&&data)list.innerHTML='<p>条件に合う掲示先はありません。</p>';
  q('[data-count]').textContent=data?match.length+'／'+rows.length+'施設':'';
  const refused=(data?.refused||[]).map(row=>`<li><strong>${esc(row.name)}</strong> ／ ${esc(row.eventTitle)} ／ ${esc(row.refusedOn)}${row.memo?`<p class="memo">${esc(row.memo)}</p>`:''}</li>`).join('')||'<li>履歴はありません。</li>';
  if(refused!==refusedMarkup){q('[data-refused]').innerHTML=refused;refusedMarkup=refused}
  mapView?.update(match.filter(visibleOnMap),!!data?.archived,busy,rowMessages);
  if(dialog.scrollTop!==scrollTop)dialog.scrollTop=scrollTop;
  updateControls();
 }
 function updateControls(){
  const available=allowed()&&data&&!data.archived&&!busy;
  q('[data-refresh]').disabled=busy||!allowed();
  for(const button of dialog.querySelectorAll('[data-add],[data-edit-flyer],[data-refuse-flyer],[data-status-choice],[data-retry-flyer]'))button.disabled=!available;
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
   data=next;redraw();message.textContent=success;return true;
  }catch(error){if(dialog.open){redraw();message.textContent=(action==='flyerRead'?'最新の情報を取得できませんでした。':'保存を確認できませんでした。')+error.message+' 「最新を取得」で確認してから、もう一度お試しください。'}return false;}
  finally{busy=false;if(dialog.open)redraw()}
 }
 function edit(row={}){
  if(busy||!data||data.archived||!allowed())return;
  const position=flyerLocationInfo(row);
  editor=document.createElement('dialog');
  editor.setAttribute('aria-label','掲示先を編集');
  editor.innerHTML=`<div class="dialog-body"><h2>${row.id?'掲示先を編集':'掲示先を追加'}</h2><form><div class="editor-bar"><div class="form-actions"><button type="submit" class="primary">変更を保存する</button><button type="button" data-cancel>キャンセル</button></div><p data-editor-status role="status" hidden></p></div><label>施設名<input name="name" required maxlength="120" value="${esc(row.name)}"></label><label>地域<input name="region" required maxlength="80" value="${esc(row.region||region.value||'神栖市')}"></label><label>区分<input name="category" list="flyer-category-options" required maxlength="80" value="${esc(row.category||category.value||'その他')}"></label><datalist id="flyer-category-options">${data.categories.map(value=>`<option value="${esc(value)}"></option>`).join('')}</datalist><label>状況<select name="status">${statuses.map(status=>`<option ${(row.status||statuses[0])===status?'selected':''}>${status}</option>`).join('')}</select></label><label>自由メモ（任意）<textarea name="memo" maxlength="2000" rows="4"></textarea></label><details ${row.id&&!flyerLocation(row)?'open':''}><summary>住所・地図の位置</summary><label>住所<input name="address" maxlength="250" value="${esc(position?.address)}"></label><button type="button" class="secondary" data-search-address>住所を地図で確認</button> <button type="button" class="secondary" data-locate-address>完全一致する住所から座標を入れる</button><p data-address-result role="status"></p><label>地図URL<input name="mapUrl" type="url" maxlength="1000" value="${esc(position?.mapUrl)}"></label><p class="muted">住所や地図リンクだけも保存できます。ピンを表示するには、ピンの座標が入った地図URL、または緯度・経度を入力してください。</p><label>緯度<input name="lat" type="number" min="-90" max="90" step="any" value="${esc(position?.lat)}"></label><label>経度<input name="lng" type="number" min="-180" max="180" step="any" value="${esc(position?.lng)}"></label></details></form></div>`;
  const form=editor.querySelector('form'),cancel=form.querySelector('[data-cancel]');
  form.elements.memo.value=row.memo||'';
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
    const response=await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q='+encodeURIComponent(address),{referrerPolicy:'no-referrer'});
    if(!response.ok)throw Error();
    const candidate=exactAddressPosition(address,await response.json());
    if(!editor?.contains(form)||address!==form.elements.address.value.trim())return;
    if(candidate){
     [form.elements.lat.value,form.elements.lng.value]=candidate;
     addressResult.textContent='住所に一致する座標を入力しました。確認して保存してください。';
    }else addressResult.textContent='住所に完全一致する座標は見つかりませんでした。地図URLまたは緯度・経度を入力してください。';
   }catch{addressResult.textContent='住所を確認できませんでした。もう一度お試しください。'}
   finally{locating=false;updateAddressButton()}
  };
  form.elements.address.addEventListener('input',updateAddressButton);
  addressButton.onclick=()=>window.open('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(form.elements.address.value.trim()),'_blank','noopener,noreferrer');
  updateAddressButton();
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
   if(locating){editorState(form,'住所の確認が終わってから保存してください。');return}
   const {address,mapUrl,lat,lng,...entry}=Object.fromEntries(new FormData(form));
   const original=row.location;
   const changed=address.trim()!==(position?.address||'')||mapUrl.trim()!==(position?.mapUrl||'')||lat!==String(position?.lat??'')||lng!==String(position?.lng??'');
   if(changed){
    if(!data.locationFields){editorState(form,'位置情報を保存するには共通保存の更新が必要です。');return}
    try{
     if(Boolean(lat)!==Boolean(lng))throw Error('緯度と経度は両方入力してください。');
     const coordinatesChanged=lat!==String(position?.lat??'')||lng!==String(position?.lng??'');
     const addressChanged=address.trim()!==(position?.address||'');
     const manual=lat&&lng&&(!addressChanged||coordinatesChanged)?[Number(lat),Number(lng)]:null;
     const fromUrl=positionFromUrl(mapUrl.trim());
     const changedUrl=mapUrl.trim()!==(position?.mapUrl||'');
     const coordinates=fromUrl&&changedUrl?fromUrl:manual||(!addressChanged?fromUrl:null);
     const location={address:address.trim(),mapUrl:mapUrl.trim(),...(coordinates?{lat:coordinates[0],lng:coordinates[1]}:{})};
     if(location.address||location.mapUrl||coordinates)entry.location=location;
     else if(original||position)entry.location=null;
    }catch(error){editorState(form,'位置情報を保存できませんでした。'+error.message);return}
   }
   busy=true;cancel.disabled=true;editorState(form,'保存中…',true);
   try{
    const next=await request('flyerSave',{id:row.id,revision:row.revision,entry});
    if(!dialog.open)return;
    if('location' in entry){
     const saved=next.rows.find(item=>row.id?item.id===row.id:venueKey(item)===venueKey(entry));
     if(!saved||JSON.stringify(saved.location??null)!==JSON.stringify(entry.location)){
      data=next;
      throw Error('施設情報は保存されましたが、位置情報は保存されませんでした。共通保存の更新後に、位置情報を登録してください。');
     }
    }
    data=next;finishEditor(current);current.close();redraw();message.textContent='掲示先を保存しました。';
   }catch(error){
    if(current.open)editorState(form,'保存できませんでした。'+error.message+' 入力はそのままです。競合した場合は、入力を控えてから一覧を更新してください。');
   }finally{busy=false;cancel.disabled=false;if(dialog.open)redraw()}
  };
  editor.showModal();
 }
 q('[data-search]').oninput=redraw;
 q('[data-filter-status]').onchange=redraw;
 region.onchange=category.onchange=redraw;source.onchange=updateControls;
 q('[data-close-flyers]').onclick=()=>{if(!busy)dialog.close()};
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault()});
 q('[data-refresh]').onclick=()=>void loadAllVenues();
 q('[data-add]').onclick=()=>edit();
 async function loadAllVenues(){
  if(busy||!allowed())return;
  busy=true;updateControls();message.textContent='施設一覧を読み込み中…';
  try{
   data=await request('flyerRead');
   if(!dialog.open)return;
   redraw();
   if(!data.archived){
    const catalog=await snapshotCatalog();
    if(!Array.isArray(catalog))throw Error('施設一覧を読み込めませんでした。');
    const excluded=new Set([...(data.rows||[]),...(data.refused||[])].flatMap(row=>[venueKey(row),...(row.keys||[])]));
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
  }catch(error){if(dialog.open){redraw();message.textContent='施設一覧をすべて取得できませんでした。'+error.message+' 「最新を取得」で再試行してください。登録済みの状況とメモは保持されます。'}}
  finally{busy=false;if(dialog.open)redraw()}
 }
 q('[data-carry]').onclick=()=>run('flyerCarry',{from:source.value},'引き継ぎを確認しました。未登録の施設のみ追加しました。');
 async function saveStatus(row,status){
  if(!row||busy||data.archived||!allowed()||row.status===status)return;
  busy=true;
  rowMessages.set(row.id,{text:'保存中…'});redraw();
  try{
   const entry={name:row.name,region:row.region,category:row.category,memo:row.memo,status};
   data=await request('flyerSave',{id:row.id,revision:row.revision,entry});
   rowMessages.set(row.id,{text:'保存しました。'});
  }catch(error){
   const conflict=/更新されました/.test(error.message);
   rowMessages.set(row.id,{text:'保存できませんでした。'+error.message,retry:{status,conflict}});
  }finally{busy=false;if(dialog.open)redraw()}
 }
 q('[data-list]').onchange=event=>{
  const input=event.target.closest('[data-status-choice]');if(!input)return;
  const row=data?.rows.find(row=>row.id===input.dataset.statusChoice);
  if(!input.checked||input.value===row?.status){redraw();return}
  void saveStatus(row,input.value);
 };
 q('[data-open-map]').onclick=()=>openMap();
 async function openMap(focusId){
  const host=q('[data-map-panel]'),button=q('[data-open-map]');
  if(mapOpening)return;
  if(mapView&&focusId){mapView.focus(focusId);return}
  if(mapView){mapView.destroy();mapView=null;host.hidden=true;button.textContent='地図で見る';return}
  mapOpening=true;host.hidden=false;host.textContent='地図を読み込み中…';
  try{
   const {mountFlyerMap}=await import('./flyer-map.js?v=20261124-map3');
   if(!dialog.open)return;
   mapView=await mountFlyerMap(host,{
    edit:id=>{const row=data?.rows.find(row=>row.id===id);if(row)edit(row)},
    change:(id,status)=>saveStatus(data?.rows.find(row=>row.id===id),status),
    retry:id=>retryStatus(id)
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
  const id=button.dataset.editFlyer||button.dataset.refuseFlyer||button.dataset.retryFlyer;
  const row=data?.rows.find(row=>row.id===id);
  if(!row)return;
  if(button.dataset.retryFlyer)retryStatus(id);
  else if(button.dataset.editFlyer)edit(row);
  else if(confirm('「'+row.name+'」を一覧から外して履歴に残しますか？ 今後の引き継ぎや候補取り込みでも追加されません。'))run('flyerRefuse',{id:row.id,revision:row.revision},'一覧から外し、履歴に残しました。');
 };
 function retryStatus(id){
   const row=data?.rows.find(row=>row.id===id);
   const retry=rowMessages.get(id)?.retry;
   if(retry?.conflict){
    rowMessages.set(id,{text:'最新の内容を確認してから、状況を選び直してください。'});
    void run('flyerRead');
   }else if(retry)void saveStatus(row,retry.status);
 }
 document.body.append(dialog);
 dialog.showModal();
 const stop=cloud.onState(()=>{if(!allowed()||cloud.state.user?.uid!==identity){editor?.close();dialog.close()}});
 dialog.addEventListener('close',()=>{stop();mapView?.destroy();editor?.close();dialog.remove()},{once:true});
 redraw();void loadAllVenues();
}
