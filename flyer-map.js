import {map, tileLayer, marker, divIcon, latLngBounds} from './vendor/leaflet/leaflet-src.esm.js';
import {flyerLocation} from './flyer-locations.js?v=20261124-map1';

const statuses=['未依頼','依頼済み','掲示済み','今回は見送り'];
let styles;
function loadStyles(){
 if(styles)return styles;
 styles=new Promise((resolve,reject)=>{
  const link=document.createElement('link');
  link.rel='stylesheet';link.href='./vendor/leaflet/leaflet.css';
  link.onload=resolve;
  link.onerror=()=>{styles=null;link.remove();reject(Error('地図のスタイルを読み込めませんでした。'))};
  document.head.append(link);
 });
 return styles;
}
export async function mountFlyerMap(host,edit){
 await loadStyles();
 host.innerHTML='<p class="flyer-map-legend"></p><div class="flyer-map-canvas" role="region" aria-label="掲示先の地図"></div><p data-map-count></p><p data-tile-warning role="status" hidden>地図の背景を取得できませんでした。ピンの情報は開けます。</p>';
 const legend=host.querySelector('.flyer-map-legend'),canvas=host.querySelector('.flyer-map-canvas');
 for(const [index,status] of statuses.entries()){
  const item=document.createElement('span');item.className='flyer-status';item.dataset.status=index;item.textContent=(index+1)+' '+status;legend.append(item);
 }
 const view=map(canvas,{scrollWheelZoom:false}).setView([35.85,140.72],11);
 const background=tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',{
  attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">地理院タイル</a>',maxZoom:18,referrerPolicy:'no-referrer'
 }).addTo(view);
 const warning=host.querySelector('[data-tile-warning]');
 background.on('loading',()=>{warning.hidden=true});
 background.on('tileerror',()=>{warning.hidden=false});
 const pins=new Map();
 let previousIds;
 function popup(row,archived){
  const content=document.createElement('div');
  const title=document.createElement('strong');title.textContent=row.name;
  const status=document.createElement('p');status.textContent=row.status;
  const memo=document.createElement('p');memo.className='memo';memo.textContent=row.memo||'';
  content.append(title,status,memo);
  if(!archived){
   const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='編集する';
   button.onclick=()=>edit(row.id);content.append(button);
  }
  return content;
 }
 return {
  update(rows,archived){
   const located=rows.filter(flyerLocation),ids=new Set(located.map(row=>row.id));
   for(const [id,pin] of pins)if(!ids.has(id)){pin.node.remove();pins.delete(id)}
   for(const row of located){
    const coordinate=flyerLocation(row);
    const signature=JSON.stringify([row.name,row.status,row.memo,archived]);
    const current=pins.get(row.id);
    if(current?.signature===signature)continue;
    const index=statuses.indexOf(row.status);
    const icon=divIcon({className:'flyer-pin',html:'<span class="flyer-status" data-status="'+index+'">'+(index+1)+'</span>',iconSize:[44,44],iconAnchor:[22,22]});
    const label=row.name+' '+row.status;
    const node=current?.node||marker(coordinate,{icon,title:label}).addTo(view);
    if(current){node.setLatLng(coordinate);node.setIcon(icon);node.setPopupContent(popup(row,archived))}
    else node.bindPopup(popup(row,archived));
    node.getElement()?.setAttribute('aria-label',label);
    pins.set(row.id,{node,signature});
   }
   const idsKey=JSON.stringify([...ids]);
   if(idsKey!==previousIds&&located.length)view.fitBounds(latLngBounds(located.map(flyerLocation)),{padding:[28,28],maxZoom:15});
   previousIds=idsKey;
   host.querySelector('[data-map-count]').textContent='地図に表示 '+located.length+'件 ／ 位置未確認 '+(rows.length-located.length)+'件';
  },
  destroy(){view.remove();host.replaceChildren()}
 };
}
