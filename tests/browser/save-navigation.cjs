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
let pending,delayedHistory;
const hold = (collection,commitEarly=false) => {
  let release, started;
  const response = new Promise(resolve => {release=resolve});
  const sent = new Promise(resolve => {started=resolve});
  pending = {collection,response,started,commitEarly};
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
          case 'read':
            if(request.name==='history'&&delayedHistory)await delayedHistory;
            return ok({doc:docs[request.name]});
          case 'roster':return ok({members:['試験会員','別の会員'].map(name=>({name}))});
          case 'attendanceRead':return ok({rows:attendance.get(request.id)||[]});
          case 'attendanceSave':{
            const rows=attendance.get(request.id)||[];
            attendance.set(request.id,[...rows.filter(row=>row.stageName!=='試験会員'),{stageName:'試験会員',status:request.status}]);
            return ok({});
          }
          case 'archivePast':{
            assert.equal(role,'admin');assert.equal(request.rehearsalDetail,true);
            const [transfer]=request.transfers;
            assert.equal(request.revisions.rehearsals,docs.rehearsals.revision);
            assert.equal(request.revisions.history,docs.history.revision);
            assert.equal(transfer.record.attendance['試験会員'],'出席');
            assert.equal(transfer.record.sourceData.notes,'当日の連絡事項');
            assert.equal(transfer.record.sourceData.practices[0].durationSeconds,185);
            docs.history={items:[...docs.history.items,transfer.record],revision:docs.history.revision+1};
            docs.rehearsals={items:docs.rehearsals.items.map(r=>r.id===transfer.id?{...r,archivedAt:'2026-11-21T08:00:00Z'}:r),revision:docs.rehearsals.revision+1};
            return ok({count:1,rehearsals:docs.rehearsals});
          }
          case 'save':{
            assert.notEqual(role,'viewer');
            if(request.revision!==docs[request.name].revision)return answer({ok:false,error:'ほかの端末で更新されています。再読み込みしてください。'});
            if(pending?.collection===request.name){
              const active=pending;pending=null;
              if(active.commitEarly)docs[request.name]={items:request.items,revision:request.revision+1};
              active.started();
              if(await active.response==='fail')return answer({ok:false,error:'模擬通信失敗'});
              if(active.commitEarly)return ok({revision:request.revision+1});
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

    const page=await session('admin');
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
    await row.locator('[name=seconds]').fill('30');
    const longName='長い高座名'.repeat(12),longPiece='非常に長い演目'.repeat(16);
    await row.locator('[name=guestStageName]').fill(longName);
    await row.locator('[name=piece]').fill(longPiece);
    await page.setViewportSize({width:320,height:720});
    assert(await row.evaluate(element=>{
      const rect=name=>element.querySelector('[name='+name+']').getBoundingClientRect();
      const performer=rect('stageName'),piece=rect('piece'),minutes=rect('minutes'),seconds=rect('seconds');
      return performer.x===piece.x&&piece.x===minutes.x&&performer.y<piece.y&&piece.y<minutes.y&&minutes.y===seconds.y&&seconds.x>minutes.x;
    }));
    await row.locator('[name=endTime]').fill('00:07');
    await row.locator('[data-end-time]').getByText('翌日 00:07').waitFor();
    const eventSave=hold('events');
    await form.locator('button[type=submit]').click();
    await eventSave.sent;
    await form.getByText('保存中…',{exact:true}).waitFor();
    assert(await form.locator('button[type=submit]').isDisabled());
    await page.locator('#event-dialog [data-close]').click();
    await page.getByRole('button',{name:'保存結果を待たずに閉じる'}).click();
    await page.locator('#new-event').click();
    await form.locator('[name=title]').fill('次の公演の下書き');
    eventSave.release();
    await page.locator('#notice').getByText('公演を保存しました。').waitFor();
    assert.equal(await form.locator('[name=title]').inputValue(),'次の公演の下書き');
    assert.equal(docs.events.items[0].kind,'定期落語会');
    assert.equal(docs.events.items[0].performers[0].endTime,'00:07');
    assert.equal(docs.events.items[0].performers[0].minutes,10.5);

    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'変更を破棄する'}).click();
    await page.locator('[data-event]').click();
    assert.equal(await page.locator('#event-dialog input, #event-dialog [data-done]').count(),0);
    const program=page.locator('.event-program-table');
    await program.getByText(longName,{exact:true}).waitFor();
    await program.getByText(longPiece,{exact:true}).waitFor();
    await program.getByText('10分30秒',{exact:true}).waitFor();
    assert(await program.evaluate(table=>table.scrollWidth<=table.parentElement.clientWidth));
    await page.evaluate(()=>{window.print=()=>{}});
    await page.locator('#print-program').click();
    await page.emulateMedia({media:'print'});
    assert(await program.isVisible());
    assert(!await page.locator('main').isVisible());
    assert((await page.pdf({format:'A4'})).length>1000);
    await page.emulateMedia({media:'screen'});
    await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
    await page.locator('#event-dialog [data-edit]').click();
    await page.setViewportSize({width:320,height:330});
    await form.locator('textarea').focus();
    await form.locator('textarea').scrollIntoViewIfNeeded();
    const saveBounds=await form.locator('button[type=submit]').boundingBox();
    assert(saveBounds.y>=0&&saveBounds.y+saveBounds.height<=330,'sticky toolbar is visible in a keyboard-sized viewport');
    await page.setViewportSize({width:393,height:740});
    assert.equal(await form.locator('[name=minutes]').inputValue(),'10');
    assert.equal(await form.locator('[name=seconds]').inputValue(),'30');
    await form.locator('[data-done]').first().check();
    await form.locator('[type=submit]').click();
    await page.locator('#event-dialog').getByText('公演を保存しました。').waitFor();
    assert.equal(docs.events.items[0].checklist[0].done,true);
    await page.locator('#event-dialog [data-close]').click();
    await page.goto(new URL('rehearsals.html',base).href);
    await page.locator('#add').click();
    const rehearsal=page.locator('#rehearsal-form');
    await rehearsal.locator('[name=title]').selectOption('その他');
    await rehearsal.locator('[name=otherContent]').fill('試験の読み合わせ');
    await rehearsal.locator('[name=venue]').fill('試験会場');
    await rehearsal.locator('[name=notes]').fill('\n連絡事項');
    await rehearsal.locator('button.primary').click();
    await page.locator('#rehearsal-dialog').getByText('稽古予定を保存しました。').waitFor();
    const savedRehearsal=JSON.stringify(docs.rehearsals);
    await page.locator('#edit-rehearsal-inside').click();
    await rehearsal.locator('[name=venue]').fill('保存しない会場');
    await rehearsal.getByRole('button',{name:'キャンセル'}).click();
    await page.getByRole('button',{name:'編集を続ける'}).click();
    assert.equal(await rehearsal.locator('[name=venue]').inputValue(),'保存しない会場');
    await rehearsal.getByRole('button',{name:'キャンセル'}).click();
    await page.getByRole('button',{name:'変更を破棄する'}).click();
    await page.locator('#rehearsal-dialog #attendance').waitFor();
    await page.locator('#edit-rehearsal-inside').click();
    await rehearsal.getByRole('button',{name:'キャンセル'}).click();
    assert.equal(await page.locator('.discard-dialog[open]').count(),0);
    assert.equal(await page.locator('#rehearsal-form').count(),0);
    assert(!await page.locator('#rehearsal-dialog').getByText('保存しない会場').count());
    assert.equal(JSON.stringify(docs.rehearsals),savedRehearsal);
    assert.equal(await page.locator('#practice-form').count(),0);
    await page.locator('#edit-practices').click();
    await page.locator('#add-practice').click();
    const practice=page.locator('.practice-row');
    await practice.locator('[name=stageName]').selectOption('guest');
    await practice.locator('[name=guestStageName]').fill('試験ゲスト');
    await practice.locator('[name=piece]').fill('時そば');
    await practice.locator('[name=seconds]').fill('45');
    assert(await practice.evaluate(element=>{
      const rect=name=>element.querySelector('[name='+name+']').getBoundingClientRect();
      const performer=rect('stageName'),piece=rect('piece'),minutes=rect('minutes'),seconds=rect('seconds');
      return performer.x===piece.x&&piece.x===minutes.x&&performer.y<piece.y&&piece.y<minutes.y&&minutes.y===seconds.y&&seconds.x>minutes.x;
    }));
    const rehearsalSave=hold('rehearsals');
    await page.locator('#practice-form button[type=submit]').click();
    await rehearsalSave.sent;
    await page.locator('#rehearsal-dialog [data-close]').click();
    await page.getByRole('button',{name:'保存結果を待たずに閉じる'}).click();
    rehearsalSave.release();
    await page.locator('#notice').getByText('稽古したネタ・時間を保存しました。').waitFor();
    assert.equal(await page.locator('#rehearsal-dialog[open]').count(),0);
    assert.equal(docs.rehearsals.items[0].practices[0].durationSeconds,45);

    await page.evaluate(()=>localStorage.setItem('yuitei.history.v1','{broken'));
    let releaseRead;
    delayedHistory=new Promise(resolve=>{releaseRead=resolve});
    await page.goto(new URL('history.html',base).href);
    await page.locator('#history-edit-status').getByText('共通の記録を読み込んでいます…').waitFor();
    assert(await page.locator('#history-add').isDisabled());
    delayedHistory=null;
    releaseRead();

    await page.locator('[data-record-edit=history-old]').click();
    const history=page.locator('.record-dialog[open] form');
    const note='\n全角「日本語」\n'+ '長い注記 '.repeat(80);
    await history.locator('[name=note]').fill(note);
    const historySave=hold('history');
    await history.locator('button[type=submit]').click();
    await historySave.sent;
    await history.locator('[data-cancel]').click();
    await page.getByRole('button',{name:'保存結果を待たずに閉じる'}).click();
    await page.locator('#history-add').click();
    await history.locator('[name=occasion]').fill('同名の記録');
    const savedHistoryResponse=page.waitForResponse(response=>response.url()===endpoint&&JSON.parse(response.request().postData()).action==='save');
    historySave.release();
    await savedHistoryResponse;
    assert.equal(await history.locator('[name=occasion]').inputValue(),'同名の記録');
    assert.equal(docs.history.items[0].note,note);
    assert.equal(await page.evaluate(()=>localStorage.getItem('yuitei.history.v1')),'{broken');

    await history.locator('button[type=submit]').click();
    await history.locator('[role=alert]').getByText(/更新されています/).waitFor();
    assert.equal(await history.locator('[name=occasion]').inputValue(),'同名の記録');
    await history.locator('[data-cancel]').click();
    await page.getByRole('button',{name:'変更を破棄する'}).click();
    await page.locator('#history-add').click();
    await history.locator('[name=occasion]').fill('同名の記録');
    await history.locator('button[type=submit]').click();
    await history.waitFor({state:'hidden'});
    assert.equal(docs.history.items.filter(record=>record.occasion==='同名の記録').length,2);

    const recovery=page.locator('.save-recovery > div').filter({hasText:'模擬通信失敗'});
    async function failAfterClose(collection,editor,close,field,value){
      const failedSave=hold(collection);
      await editor.locator('[type=submit],button.primary:not([type=button])').first().click();
      await failedSave.sent;
      await close.click();
      await page.getByRole('dialog',{name:'保存結果はまだ確定していません'}).waitFor();
      await page.getByRole('button',{name:'保存結果を待たずに閉じる'}).click();
      assert(await page.evaluate(()=>!window.dispatchEvent(new Event('beforeunload',{cancelable:true}))));
      failedSave.release('fail');
      await recovery.getByText(/保存できませんでした/).waitFor();
      await recovery.getByRole('button',{name:'入力を復元する'}).click();
      assert.equal(await editor.locator(field).inputValue(),value);
      await editor.locator('[type=submit],button.primary:not([type=button])').first().click();
      await recovery.waitFor({state:'hidden'});
    }

    await page.goto(base.href);
    await page.locator('[data-event]').click();
    await page.locator('[data-edit]').click();
    await form.locator('[name=piece]').fill('番組表の復元');
    await failAfterClose('events',form,page.locator('#event-dialog [data-close]'),'[name=piece]','番組表の復元');
    await page.locator('#event-dialog').getByText('番組表の復元').waitFor();

    await page.goto(new URL('rehearsals.html',base).href);
    await page.locator('[data-detail]').click();
    await page.locator('#edit-rehearsal-inside').click();
    await rehearsal.locator('[name=venue]').fill('稽古の復元');
    await failAfterClose('rehearsals',rehearsal,page.locator('#rehearsal-dialog [data-close]'),'[name=venue]','稽古の復元');
    await page.locator('#rehearsal-dialog').getByText(/稽古の復元/).waitFor();
    await page.locator('#edit-practices').click();
    await page.locator('#practice-form [name=piece]').fill('ネタの復元');
    await failAfterClose('rehearsals',page.locator('#practice-form'),page.locator('#rehearsal-dialog [data-close]'),'[name=piece]','ネタの復元');
    await page.locator('#practice-section').getByText(/ネタの復元/).waitFor();
    await page.locator('#edit-rehearsal-inside').click();
    await rehearsal.locator('[name=notes]').fill('再読み込み後の復元');
    const interrupted=hold('rehearsals');
    await rehearsal.locator('button.primary').click();await interrupted.sent;
    let warned=false;
    page.once('dialog',async message=>{warned=message.type()==='beforeunload';await message.accept()});
    await page.reload();
    interrupted.release('fail');
    assert(warned);
    const uncertain=page.locator('.save-recovery').filter({hasText:/保存結果を確認できませんでした|Failed to fetch/});
    await uncertain.getByRole('button',{name:'入力を復元する'}).click();
    assert.equal(await rehearsal.locator('[name=notes]').inputValue(),'再読み込み後の復元');
    await rehearsal.locator('button.primary').click();
    await uncertain.waitFor({state:'hidden'});
    await page.locator('#rehearsal-dialog').getByText('再読み込み後の復元').waitFor();

    await page.locator('#edit-rehearsal-inside').click();
    await rehearsal.locator('[name=notes]').fill('応答が届く前に確定した更新');
    const committed=hold('rehearsals',true);
    await rehearsal.locator('button.primary').click();await committed.sent;
    page.once('dialog',message=>message.accept());
    await page.reload();
    committed.release();
    await uncertain.getByRole('button',{name:'入力を復元する'}).click();
    await rehearsal.getByText(/保存先の内容が変わっています/).waitFor();
    assert(await rehearsal.locator('button.primary').isDisabled());
    assert.equal(docs.rehearsals.items[0].notes,'応答が届く前に確定した更新');

    await page.goto(new URL('history.html',base).href);
    await page.locator('[data-record-edit=history-old]').click();
    await history.locator('[name=note]').fill('記録の復元');
    await failAfterClose('history',history,history.locator('[data-cancel]'),'[name=note]','記録の復元');
    await page.locator('#history-edit-result').getByText('記録を保存しました。').waitFor();
    assert.equal(docs.history.items[0].note,'記録の復元');

    const viewer=await session('viewer');
    await viewer.goto(base.href);
    await viewer.locator('#schedule').getByText('翌日の公演').waitFor();
    await viewer.locator('[data-event]').click();
    await viewer.locator('.program-table').getByText('翌日 00:07').waitFor();
    assert(!await viewer.locator('#new-event').isVisible());
    assert.equal(await viewer.locator('#event-dialog [data-done],#event-dialog input[type=checkbox]').count(),0);
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
    const todayPractice={id:'today-archive',title:'通常稽古',date:'2026-11-21',time:'17:00',venue:'和室',notes:'当日の連絡事項',practices:[
      {stageName:'試験会員',piece:'時そば',durationSeconds:185},
      {stageName:'試験会員',piece:'猫と金魚',durationSeconds:0},
      {stageName:'別の会員',piece:'寿限無',durationSeconds:null}
    ]};
    docs.rehearsals={revision:docs.rehearsals.revision+1,items:[todayPractice,{...todayPractice,id:'next-practice',title:'師匠稽古',date:'2026-12-13'}]};
    attendance.set(todayPractice.id,[{stageName:'試験会員',status:'出席'}]);
    await page.clock.setFixedTime(new Date('2026-11-21T08:01:00Z'));
    await page.goto(new URL('rehearsals.html',base).href);
    await page.locator('.member-home').getByText('今日の稽古').waitFor();
    await page.locator('[data-open-rehearsal]').click();
    const durations=page.locator('.practice-table td.duration-value');
    assert.deepEqual(await durations.allTextContents(),['3分05秒','0分00秒','未入力']);
    assert(await durations.evaluateAll(cells=>cells.every(cell=>getComputedStyle(cell).textAlign==='right')));
    await page.locator('#edit-rehearsal-inside').click();
    const archive=page.getByRole('button',{name:'終了して記録へ移す'});
    await archive.click();
    const confirmation=page.getByRole('dialog',{name:'稽古の終了を確認'});
    await confirmation.getByRole('button',{name:'戻る',exact:true}).click();
    assert.equal(docs.history.items.filter(r=>r.sourceId===todayPractice.id).length,0);
    await archive.click();
    await confirmation.getByRole('button',{name:'終了して移す'}).click();
    await page.locator('.member-home').getByText('次回の稽古').waitFor();
    await page.locator('[data-open-rehearsal="next-practice"]').waitFor();
    assert.equal(docs.history.items.filter(r=>r.sourceId===todayPractice.id).length,1);
    await page.goto(new URL('history.html',base).href);
    const longRecordPiece='とても長い演目'.repeat(20);
    docs.history.items.push({id:'custom-event',date:'2026-11-21',kind:'交流寄席',occasion:'独自の公演',pieces:{'試験会員':longRecordPiece+'（3分5秒）／猫と金魚（0分）'},note:'会場：試験会場'});
    await page.reload();
    await page.locator('[data-record-id=custom-event]').getByText('独自の公演').waitFor();
    assert.equal(await page.locator('[data-record-id="transferred:rehearsal:today-archive"]').count(),0);
    await page.locator('#query').fill('試験会場');
    assert.equal(await page.locator('#body [data-record-id]').count(),1);
    await page.locator('#kind').selectOption('交流寄席');
    await page.setViewportSize({width:320,height:720});
    const customRow=page.locator('[data-record-id=custom-event]');
    assert.deepEqual(await customRow.locator('td .duration-value').allTextContents(),['3分05秒','0分00秒']);
    assert(await customRow.locator('.duration-value').evaluateAll(cells=>cells.every(cell=>getComputedStyle(cell).textAlign==='right')));
    assert(await page.locator('.scroll').evaluate(container=>{
      const day=container.querySelector('#body .fixed-date'),name=container.querySelector('#body .fixed-occasion');
      const before=[day.getBoundingClientRect().left,name.getBoundingClientRect().left];
      container.scrollLeft=200;
      return container.scrollLeft>0&&before[0]===day.getBoundingClientRect().left&&before[1]===name.getBoundingClientRect().left&&document.documentElement.scrollWidth<=innerWidth;
    }));
    await page.locator('#query').fill('');
    await page.locator('[data-record-type=rehearsal]').click();
    const rehearsalRow=page.locator('[data-record-id="transferred:rehearsal:today-archive"]');
    await rehearsalRow.getByText(/当日の連絡事項/).waitFor();
    await rehearsalRow.getByText('0分00秒',{exact:true}).first().waitFor();
    await rehearsalRow.getByText('未入力',{exact:true}).first().waitFor();
    await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({media:'print'});
    assert(await page.locator('#body .duration-value').getByText('3分05秒',{exact:true}).first().isVisible());
    assert((await page.pdf({format:'A4'})).length>1000);
    await page.emulateMedia({media:'screen'});
    await page.locator('[data-record-type=all]').click();
    assert.equal(await page.locator('[data-record-id="transferred:rehearsal:today-archive"]').count(),1);
    assert.equal(await page.locator('[data-record-id=custom-event]').count(),1);

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
