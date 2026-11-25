import {searchRegionalPlaces} from './regional-places.js?v=20261125-search1';
import {loadStyles} from './flyer-map.js?v=20261125-link2';
import {map, tileLayer, circleMarker} from './vendor/leaflet/leaflet-src.esm.js';

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
 host.replaceChildren(feedback,canvas,...(options.readOnly?[]:[submit]));
 const view=map(canvas,{scrollWheelZoom:false,maxZoom:21}).setView(initial||[35.85,140.72],initial?16:11);
 const background=tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',{attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">地理院タイル</a> | © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',maxNativeZoom:18,maxZoom:21,referrerPolicy:'no-referrer'}).addTo(view);
 const tileWarning=document.createElement('p');tileWarning.className='flyer-tile-warning';tileWarning.setAttribute('role','status');tileWarning.hidden=true;tileWarning.textContent='地図の背景を取得できませんでした。地図を閉じて開き直すと再試行できます。施設だけ先に登録しても構いません。';host.prepend(tileWarning);
 background.on('tileerror',()=>{if(tileWarning.hidden){tileWarning.hidden=false;feedback.hidden=true;tileWarning.scrollIntoView?.({block:'nearest'})}});
 background.on('loading',()=>{tileWarning.hidden=true;feedback.hidden=false});
 let selected=initial,positionMarker=initial?circleMarker(initial,{radius:8,color:'#a92530',fillOpacity:1,interactive:false}).addTo(view):null;
 if(initial){submit.disabled=false;feedback.textContent='赤い点が登録する位置です。違う場合は地図を押して変更できます。'}
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
  selected=[latlng.lat,latlng.lng];
  if(positionMarker)positionMarker.setLatLng(selected);
  else positionMarker=circleMarker(selected,{radius:8,color:'#a92530',fillOpacity:1,interactive:false}).addTo(view);
  submit.disabled=false;feedback.textContent='ピンの位置を確認してください。';options.onMove?.(selected);
 });
 submit.onclick=()=>choose(selected);
 return ()=>{active=false;view.remove()};
}
