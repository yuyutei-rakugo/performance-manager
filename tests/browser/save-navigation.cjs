const assert = require('node:assert/strict');
const {readFile,mkdir}=require('node:fs/promises');
const { chromium, devices } = require('playwright');

const base = new URL(process.env.AUDIT_URL || 'http://127.0.0.1:8151/');
assert.equal(base.hostname, '127.0.0.1', 'The audit must run against a local copy.');
const endpoint = 'https://script.google.com/macros/s/audit-fixture/exec';
const reservationRows=[];
let failReservation=true;
const docs = {
  events: {revision:1, items:[]},
  rehearsals: {revision:1, items:[]},
  history: {revision:1, items:[{
    id:'history-old', date:'2026-06-01', kind:'定期落語会',
    occasion:'同名の記録', pieces:{'試験会員':'寿限無'}, note:''
  }]}
};
const attendance=new Map(),flyerRows=[],flyerRefused=[];
let failFlyer=false;
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
            assert.equal(transfer.record.note,'会場：和室\n開始：17:00\n当日の連絡事項');
            assert.equal(transfer.record.sourceData.practices[0].durationSeconds,185);
            docs.history={items:[...docs.history.items,transfer.record],revision:docs.history.revision+1};
            docs.rehearsals={items:docs.rehearsals.items.map(r=>r.id===transfer.id?{...r,archivedAt:'2026-11-21T08:00:00Z'}:r),revision:docs.rehearsals.revision+1};
            return ok({count:1,rehearsals:docs.rehearsals});
          }
          case 'flyerRead':case 'flyerImport':return ok({rows:flyerRows,locationFields:true,googleShare:true,declineFields:true,migrationRequired:false,refused:flyerRefused,categories:['公共施設'],sources:[],archived:false});
          case 'flyerResolveGoogleLink':
            return request.url.endsWith('/example')?ok({name:'',address:''}):ok({name:'石毛呉服店',address:'千葉県銚子市飯沼町1-25'});
          case 'flyerSave':{
            assert(['admin','viewer'].includes(role),'authenticated members can save flyer records');
            assert.equal(request.eventId,docs.events.items[0].id);
            if(failFlyer){failFlyer=false;return answer({ok:false,error:'模擬掲示先保存失敗'})}
            if(request.id){
              const i=flyerRows.findIndex(row=>row.id===request.id);
              assert(i>=0);
              assert.equal(request.revision,flyerRows[i].revision);
              flyerRows[i]={...flyerRows[i],...request.entry,revision:request.revision+1};
            }else flyerRows.push({...request.entry,id:flyerRows.some(row=>row.id==='test-flyer')?'test-flyer-'+(flyerRows.length+1):'test-flyer',revision:1});
            return ok({rows:flyerRows,locationFields:true,googleShare:true,declineFields:true,migrationRequired:false,refused:flyerRefused,categories:['公共施設'],sources:[],archived:false});
          }
          case 'reservationList':return ok({documents:reservationRows,schedules:[],canReview:false});
          case 'reservationAdd':{
            assert.equal(role,'viewer');assert(request.photo.startsWith('/9j/'));
            if(failReservation){failReservation=false;return answer({ok:false,error:'模擬写真保存失敗'})}
            reservationRows.push({id:'test-photo',fields:request.fields,status:'確認待ち',reasons:['候補なし']});
            return ok({documents:reservationRows,schedules:[],canReview:false});
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
    await form.getByRole('button',{name:'変更を保存する',exact:true}).waitFor();
    const task=form.locator('.task-edit-row').first();
    await task.locator('[data-task-title]').click();
    assert(await task.locator('[data-done]').isChecked());
    await task.locator('[data-excluded]').check();
    assert(!await task.locator('[data-done]').isChecked());
    await task.locator('[data-task-title]').click();
    assert(!await task.locator('[data-excluded]').isChecked());
    await form.locator('[data-excluded]').nth(1).check();
    await form.locator('[type=submit]').click();
    await page.locator('#event-dialog').getByText('公演を保存しました。').waitFor();
    assert.equal(docs.events.items[0].checklist[0].done,true);
    assert.equal(docs.events.items[0].checklist[1].excluded,true);
    await page.locator('#event-dialog .progress').getByText('1／'+(docs.events.items[0].checklist.length-1)+'件 完了',{exact:true}).waitFor();
    await page.locator('#event-dialog .progress').getByText('対象外 1件',{exact:true}).waitFor();
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

    const historyRow=page.locator('[data-record-id=history-old]');
    await historyRow.waitFor();
    assert.equal(await historyRow.locator('[data-record-edit]').count(),0);
    const readingHeight=(await historyRow.boundingBox()).height;
    await page.getByRole('button',{name:'記録を編集する',exact:true}).click();
    assert((await historyRow.boundingBox()).height>readingHeight);
    await page.getByRole('button',{name:'編集を終了',exact:true}).click();
    assert.equal(await historyRow.locator('[data-record-edit]').count(),0);
    assert.equal((await historyRow.boundingBox()).height,readingHeight);

    await page.getByRole('button',{name:'記録を編集する',exact:true}).click();
    await page.locator('[data-record-edit=history-old]').click();
    const history=page.locator('.record-dialog[open] form');
    await history.getByRole('button',{name:'＋ 区分を追加'}).click();
    await history.locator('.category-adder input').fill('試験用の独自区分');
    await history.locator('[data-cancel-category]').click();
    assert.equal(await history.locator('[name=kind]').inputValue(),'定期落語会');
    assert.equal(await history.locator('[data-cancel]').count(),1);
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
    await page.locator('[data-detail], [data-open-rehearsal]').first().click();
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
    await page.getByRole('button',{name:'記録を編集する',exact:true}).click();
    await page.locator('[data-record-edit=history-old]').click();
    await history.locator('[name=note]').fill('記録の復元');
    await failAfterClose('history',history,history.locator('[data-cancel]'),'[name=note]','記録の復元');
    await page.locator('#history-edit-result').getByText('記録を保存しました。').waitFor();
    assert.equal(docs.history.items[0].note,'記録の復元');

    const viewer=await session('viewer');
    await viewer.goto(base.href);
    await viewer.locator('main .event-card').getByText('翌日の公演').waitFor();
    await viewer.locator('[data-event]').click();
    await viewer.locator('.program-table').getByText('翌日 00:07').waitFor();
    assert(!await viewer.locator('#new-event').isVisible());
    assert.equal(await viewer.locator('#event-dialog [data-done],#event-dialog input[type=checkbox]').count(),0);
    assert(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const rehearsalId=docs.rehearsals.items[0].id;
    attendance.set(rehearsalId,[{stageName:'別の会員',status:'出席'}]);
    await viewer.goto(new URL('rehearsals.html',base).href);
    await viewer.locator('[data-open-rehearsal]').waitFor();
    assert.equal(await viewer.locator('#rehearsals [data-detail="'+rehearsalId+'"]').count(),0);
    await viewer.locator('[data-detail], [data-open-rehearsal]').first().click();
    await viewer.locator('#attendance [data-self-status="欠席"]').click();
    await viewer.locator('#attendance-feedback').getByText(/登録しました/).waitFor();
    await viewer.locator('#attendance [data-self-status="未定"]').click();
    await viewer.locator('#attendance').getByText('未定 1人').waitFor();
    await viewer.reload();
    await viewer.locator('[data-detail], [data-open-rehearsal]').first().click();
    await viewer.locator('#attendance').getByText('未定 1人').waitFor();
    assert.equal(await viewer.locator('#attendance [data-person]').count(),1);
    const recordsBeforeDelete=structuredClone(docs.history);
    await page.goto(new URL('rehearsals.html',base).href);
    await page.locator('[data-detail], [data-open-rehearsal]').first().click();
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
    const legacyNote='会場：旧会場\n手入力の連絡事項\n1. 試験会員｜時そば（3分5秒）\n2. 別の会員｜注記だけに残っているネタ\n試験会員：出席\n別の会員：欠席';
    docs.history.items.push({id:'legacy-rehearsal',date:'2026-11-20',kind:'通常稽古',occasion:'旧形式の稽古',
      pieces:{'試験会員':'時そば（3分05秒）','旧記録の会員':'○','別の会員':'○'},
      attendance:{'試験会員':'出席','別の会員':'欠席','出席のみの会員':'出席','未定の会員':'未定','未回答の会員':'未回答'},note:legacyNote});
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
    const legacy=page.locator('[data-record-id=legacy-rehearsal]');
    const legacyNotes=legacy.locator('td').last();
    await legacyNotes.getByText(/手入力の連絡事項/).waitFor();
    assert.equal(await legacyNotes.textContent(),'会場：旧会場\n手入力の連絡事項\n別の会員｜注記だけに残っているネタ');
    const expectedMemberCells={'試験会員':'時そば3分05秒','別の会員':'','旧記録の会員':'○','出席のみの会員':'○','未定の会員':'','未回答の会員':''};
    async function assertMemberCells(){
      const names=await page.locator('#head tr').last().locator('th').allTextContents();
      const cells=await legacy.locator('td').allTextContents();
      for(const [name,value] of Object.entries(expectedMemberCells)){
        assert(names.includes(name));
        assert.equal(cells[names.indexOf(name)+2],value,name);
      }
    }
    await assertMemberCells();
    assert.equal(docs.history.items.find(record=>record.id==='legacy-rehearsal').note,legacyNote);
    async function downloadRecords(){
      const download=page.waitForEvent('download');
      await page.locator('#download').click();
      return readFile(await (await download).path(),'utf8');
    }
    await page.locator('#query').fill('旧形式の稽古');
    const csv=await downloadRecords();
    assert(csv.includes('"時そば（3分05秒）"'));
    assert(!/"(?:出席|欠席|未定|未登録|未回答)"/.test(csv));
    assert(csv.includes('"会場：旧会場\n手入力の連絡事項\n別の会員｜注記だけに残っているネタ"'));
    assert(!csv.includes('試験会員：出席'));
    assert(!csv.includes('別の会員：欠席'));
    assert(!csv.includes('1. 試験会員'));
    assert(!csv.includes('3分5秒'));
    for(const [name,value] of Object.entries({...expectedMemberCells,'試験会員':'時そば（3分05秒）'})){
      await page.locator('#person').selectOption(name);
      const filtered=await downloadRecords();
      assert(filtered.includes('"日付","公演・稽古","'+name+'","注記"'));
      assert(filtered.includes('"旧形式の稽古","'+value+'",'),name);
    }
    await page.locator('#person').selectOption('');
    await page.locator('#query').fill('');
    await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({media:'print'});
    await assertMemberCells();
    assert(await page.locator('#body .duration-value').getByText('3分05秒',{exact:true}).first().isVisible());
    assert((await page.pdf({format:'A4'})).length>1000);
    assert.equal(await legacyNotes.textContent(),'会場：旧会場\n手入力の連絡事項\n別の会員｜注記だけに残っているネタ');
    await page.emulateMedia({media:'screen'});
    await page.locator('[data-record-type=all]').click();
    assert.equal(await page.locator('[data-record-id="transferred:rehearsal:today-archive"]').count(),1);
    assert.equal(await page.locator('[data-record-id=custom-event]').count(),1);

    await viewer.goto(new URL('history.html',base).href);
    await viewer.locator('[data-record-id=history-old]').waitFor();
    assert.equal(await viewer.getByRole('button',{name:'記録を編集する',exact:true}).count(),0);
    assert.equal(await viewer.locator('[data-record-edit]').count(),0);
    const editorPage=await session('editor');
    await editorPage.goto(new URL('history.html',base).href);
    await editorPage.getByRole('button',{name:'記録を編集する',exact:true}).click();
    await editorPage.locator('[data-record-edit=history-old]').waitFor();

    const checklistViewer=await session('viewer');
    await checklistViewer.goto(base.href);
    await checklistViewer.locator('[data-event]').click();
    await checklistViewer.locator('#event-dialog .task-summary.is-excluded').getByText('対象外',{exact:true}).waitFor();
    const committedTasks=structuredClone(docs.events.items[0].checklist);
    docs.events.items[0].checklist=committedTasks.map(task=>({...task,done:false,excluded:true}));
    docs.events.revision++;
    await checklistViewer.reload();
    await checklistViewer.locator('[data-event]').click();
    await checklistViewer.clock.setFixedTime(new Date(Date.now()+120000));
    await checklistViewer.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await checklistViewer.locator('#event-dialog').getByText('対象作業なし',{exact:true}).waitFor();
    docs.events.items[0].checklist=committedTasks;
    docs.events.revision++;

    const invited=await session('viewer');
    const invitation=new URL(base);
    invitation.searchParams.set('detail',docs.events.items[0].id);
    await invited.goto(invitation.href);
    await invited.locator('#event-dialog[open] #event-heading').getByText('翌日の公演').waitFor();

    await invited.locator('[data-flyers]').click();
    const flyerPanel=invited.getByRole('dialog',{name:'チラシ配布・掲示',exact:true});
    const flyerForm=invited.getByRole('dialog',{name:'掲示先を編集',exact:true});
    await mkdir('test-artifacts',{recursive:true});
    await invited.setViewportSize({width:360,height:740});
    await invited.route('https://photon.komoot.io/api/**',route=>route.fulfill({json:{features:[]}}));
    await invited.route('https://msearch.gsi.go.jp/**',route=>route.fulfill({json:[]}));
    let tiles=0;
    await invited.route('https://cyberjapandata.gsi.go.jp/xyz/**',route=>{tiles++;return route.fulfill({status:404,body:''})});
    await flyerPanel.getByLabel('登録済みの施設を探す',{exact:true}).fill('未収録の試験施設');
    await flyerPanel.getByRole('button',{name:'検索する',exact:true}).click();
    await flyerPanel.getByRole('button',{name:'「未収録の試験施設」を新しく追加',exact:true}).click();
    assert.equal(await flyerForm.getByLabel('施設名',{exact:true}).inputValue(),'未収録の試験施設');
    assert.equal(await flyerForm.locator('button[type=submit]').count(),1,'one save button');
    assert(!await flyerForm.getByLabel('住所',{exact:true}).isVisible(),'optional address stays hidden');
    assert(await flyerForm.getByLabel('Googleマップの共有リンク（任意）').isVisible());
    assert.deepEqual(await flyerForm.locator('.flyer-share-link > button').allTextContents(),['Googleマップで探す','貼り付け','リンクから場所を確認']);
    await flyerForm.locator('.flyer-place-fallback').evaluate(el=>el.open=true);
    await flyerForm.getByLabel('施設名',{exact:true}).fill('未収録の試験施設');
    await invited.context().route('https://www.google.com/maps/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Map search handoff fixture</h1>'}));
    // Manual map opens immediately beside its sole button, not below all fallback fields.
    await flyerForm.locator('.flyer-place-fallback').evaluate(el=>el.open=true);
    assert(!await flyerForm.getByRole('button',{name:'地図上で位置を指定',exact:true}).isVisible());
    const popupPromise=invited.context().waitForEvent('page');
    await flyerForm.getByRole('button',{name:'Googleマップで探す',exact:true}).click();
    const mapSearchPage=await popupPromise;await mapSearchPage.waitForLoadState();
    const externalQuery=new URL(mapSearchPage.url()).searchParams.get('query');
    assert.equal(externalQuery,'未収録の試験施設 神栖市');
    await mapSearchPage.close();
    await flyerForm.getByRole('button',{name:'地図を開いて場所を指定',exact:true}).click();
    await flyerForm.locator('.flyer-inline-map .flyer-map-canvas').waitFor();
    assert(await flyerForm.locator('.flyer-inline-map').evaluate(el=>el.previousElementSibling?.textContent==='地図を閉じる'));
    await flyerForm.locator('.flyer-inline-map .flyer-tile-warning').waitFor();
    const manualBounds=await flyerForm.locator('.flyer-inline-map .flyer-map-canvas').boundingBox();
    const manualSave=await flyerForm.getByRole('button',{name:'登録する',exact:true}).boundingBox();
    const warningBounds=await flyerForm.locator('.flyer-inline-map .flyer-tile-warning').boundingBox();
    assert(warningBounds.y>=0&&warningBounds.y+warningBounds.height<=manualSave.y,'connection failure is visible above save');
    assert(manualBounds.y<manualSave.y,'manual map is reached without traversing the remaining options');
    await flyerForm.screenshot({path:'test-artifacts/facility-manual-map-mobile.png'});
    await flyerForm.getByRole('button',{name:'地図を閉じる',exact:true}).click();
    assert.equal(await flyerForm.locator('.flyer-inline-map .flyer-map-canvas').count(),0);
    await flyerForm.getByRole('button',{name:'地図を開いて場所を指定',exact:true}).click();
    const manualCanvas=flyerForm.locator('.flyer-inline-map .flyer-map-canvas');
    await manualCanvas.click({position:{x:110,y:100}});
    assert.notEqual(await flyerForm.locator('[name=lat]').inputValue(),'','a manual tap stages coordinates');
    await flyerForm.getByRole('button',{name:'地図を閉じる',exact:true}).click();
    // This scenario will register the facility without a pin, so clear only the test draft.
    await flyerForm.locator('[name=lat]').evaluate(el=>{el.value='';el.dispatchEvent(new Event('input',{bubbles:true}))});
    await flyerForm.locator('[name=lng]').evaluate(el=>{el.value='';el.dispatchEvent(new Event('input',{bubbles:true}))});
    await flyerForm.locator('.flyer-place-fallback').evaluate(el=>el.open=true);
    await flyerForm.locator('.flyer-place-fallback').evaluate(el=>el.open=true);
    await flyerForm.getByRole('button',{name:'施設名で場所を検索',exact:true}).click();
    await flyerForm.getByText(/老舗でも未収録/).waitFor();
    await flyerForm.screenshot({path:'test-artifacts/facility-search-mobile.png'});
    failFlyer=true;
    await flyerForm.getByRole('button',{name:'登録する',exact:true}).click();
    await flyerForm.locator('[data-editor-status]').filter({hasText:'保存できませんでした'}).waitFor();
    assert.equal(await flyerForm.getByLabel('施設名',{exact:true}).inputValue(),'未収録の試験施設');
    await flyerForm.getByRole('button',{name:'登録する',exact:true}).click();
    await flyerForm.waitFor({state:'hidden'});
    await flyerPanel.locator('[data-message]').filter({hasText:'場所は確認待ち'}).waitFor();
    assert.equal(flyerRows.length,1);assert.equal(flyerRows[0].location,undefined);
    await flyerPanel.getByRole('button',{name:/場所の要確認/}).click();
    assert.equal(await flyerPanel.locator('[data-venue-id]').count(),1);
    await flyerPanel.getByRole('button',{name:'すべての施設に戻る',exact:true}).click();
    await flyerPanel.getByRole('button',{name:'場所を設定する（任意）',exact:true}).click();
    assert.equal(await flyerForm.getByLabel('施設名',{exact:true}).inputValue(),'未収録の試験施設');
    await flyerForm.locator('.flyer-place-fallback').evaluate(el=>el.open=true);
    await invited.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:async()=> 'https://maps.app.goo.gl/example'}}));
    await flyerForm.getByRole('button',{name:'貼り付け',exact:true}).click();
    assert.equal(await flyerForm.getByLabel('Googleマップの共有リンク（任意）').inputValue(),'https://maps.app.goo.gl/example');
    await flyerForm.getByRole('button',{name:'リンクから場所を確認',exact:true}).click();
    await flyerForm.getByText(/施設の位置を読み取れませんでした/).waitFor();
    assert.equal(await flyerForm.locator('[name=lat]').inputValue(),'');
    await flyerForm.getByRole('button',{name:'保存する',exact:true}).click();
    await flyerForm.waitFor({state:'hidden'});
    assert.deepEqual(flyerRows[0].location,{address:'',mapUrl:'https://maps.app.goo.gl/example'});
    await flyerPanel.getByRole('button',{name:/場所の要確認/}).click();
    assert.equal(await flyerPanel.locator('[data-venue-id]').count(),1,'short link alone remains in review');
    await flyerPanel.getByRole('button',{name:'すべての施設に戻る',exact:true}).click();

    await flyerPanel.getByRole('button',{name:'場所を設定する（任意）',exact:true}).click();
    await flyerForm.getByLabel('Googleマップの共有リンク（任意）').fill('https://maps.app.goo.gl/j9k7ZsgZdyYVzWJZA?g_st=ac');
    await flyerForm.getByRole('button',{name:'リンクから場所を確認',exact:true}).click();
    await flyerForm.getByText('千葉県銚子市飯沼町1-25',{exact:true}).waitFor();
    await flyerForm.locator('.flyer-confirmation .flyer-map-canvas').waitFor();
    await flyerForm.getByRole('button',{name:'施設名を「石毛呉服店」に変更',exact:true}).click();
    assert.equal(await flyerForm.locator('[name=lat]').inputValue(),'35.73224754');
    assert.equal(await flyerForm.locator('[name=mapUrl]').inputValue(),'https://maps.app.goo.gl/j9k7ZsgZdyYVzWJZA?g_st=ac');
    await flyerForm.getByRole('button',{name:'一覧に戻る',exact:true}).click();
    await invited.getByRole('button',{name:'変更を破棄して一覧に戻る',exact:true}).click();

    // A different candidate name is presented explicitly; renaming is a draft until saved.
    await invited.route('https://photon.komoot.io/api/**',route=>route.fulfill({json:{features:[
      {properties:{name:'未収録の試験施設 本店',city:'神栖市'},geometry:{coordinates:[140.7,35.8]}}
    ]}}));
    await flyerPanel.getByRole('button',{name:'場所を設定する（任意）',exact:true}).click();
    await flyerForm.locator('.flyer-place-fallback').evaluate(el=>el.open=true);
    await flyerForm.getByRole('button',{name:'施設名で場所を検索',exact:true}).click();
    await flyerForm.getByRole('button',{name:'この施設を選ぶ',exact:true}).click();
    await flyerForm.getByText('現在の登録名：未収録の試験施設',{exact:true}).waitFor();
    const candidateLatitude=await flyerForm.locator('[name=lat]').inputValue();
    await flyerForm.getByRole('button',{name:'施設名を「未収録の試験施設 本店」に変更',exact:true}).click();
    assert.equal(await flyerForm.locator('[name=name]').inputValue(),'未収録の試験施設 本店');
    assert.equal(await flyerForm.locator('[name=lat]').inputValue(),candidateLatitude,'renaming preserves the selected position');
    assert.equal(flyerRows[0].name,'未収録の試験施設','draft name does not change the database');
    await flyerForm.getByRole('button',{name:'一覧に戻る',exact:true}).click();
    await invited.getByRole('button',{name:'変更を破棄して一覧に戻る',exact:true}).click();
    await invited.route('https://photon.komoot.io/api/**',route=>route.fulfill({json:{features:[]}}));

    // Selecting a known candidate opens a read-only confirmation, then saves the pin.
    await flyerPanel.getByRole('button',{name:'施設を追加',exact:true}).click();
    await flyerForm.locator('.flyer-place-fallback').evaluate(el=>el.open=true);
    await flyerForm.getByLabel('施設名',{exact:true}).fill('矢田部郵便局');
    await flyerForm.locator('.flyer-place-fallback').evaluate(el=>el.open=true);
    await flyerForm.getByRole('button',{name:'施設名で場所を検索',exact:true}).click();
    await flyerForm.getByRole('button',{name:'この施設を選ぶ',exact:true}).first().click();
    await flyerForm.getByRole('heading',{name:'この施設ですか？',exact:true}).waitFor();
    const confirmationMap=flyerForm.locator('.flyer-confirmation .flyer-map-canvas');
    await confirmationMap.waitFor();
    const footerBounds=await flyerForm.getByRole('button',{name:'登録する',exact:true}).boundingBox();
    assert(footerBounds.y>=0&&footerBounds.y+footerBounds.height<=740,'save stays visible without scrolling');
    const beforePin=await flyerForm.locator('[name=lat]').inputValue();
    await confirmationMap.click({position:{x:110,y:100}});
    const tappedPin=await flyerForm.locator('[name=lat]').inputValue();
    assert.notEqual(tappedPin,beforePin,'tap adjusts the confirmation pin');
    const draggable=confirmationMap.locator('.flyer-adjust-pin');
    await draggable.scrollIntoViewIfNeeded();
    const pinBounds=await draggable.boundingBox();
    const x=Math.round(pinBounds.x+22),y=Math.round(pinBounds.y+22);
    assert(await invited.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('.flyer-adjust-pin'),{x,y}),'pin is reachable at the drag start');
    const touch=await invited.context().newCDPSession(invited);
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let step=1;step<=5;step++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+step*4,y:y+step*6}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await touch.detach();
    const adjustedLatitude=Number(await flyerForm.locator('[name=lat]').inputValue());
    assert.notEqual(adjustedLatitude,Number(tappedPin),'drag adjusts the confirmation pin');
    await confirmationMap.getByRole('button',{name:'拡大',exact:true}).click();
    await confirmationMap.getByRole('button',{name:'縮小',exact:true}).click();
    await flyerForm.getByRole('button',{name:'航空写真に切り替え',exact:true}).click();
    await flyerForm.getByRole('button',{name:'通常の地図に切り替え',exact:true}).click();
    assert.equal(Number(await flyerForm.locator('[name=lat]').inputValue()),adjustedLatitude);
    assert(!await flyerForm.getByLabel('施設名',{exact:true}).isVisible());
    assert.equal(await flyerForm.locator('button[type=submit]').count(),1);
    await flyerForm.evaluate(()=>document.fonts.ready);
    await flyerForm.screenshot({path:'test-artifacts/facility-confirm-mobile.png'});
    await invited.setViewportSize({width:320,height:680});
    const narrowSave=await flyerForm.getByRole('button',{name:'登録する',exact:true}).boundingBox();
    assert(narrowSave.y+narrowSave.height<=680&&narrowSave.x>=0&&narrowSave.x+narrowSave.width<=320,'save remains usable on a small screen');
    assert(await flyerForm.evaluate(el=>el.scrollWidth<=el.clientWidth+2),'no horizontal overflow');
    await flyerForm.screenshot({path:'test-artifacts/facility-confirm-small.png'});
    await invited.setViewportSize({width:360,height:740});
    failFlyer=true;
    await flyerForm.getByRole('button',{name:'登録する',exact:true}).click();
    await flyerForm.locator('[data-editor-status]').filter({hasText:'保存できませんでした'}).waitFor();
    await flyerForm.getByRole('button',{name:'登録する',exact:true}).click();
    await flyerForm.waitFor({state:'hidden'});
    assert.equal(flyerRows.length,2);
    const postal=flyerRows.find(row=>row.name==='矢田部郵便局');
    assert.equal(postal.location.lat,adjustedLatitude);
    await flyerPanel.locator('[data-message]').filter({hasText:'施設とピンを保存しました'}).waitFor();
    assert.equal(await flyerPanel.locator('.flyer-just-edited').count(),1);
    await flyerPanel.screenshot({path:'test-artifacts/facility-list-mobile.png'});

    // An existing facility candidate navigates to its row, without a duplicate save.
    await flyerPanel.getByRole('button',{name:'施設を追加',exact:true}).click();
    await flyerForm.locator('.flyer-place-fallback').evaluate(el=>el.open=true);
    await flyerForm.getByLabel('施設名',{exact:true}).fill('矢田部郵便局');
    await flyerForm.locator('.flyer-place-fallback').evaluate(el=>el.open=true);
    await flyerForm.getByRole('button',{name:'施設名で場所を検索',exact:true}).click();
    await flyerForm.getByRole('button',{name:'登録済み・一覧で見る',exact:true}).click();
    await flyerForm.waitFor({state:'hidden'});assert.equal(flyerRows.length,2);
    const postalCard=flyerPanel.locator('[data-venue-id="'+postal.id+'"]');
    await postalCard.locator('summary').click();
    await postalCard.getByRole('button',{name:'場所を登録・変更',exact:true}).click();
    await flyerForm.locator('.flyer-adjust-pin').waitFor();
    assert.equal(Number(await flyerForm.locator('[name=lat]').inputValue()),adjustedLatitude);
    await flyerForm.getByLabel('Googleマップの共有リンク（任意）').fill('https://maps.app.goo.gl/j9k7ZsgZdyYVzWJZA?g_st=ac');
    await flyerForm.getByRole('button',{name:'リンクから場所を確認',exact:true}).click();
    await flyerForm.getByRole('heading',{name:'この施設ですか？',exact:true}).waitFor();
    assert.equal(Number(await flyerForm.locator('[name=lat]').inputValue()),adjustedLatitude,'link lookup never replaces a saved pin');
    await flyerForm.getByRole('button',{name:'一覧に戻る',exact:true}).click();
    await invited.getByRole('button',{name:'変更を破棄して一覧に戻る',exact:true}).click();
    await postalCard.getByRole('button',{name:'状況を変更',exact:true}).click();
    assert(!await flyerForm.getByLabel('施設名',{exact:true}).isVisible());
    const originalLocation=structuredClone(postal.location);
    await flyerForm.getByRole('radio',{name:'掲示済み',exact:true}).check();
    await flyerForm.getByLabel('自由メモ（任意）').fill('掲示しました');
    await flyerForm.getByRole('button',{name:'保存する',exact:true}).click();
    await flyerForm.waitFor({state:'hidden'});
    assert.deepEqual(flyerRows.find(row=>row.id===postal.id).location,originalLocation);
    assert.equal(flyerRows.find(row=>row.id===postal.id).status,'掲示済み');
    await flyerPanel.getByRole('button',{name:/場所の要確認/}).click();
    assert.equal(await flyerPanel.locator('[data-venue-id]').count(),1);
    await flyerPanel.getByRole('button',{name:'すべての施設に戻る',exact:true}).click();

    // The map gets its own visible area; unresolved places remain an optional disclosure.
    await flyerPanel.getByRole('button',{name:'地図で見る',exact:true}).click();
    await flyerPanel.getByRole('button',{name:'矢田部郵便局 掲示済み',exact:true}).waitFor();
    assert(!await flyerPanel.locator('[data-list]').isVisible());
    assert(!await flyerPanel.locator('[data-unlocated]').evaluate(el=>el.open));
    await flyerPanel.locator('[data-unlocated] > summary').click();
    await flyerPanel.getByRole('button',{name:'未収録の試験施設の場所を登録',exact:true}).click();
    await flyerForm.getByRole('button',{name:'一覧に戻る',exact:true}).click();
    await flyerPanel.getByRole('button',{name:'一覧に戻る',exact:true}).click();
    assert(await flyerPanel.locator('[data-list]').isVisible());
    assert(tiles>0);

    // Verified Marutake reference is available through its different spelling too.
    const marutakeLocation={address:'',mapUrl:'https://maps.app.goo.gl/g2AV4mKkUri1t9MS9'};
    flyerRows.push({id:'marutake-short',revision:1,name:'丸竹',region:'神栖市',category:'その他',status:'未依頼',memo:'',location:{...marutakeLocation}});
    await flyerPanel.locator('.flyer-tools > summary').click();
    await flyerPanel.getByRole('button',{name:'一覧を更新',exact:true}).click();
    await flyerPanel.getByRole('button',{name:'施設を追加',exact:true}).click();
    await flyerForm.locator('.flyer-place-fallback').evaluate(el=>el.open=true);
    await flyerForm.getByLabel('施設名',{exact:true}).fill('マルタケ');
    await flyerForm.locator('.flyer-place-fallback').evaluate(el=>el.open=true);
    await flyerForm.getByRole('button',{name:'施設名で場所を検索',exact:true}).click();
    await flyerForm.getByRole('button',{name:'登録済み・一覧で見る',exact:true}).click();
    await flyerForm.waitFor({state:'hidden'});
    assert.deepEqual(flyerRows.find(row=>row.id==='marutake-short').location,marutakeLocation);
    await flyerPanel.locator('[data-close-flyers]').click();

    await invited.setViewportSize({width:320,height:680});
    await invited.locator('#event-dialog [data-close]').click();
    await invited.getByRole('button',{name:'予約書類を追加'}).click();
    const reservations=invited.getByRole('dialog',{name:'予約書類',exact:true});
    await reservations.getByText('保存済みの予約書類はありません。').waitFor();
    await invited.evaluate(()=>{window.TextDetector=class {
      async detect(){return [{rawValue:'利用日：2026年12月20日\n施設名：試験会場\n部屋：第1室\n予約開始：15:00\n予約終了：21:00\n発行日：2026年11月23日'}]}
    }});
    const tiny=Buffer.from(await invited.evaluate(()=>document.createElement('canvas').toDataURL('image/png').split(',')[1]),'base64');
    await reservations.locator('input[type=file]').setInputFiles({name:'test.png',mimeType:'image/png',buffer:tiny});
    await reservations.getByText('読み取り内容を開く').click();
    assert.equal(await reservations.getByLabel('利用日',{exact:true}).inputValue(),'2026-12-20');
    assert.equal(await reservations.getByLabel('部屋',{exact:true}).inputValue(),'第1室');
    await reservations.getByRole('button',{name:'写真を保存する'}).click();
    await reservations.getByText(/模擬写真保存失敗/).waitFor();
    assert.equal(await reservations.getByLabel('予約終了',{exact:true}).inputValue(),'21:00');
    await reservations.getByRole('button',{name:'写真を保存する'}).click();
    await reservations.getByText(/写真を保存しました/).waitFor();
    await reservations.locator('summary').getByText('確認待ち',{exact:true}).waitFor();
    assert(await reservations.evaluate(dialog=>dialog.scrollWidth<=dialog.clientWidth));

    const sample=docs.events.items[0];
    docs.events={revision:docs.events.revision+1,items:Array.from({length:500},(_,i)=>({...sample,id:'bulk-'+i}))};
    const narrow=await session('viewer');
    await narrow.setViewportSize({width:320,height:720});
    await narrow.goto(base.href);
    await narrow.waitForFunction(()=>document.querySelectorAll('main .event-card').length===500);
    assert(await narrow.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    console.log('PASS event, rehearsal, and history saves remain committed when the original dialog is closed; new drafts, midnight timing, and cross-session read-back are preserved');
  }finally{
    await browser.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
