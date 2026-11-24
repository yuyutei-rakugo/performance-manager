import {loadStyles} from './flyer-map.js?v=20261124-ux1';
import {map, tileLayer, circleMarker} from './vendor/leaflet/leaflet-src.esm.js';

const query=text=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(text);
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
 const url=new URL('https://photon.komoot.io/api/');
 url.search=new URLSearchParams({q:name+' '+region,limit:12});
 const response=await fetch(url,{referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('検索先に接続できません。');
 return placeCandidates((await response.json()).features,name,region);
}
export function showPlaceCandidates(host,candidates,choose){
 host.replaceChildren();
 if(!candidates.length){host.textContent='候補が見つかりません。住所・地図URL・地図上の位置指定も使えます。';return}
 for(const candidate of candidates){
  const row=document.createElement('div');row.className='flyer-place-candidate';
  const title=document.createElement('strong');title.textContent=candidate.name;
  const address=document.createElement('p');address.textContent=candidate.address;
  const link=document.createElement('a');link.href=query(candidate.lat+','+candidate.lng);link.rel='noopener noreferrer';link.target='_blank';link.textContent='候補を地図で確認';
  const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='この場所で登録';
  button.onclick=()=>choose(candidate);
  row.append(title,address,link,' ',button);host.append(row);
 }
}
export async function mountPlacePicker(host,initial,choose){
 await loadStyles();
 if(!host.isConnected)return ()=>{};
 const canvas=document.createElement('div');canvas.className='flyer-map-canvas';canvas.setAttribute('aria-label','施設の位置を地図で指定');
 const feedback=document.createElement('p');feedback.textContent='地図を拡大し、施設の位置を押してください。';
 const submit=document.createElement('button');submit.type='button';submit.className='secondary';submit.textContent='この位置を使う';submit.disabled=true;
 host.replaceChildren(feedback,canvas,submit);
 const view=map(canvas,{scrollWheelZoom:false,maxZoom:21}).setView(initial||[35.85,140.72],initial?16:11);
 tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',{attribution:'地理院タイル',maxNativeZoom:18,maxZoom:21,referrerPolicy:'no-referrer'}).addTo(view);
 let positionMarker,selected;
 view.on('click',({latlng})=>{
  selected=[latlng.lat,latlng.lng];
  if(positionMarker)positionMarker.setLatLng(selected);
  else positionMarker=circleMarker(selected,{radius:8,color:'#a92530',fillOpacity:1,interactive:false}).addTo(view);
  submit.disabled=false;feedback.textContent='ピンの位置を確認してください。';
 });
 submit.onclick=()=>choose(selected);
 return ()=>view.remove();
}
