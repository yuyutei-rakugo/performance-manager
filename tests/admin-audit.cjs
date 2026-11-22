const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const w=new JSDOM(fs.readFileSync('admin.html','utf8'),{url:'https://example.test',runScripts:'outside-only'}).window;
const q=selector=>w.document.querySelector(selector);
const clean=file=>fs.readFileSync(file,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const source={id:'audit-event',date:'2020-06-01',title:'試験公演',venue:'会場',time:'14:00',performers:[]};
const record={id:'old',date:'2020-06-01',kind:'その他公演',occasion:'記録',note:'原記録',pieces:{}};
let events={items:[source],revision:1},failRefresh=false,archived,migration,releaseRoster;
w.structuredClone=structuredClone;
w.confirm=()=>true;
w.mountAccount=()=>{};
w.startCloud=()=>{};
w.fetch=async()=>({ok:true,json:async()=>({records:[record]})});
w.HTMLDialogElement.prototype.close=function(){this.open=false};
w.cloud={
 state:{configured:true,ready:true,user:{},provider:'apps-script',role:'admin',stageName:'管理者',owner:true},
 onState(fn){fn(this.state)},
 async readShared(name){
  if(failRefresh)throw Error('模擬一覧更新失敗');
  return name==='events'?events:{items:[],revision:0};
 },
 async members(){return []},
 roster:()=>new Promise(resolve=>{releaseRoster=resolve}),
 async archivePast(data){
  archived=data;
  if(data.revisions.events!==events.revision)throw Error('予定が更新されています。');
  failRefresh=true;
  return {count:1};
 },
 async importLocal(data){migration=data;failRefresh=true}
};
(async()=>{
 w.eval(clean('record-transfer.js')+'\n'+clean('admin.js'));
 await tick();
 assert(q('#member-form').hidden);w.HTMLElement.prototype.scrollIntoView=function(){};q('#new-member').click();assert(!q('#member-form').hidden);q('#member-form').elements.name.value='未保存';q('#member-form').dispatchEvent(new w.Event('input',{bubbles:true}));assert.match(q('#member-result').textContent,/未保存/);q('#cancel-member').click();assert(q('#member-form').hidden);
 let finishMember;w.cloud.memberSave=()=>new Promise(resolve=>finishMember=resolve);q('#new-member').click();q('#member-form').elements.name.value='試験会員';const memberSave=q('#member-form').onsubmit({preventDefault(){},target:q('#member-form')});assert([...q('#member-form').children].filter(el=>!el.classList.contains('editor-bar')).every(el=>el.inert));finishMember();await memberSave;assert(q('#member-form').hidden);assert.match(q('#member-feedback').textContent,/保存しました/);assert([...q('#member-form').children].every(el=>!el.inert));
 q('[data-past]').checked=true;
 const first=q('#archive-selected').onclick();
 events={items:[{...source,title:'新しい公演名'}],revision:2};
 await q('#refresh-past').onclick();
 releaseRoster([]);
 await first;
 assert.equal(archived.transfers[0].record.occasion,source.title);
 assert.equal(archived.revisions.events,1,'archive uses the revision of the selected record');
 assert.match(q('#archive-result').textContent,/予定が更新/);
 q('[data-past]').checked=true;
 const second=q('#archive-selected').onclick();
 releaseRoster([]);
 await second;
 assert.equal(archived.transfers[0].record.occasion,'新しい公演名');
 assert.match(q('#archive-result').textContent,/1件を記録へ移しました。 一覧を更新できませんでした/);
 w.localStorage.setItem('yuitei.history.v1',JSON.stringify({version:1,items:[{...record,note:'端末で修正'}]}));
 await q('#migrate-local').onclick();
 assert.equal(migration.documents.history.length,1);
 assert.equal(migration.documents.history[0].note,'端末で修正');
 assert.match(q('#migrate-result').textContent,/共通保存へ追加しました。.*一覧を更新できませんでした/);
 w.close();
 console.log('PASS archive revision matches record snapshot, confirmed writes remain successful after refresh failure, migration deduplicates records');
})().catch(error=>{console.error(error);process.exitCode=1});
