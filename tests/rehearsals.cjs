const {JSDOM}=require('jsdom');
const fs=require('fs'),assert=require('node:assert/strict');
const path=require('node:path'),root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'rehearsals.html'),'utf8'),source=fs.readFileSync(path.join(root,'rehearsals.js'),'utf8').replace(/^import .*;\n/gm,'').replace(/await applyConfirmedSchedule\(\)/g,'void 0'),model=fs.readFileSync(path.join(root,'rehearsal-model.js'),'utf8').replace(/export /g,'').replace(/await applyConfirmedSchedule\(\)/g,'void 0');
const tick=()=>new Promise(r=>setImmediate(r));
async function boot(stored,cloudState={configured:false},pageUrl='http://localhost/rehearsals.html'){
 const dom=new JSDOM(html,{url:pageUrl,runScripts:'outside-only'}),w=dom.window;let stateListener,watch,watchAttendance,watchAttendanceError;let confirm=true,blobData,saveError=false,respond=[];
 w.structuredClone=structuredClone;w.setTimeout=()=>0;w.fetch=async()=>({json:async()=>({names:['勇水','日光','一悟','藤本']})});w.confirm=()=>confirm;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){const open=this.open;this.open=false;if(open)this.onclose?.()};
 w.HTMLAnchorElement.prototype.click=function(){};w.URL.createObjectURL=b=>{blobData=b;return 'blob:test'};w.URL.revokeObjectURL=()=>{};
 const cloud={state:cloudState,onState(fn){stateListener=fn;fn(this.state)},watch(name,fn){watch=fn;return()=>{}},watchAttendance(id,fn,onError){watchAttendance=fn;watchAttendanceError=onError;return()=>{}},async save(){if(saveError)throw Error('conflict')},async respondAttendance(id,status){respond.push({id,status});if(saveError)throw Error('通信失敗')}};
 w.cloud=cloud;w.startCloud=()=>{};w.mountMemberHome=()=>{};w.mountAccount=()=>{};
 w.localStorage.setItem('yuitei.attendance.person','勇水');
 if(stored!==undefined)w.localStorage.setItem('yuitei.rehearsals.v1',stored);
 const transfer=fs.readFileSync(path.join(root,'record-transfer.js'),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'').replace(/await applyConfirmedSchedule\(\)/g,'void 0');w.eval(fs.readFileSync(path.join(root,'categories.js'),'utf8').replace(/export /g,'').replace(/await applyConfirmedSchedule\(\)/g,'void 0')+'\n'+fs.readFileSync(path.join(root,'schedule-import.js'),'utf8').replace(/export /g,'').replace(/await applyConfirmedSchedule\(\)/g,'void 0'));w.eval(transfer+'\n'+model+'\n'+fs.readFileSync(path.join(root,'performer-picker.js'),'utf8').replace(/export /g,'')+'\n'+source);await tick();
 return {w,dom,cloud,emit(s){cloud.state=s;stateListener(s)},snapshot(d){watch(d)},attendance(rows){watchAttendance(rows)}, attendanceError(){watchAttendanceError("取得失敗")},confirm(v){confirm=v},fail(v){saveError=v},responses:respond,blob:()=>blobData};
}
function $(t,s){return t.w.document.querySelector(s)}
async function create(t,title='通常稽古',date='2026-12-02'){
 $(t,'#add').click();assert.deepEqual([...$(t,'[name=title]').options].map(o=>o.value),['通常稽古','師匠稽古','自主稽古','その他']);assert(!$(t,'[name=kind]'));for(const [key,v] of Object.entries({title,date,time:'14:00',venue:'和室',notes:''}))$(t,`[name="${key}"]`).value=v;
 await $(t,'#rehearsal-form').onsubmit({preventDefault(){},target:$(t,'#rehearsal-form')});
}
async function response(t,name,status){const select=$(t,`[data-person="${name}"]`);select.value=status;await $(t,'#attendance').onchange({target:select})}
(async()=>{
 const t=await boot();await create(t);assert.equal($(t,'#rehearsals h3').textContent,'通常稽古');assert(!$(t,'#rehearsal-dialog').open);await create(t,'自主稽古','2026-12-01','自主稽古');assert.equal($(t,'#rehearsals h3').textContent,'自主稽古');
 $(t,'[data-detail]').click();assert.equal(t.w.document.querySelectorAll('[data-person]').length,1);assert(!$(t,'[data-person="藤本"]'));assert.match($(t,'#attendance').textContent,/未登録 3人/);
 for(const status of ['出席','欠席','未定','未回答']){await response(t,'勇水',status);assert.equal($(t,'[data-person="勇水"]').value,status)}
 await response(t,'勇水','出席');assert.equal($(t,'[data-person=日光]'),null);const picker=$(t,'#attendance-person');picker.value='日光';await $(t,'#attendance').onchange({target:picker});await response(t,'日光','出席');assert.match($(t,'#attendance').textContent,/出席 2人/);assert.match($(t,'#attendance').textContent,/勇水・日光/);
 t.emit({configured:false});assert.equal(t.w.document.querySelectorAll('.rehearsal-card').length,2,'local data survives connection state refresh');
 const saved=t.w.localStorage.getItem('yuitei.rehearsals.v1');const reloaded=await boot(saved);$(reloaded,'[data-detail]').click();assert.equal($(reloaded,'[data-person="勇水"]').value,'出席');
 $(t,'#edit-rehearsal-inside').click();
 $(t,'[name=venue]').value='未保存の会場';
 $(t,'[data-cancel-edit]').click();
 assert($(t,'#rehearsal-dialog').open);
 assert($(t,'#attendance'));
 assert(!$(t,'#rehearsal-dialog').textContent.includes('未保存の会場'));
 assert.equal(t.w.localStorage.getItem('yuitei.rehearsals.v1'),saved);
 $(t,'#add').click();
 $(t,'[data-cancel-edit]').click();
 assert(!$(t,'#rehearsal-dialog').open,'new form cancellation still closes');
 $(t,'[data-detail]').click();
 $(t,'[data-close]').click();$(t,'[data-detail]').click();$(t,'#edit-rehearsal-inside').click();assert($(t,'#delete-rehearsal').disabled);$(t,'[name="venue"]').value='交流センター';await $(t,'#rehearsal-form').onsubmit({preventDefault(){},target:$(t,'#rehearsal-form')});assert.match($(t,'#rehearsals').textContent,/交流センター/);
 $(t,'[data-detail]').click();$(t,'#edit-rehearsal-inside').click();$(t,'#delete-rehearsal').onclick();assert.equal(JSON.parse(t.w.localStorage.getItem('yuitei.rehearsals.v1')).items.length,2);$(t,'#delete-confirm').checked=true;$(t,'#delete-confirm').onchange({target:$(t,'#delete-confirm')});t.confirm(false);await $(t,'#delete-rehearsal').onclick();assert.equal(JSON.parse(t.w.localStorage.getItem('yuitei.rehearsals.v1')).items.length,2);t.confirm(true);await $(t,'#delete-rehearsal').onclick();assert.equal(JSON.parse(t.w.localStorage.getItem('yuitei.rehearsals.v1')).items.length,1);
 $(t,'#backup').click();const contents=await new Promise(resolve=>{const r=new t.w.FileReader();r.onload=()=>resolve(r.result);r.readAsText(t.blob())});const data=JSON.parse(contents);assert.equal(data.type,'yuyutei-rehearsals');assert.equal(data.items.length,1);
 const fresh=await boot();Object.defineProperty($(fresh,'#restore'),'files',{configurable:true,value:[{text:async()=>contents}]});await $(fresh,'#restore').onchange({target:$(fresh,'#restore')});assert.equal(JSON.parse(fresh.w.localStorage.getItem('yuitei.rehearsals.v1')).items.length,1);
 const cancelled=await boot();cancelled.confirm(false);
 const staged={...JSON.parse(contents),records:[{id:'staged',date:'2026-12-02',kind:'通常稽古',occasion:'中止',note:'',pieces:{}}],categories:['取り込み専用']};
 Object.defineProperty($(cancelled,'#restore'),'files',{configurable:true,value:[{text:async()=>JSON.stringify(staged)}]});
 await $(cancelled,'#restore').onchange({target:$(cancelled,'#restore')});
 for(const key of ['yuitei.history.v1','yuitei.categories.v1','yuitei.rehearsals.v1'])assert.equal(cancelled.w.localStorage.getItem(key),null);
 const malformed=await boot('{bad');await create(malformed);assert.equal(malformed.w.localStorage.getItem('yuitei.rehearsals.v1'),'{bad');
 const viewer=await boot(undefined,{configured:true,role:'viewer',stageName:'勇水'});viewer.snapshot({items:data.items,revision:1});assert($(viewer,'#add').disabled);$(viewer,'[data-detail]').click();
 assert.match($(viewer,'#attendance').textContent,/読み込んでいます/);
 assert(!$(viewer,'.attendance-summary').textContent.includes('未登録'));
 viewer.attendanceError();
 assert.match($(viewer,'#attendance').textContent,/取得できませんでした/);
 assert(!$(viewer,'.attendance-summary').textContent.includes('未登録'));
 $(viewer,'[data-retry-attendance]').click();
 assert.match($(viewer,'#attendance').textContent,/読み込んでいます/);
 const selectBefore=$(viewer,'[data-person]'),buttonBefore=$(viewer,'[data-self-status]');
 viewer.attendance([{stageName:'日光',status:'欠席'},{stageName:'一悟',status:'未定'}]);
 assert.equal($(viewer,'[data-person]'),selectBefore);assert.equal($(viewer,'[data-self-status]'),buttonBefore);
 assert.match($(viewer,'#attendance').textContent,/欠席 1人.*日光/);
 assert.match($(viewer,'#attendance').textContent,/未定 1人.*一悟/);assert(!$(viewer,'[data-person="勇水"]').disabled);assert.equal($(viewer,'[data-person="日光"]'),null);await response(viewer,'勇水','出席');assert.equal(viewer.responses.length,1);
 const linked=await boot(saved,{configured:true,role:'viewer',stageName:'勇水'},'http://localhost/rehearsals.html?detail='+encodeURIComponent(data.items[0].id));assert(!$(linked,'#rehearsal-dialog').open);linked.snapshot({items:data.items,revision:1});assert($(linked,'#rehearsal-dialog').open,'deep link waits for shared schedule then opens its detail');linked.attendance([]);assert($(linked,'#attendance'));const direct=await boot(saved);direct.w.dispatchEvent(new direct.w.CustomEvent('rehearsal-detail',{detail:{id:data.items[0].id}}));assert($(direct,'#rehearsal-dialog').open,'same-page link opens details without navigation');
 const admin=await boot(undefined,{configured:true,role:'admin',stageName:'勇水'});admin.snapshot({items:data.items,revision:1});admin.fail(true);$(admin,'[data-detail]').click();$(admin,'#edit-rehearsal-inside').click();$(admin,'[name="venue"]').value='競合';await $(admin,'#rehearsal-form').onsubmit({preventDefault(){},target:$(admin,'#rehearsal-form')});assert($(admin,'#rehearsal-dialog').open);assert(!$(admin,'#rehearsals').textContent.includes('競合'));
 const practice=await boot();await create(practice);$(practice,'[data-detail]').click();$(practice,'#add-practice').click();$(practice,'#practice-rows [name=stageName]').value='勇水';$(practice,'#practice-rows [name=piece]').value='火焔太鼓';$(practice,'#practice-rows [name=minutes]').value='12';$(practice,'#practice-rows [name=seconds]').value='30';await $(practice,'#practice-form').onsubmit({preventDefault(){}});assert.equal(JSON.parse(practice.w.localStorage.getItem('yuitei.rehearsals.v1')).items[0].practices[0].durationSeconds,750);await $(practice,'#transfer-rehearsal').onclick();assert.equal(practice.w.localStorage.getItem('yuitei.history.v1'),null);assert($(practice,'#transfer-rehearsal').closest('[hidden]'));
 const other=await boot();$(other,'#add').click();$(other,'[name=title]').value='その他';$(other,'[name=title]').onchange();assert(!$(other,'#other-content-field').hidden);assert($(other,'[name=otherContent]').required);
 console.log('PASS: create both types; chronological order; four attendance states; counts and participants; reload; edit; guarded deletion/cancel; JSON export/import; corrupt storage preservation; viewer UI restrictions/self RSVP; cloud save failure preservation.');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
