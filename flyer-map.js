import {map, tileLayer, circleMarker, marker, divIcon, latLngBounds} from './vendor/leaflet/leaflet-src.esm.js';
import {flyerLocation,flyerLocationInfo,flyerSearchUrl,approximateAddressPosition,normalizeLocationAddress} from './flyer-locations.js?v=20261127-integrated2';

const statuses=['未依頼','依頼済み','掲示済み','今回は見送り'];
let styles;
export function loadStyles(){
 if(styles)return styles;
 styles=new Promise((resolve,reject)=>{
  const link=document.createElement('link');
  link.rel='stylesheet';link.href='./vendor/leaflet/leaflet.css';
  const failed=()=>{clearTimeout(timer);styles=null;link.remove();reject(Error('地図のスタイルを読み込めませんでした。'))};
  const timer=setTimeout(failed,12000);
  link.onload=()=>{clearTimeout(timer);resolve()};
  link.onerror=failed;
  document.head.append(link);
 });
 return styles;
}
export async function mountFlyerMap(host,actions){
 await loadStyles();
 host.innerHTML='<p class="flyer-map-legend"></p><div class="flyer-map-actions"><button type="button" class="secondary" data-locate-me>現在地を表示</button> <button type="button" class="secondary" data-nearby hidden>近い順に見る</button></div><p data-location-result role="status"></p><details data-unlocated hidden><summary>ピンのない施設</summary><p>施設は登録済みです。場所を登録すると、この地図にピンが出ます。</p><ul></ul></details><div class="flyer-map-canvas" role="region" aria-label="掲示先の地図"></div><section data-pin-details class="flyer-pin-details" aria-label="選んだ施設" hidden></section><p data-map-count></p><div data-nearby-list hidden></div><p data-tile-warning role="status" hidden>地図の背景を取得できませんでした。ピンの情報は開けます。</p>';
 const legend=host.querySelector('.flyer-map-legend'),canvas=host.querySelector('.flyer-map-canvas');
 for(const [index,status] of statuses.entries()){
  const item=document.createElement('span');item.className='flyer-status';item.dataset.status=index;item.textContent=status;legend.append(item);
 }
 const approximateLabel=document.createElement('span');
 approximateLabel.className='flyer-approx-label';approximateLabel.textContent='輪郭のピンは概略位置';legend.append(approximateLabel);
 const view=map(canvas,{scrollWheelZoom:false,maxZoom:21}).setView([35.85,140.72],11);
 const background=tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',{
  attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">地理院タイル</a> | © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',maxNativeZoom:18,maxZoom:21,referrerPolicy:'no-referrer'
 }).addTo(view);
 const warning=host.querySelector('[data-tile-warning]');
 background.on('loading',()=>{warning.hidden=true});
 background.on('tileerror',()=>{warning.hidden=false});
 const pins=new Map(),details=host.querySelector('[data-pin-details]');
 const estimated=new Map(),automaticAttempts=new Set();
 let addressQueue=Promise.resolve();
 const nearbyList=host.querySelector('[data-nearby-list]'),nearbyButton=host.querySelector('[data-nearby]');
 const locateButton=host.querySelector('[data-locate-me]'),locationResult=host.querySelector('[data-location-result]');
 let previousIds,selected,active=true,userPosition,userMarker,lastUpdate;
 const addressKey=row=>JSON.stringify([row.region,flyerLocationInfo(row)?.address]);
 const position=row=>flyerLocation(row)||estimated.get(addressKey(row));
 const distanceText=pin=>{
  const meters=view.distance(userPosition,pin.coordinate);
  return (pin.approximate?'概略位置 · 距離の目安 ':'直線距離の目安 ')+(meters<1000?Math.round(meters)+' m':(meters/1000).toFixed(1)+' km');
 };
 function renderNearby(){
  if(nearbyList.hidden||!userPosition)return;
  const sorted=[...pins].sort((a,b)=>view.distance(userPosition,a[1].coordinate)-view.distance(userPosition,b[1].coordinate));
  const list=document.createElement('ol');
  for(const [id,pin] of sorted){
   const item=document.createElement('li'),button=document.createElement('button');
   button.type='button';button.textContent=pin.label+' ／ '+distanceText(pin);
   button.onclick=()=>show(id,true);
   item.append(button);list.append(item);
  }
  nearbyList.replaceChildren(sorted.length?list:'条件に合う施設がありません。');
 }
 nearbyButton.onclick=()=>{
  nearbyList.hidden=!nearbyList.hidden;nearbyButton.textContent=nearbyList.hidden?'近い順に見る':'近い順を閉じる';
  renderNearby();if(!nearbyList.hidden)nearbyList.scrollIntoView({block:'nearest'});
 };
 locateButton.onclick=()=>{
  if(!navigator.geolocation){locationResult.textContent='この端末では現在地を表示できません。';return}
  locateButton.disabled=true;locationResult.textContent='現在地を確認しています…';
  navigator.geolocation.getCurrentPosition(({coords})=>{
   if(!active)return;
   userPosition=[coords.latitude,coords.longitude];
   if(userMarker)userMarker.setLatLng(userPosition);
   else userMarker=circleMarker(userPosition,{radius:8,color:'#fff',weight:3,fillColor:'#075cc3',fillOpacity:1,interactive:false}).addTo(view);
   view.setView(userPosition,Math.max(view.getZoom(),15),{animate:false});
   locationResult.textContent='青い丸が現在地です。';locateButton.disabled=false;nearbyButton.hidden=false;
   renderNearby();if(selected)show(selected);
  },error=>{
   if(!active)return;
   locationResult.textContent=error.code===1?'位置情報の利用が許可されていません。地図はそのまま使えます。':'現在地を取得できませんでした。もう一度お試しください。';
   locateButton.disabled=false;
  },{timeout:10000,maximumAge:30000});
 };
 function showUnlocated(rows,archived,busy){
  const panel=host.querySelector('[data-unlocated]'),list=panel.querySelector('ul');
  const missing=rows.filter(row=>!position(row));
  const signature=JSON.stringify([archived,busy,missing.map(row=>[row.id,row.name,row.region,flyerLocationInfo(row)?.address,flyerLocationInfo(row)?.mapUrl])]);
  if(list.dataset.signature===signature)return;
  list.dataset.signature=signature;panel.hidden=!missing.length;
  panel.querySelector('summary').textContent='ピンのない施設（'+missing.length+'件）';
  // Keep the optional review list collapsed so the map remains visible.
  const items=missing.map(row=>{
   const item=document.createElement('li'),address=flyerLocationInfo(row)?.address;
   const search=document.createElement('a');
   search.href=flyerSearchUrl(row);search.textContent='Googleマップで探す';search.target='_blank';search.rel='noopener noreferrer';
   item.append(row.name+' ／ '+(address?'座標未登録':flyerLocationInfo(row)?.mapUrl?'地図リンクのみ・ピン未設定':'住所・座標未登録')+' ',search);
   if(!archived&&actions.find){
    const register=document.createElement('button');register.type='button';register.className='secondary';register.textContent='場所を登録';register.setAttribute('aria-label',row.name+'の場所を登録');register.disabled=busy;register.onclick=()=>actions.find(row.id);item.append(' ',register);
   }
   if(address){
    const button=document.createElement('button');button.type='button';button.textContent='住所から位置を探す';
    const feedback=document.createElement('span');feedback.setAttribute('role','status');
    button.onclick=async(automatic=false)=>{
     button.disabled=true;feedback.textContent='確認中…';
     try{
      const response=await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q='+encodeURIComponent(normalizeLocationAddress(address)),{referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error();
      const xy=approximateAddressPosition(address,row.region,await response.json());
      if(!active)return;
      if(xy){estimated.set(addressKey(row),xy);update(...lastUpdate);if(automatic!==true)focus(row.id)}
      else feedback.textContent='住所と一致する範囲を確認できませんでした。';
     }catch{if(active)feedback.textContent='検索できませんでした。もう一度お試しください。'}
     finally{button.disabled=false}
    };
    item.append(' ',button,' ',feedback);
    const key=addressKey(row);
    if(!automaticAttempts.has(key)){
     automaticAttempts.add(key);
     addressQueue=addressQueue.then(async()=>{
      if(active&&lastUpdate[0].some(item=>addressKey(item)===key)&&!position(row))await button.onclick(true);
     });
    }
   }
   return item;
  });
  list.replaceChildren(...items);
 }
 function show(id,scroll=false){
  selected=id;
  const pin=pins.get(id);
  details.hidden=!pin;
  if(pin){details.dataset.status=pin.statusIndex;details.replaceChildren(pin.content());}
  else details.replaceChildren();
  if(pin&&scroll)details.scrollIntoView({block:'nearest'});
 }
 function venueDetails(row,archived,busy,result,neighbors,approximate){
  const content=document.createElement('div');
  const title=document.createElement('strong');title.textContent=row.name;
  const status=document.createElement('span');status.className='flyer-badge';status.textContent=row.status;
  const memo=document.createElement('p');memo.className='memo';memo.textContent=row.memo||'';
  content.append(title,' ',status,memo);
  if(approximate){
   const notice=document.createElement('p');notice.textContent='概略位置（住所に基づく目安）';content.append(notice);
  }
  if(userPosition){
   const distance=document.createElement('p');distance.textContent=distanceText(pins.get(row.id));content.append(distance);
  }
  const search=document.createElement('a');
  search.href=flyerSearchUrl(row);search.textContent='Googleマップで探す';search.target='_blank';search.rel='noopener noreferrer';content.append(search);
  if(!archived){
   const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='状況を変更';
   button.disabled=busy;button.onclick=event=>{event.stopPropagation();actions.edit(row.id)};
   content.append(button);
  }
  if(result){
   const feedback=document.createElement('p');feedback.setAttribute('role','status');feedback.textContent=result.text;
   content.append(feedback);
  }
  if(neighbors.length){
   const label=document.createElement('p');label.textContent='同じ場所にある施設';content.append(label);
   for(const neighbor of neighbors){
    const button=document.createElement('button');button.type='button';button.className='secondary';
    button.textContent=neighbor.name;button.onclick=event=>{event.stopPropagation();show(neighbor.id,true)};content.append(button);
   }
  }
  return content;
 }
 function focus(id){
   const pin=pins.get(id)?.node;
   if(!pin)return;
   view.setView(pin.getLatLng(),Math.max(view.getZoom(),17),{animate:false});show(id,true);
 }
 function update(rows,archived,busy,messages){
   lastUpdate=[rows,archived,busy,messages];
   const located=rows.filter(position),ids=new Set(located.map(row=>row.id));
   for(const [id,pin] of pins)if(!ids.has(id)){pin.node.remove();pins.delete(id)}
   const byCoordinate=new Map();
   for(const row of located){
    const key=String(position(row));
    if(!byCoordinate.has(key))byCoordinate.set(key,[]);
    byCoordinate.get(key).push(row);
   }
   for(const row of located){
    const coordinate=position(row),approximate=!flyerLocation(row);
    const neighbors=byCoordinate.get(String(coordinate)).filter(item=>item.id!==row.id);
    const signature=JSON.stringify([row.name,row.status,row.memo,coordinate,approximate,archived,busy,messages.get(row.id),neighbors.map(item=>[item.id,item.name])]);
    const current=pins.get(row.id);
    if(current?.signature===signature)continue;
    const index=statuses.indexOf(row.status);
    const icon=divIcon({className:'flyer-pin'+(approximate?' flyer-pin-approx':''),html:'<span class="flyer-status" data-status="'+index+'"></span>',iconSize:[34,40],iconAnchor:[17,37],popupAnchor:[0,-31]});
    const label=row.name+' '+row.status+(approximate?' 概略位置':'');
    const node=current?.node||marker(coordinate,{icon,title:label,autoPanOnFocus:false}).addTo(view);
    if(current){
     if(String(current.coordinate)!==String(coordinate))node.setLatLng(coordinate);
     if(current.status!==row.status||current.approximate!==approximate)node.setIcon(icon);
    }
    const element=node.getElement();
    element.setAttribute('aria-label',label);element.title=label;
    // Pointer focus can scroll a clipped dialog between press and release.
    element.onmousedown=event=>{if(event.button===0)event.preventDefault()};
    element.onclick=event=>{event.stopPropagation();show(row.id,true)};
    element.onkeydown=event=>{
     if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();show(row.id,true)}
    };
    pins.set(row.id,{node,signature,coordinate,approximate,label,statusIndex:index,status:row.status,content:()=>venueDetails(row,archived,busy,messages.get(row.id),neighbors,approximate)});
    if(row.id===selected)show(selected);
   }
   if(selected&&!pins.has(selected))show(null);
   const idsKey=JSON.stringify([...ids]);
   if(!userPosition&&idsKey!==previousIds&&located.length)view.fitBounds(latLngBounds(located.map(position)),{padding:[28,28],maxZoom:15,animate:false});
   previousIds=idsKey;
   const approximateCount=located.filter(row=>!flyerLocation(row)).length;
   host.querySelector('[data-map-count]').textContent='表示対象 '+rows.length+'件 ／ 位置確認済み '+(located.length-approximateCount)+'件 ／ 概略位置 '+approximateCount+'件 ／ 表示位置なし '+(rows.length-located.length)+'件';
   showUnlocated(rows,archived,busy);renderNearby();
 }
 return {focus,update,destroy(){active=false;view.remove();host.replaceChildren()}
 };
}
