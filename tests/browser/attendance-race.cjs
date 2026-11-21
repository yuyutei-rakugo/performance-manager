const assert=require('node:assert/strict');
const {chromium,devices}=require('playwright');
const base=new URL(process.env.AUDIT_URL||'http://127.0.0.1:8151/');
assert.equal(base.hostname,'127.0.0.1');
const endpoint='https://script.google.com/macros/s/attendance-fixture/exec';
const names=['試験会員甲','試験会員乙','試験会員丙'];
const practice={id:'p1',title:'通常稽古',date:'2099-01-02',time:'14:00',venue:'試験会場',notes:''};
const saved=new Map([[names[0],'欠席']]);
const writes=[],writeIds=[];
const delegated=new Set();
const secondDaySaved=new Map([[names[0],'未定']]);
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
  async function session(name,admin=false){
   const c=await browser.newContext({...devices['Pixel 7'],serviceWorkers:'block',timezoneId:'America/Los_Angeles'});
   const p=await c.newPage();p.setDefaultTimeout(10000);
   let readGate,writeGate,proxyGate,fail=false,failRead=false,failProxy=false;
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
    case 'session':return json({ok:true,member:{id:name,name,role:admin?'admin':name===names[0]?'editor':'viewer',...(admin?{attendanceProxy:true}:{})}});
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
     const rows=[...(req.id==='december'?secondDaySaved:saved)].map(([stageName,status])=>({stageName,status,delegated:req.id==='december'&&delegated.has(stageName)}));
     if(readGate){const gate=readGate;readGate=null;gate.started();await gate.wait}
     if(failRead){failRead=false;return json({ok:false,error:'模擬取得失敗'});}
     return json({ok:true,rows});
    }
    case 'attendanceSave':{
     writes.push([name,req.status]);writeIds.push(req.id);
     if(writeGate){const gate=writeGate;writeGate=null;gate.started();await gate.wait}
     if(fail){fail=false;return json({ok:false,error:'模擬保存失敗'});}
     (req.id==='december'?secondDaySaved:saved).set(name,req.status);
     if(req.id==='december')delegated.delete(name);
     return json({ok:true});
    }
    case 'attendanceProxy':{
     assert(admin);assert.equal(req.id,'december');
     if(proxyGate){const gate=proxyGate;proxyGate=null;gate.started();await gate.wait}
     if(failProxy){failProxy=false;return json({ok:false,error:'模擬代行保存失敗'})}
     if(secondDaySaved.has(req.name))return json({ok:true,applied:false});
     secondDaySaved.set(req.name,req.status);delegated.add(req.name);
     return json({ok:true,applied:true});
    }
    default:throw Error(action);
    }
   });
   const open=()=>p.goto(new URL('rehearsals.html',base).href);
   await open();
   await p.locator('.quick-attendance strong').waitFor();
   return {p,open,holdRead:()=>readGate=gate(),holdWrite:()=>writeGate=gate(),failOnce:()=>{fail=true},failRead:()=>{failRead=true},holdProxy:()=>proxyGate=gate(),failProxy:()=>{failProxy=true},poll:()=>p.evaluate(()=>{for(const callback of fixturePolls.values())callback()})};
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
  await p.locator('#edit-practices').click();
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
  assert(await editor.locator('button[type=submit]').isDisabled());
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
  await p.locator('#practice-section li').getByText(/芝浜/).waitFor();
  await p.reload();await show(p);
  await p.locator('#practice-section li').getByText(/芝浜/).waitFor();
  await p.locator('#edit-practices').click();
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
  // The same document contains multiple JST dates and multiple times on one day.
  const today={...practice,date:'2026-11-21',time:'17:00'};
  const december={...practice,id:'december',date:'2026-12-13',title:'師匠稽古'};
  rehearsalDoc={revision:rehearsalDoc.revision+1,items:[
   december,{...today,id:'later',time:'19:00',title:'自主稽古'},today,
   {...today,id:'archived',time:'09:00',archivedAt:'2026-11-21T01:00:00Z'},
   {...today,id:'other',time:'20:00',title:'その他稽古',otherContent:'交流会'}
  ]};
  const card=p.locator('.member-home');
  await p.getByRole('button',{name:'キャンセル',exact:true}).click();
  await p.getByRole('button',{name:'変更を破棄する'}).click();
  await p.clock.setFixedTime(new Date('2026-11-20T14:59:00Z'));
  await p.reload();
  await card.getByRole('heading',{name:'次回の稽古',exact:true}).waitFor();
  const sameScheduleControl=await card.getByRole('button',{name:'出席',exact:true}).elementHandle();
  await p.clock.setFixedTime(new Date('2026-11-21T07:59:00Z'));
  await p.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  assert(await sameScheduleControl.evaluate(button=>button.isConnected));
  await card.getByRole('heading',{name:'今日の稽古',exact:true}).waitFor();
  assert.equal(await card.locator('[data-open-rehearsal]').getAttribute('data-open-rehearsal'),today.id);
  await card.getByText('通常稽古',{exact:true}).waitFor();
  await card.getByText('2026年 11月21日（土） 17:00',{exact:true}).waitFor();
  assert.equal(await card.locator('.rehearsal-kind').getAttribute('class'),await p.locator('#rehearsals').getByText('通常稽古',{exact:true}).getAttribute('class'));
  await p.locator('#rehearsals').getByText('自主稽古',{exact:true}).waitFor();
  await p.locator('#rehearsals').getByText('その他：交流会',{exact:true}).waitFor();
  await p.clock.setFixedTime(new Date('2026-11-21T08:00:01Z'));
  await p.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  await card.getByRole('heading',{name:'今日の稽古',exact:true}).waitFor();
  await card.getByRole('button',{name:'出席',exact:true}).click();
  await quick.getByText('出席で登録しました。').waitFor();
  assert.equal(writeIds.at(-1),today.id);
  await show(p);
  assert.equal(await p.locator('#rehearsal-dialog .rehearsal-kind').getAttribute('class'),await card.locator('.rehearsal-kind').getAttribute('class'));
  await p.locator('#rehearsal-dialog').getByText('2026年 11月21日（土） 17:00',{exact:true}).waitFor();
  const reset=a.holdWrite();
  await panel(p).locator('[data-person]').selectOption('未回答');await reset.sent;
  await panel(p).getByText('保存中…').waitFor();
  assert.equal(saved.get(names[0]),'出席');
  reset.open();
  await panel(p).getByText('回答を未登録に戻しました。').waitFor();
  assert.equal(saved.get(names[0]),'未回答');
  await p.locator('#rehearsal-dialog [data-close]').click();

  await p.clock.install({time:new Date('2026-11-21T14:59:50Z')});
  await p.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  await card.getByRole('heading',{name:'今日の稽古',exact:true}).waitFor();
  const oldRead=a.holdRead();
  await a.poll();await oldRead.sent;
  await p.clock.fastForward(10000);
  await card.getByRole('heading',{name:'次回の稽古',exact:true}).waitFor();
  await card.getByText('師匠稽古',{exact:true}).waitFor();
  assert.equal(await quick.textContent(),'');
  oldRead.open();
  await card.locator('.quick-attendance strong').getByText('未定',{exact:true}).waitFor();
  await card.getByRole('button',{name:'欠席',exact:true}).click();
  await quick.getByText('欠席で登録しました。').waitFor();
  assert.equal(writeIds.at(-1),december.id);
  assert.equal(saved.get(names[0]),'未回答');
  assert.equal(secondDaySaved.get(names[0]),'欠席');
  await show(p);
  await p.locator('#rehearsal-dialog .rehearsal-kind--master').getByText('師匠稽古',{exact:true}).waitFor();
  // A narrow viewport and enlarged base font must still fit the updated date.
  await p.setViewportSize({width:320,height:720});
  const fits=await p.evaluate(()=>{
   document.documentElement.style.fontSize='200%';
   return [...document.querySelectorAll('.rehearsal-datetime')].every(time=>
    time.scrollWidth<=time.clientWidth+1&&time.getBoundingClientRect().width<=time.parentElement.clientWidth);
  });
  assert(fits);
  // Independent administrator and member sessions reading the same attendance.
  const adm=await session(names[0],true),peer=await session(names[1]);
  for(const user of [adm,peer]){
   await user.p.locator('[data-detail="december"]').click();
   await panel(user.p).getByText('未登録 2人').waitFor();
  }
  assert.equal(await panel(peer.p).locator('[data-proxy]').count(),0);
  const proxy=panel(adm.p).locator('[data-proxy]');
  await proxy.locator('summary').click();
  const selectProxy=async (name,status)=>{
   await proxy.locator('[name=member]').selectOption(name);
   await proxy.locator('[name=status]').selectOption(status);
  };
  const proxyStatus=panel(adm.p).locator('[data-proxy-status]');
  await selectProxy(names[1],'欠席');
  adm.failProxy();
  await proxy.locator('button').click();
  await proxyStatus.getByText(/模擬代行保存失敗/).waitFor();
  assert.equal(await proxy.locator('[name=member]').inputValue(),names[1]);
  const pendingProxy=adm.holdProxy();
  await proxy.locator('button').click();await pendingProxy.sent;
  await proxyStatus.getByText('保存中…',{exact:true}).waitFor();
  assert(await proxy.locator('button').isDisabled());
  await panel(peer.p).locator('[data-self-status="出席"]').click();
  await panel(peer.p).getByText('出席で登録しました。').waitFor();
  pendingProxy.open();
  await proxyStatus.getByText(/既に登録/).waitFor();
  await panel(adm.p).getByText('出席 1人').waitFor();
  await proxy.locator('summary').click();
  await selectProxy(names[2],'未定');
  await proxy.locator('button').click();
  await proxyStatus.getByText(/未定で代行登録/).waitFor();
  await panel(adm.p).getByText('（管理者代行）',{exact:true}).waitFor();
  const third=await session(names[2]);
  await third.p.locator('[data-detail="december"]').click();
  await panel(third.p).getByText('（管理者代行）',{exact:true}).waitFor();
  await panel(third.p).locator('[data-self-status="欠席"]').click();
  await panel(third.p).getByText('欠席 2人').waitFor();
  assert.equal(await panel(third.p).getByText('（管理者代行）',{exact:true}).count(),0);
  console.log('PASS independent proxy and self sessions, pending, failure and retry, conflicts and delegated label');
  console.log('PASS JST start and midnight boundaries on a Los Angeles device, earliest active schedule, correct write IDs, stale response and message isolation, type labels, dates at 320px and 200% font, reset feedback');
  console.log('PASS stable pointer controls, pending/confirmed/error feedback, all three save routes, stale-read ordering, double click, detail reopening, independent sessions and concurrent member answers, practice drafts, conflict rebase, readback failure, and persistence');
 }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
