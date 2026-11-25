import {normalizeLocationAddress,verifiedLocationReferences} from './flyer-locations.js?v=20261125-link3';

const nameKey=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/(?:株式会社|有限会社|（株）|\(株\)|\s)/g,'');
const hasParcel=address=>/\d/.test(address.slice(-16))&&/\d$/.test(address);
const valid=(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180;
const closeTo=(a,b)=>Math.abs(a.lat-b.lat)<.00005&&Math.abs(a.lng-b.lng)<.00005;

export function addressCandidates(features,address){
 const target=normalizeLocationAddress(address);
 if(!target||!hasParcel(target))return [];
 return (Array.isArray(features)?features:[]).flatMap(feature=>{
  const label=feature.properties?.title;
  const key=normalizeLocationAddress(label);
  const [lng,lat]=feature.geometry?.coordinates||[];
  if(!valid(lat,lng)||!key)return [];
  if(key===target)return [{lat,lng,address:label,quality:'address',source:'国土地理院'}];
  // Only a numeric prefix of the same address may be offered as a rough starting point.
  if(/\d$/.test(key)&&target.startsWith(key+'-'))return [{lat,lng,address:label,quality:'approximate',source:'国土地理院'}];
  return [];
 });
}

export function facilityCandidates(features,{name,address,region}){
 const sought=nameKey(name),target=normalizeLocationAddress(address);
 if(!sought||!target||!hasParcel(target))return [];
 return (Array.isArray(features)?features:[]).flatMap(feature=>{
  const p=feature.properties||{};
  const [lng,lat]=feature.geometry?.coordinates||[];
  const locality=p.city||p.county||p.locality;
  if(nameKey(p.name)!==sought||!valid(lat,lng)||!locality||!p.street||!p.housenumber)return [];
  if(region&&!target.includes(locality)&&region!==locality)return [];
  const full=[p.state,locality,p.district,p.street,p.housenumber].filter(Boolean);
  const unique=[...new Set(full)];
  const joined=unique.join('');
  const addressKey=normalizeLocationAddress(joined);
  const localKey=normalizeLocationAddress(locality);
  const exact=addressKey===target||(localKey&&target.includes(localKey)&&addressKey.includes(localKey)&&target.slice(target.indexOf(localKey))===addressKey.slice(addressKey.indexOf(localKey)));
  return exact?[{name:p.name,lat,lng,address:joined,quality:'facility',source:'OpenStreetMap'}]:[];
 });
}

export async function resolveFlyerLinkPosition(place,{region,known,signal}={}){
 if(valid(place.lat,place.lng))return [{...place,quality:'link',source:'共有リンク'}];
 const address=place.address?.trim()||'';
 const normalize=normalizeLocationAddress(address);
 const collected=[];
 let failed=false;
 const read=async url=>{
  try{
   const timeout=AbortSignal.timeout(5000);
   const response=await fetch(url,{referrerPolicy:'no-referrer',signal:signal?AbortSignal.any([signal,timeout]):timeout});
   if(!response.ok)throw Error('検索に失敗しました。');
   return await response.json();
  }catch(error){if(signal?.aborted)throw error;failed=true;return null}
 };
 for(const query of [...new Set([address,normalize].filter(Boolean))]){
  const url='https://msearch.gsi.go.jp/address-search/AddressSearch?q='+encodeURIComponent(query);
  const matches=addressCandidates(await read(url),address);
  collected.push(...matches);
  if(matches.some(candidate=>candidate.quality==='address'))break;
 }
 if(place.name&&address){
  const url=new URL('https://photon.komoot.io/api/');
  url.search=new URLSearchParams({q:place.name+' '+normalize,limit:6});
  const response=await read(url);
  collected.push(...facilityCandidates(response?.features,{...place,region}));
 }
 if(known&&valid(known.lat,known.lng)&&(!address||normalizeLocationAddress(known.address)===normalize)){
  collected.push({...known,quality:'facility',source:'確認済みの施設資料'});
 }
 for(const reference of verifiedLocationReferences(place.name,address)){
  collected.push({...reference,quality:'facility',source:'確認済みの施設資料'});
 }
 const ordered=collected.sort((a,b)=>Number(a.quality==='approximate')-Number(b.quality==='approximate'));
 const distinct=[];
 for(const entry of ordered)if(!distinct.some(candidate=>closeTo(candidate,entry)))distinct.push(entry);
 const precise=distinct.filter(candidate=>candidate.quality!=='approximate');
 if(precise.length)return precise;
 if(!distinct.length&&failed)throw Error('位置の検索先につながりませんでした。時間をおいて再試行してください。');
 return distinct;
}
