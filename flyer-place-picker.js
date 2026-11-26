import {searchRegionalPlaces} from './regional-places.js?v=20261125-search1';
import {loadStyles} from './flyer-map.js?v=20261126-pin1';
import {map, tileLayer, circleMarker, marker, divIcon, control} from './vendor/leaflet/leaflet-src.esm.js';

const clean=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
const valid=xy=>Array.isArray(xy)&&xy.length===2&&xy.every(Number.isFinite)&&Math.abs(xy[1])<=90&&Math.abs(xy[0])<=180;
export function placeCandidates(features,name,region){
 return (features||[]).flatMap(feature=>{
  const {properties:p,geometry:g}=feature;
  const candidateName=clean(p?.name),requestedName=clean(name);
  const nameMatches=candidateName&&requestedName&&(candidateName.includes(requestedName)||(candidateName.length>=2&&requestedName.includes(candidateName)));
  if(!nameMatches||![p.city,p.district,p.county,p.locality].some(value=>clean(value)===clean(region))||!valid(g?.coordinates))return [];
  const address=[...new Set([p.state,p.city||p.county||region,p.district,p.locality,p.street,p.housenumber].filter(value=>typeof value==='string'&&value))].join('');
  return [{name:p.name,address,lat:g.coordinates[1],lng:g.coordinates[0]}];
 }).slice(0,6);
}
export async function searchPlaces(name,region){
 let localError;
 try{const rows=await searchRegionalPlaces(name,region);if(rows.length)return rows}catch(error){localError=error}
 const url=new URL('https://photon.komoot.io/api/');
 url.search=new URLSearchParams({q:name+' '+region,limit:12});
 const response=await fetch(url,{referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw localError||Error('検索先に接続できません。');
 return placeCandidates((await response.json()).features,name,region);
}
export function showPlaceCandidates(host,candidates,choose){
 host.replaceChildren();
 if(!candidates.length){host.textContent='候補が見つかりません。「地図を開いて場所を指定」か、下のGoogleマップから確認できます。';return}
 for(const candidate of candidates){
  const row=document.createElement('div');row.className='flyer-place-candidate';
  const title=document.createElement('strong');title.textContent=candidate.name;
  const address=document.createElement('p');address.textContent=candidate.address||candidate.region||'住所未収録：地図で場所を確認してください。';
  const info=document.createElement('p');info.className='muted';info.textContent=[candidate.cachedCopy?'前回保存した地域データ':null,candidate.category,candidate.datasetDate?'収録：'+candidate.datasetDate.slice(0,10):null,candidate.position==='representative'?'建物・敷地の代表位置：地図で確認':null].filter(Boolean).join(' ／ ');
  const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=candidate.registered?'登録済み・一覧で見る':'この施設を選ぶ';
  button.onclick=()=>choose(candidate);
  row.append(title,address,info,button);host.append(row);
 }
}
export async function mountPlacePicker(host,initial,choose,options={}){
 await loadStyles();
 if(!host.isConnected)return ()=>{};
 const canvas=document.createElement('div');canvas.className='flyer-map-canvas';canvas.setAttribute('aria-label','施設の位置を地図で指定');
 const feedback=document.createElement('p');feedback.textContent='地図を拡大し、施設の位置を押してください。';
 const submit=document.createElement('button');submit.type='button';submit.className='secondary';submit.textContent=options.submitLabel||'この位置を使う';submit.disabled=true;
 host.replaceChildren(feedback,canvas,...(options.readOnly||options.inline?[]:[submit]));
 const view=map(canvas,{scrollWheelZoom:false,maxZoom:21,zoomControl:false}).setView(initial||[35.85,140.72],initial?16:11);
 control.zoom({zoomInTitle:'拡大',zoomOutTitle:'縮小'}).addTo(view);
 const tileOptions={attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">地理院タイル</a> | © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',maxNativeZoom:18,maxZoom:21,referrerPolicy:'no-referrer'};
 const standard=tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',tileOptions).addTo(view);
 const aerial=tileLayer('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',tileOptions);
 let background=standard;
 const tileWarning=document.createElement('p');tileWarning.className='flyer-tile-warning';tileWarning.setAttribute('role','status');tileWarning.hidden=true;tileWarning.textContent='地図の背景を取得できませんでした。地図を閉じて開き直すと再試行できます。施設だけ先に登録しても構いません。';host.prepend(tileWarning);
 for(const layer of [standard,aerial]){
  layer.on('tileerror',()=>{if(layer===background&&tileWarning.hidden){tileWarning.hidden=false;tileWarning.scrollIntoView?.({block:'nearest'})}});
  layer.on('loading',()=>{if(layer===background)tileWarning.hidden=true});
 }
 const switchLayer=document.createElement('button');
 switchLayer.type='button';switchLayer.className='secondary';switchLayer.textContent='航空写真に切り替え';
 switchLayer.onclick=()=>{
  background.remove();tileWarning.hidden=true;
  background=background===standard?aerial:standard;
  background.addTo(view);
  switchLayer.textContent=background===aerial?'通常の地図に切り替え':'航空写真に切り替え';
 };
 host.insertBefore(switchLayer,canvas);
 let selected=initial,positionMarker;
 const pin=divIcon({className:'flyer-adjust-pin',iconSize:[44,44],iconAnchor:[22,36]});
 const placed=latlng=>{
  selected=[latlng.lat,latlng.lng];
  submit.disabled=false;feedback.textContent='ピンを移動しました。位置を確認して保存してください。';
  // Keep the pin's full touch target clear of the map controls and attribution.
  view.panInside(latlng,{paddingTopLeft:[60,60],paddingBottomRight:[24,60],animate:false});
  options.onMove?.(selected);
 };
 const setMarker=xy=>{
  if(positionMarker){positionMarker.setLatLng(xy);return}
  positionMarker=marker(xy,{icon:pin,draggable:!options.readOnly,keyboard:false,autoPan:false}).addTo(view);
  positionMarker.getElement().setAttribute('aria-label',options.readOnly?'施設のピン':'動かせる施設のピン');
  positionMarker.on('dragend',()=>placed(positionMarker.getLatLng()));
 };
 if(initial)setMarker(initial);
 if(initial){submit.disabled=!!options.requireMove;feedback.textContent='赤いピンを指で動かすか、正しい場所を押してください。拡大・縮小は＋／−で操作できます。'}
 const locate=document.createElement('button');locate.type='button';locate.className='secondary';locate.textContent='現在地の周辺を表示';
 if(!options.readOnly)host.insertBefore(locate,canvas);
 if(options.readOnly){feedback.textContent='この場所で登録します。違う場合だけ「場所を変更」を押してください。';canvas.setAttribute('aria-label','登録する施設の場所')}
 let active=true;
 locate.onclick=()=>{
  if(!navigator.geolocation){feedback.textContent='この端末では現在地を取得できません。';return}
  locate.disabled=true;
  navigator.geolocation.getCurrentPosition(({coords})=>{
   if(!active)return;
   view.setView([coords.latitude,coords.longitude],17);
   circleMarker([coords.latitude,coords.longitude],{radius:7,color:'#fff',weight:2,fillColor:'#075cc3',fillOpacity:1,interactive:false}).addTo(view);
   feedback.textContent='青い点が現在地です。施設の場所を押して赤いピンを置いてください。';locate.disabled=false;
  },()=>{if(active){feedback.textContent='現在地を取得できません。地図を動かして指定できます。';locate.disabled=false}},{timeout:10000,maximumAge:30000});
 };
 view.on('click',({latlng})=>{
  if(options.readOnly)return;
  setMarker([latlng.lat,latlng.lng]);
  placed(latlng);
 });
 submit.onclick=()=>choose(selected);
 return ()=>{active=false;view.remove()};
}
