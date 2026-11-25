// Public search data only. Member records, PINs and flyer statuses never enter this cache.
const files={'神栖市':'kamisu.json','銚子市':'choshi.json'};
const cacheName='yuyutei-public-place-catalog-v1';
const originUrl=path=>new URL('./place-catalog/'+path,import.meta.url).href;
const documents=new Map();
let manifestPromise;
const compare=new Intl.Collator('ja',{numeric:true,sensitivity:'base'}).compare;
export const normalizePlaceName=value=>String(value||'').normalize('NFKC').toLowerCase()
 .replace(/[ァ-ヶ]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0x60)).replace(/[\s・･〜～ー‐－-]/g,'');
async function storage(){try{return await globalThis.caches?.open(cacheName)}catch{return undefined}}
const checkedManifest=data=>{
 if(data?.schemaVersion!==1||!data.regions||data.license!=='ODbL-1.0')throw Error('地域データの形式が異なります。');
 for(const [region,file] of Object.entries(files)){
  const item=data.regions[region];
  if(item?.file!==file||!Number.isInteger(item.count)||item.count<1||!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('地域データの一覧を確認できません。');
 }
 return data;
};
async function manifest(){
 if(!manifestPromise)manifestPromise=(async()=>{
  const cache=await storage(),url=originUrl('manifest.json');
  const saved=await cache?.match(url);
  if(globalThis.navigator?.onLine===false&&saved)return checkedManifest(await saved.json());
  try{
   const response=await fetch(url,{cache:'no-cache',signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw Error();
   const data=checkedManifest(await response.clone().json());
   try{await cache?.put(url,response)}catch{}
   return data;
  }catch{
   if(saved)return checkedManifest(await saved.json());
   throw Error('地域データを読み込めません。接続を確認して、もう一度検索してください。');
  }
 })().catch(error=>{manifestPromise=undefined;throw error});
 return manifestPromise;
}
export function validatePlaceCatalog(data,region){
 if(data?.schemaVersion!==1||data.region!==region||data.license!=='ODbL-1.0'||!Array.isArray(data.rows)||data.rows.length>25000)throw Error('地域データの形式が異なります。');
 const ids=new Set();
 for(const row of data.rows){
  if(typeof row.name!=='string'||!row.name.trim()||typeof row.id!=='string'||!/^(node|way|relation)\/\d+$/.test(row.id)||ids.has(row.id)||
   !Number.isFinite(row.lat)||!Number.isFinite(row.lng)||row.lat<35.65||row.lat>36.08||row.lng<140.4||row.lng>141.05||
   !Array.isArray(row.aliases)||!row.aliases.every(x=>typeof x==='string')||typeof row.address!=='string')throw Error('地域データの内容を確認できません。');
  ids.add(row.id);
 }
 return data;
}
async function catalog(region){
 const metadata=await manifest(),item=metadata.regions[region];
 const key=region+':'+item.sha256;
 if(!documents.has(key))documents.set(key,(async()=>{
  const cache=await storage(),url=originUrl(item.file)+'?rev='+item.sha256;
  const parse=async(response,expectedHash=item.sha256,expectedCount=item.count)=>{
   const text=await response.text();
   // Validate cached and downloaded content before it becomes a search candidate.
   if(globalThis.crypto?.subtle){
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
    if([...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')!==expectedHash)throw Error('地域データの更新内容を確認できません。');
   }
   const data=validatePlaceCatalog(JSON.parse(text),region);
   if(expectedCount!==null&&data.rows.length!==expectedCount)throw Error('地域データの件数が一致しません。');
   return data;
  };
  try{
   const saved=await cache?.match(url);
   if(saved){try{return await parse(saved)}catch{await cache?.delete(url)}}
  }catch{}
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error('地域データを読み込めません。');
   const data=await parse(response.clone());
   try{
    await cache?.put(url,response);
    // Replace old public revisions after the new data is verified and safely stored.
    for(const request of await cache?.keys?.()||[]){
     const old=new URL(request.url),current=new URL(url);
     if(old.origin===current.origin&&old.pathname===current.pathname&&old.href!==current.href)await cache.delete(request);
    }
   }catch{}
   return data;
  }catch(error){
   // An interrupted update must not make the previous valid regional snapshot unusable.
   for(const request of await cache?.keys?.()||[]){
    const old=new URL(request.url),current=new URL(url),hash=old.searchParams.get('rev');
    if(old.origin!==current.origin||old.pathname!==current.pathname||!/^[a-f0-9]{64}$/.test(hash||''))continue;
    try{return {...await parse(await cache.match(request),hash,null),cachedCopy:true}}catch{}
   }
   throw error;
  }
 })().catch(error=>{documents.delete(key);throw error}));
 return documents.get(key);
}
export function findRegionalPlaces(data,name,limit=12){
 const query=normalizePlaceName(name),words=String(name||'').trim().split(/[\s　]+/).map(normalizePlaceName).filter(Boolean);
 if(!query)return [];
 return data.rows.flatMap(row=>{
  const names=[row.name,...row.aliases].map(normalizePlaceName);
  const score=names.some(n=>n===query)?0:names.some(n=>n.startsWith(query))?1:names.some(n=>n.includes(query))?2:3;
  if(score===3&&!words.every(word=>names.some(n=>n.includes(word))))return [];
  return [{...row,region:data.region,datasetDate:data.sourceDate,cachedCopy:!!data.cachedCopy,score}];
 }).sort((a,b)=>a.score-b.score||compare(a.name,b.name)||compare(a.address,b.address)).slice(0,limit).map(({score,...row})=>row);
}
export async function searchRegionalPlaces(name,region){
 if(!Object.hasOwn(files,region))return [];
 return findRegionalPlaces(await catalog(region),name);
}
// Explicit refresh can pick up a new public catalog without clearing any member data.
export function refreshRegionalPlaces(){manifestPromise=undefined;documents.clear()}
