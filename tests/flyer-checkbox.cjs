const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('node:assert/strict');
const clean=f=>fs.readFileSync(f,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const w=new JSDOM('<body></body>',{url:'https://example.test',runScripts:'outside-only'}).window;w.structuredClone=structuredClone;w.confirm=()=>true;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 let rows=[{id:'one',revision:2,name:'〇〇公民館',region:'神栖市',category:'公共施設',status:'依頼済み',memo:'受付に置いてもらう'}],fail=false,release,calls=[];
 w.cloud={state:{provider:'apps-script',role:'viewer',user:{uid:'member-one'}},onState(fn){fn(this.state);return()=>{}},async flyer(action,body){calls.push({action,body});if(action==='flyerSave'){await new Promise(r=>release=r);if(fail)throw Error('模擬保存失敗');assert.equal(body.revision,rows[0].revision);rows=[{...rows[0],...body.entry,revision:rows[0].revision+1}]}return structuredClone({rows,refused:[],categories:['公共施設'],sources:[],archived:false})}};
 w.eval(clean('editor-dialog.js')+'\n'+clean('flyer-venues.js')+'\nopenFlyerVenues({id:"event-one",title:"寄席"});');await tick();
 const panel=w.document.querySelector('.flyer-dialog'),checkbox=()=>panel.querySelector('[data-posted]');
 assert(!panel.querySelector('.flyer-tools').open);assert(!panel.querySelector('.flyer-row-details').open);assert.equal(checkbox().checked,false);assert.match(panel.textContent,/受付に置いてもらう/);
 checkbox().click();assert(checkbox().disabled);assert(panel.querySelector('[data-close-flyers]').disabled);assert.match(panel.querySelector('[data-message]').textContent,/保存中/);release();await tick();
 assert(checkbox().checked);assert(!checkbox().disabled);assert.match(panel.querySelector('[data-message]').textContent,/掲示済みで保存しました/);assert.equal(rows[0].memo,'受付に置いてもらう');assert.equal(calls.at(-1).body.entry.region,'神栖市');
 fail=true;checkbox().click();release();await tick();assert(checkbox().checked);assert(!checkbox().disabled);assert.match(panel.querySelector('[data-message]').textContent,/保存を確認できませんでした/);assert.equal(rows[0].status,'掲示済み');
 fail=false;checkbox().click();release();await tick();assert(!checkbox().checked);assert.equal(rows[0].status,'未依頼');assert.match(panel.querySelector('[data-message]').textContent,/未依頼で保存しました/);
 panel.querySelector('[data-edit-flyer]').click();assert(w.document.querySelector('[aria-label="掲示先を編集"]'));w.document.querySelector('[data-cancel]').click();assert(!w.document.querySelector('[aria-label="掲示先を編集"]'));
 panel.querySelector('[data-close-flyers]').click();assert(!w.document.querySelector('.flyer-dialog'));w.close();
 console.log('PASS simple flyer checkbox saves both ways with current revision, preserves memo, blocks repeat input, reverts unconfirmed display and retains editing');
})().catch(error=>{console.error(error);process.exitCode=1});
