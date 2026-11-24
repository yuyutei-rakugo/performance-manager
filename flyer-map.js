import {map, tileLayer, marker, divIcon, latLngBounds} from './vendor/leaflet/leaflet-src.esm.js';
import {flyerLocation} from './flyer-locations.js?v=20261124-map2';

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
export async function mountFlyerMap(host,actions){
 await loadStyles();
 host.innerHTML='<p class="flyer-map-legend"></p><div class="flyer-map-canvas" role="region" aria-label="掲示先の地図"></div><p data-map-count></p><p data-tile-warning role="status" hidden>地図の背景を取得できませんでした。ピンの情報は開けます。</p>';
 const legend=host.querySelector('.flyer-map-legend'),canvas=host.querySelector('.flyer-map-canvas');
 for(const [index,status] of statuses.entries()){
  const item=document.createElement('span');item.className='flyer-status';item.dataset.status=index;item.textContent=status;legend.append(item);
 }
 const view=map(canvas,{scrollWheelZoom:false,maxZoom:21}).setView([35.85,140.72],11);
 const background=tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',{
  attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">地理院タイル</a>',maxNativeZoom:18,maxZoom:21,referrerPolicy:'no-referrer'
 }).addTo(view);
 const warning=host.querySelector('[data-tile-warning]');
 background.on('loading',()=>{warning.hidden=true});
 background.on('tileerror',()=>{warning.hidden=false});
 const pins=new Map();
 let previousIds;
 function popup(row,archived,busy,result,neighbors){
  const content=document.createElement('div');
  const title=document.createElement('strong');title.textContent=row.name;
  const status=document.createElement('p');status.textContent=row.status;
  const memo=document.createElement('p');memo.className='memo';memo.textContent=row.memo||'';
  content.append(title,status,memo);
  if(!archived){
   const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='編集する';
   button.disabled=busy;button.onclick=()=>actions.edit(row.id);
   const label=document.createElement('label');label.textContent='状況を変更';
   const select=document.createElement('select');
   select.replaceChildren(...statuses.map(value=>new Option(value,value,false,value===row.status)));
   select.disabled=busy;select.onchange=()=>actions.change(row.id,select.value);
   label.append(select);content.append(label,button);
  }
  if(result){
   const feedback=document.createElement('p');feedback.setAttribute('role','status');feedback.textContent=result.text;
   if(result.retry){
    const retry=document.createElement('button');retry.type='button';retry.textContent='再試行';retry.disabled=busy;retry.onclick=()=>actions.retry(row.id);feedback.append(' ',retry);
   }
   content.append(feedback);
  }
  if(neighbors.length){
   const label=document.createElement('p');label.textContent='同じ場所にある施設';content.append(label);
   for(const neighbor of neighbors){
    const button=document.createElement('button');button.type='button';button.className='secondary';
    button.textContent=neighbor.name;button.onclick=()=>pins.get(neighbor.id)?.node.openPopup();content.append(button);
   }
  }
  return content;
 }
 return {
  focus(id){
   const pin=pins.get(id)?.node;
   if(!pin)return;
   view.setView(pin.getLatLng(),Math.max(view.getZoom(),17),{animate:false});pin.openPopup();
  },
  update(rows,archived,busy,messages){
   const located=rows.filter(flyerLocation),ids=new Set(located.map(row=>row.id));
   for(const [id,pin] of pins)if(!ids.has(id)){pin.node.remove();pins.delete(id)}
   const byCoordinate=new Map();
   for(const row of located){
    const key=String(flyerLocation(row));
    if(!byCoordinate.has(key))byCoordinate.set(key,[]);
    byCoordinate.get(key).push(row);
   }
   for(const row of located){
    const coordinate=flyerLocation(row);
    const neighbors=byCoordinate.get(String(coordinate)).filter(item=>item.id!==row.id);
    const signature=JSON.stringify([row.name,row.status,row.memo,coordinate,archived,busy,messages.get(row.id),neighbors.map(item=>[item.id,item.name])]);
    const current=pins.get(row.id);
    if(current?.signature===signature)continue;
    const index=statuses.indexOf(row.status);
    const icon=divIcon({className:'flyer-pin',html:'<span class="flyer-status" data-status="'+index+'"></span>',iconSize:[34,40],iconAnchor:[17,37],popupAnchor:[0,-31]});
    const label=row.name+' '+row.status;
    const node=current?.node||marker(coordinate,{icon,title:label,autoPanOnFocus:false}).addTo(view);
    const content=popup(row,archived,busy,messages.get(row.id),neighbors);
    if(current){
     if(String(current.coordinate)!==String(coordinate))node.setLatLng(coordinate);
     if(current.status!==row.status)node.setIcon(icon);
     node.setPopupContent(content);
    }else node.bindPopup(content,{maxWidth:205,maxHeight:165});
    const element=node.getElement();
    element.setAttribute('aria-label',label);element.title=label;
    // Pointer focus can scroll a clipped dialog between press and release.
    element.onmousedown=event=>{if(event.button===0)event.preventDefault()};
    element.onclick=event=>{event.stopPropagation();node.openPopup()};
    element.onkeydown=event=>{
     if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();node.openPopup()}
    };
    pins.set(row.id,{node,signature,coordinate,status:row.status});
   }
   const idsKey=JSON.stringify([...ids]);
   if(idsKey!==previousIds&&located.length)view.fitBounds(latLngBounds(located.map(flyerLocation)),{padding:[28,28],maxZoom:15,animate:false});
   previousIds=idsKey;
   host.querySelector('[data-map-count]').textContent='地図に表示 '+located.length+'件 ／ 位置未確認 '+(rows.length-located.length)+'件';
  },
  destroy(){view.remove();host.replaceChildren()}
 };
}
