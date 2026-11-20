const assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');

const base = new URL(process.env.AUDIT_URL || 'http://127.0.0.1:8151/');
assert.equal(base.hostname, '127.0.0.1', 'The audit must run against a local copy.');
const endpoint = 'https://script.google.com/macros/s/audit-fixture/exec';
const docs = {
  events: {revision:1, items:[]},
  rehearsals: {revision:1, items:[]},
  history: {revision:1, items:[{
    id:'history-old', date:'2026-06-01', kind:'定期落語会',
    occasion:'同名の記録', pieces:{'試験会員':'寿限無'}, note:''
  }]}
};
const attendance=new Map();
let pending;
const hold = collection => {
  let release, started;
  const response = new Promise(resolve => {release=resolve});
  const sent = new Promise(resolve => {started=resolve});
  pending = {collection,response,started};
  return {release,sent};
};

async function main(){
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  try{
    async function session(role){
      const context=await browser.newContext({...devices['Pixel 7'],serviceWorkers:'block'});
      const page=await context.newPage();
      page.setDefaultTimeout(9000);
      await page.addInitScript(()=>{if(!localStorage.getItem('yuitei.session'))localStorage.setItem('yuitei.session','fixture')});
      await page.route('**/cloud-config.json',route=>route.fulfill({json:{enabled:true,provider:'apps-script',endpoint}}));
      await page.route(endpoint,async route=>{
        const request=JSON.parse(route.request().postData());
        const answer=body=>route.fulfill({headers:{'access-control-allow-origin':'*'},json:body});
        const ok=payload=>answer({ok:true,...payload});
        switch(request.action){
          case 'session':return ok({member:{id:role,name:'試験会員',role,active:true}});
          case 'read':return ok({doc:docs[request.name]});
          case 'roster':return ok({members:['試験会員','別の会員'].map(name=>({name}))});
          case 'attendanceRead':return ok({rows:attendance.get(request.id)||[]});
          case 'attendanceSave':{
            const rows=attendance.get(request.id)||[];
            attendance.set(request.id,[...rows.filter(row=>row.stageName!=='試験会員'),{stageName:'試験会員',status:request.status}]);
            return ok({});
          }
          case 'save':{
            assert.notEqual(role,'viewer');
            if(request.revision!==docs[request.name].revision)return answer({ok:false,error:'ほかの端末で更新されています。再読み込みしてください。'});
            if(pending?.collection===request.name){
              const active=pending;pending=null;
              active.started();
              await active.response;
            }
            const revision=docs[request.name].revision+1;
            docs[request.name]={items:request.items,revision};
            return ok({revision});
          }
          default:throw Error('Unexpected action: '+request.action);
        }
      });
      return page;
    }

    const page=await session('editor');
    await page.goto(base.href);
    await page.getByText('公演がありません。',{exact:false}).waitFor();
    await page.locator('#new-event').click();
    const form=page.locator('#event-form');
    await form.locator('[name=title]').fill('翌日の公演');
    await form.locator('[name=kind]').selectOption('定期落語会');
    await form.locator('[name=date]').fill('2026-12-20');
    await form.locator('[name=time]').fill('23:55');
    await form.locator('button[type=submit]').click();
    assert.equal(docs.events.items.length,0,'a missing venue blocks the save');
    await form.locator('[name=venue]').fill('試験会場');
    await page.locator('#add-performer').click();
    const row=page.locator('.performer').first();
    await row.locator('[name=stageName]').selectOption('guest');
    await row.locator('[name=guestStageName]').fill('試験ゲスト');
    await row.locator('[name=piece]').fill('寿限無');
    await row.locator('[name=minutes]').fill('10');
    await row.locator('[name=endTime]').fill('00:07');
    await row.locator('[data-end-time]').getByText('翌日 00:07').waitFor();
    const eventSave=hold('events');
    await form.locator('button[type=submit]').click();
    await eventSave.sent;
    await page.locator('#event-dialog [data-close]').click();
    await page.locator('#new-event').click();
    await form.locator('[name=title]').fill('次の公演の下書き');
    eventSave.release();
    await page.locator('#notice').getByText('公演を保存しました。').waitFor();
    assert.equal(await form.locator('[name=title]').inputValue(),'次の公演の下書き');
    assert.equal(docs.events.items[0].kind,'定期落語会');
    assert.equal(docs.events.items[0].performers[0].endTime,'00:07');

    await page.goto(new URL('rehearsals.html',base).href);
    await page.locator('#add').click();
    const rehearsal=page.locator('#rehearsal-form');
    await rehearsal.locator('[name=title]').selectOption('その他');
    await rehearsal.locator('[name=otherContent]').fill('試験の読み合わせ');
    await rehearsal.locator('[name=venue]').fill('試験会場');
    await rehearsal.locator('[name=notes]').fill('\n連絡事項');
    await rehearsal.locator('button.primary').click();
    await page.locator('[data-detail]').click();
    await page.locator('#add-practice').click();
    const practice=page.locator('.practice-row');
    await practice.locator('[name=stageName]').selectOption('guest');
    await practice.locator('[name=guestStageName]').fill('試験ゲスト');
    await practice.locator('[name=piece]').fill('時そば');
    await practice.locator('[name=seconds]').fill('45');
    const rehearsalSave=hold('rehearsals');
    await page.locator('#practice-form button[type=submit]').click();
    await rehearsalSave.sent;
    await page.locator('#rehearsal-dialog [data-close]').click();
    rehearsalSave.release();
    await page.locator('#notice').getByText('稽古したネタ・時間を保存しました。').waitFor();
    assert.equal(await page.locator('#rehearsal-dialog[open]').count(),0);
    assert.equal(docs.rehearsals.items[0].practices[0].durationSeconds,45);

    await page.evaluate(()=>localStorage.setItem('yuitei.history.v1','{broken'));
    await page.goto(new URL('history.html',base).href);
    await page.locator('[data-record-edit=history-old]').click();
    const history=page.locator('.record-dialog[open] form');
    const note='\n全角「日本語」\n'+ '長い注記 '.repeat(80);
    await history.locator('[name=note]').fill(note);
    const historySave=hold('history');
    await history.locator('button[type=submit]').click();
    await historySave.sent;
    await history.locator('[data-cancel]').click();
    await page.locator('#history-add').click();
    await history.locator('[name=occasion]').fill('同名の記録');
    historySave.release();
    await page.locator('#body').getByText('全角「日本語」',{exact:false}).waitFor();
    assert.equal(await history.locator('[name=occasion]').inputValue(),'同名の記録');
    assert.equal(docs.history.items[0].note,note);
    assert.equal(await page.evaluate(()=>localStorage.getItem('yuitei.history.v1')),'{broken');

    await history.locator('button[type=submit]').click();
    await history.locator('[role=alert]').getByText(/更新されています/).waitFor();
    assert.equal(await history.locator('[name=occasion]').inputValue(),'同名の記録');
    await history.locator('[data-cancel]').click();
    await page.locator('#history-add').click();
    await history.locator('[name=occasion]').fill('同名の記録');
    await history.locator('button[type=submit]').click();
    await history.waitFor({state:'hidden'});
    assert.equal(docs.history.items.filter(record=>record.occasion==='同名の記録').length,2);

    const viewer=await session('viewer');
    await viewer.goto(base.href);
    await viewer.locator('#schedule').getByText('翌日の公演').waitFor();
    await viewer.locator('[data-event]').click();
    await viewer.locator('.program-table').getByText('翌日 00:07').waitFor();
    assert(!await viewer.locator('#new-event').isVisible());
    assert(await viewer.locator('[data-check]').first().isDisabled());
    assert(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const rehearsalId=docs.rehearsals.items[0].id;
    attendance.set(rehearsalId,[{stageName:'別の会員',status:'出席'}]);
    await viewer.goto(new URL('rehearsals.html',base).href);
    await viewer.locator('[data-detail]').click();
    await viewer.locator('#attendance [data-self-status="欠席"]').click();
    await viewer.locator('#attendance-feedback').getByText(/登録しました/).waitFor();
    await viewer.locator('#attendance [data-self-status="未定"]').click();
    await viewer.locator('#attendance').getByText('未定 1人').waitFor();
    await viewer.reload();
    await viewer.locator('[data-detail]').click();
    await viewer.locator('#attendance').getByText('未定 1人').waitFor();
    assert.equal(await viewer.locator('#attendance [data-person]').count(),1);
    const recordsBeforeDelete=structuredClone(docs.history);
    await page.goto(new URL('rehearsals.html',base).href);
    await page.locator('[data-detail]').click();
    await page.locator('#edit-rehearsal-inside').click();
    await page.getByText('この稽古を削除する').click();
    await page.locator('#delete-confirm').check();
    page.once('dialog',async dialog=>{assert.match(dialog.message(),/既に転記した記録は残ります/);await dialog.accept()});
    await page.locator('#delete-rehearsal').click();
    await page.locator('#notice').getByText('稽古予定を削除しました。').waitFor();
    assert.equal(docs.rehearsals.items.length,0);
    assert.deepEqual(docs.history,recordsBeforeDelete);
    assert.deepEqual(attendance.get(rehearsalId),[{stageName:'別の会員',status:'出席'},{stageName:'試験会員',status:'未定'}]);
    const sample=docs.events.items[0];
    docs.events={revision:docs.events.revision+1,items:Array.from({length:500},(_,i)=>({...sample,id:'bulk-'+i}))};
    const narrow=await session('viewer');
    await narrow.setViewportSize({width:320,height:720});
    await narrow.goto(base.href);
    await narrow.waitForFunction(()=>document.querySelectorAll('#schedule .event-card').length===500);
    assert(await narrow.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    console.log('PASS event, rehearsal, and history saves remain committed when the original dialog is closed; new drafts, midnight timing, and cross-session read-back are preserved');
  }finally{
    await browser.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
