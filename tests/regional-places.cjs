const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const source=fs.readFileSync('regional-places.js','utf8').replace(/export /g,'').replace(/import\.meta\.url/g,"'https://notebook.test/regional-places.js'");
const row=(id,name,extra={})=>({id:'node/'+id,name,aliases:[],address:'茨城県神栖市矢田部',lat:35.79,lng:140.76,category:'公共施設',position:'point',...extra});
const doc=(region,rows)=>({schemaVersion:1,region,license:'ODbL-1.0',sourceDate:'2026-06-01T00:00:00Z',rows});
const makeResources=kamisu=>{
 const cities={'神栖市':kamisu,'銚子市':doc('銚子市',[row(9,'銚子駅')])},files={'神栖市':'kamisu.json','銚子市':'choshi.json'},regions={};
 const texts={};for(const [region,d] of Object.entries(cities)){const text=JSON.stringify(d);texts[files[region]]=text;regions[region]={file:files[region],count:d.rows.length,sha256:crypto.createHash('sha256').update(text).digest('hex')}}
 texts['manifest.json']=JSON.stringify({schemaVersion:1,license:'ODbL-1.0',regions});return texts;
};
const initial=doc('神栖市',[row(1,'矢田部郵便局'),row(2,'ゆ〜ぽ〜とはさき',{aliases:['ユーポートはさき']}),row(3,'丸竹鮮魚店'),row(4,'マルトモ')]);
let resources=makeResources(initial),offline=false,cacheBroken=false,failCity=false;const cached=new Map(),calls=[];
function moduleInstance(){
 const context={URL,Response,Request,AbortSignal,TextEncoder,Uint8Array,crypto:crypto.webcrypto,console,
  caches:{async open(name){assert.equal(name,'yuyutei-public-place-catalog-v1');if(cacheBroken)throw Error('storage blocked');return {
   async match(url){return cached.get(typeof url==='string'?url:url.url)?.clone()},async put(url,response){assert(new URL(url).pathname.startsWith('/place-catalog/'));cached.set(url,response.clone())},async delete(url){cached.delete(typeof url==='string'?url:url.url)},async keys(){return [...cached.keys()].map(url=>new Request(url))}
  }}},async fetch(url){calls.push(url);if(offline)throw Error('offline');const name=new URL(url).pathname.split('/').pop();if(failCity&&name==='kamisu.json')throw Error('interrupted city update');return new Response(resources[name]||'',{status:resources[name]?200:404})}
 };
 vm.runInNewContext(source+'\nglobalThis.api={normalizePlaceName,validatePlaceCatalog,findRegionalPlaces,searchRegionalPlaces,refreshRegionalPlaces};',context);return context.api;
}
(async()=>{
 let api=moduleInstance();
 assert.equal(api.normalizePlaceName('ユーポート　はさき'),api.normalizePlaceName('ゆ〜ぽ〜と はさき'));
 assert.equal(api.findRegionalPlaces(initial,'郵便局')[0].name,'矢田部郵便局');
 assert.equal(api.findRegionalPlaces(initial,'ユーポート')[0].name,'ゆ〜ぽ〜とはさき');
 assert.equal(api.findRegionalPlaces(initial,'丸竹')[0].name,'丸竹鮮魚店');
 assert.equal(api.findRegionalPlaces(initial,'丸竹').some(r=>r.name==='マルトモ'),false);
 assert.equal(api.findRegionalPlaces(initial,'').length,0);
 const [a,b]=await Promise.all([api.searchRegionalPlaces('郵便局','神栖市'),api.searchRegionalPlaces('ユーポート','神栖市')]);assert.equal(a.length,1);assert.equal(b.length,1);
 assert.equal(calls.length,2,'one manifest and only the selected city; concurrent calls share reads');
 await api.searchRegionalPlaces('丸竹','神栖市');assert.equal(calls.length,2,'repeated searches reuse memory');
 assert(!calls.some(url=>url.includes('choshi.json')),'the other city is not downloaded');
 offline=true;api=moduleInstance();assert.equal((await api.searchRegionalPlaces('郵便局','神栖市')).length,1,'a later offline session uses the public disk cache');
 offline=false;resources=makeResources(doc('神栖市',[...initial.rows,row(5,'新しい施設')]));api.refreshRegionalPlaces();
 assert.equal((await api.searchRegionalPlaces('新しい施設','神栖市')).length,1,'explicit refresh gets a new revision');
 assert.equal([...cached.keys()].filter(k=>k.includes('kamisu.json')).length,1,'old public revisions do not accumulate');
 const cityKey=[...cached.keys()].find(k=>k.includes('kamisu.json')&&k.includes(JSON.parse(resources['manifest.json']).regions['神栖市'].sha256));
 cached.set(cityKey,new Response('{"bad":true}'));api=moduleInstance();assert.equal((await api.searchRegionalPlaces('新しい施設','神栖市')).length,1,'a corrupt cached catalog is replaced, never used');
 resources=makeResources(doc('神栖市',[...initial.rows,row(6,'次の更新'),row(7,'追加候補')]));failCity=true;api.refreshRegionalPlaces();
 assert.equal((await api.searchRegionalPlaces('郵便局','神栖市'))[0].cachedCopy,true,'an interrupted update retains a verified previous regional snapshot');
 failCity=false;
 assert.throws(()=>api.validatePlaceCatalog(doc('神栖市',[row(1,'壊れた位置',{lat:0})]),'神栖市'));
 assert.throws(()=>api.validatePlaceCatalog(doc('銚子市',initial.rows),'神栖市'));
 assert.throws(()=>api.validatePlaceCatalog(doc('神栖市',[row(1,'重複'),row(1,'重複')]),'神栖市'));
 cacheBroken=true;api=moduleInstance();assert.equal((await api.searchRegionalPlaces('郵便局','神栖市')).length,1,'cache denial does not block online search');
 const before=calls.length;assert.equal((await api.searchRegionalPlaces('施設','鹿嶋市')).length,0);assert.equal(calls.length,before);
 // Validate the shipped data, its release hashes, and the separation from the small flyer seed catalog.
 const manifest=JSON.parse(fs.readFileSync('place-catalog/manifest.json','utf8'));
 for(const [region,meta] of Object.entries(manifest.regions)){
  const raw=fs.readFileSync('place-catalog/'+meta.file),data=JSON.parse(raw);
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),meta.sha256);assert.equal(raw.length,meta.bytes);api.validatePlaceCatalog(data,region);assert.equal(data.rows.length,meta.count);
  assert(data.rows.length>100);assert(!data.rows.some(r=>'status' in r||'memo' in r||'pinHash' in r));
 }
 assert(JSON.parse(fs.readFileSync('flyer-candidates.json')).length<150,'regional search data must never become mass-imported flyer rows');
 console.log('PASS regional search, kana/alias matching, city isolation, concurrent/memory/disk caching, offline recovery, revision refresh, corruption/hash protection, shipped catalog integrity and member-data separation');
})().catch(error=>{console.error(error);process.exitCode=1});
