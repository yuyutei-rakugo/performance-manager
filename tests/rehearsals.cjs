const {JSDOM}=require('jsdom');
const fs=require('fs'),assert=require('node:assert/strict');
const path=require('node:path'),root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'rehearsals.html'),'utf8'),source=fs.readFileSync(path.join(root,'rehearsals.js'),'utf8').replace(/^import .*;\n/gm,''),model=fs.readFileSync(path.join(root,'rehearsal-model.js'),'utf8').replace(/export /g,'');
const tick=()=>new Promise(r=>setImmediate(r));
async function boot(stored,cloudState={configured:false}){
 const dom=new JSDOM(html,{url:'http://localhost/rehearsals.html',runScripts:'outside-only'}),w=dom.window;let stateListener,watch,watchAttendance;let confirm=true,blobData,saveError=false,respond=[];
 w.structuredClone=structuredClone;w.setTimeout=()=>0;w.fetch=async()=>({json:async()=>({names:['勇水','日光','一悟','藤本']})});w.confirm=()=>confirm;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){const open=this.open;this.open=false;if(open)this.onclose?.()};
 w.HTMLAnchorElement.prototype.click=function(){};w.URL.createObjectURL=b=>{blobData=b;return 'blob:test'};w.URL.revokeObjectURL=()=>{};
 const cloud={state:cloudState,onState(fn){stateListener=fn;fn(this.state)},watch(name,fn){watch=fn;return()=>{}},watchAttendance(id,fn){watchAttendance=fn;return()=>{}},async save(){if(saveError)throw Error('conflict')},async respondAttendance(id,status){respond.push({id,status});if(saveError)throw Error('通信失敗')}};
 w.cloud=cloud;w.startCloud=()=>{};w.mountAccount=()=>{};
 if(stored!==undefined)w.localStorage.setItem('yuitei.rehearsals.v1',stored);
 w.eval(model+'\n'+source);await tick();
 return {w,dom,cloud,emit(s){cloud.state=s;stateListener(s)},snapshot(d){watch(d)},attendance(rows){watchAttendance(rows)},confirm(v){confirm=v},fail(v){saveError=v},responses:respond,blob:()=>blobData};
}
function $(t,s){return t.w.document.querySelector(s)}
async function create(t,title='稽古A',date='2026-12-02',kind='師匠稽古'){
 $(t,'#add').click();for(const [key,v] of Object.entries({title,date,time:'14:00',venue:'和室',kind,notes:''}))$(t,`[name="${key}"]`).value=v;
 await $(t,'#rehearsal-form').onsubmit({preventDefault(){},target:$(t,'#rehearsal-form')});
}
async function response(t,name,status){const select=$(t,`[data-person="${name}"]`);select.value=status;await $(t,'#attendance').onchange({target:select})}
(async()=>{
 const t=await boot();await create(t);assert.equal($(t,'#rehearsals h2').textContent,'稽古A');assert(!$(t,'dialog').open);await create(t,'稽古B','2026-12-01','自主稽古');assert.equal($(t,'#rehearsals h2').textContent,'稽古B');
 $(t,'[data-detail]').click();assert.equal(t.w.document.querySelectorAll('[data-person]').length,3);assert(!$(t,'[data-person="藤本"]'));assert.match($(t,'#attendance h3').textContent,/出席 0人 ／ 未回答 3人/);
 for(const status of ['出席','欠席','未定','未回答']){await response(t,'勇水',status);assert.equal($(t,'[data-person="勇水"]').value,status)}
 await response(t,'勇水','出席');await response(t,'日光','出席');assert.match($(t,'#attendance h3').textContent,/出席 2人 ／ 未回答 1人/);assert.match($(t,'#attendance').textContent,/参加者：勇水・日光/);
 t.emit({configured:false});assert.equal(t.w.document.querySelectorAll('.rehearsal-card').length,2,'local data survives connection state refresh');
 const saved=t.w.localStorage.getItem('yuitei.rehearsals.v1');const reloaded=await boot(saved);$(reloaded,'[data-detail]').click();assert.equal($(reloaded,'[data-person="勇水"]').value,'出席');
 $(t,'[data-close]').click();$(t,'[data-edit]').click();assert($(t,'#delete-rehearsal').disabled);$(t,'[name="venue"]').value='交流センター';await $(t,'#rehearsal-form').onsubmit({preventDefault(){},target:$(t,'#rehearsal-form')});assert.match($(t,'#rehearsals').textContent,/交流センター/);
 $(t,'[data-edit]').click();$(t,'#delete-rehearsal').onclick();assert.equal(JSON.parse(t.w.localStorage.getItem('yuitei.rehearsals.v1')).items.length,2);$(t,'#delete-confirm').checked=true;$(t,'#delete-confirm').onchange({target:$(t,'#delete-confirm')});t.confirm(false);await $(t,'#delete-rehearsal').onclick();assert.equal(JSON.parse(t.w.localStorage.getItem('yuitei.rehearsals.v1')).items.length,2);t.confirm(true);await $(t,'#delete-rehearsal').onclick();assert.equal(JSON.parse(t.w.localStorage.getItem('yuitei.rehearsals.v1')).items.length,1);
 $(t,'#backup').click();const contents=await new Promise(resolve=>{const r=new t.w.FileReader();r.onload=()=>resolve(r.result);r.readAsText(t.blob())});const data=JSON.parse(contents);assert.equal(data.type,'yuyutei-rehearsals');assert.equal(data.items.length,1);
 const fresh=await boot();Object.defineProperty($(fresh,'#restore'),'files',{configurable:true,value:[{text:async()=>contents}]});await $(fresh,'#restore').onchange({target:$(fresh,'#restore')});assert.equal(JSON.parse(fresh.w.localStorage.getItem('yuitei.rehearsals.v1')).items.length,1);
 const malformed=await boot('{bad');await create(malformed);assert.equal(malformed.w.localStorage.getItem('yuitei.rehearsals.v1'),'{bad');
 const viewer=await boot(undefined,{configured:true,role:'viewer',stageName:'勇水'});viewer.snapshot({items:data.items,revision:1});assert($(viewer,'#add').disabled);$(viewer,'[data-detail]').click();viewer.attendance([]);assert(!$(viewer,'[data-person="勇水"]').disabled);assert($(viewer,'[data-person="日光"]').disabled);await response(viewer,'勇水','出席');assert.equal(viewer.responses.length,1);
 const admin=await boot(undefined,{configured:true,role:'admin',stageName:'勇水'});admin.snapshot({items:data.items,revision:1});admin.fail(true);$(admin,'[data-edit]').click();$(admin,'[name="venue"]').value='競合';await $(admin,'#rehearsal-form').onsubmit({preventDefault(){},target:$(admin,'#rehearsal-form')});assert($(admin,'dialog').open);assert(!$(admin,'#rehearsals').textContent.includes('競合'));
 console.log('PASS: create both types; chronological order; four attendance states; counts and participants; reload; edit; guarded deletion/cancel; JSON export/import; corrupt storage preservation; viewer UI restrictions/self RSVP; cloud save failure preservation.');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
