const assert=require('node:assert/strict');
const {chromium,devices}=require('playwright');
const base=new URL(process.env.AUDIT_URL||'http://127.0.0.1:8151/');
assert.equal(base.hostname,'127.0.0.1');
const endpoint='https://script.google.com/macros/s/attendance-fixture/exec';
const names=['試験会員甲','試験会員乙','試験会員丙'];
const practice={id:'p1',title:'通常稽古',date:'2099-01-02',time:'14:00',venue:'試験会場',notes:''};
const saved=new Map([[names[0],'欠席']]);
const writes=[];
let rehearsalDoc={revision:1,items:[practice]},practiceConflict=false,practiceFailure=false,practiceWrite,failReadback=false,readbackPending=false;
function gate(){
 let open,started;
 return {
  wait:new Promise(resolve=>{open=resolve}),
  sent:new Promise(resolve=>{started=resolve}),
  open,started
 };
}
async function main(){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 try{
  async function session(name){
   const c=await browser.newContext({...devices['Pixel 7'],serviceWorkers:'block'});
   const p=await c.newPage();p.setDefaultTimeout(10000);
   let readGate,writeGate,fail=false,failRead=false;
   await p.addInitScript(()=>{
    if(!localStorage.getItem('yuitei.session'))localStorage.setItem('yuitei.session','fixture');
    const schedule=window.setInterval;
    window.fixturePolls=new Map();
    window.setInterval=(fn,ms)=>{
     const id=schedule(fn,ms);
     if(ms===60000)fixturePolls.set(id,fn);
     return id;
    };
    const clear=window.clearInterval;
    window.clearInterval=id=>{fixturePolls.delete(id);clear(id)};
   });
   await p.route('**/cloud-config.json',r=>r.fulfill({json:{enabled:true,provider:'apps-script',endpoint}}));
   await p.route(endpoint,async r=>{
    const req=JSON.parse(r.request().postData()),{action}=req;
    const json=body=>r.fulfill({headers:{'access-control-allow-origin':'*'},json:body});
    switch(action){
    case 'session':return json({ok:true,member:{id:name,name,role:name===names[0]?'editor':'viewer'}});
    case 'read':
     if(readbackPending){readbackPending=false;return json({ok:false,error:'模擬読み戻し失敗'})}
     return json({ok:true,doc:rehearsalDoc});
    case 'save':{
     assert.equal(name,names[0]);assert.equal(req.name,'rehearsals');
     assert.equal(req.items[0].id,practice.id);
     if(practiceWrite){const waiting=practiceWrite;practiceWrite=null;waiting.started();await waiting.wait}
     if(practiceFailure){practiceFailure=false;return json({ok:false,error:'模擬ネタ保存失敗'})}
     if(practiceConflict){
      practiceConflict=false;
      rehearsalDoc={revision:rehearsalDoc.revision+1,items:[{...rehearsalDoc.items[0],venue:'別端末が更新した会場'}]};
     }
     if(req.revision!==rehearsalDoc.revision)return json({ok:false,error:'ほかの端末で更新されています。再読み込みしてください。'});
     rehearsalDoc={revision:rehearsalDoc.revision+1,items:req.items};
     if(failReadback){failReadback=false;readbackPending=true}
     return json({ok:true,revision:rehearsalDoc.revision});
    }
    case 'roster':return json({ok:true,members:names.map(name=>({name}))});
    case 'attendanceRead':{
     const rows=[...saved].map(([stageName,status])=>({stageName,status}));
     if(readGate){const gate=readGate;readGate=null;gate.started();await gate.wait}
     if(failRead){failRead=false;return json({ok:false,error:'模擬取得失敗'});}
     return json({ok:true,rows});
    }
    case 'attendanceSave':{
     writes.push([name,req.status]);
     if(writeGate){const gate=writeGate;writeGate=null;gate.started();await gate.wait}
     if(fail){fail=false;return json({ok:false,error:'模擬保存失敗'});}
     saved.set(name,req.status);
     return json({ok:true});
    }
    default:throw Error(action);
    }
   });
   const open=()=>p.goto(new URL('rehearsals.html',base).href);
   await open();
   await p.locator('.quick-attendance strong').waitFor();
   return {p,open,holdRead:()=>readGate=gate(),holdWrite:()=>writeGate=gate(),failOnce:()=>{fail=true},failRead:()=>{failRead=true},poll:()=>p.evaluate(()=>{for(const callback of fixturePolls.values())callback()})};
  }
  const a=await session(names[0]),b=await session(names[1]),p=a.p;
  const quick=p.locator('.member-home .save-feedback');
  const show=page=>page.locator('[data-open-rehearsal]').click();
  const panel=page=>page.locator('#rehearsal-dialog #attendance');
  await p.locator('.quick-attendance strong').getByText('欠席',{exact:true}).waitFor();
  await b.p.locator('.quick-attendance strong').getByText('未登録',{exact:true}).waitFor();

  // A poll redraws the card after pointerdown. The original button must still get the click.
  const sameButton=p.locator('[data-quick-status="出席"]');
  await sameButton.scrollIntoViewIfNeeded();
  const original=await sameButton.elementHandle();
  const bounds=await sameButton.boundingBox();
  await p.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  await p.mouse.down();
  saved.set(names[0],'未定');
  saved.set(names[2],'未定');
  const redraw=a.holdRead();
  await a.poll();await redraw.sent;
  const redrawResponse=p.waitForResponse(response=>response.url()===endpoint&&JSON.parse(response.request().postData()).action==='attendanceRead');
  redraw.open();await redrawResponse;
  await p.locator('.quick-attendance strong').getByText('未定',{exact:true}).waitFor();
  assert(await original.evaluate(node=>node.isConnected));
  const first=a.holdWrite();
  await p.mouse.up();
  await first.sent;
  await quick.getByText('保存中…').waitFor();
  assert.equal(saved.get(names[0]),'未定');
  await sameButton.evaluate(button=>button.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  assert.equal(writes.length,1,'duplicate user actions must not send another write');

  // A read begun before saving must not overwrite the committed answer after it returns.
  const delayed=a.holdRead();
  await a.poll();await delayed.sent;
  await show(b.p);
  await panel(b.p).locator('[data-self-status="欠席"]').click();
  await panel(b.p).getByText('欠席で登録しました。').waitFor();
  first.open();
  await quick.getByText('出席で登録しました。').waitFor();
  await show(p);
  delayed.open();
  await panel(p).getByText('未定 1人').waitFor();
  await panel(p).getByText(names[1],{exact:true}).waitFor();
  assert.equal(await panel(p).locator('[data-person]').inputValue(),'出席');
  assert.deepEqual([...saved],[ [names[0],'出席'],[names[2],'未定'],[names[1],'欠席'] ]);

  // A failed dropdown change restores the confirmed choice and can be retried.
  a.failOnce();
  await panel(p).locator('[data-person]').selectOption('欠席');
  await panel(p).getByText(/保存できませんでした/).waitFor();
  assert.equal(await panel(p).locator('[data-person]').inputValue(),'出席');
  assert.equal(saved.get(names[0]),'出席');
  const retry=a.holdWrite();
  await panel(p).locator('[data-person]').selectOption('欠席');await retry.sent;
  await panel(p).getByText('保存中…').waitFor();
  await p.locator('#rehearsal-dialog [data-close]').click();
  await show(p);
  await panel(p).getByText('保存中…').waitFor();
  retry.open();
  await panel(p).getByText('欠席で登録しました。').waitFor();
  await panel(p).getByText('欠席 2人').waitFor();
  assert.equal(await panel(p).locator('[data-person]').inputValue(),'欠席');
  await p.locator('#rehearsal-dialog [data-close]').click();
  await p.locator('.quick-attendance strong').getByText('欠席',{exact:true}).waitFor();

  await p.reload();
  await p.locator('.quick-attendance strong').getByText('欠席',{exact:true}).waitFor();
  const other=await session(names[0]);
  await other.p.locator('.quick-attendance strong').getByText('欠席',{exact:true}).waitFor();
  await show(other.p);
  await panel(other.p).getByText('欠席 2人').waitFor();
  other.failRead();
  await panel(other.p).getByRole('button',{name:'出欠一覧を更新'}).click();
  await panel(other.p).getByText(/出欠一覧を取得できませんでした/).waitFor();
  assert.equal(await panel(other.p).locator('.attendance-summary section').count(),0);
  await panel(other.p).getByRole('button',{name:'出欠一覧を更新'}).click();
  await panel(other.p).getByText('欠席 2人').waitFor();
  assert(! (await panel(other.p).locator('[data-attendance-time]').textContent()).includes('未取得'));
  await show(p);
  const editor=p.locator('#practice-form');
  const practiceStatus=p.locator('#practice-save-feedback');
  const addPractice=async (name,piece,minutes,guest=false)=>{
   await p.locator('#add-practice').click();
   const row=editor.locator('.practice-row').last();
   await row.locator('[name=stageName]').selectOption(guest?'guest':name);
   if(guest)await row.locator('[name=guestStageName]').fill(name);
   await row.locator('[name=piece]').fill(piece);
   if(minutes)await row.locator('[name=minutes]').fill(minutes);
  };
  await addPractice(names[0],'寿限無','10');
  await addPractice('試験ゲスト','時そば',null,true);
  await addPractice(names[0],'芝浜',null);
  practiceFailure=true;
  await editor.locator('button[type=submit]').click();
  await practiceStatus.getByText(/模擬ネタ保存失敗/).waitFor();
  assert.equal(await editor.locator('[name=piece]').last().inputValue(),'芝浜');
  assert.equal(rehearsalDoc.items[0].practices,undefined);

  practiceConflict=true;failReadback=true;
  const pendingPractice=gate();practiceWrite=pendingPractice;
  await editor.locator('button[type=submit]').click();
  await pendingPractice.sent;
  await practiceStatus.getByText('保存中…').waitFor();
  assert(await editor.evaluate(form=>form.inert));
  await panel(b.p).locator('[data-self-status="出席"]').click();
  await panel(b.p).getByText('出席で登録しました。').waitFor();
  pendingPractice.open();
  await practiceStatus.getByText(/保存後の一覧を取得できませんでした/).waitFor();
  assert.deepEqual(rehearsalDoc.items[0].practices.map(({stageName,piece,durationSeconds})=>[stageName,piece,durationSeconds]),
   [[names[0],'寿限無',600],['試験ゲスト','時そば',null],[names[0],'芝浜',null]]);
  assert.equal(rehearsalDoc.items[0].venue,'別端末が更新した会場');
  assert.equal(saved.get(names[1]),'出席');
  await p.locator('#rehearsal-dialog [data-close]').click();
  await show(p);
  assert.equal(await editor.locator('[name=piece]').last().inputValue(),'芝浜');
  await p.reload();await show(p);
  assert.equal(await editor.locator('[name=piece]').last().inputValue(),'芝浜');
  const viewer=await session(names[1]);await show(viewer.p);
  await viewer.p.locator('#practice-section').getByText(/試験ゲスト.*時そば/).waitFor();
  assert.equal(await viewer.p.locator('#practice-section li').count(),3);
  await panel(viewer.p).getByText('出席 1人').waitFor();
  await panel(viewer.p).getByText('欠席 1人').waitFor();

  // A genuine same-field conflict must retain the draft and leave server rows alone.
  rehearsalDoc={revision:rehearsalDoc.revision+1,items:[{...rehearsalDoc.items[0],practices:[{stageName:names[0],piece:'別の演目',durationSeconds:null}]}]};
  await editor.locator('[name=piece]').last().fill('上書きしない下書き');
  await editor.locator('button[type=submit]').click();
  await practiceStatus.getByText(/別の端末でこの稽古のネタが更新/).waitFor();
  assert.equal(await editor.locator('[name=piece]').last().inputValue(),'上書きしない下書き');
  assert.equal(rehearsalDoc.items[0].practices[0].piece,'別の演目');
  console.log('PASS stable pointer controls, pending/confirmed/error feedback, all three save routes, stale-read ordering, double click, detail reopening, independent sessions and concurrent member answers, practice drafts, conflict rebase, readback failure, and persistence');
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
