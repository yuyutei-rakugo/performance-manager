const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
const clean=f=>fs.readFileSync(f,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const w=new JSDOM('<body></body>',{url:'https://example.test',runScripts:'outside-only'}).window;w.structuredClone=structuredClone;w.confirm=()=>true;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 let rows=[{id:'one',revision:2,name:'〇〇公民館',region:'神栖市',category:'公共施設',status:'依頼済み',memo:'受付に置いてもらう'}],fail=false,release,calls=[];
 w.cloud={state:{provider:'apps-script',role:'viewer',user:{uid:'member-one'}},onState(fn){fn(this.state);return()=>{}},async flyer(action,body){calls.push({action,body});if(action==='flyerSave'){await new Promise(r=>release=r);if(fail)throw Error('模擬保存失敗');assert.equal(body.revision,rows[0].revision);rows=[{...rows[0],...body.entry,revision:rows[0].revision+1}]}if(action==='flyerImport'){if(fail)throw Error('模擬追加失敗');rows.push(...body.entries.map((row,i)=>({...row,id:'added-'+i,revision:1,status:'未依頼',memo:''})))}return structuredClone({rows,refused:[{name:'断られた店',region:'神栖市',keys:[]}],categories:['公共施設'],sources:[],archived:false})}};
 w.eval(clean('editor-dialog.js')+'\n'+clean('flyer-venues.js')+'\nopenFlyerVenues({id:"event-one",title:"寄席"});');await tick();
 const panel=w.document.querySelector('.flyer-dialog'),checkbox=(status='掲示済み')=>[...panel.querySelectorAll('[data-status-choice]')].find(input=>input.value===status);
 assert(!panel.querySelector('.flyer-tools').open);assert(!panel.querySelector('.flyer-row-details').open);assert.equal(checkbox().checked,false);assert.match(panel.textContent,/受付に置いてもらう/);
 checkbox().click();assert(checkbox().disabled);assert(panel.querySelector('[data-close-flyers]').disabled);assert.match(panel.querySelector('[data-message]').textContent,/保存中/);release();await tick();
 assert(checkbox().checked);assert(!checkbox().disabled);assert.match(panel.querySelector('[data-message]').textContent,/掲示済みで保存しました/);assert.equal(rows[0].memo,'受付に置いてもらう');assert.equal(calls.at(-1).body.entry.region,'神栖市');
 fail=true;checkbox('未依頼').click();release();await tick();assert(checkbox().checked);assert(!checkbox().disabled);assert.match(panel.querySelector('[data-message]').textContent,/保存を確認できませんでした/);assert.equal(rows[0].status,'掲示済み');
 fail=false;checkbox('未依頼').click();release();await tick();assert(!checkbox().checked);assert.equal(rows[0].status,'未依頼');assert.match(panel.querySelector('[data-message]').textContent,/未依頼で保存しました/);
 for(const status of ['依頼済み','今回は見送り','掲示済み']){checkbox(status).click();release();await tick();assert.equal(rows[0].status,status);assert.equal(panel.querySelectorAll('[data-status-choice]:checked').length,1)}
 const count=calls.length;checkbox().click();await tick();assert(checkbox().checked);assert.equal(calls.length,count);
 panel.querySelector('[data-edit-flyer]').click();assert(w.document.querySelector('[aria-label="掲示先を編集"]'));w.document.querySelector('[data-cancel]').click();assert(!w.document.querySelector('[aria-label="掲示先を編集"]'));
 const catalog=JSON.parse(fs.readFileSync('flyer-candidates.json','utf8'));
 assert(catalog.length>50);assert(catalog.some(r=>r.category==='コンビニ'));assert(catalog.some(r=>r.category==='公共施設'));assert(catalog.some(r=>r.category==='スーパー・商店'));
 const key=r=>JSON.stringify([r.region,r.name].map(v=>v.normalize('NFKC').toLowerCase().replace(/\s+/g,'')));
 assert.equal(new Set(catalog.map(key)).size,catalog.length);for(const row of catalog){assert(new URL(row.url).protocol==='https:');assert(row.reading);assert.equal(row.date,'2026-11-23')}
 w.fetch=async()=>({ok:true,json:async()=>[rows[0],{name:'断られた店',region:'神栖市',category:'スーパー・商店'},...Array.from({length:52},(_,i)=>({name:'候補'+i,region:i%2?'銚子市':'神栖市',category:i%2?'コンビニ':'公共施設',url:'https://example.test/source',date:'2026-11-23',reading:String(i)}))]});
 panel.querySelector('[data-import]').click();await tick();
 let picker=w.document.querySelector('[aria-label="施設候補から選ぶ"]');assert(picker);assert.equal(picker.querySelectorAll('[data-candidate]').length,52);assert(picker.querySelector('[data-save-candidates]').disabled);
 picker.querySelector('[data-candidate]').click();
 const filter=picker.querySelector('[data-candidate-region]');filter.value='銚子市';filter.dispatchEvent(new w.Event('change'));assert.match(picker.querySelector('[data-save-candidates]').textContent,/1件/);
 filter.value='';filter.dispatchEvent(new w.Event('change'));assert.equal(picker.querySelectorAll('[data-candidate]:checked').length,1);
 for(const input of picker.querySelectorAll('[data-candidate]'))if(!input.checked)input.click();assert(picker.querySelector('[data-save-candidates]').disabled);assert.match(picker.textContent,/50件まで/);
 for(const input of picker.querySelectorAll('[data-candidate]:checked'))input.click();picker.querySelector('[data-candidate]').click();
 fail=true;picker.querySelector('[data-save-candidates]').click();await tick();assert(picker.open);assert.equal(picker.querySelectorAll('[data-candidate]:checked').length,1);assert.match(picker.querySelector('[data-candidate-message]').textContent,/追加を確認できません/);
 fail=false;picker.querySelector('[data-save-candidates]').click();await tick();assert(!w.document.querySelector('[aria-label="施設候補から選ぶ"]'));assert.equal(calls.at(-1).action,'flyerImport');assert.equal(calls.at(-1).body.entries.length,1);assert.equal(rows.at(-1).status,'未依頼');
 panel.querySelector('[data-close-flyers]').click();assert(!w.document.querySelector('.flyer-dialog'));w.close();
 console.log('PASS simple flyer checkbox saves both ways with current revision, preserves memo, blocks repeat input, reverts unconfirmed display and retains editing');
})().catch(error=>{console.error(error);process.exitCode=1});
