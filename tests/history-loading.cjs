const {JSDOM}=require('jsdom'),fs=require('node:fs'),assert=require('node:assert/strict');
const w=new JSDOM('<main><div id="history-tools"></div><table><tbody id="body"></tbody></table></main>',{runScripts:'outside-only',url:'https://example.test'}).window;
w.structuredClone=structuredClone;
w.HTMLDialogElement.prototype.close=function(){this.open=false};
let listener,current,onRead,onError;
w.cloud={
 get state(){return current},
 onState(fn){listener=fn;fn(current)},
 watch(name,fn,fail){assert.equal(name,'history');onRead=fn;onError=fail;return()=>{}}
};
const emit=value=>{current=value;listener(current)};
const q=selector=>w.document.querySelector(selector);
const status=()=>q('#history-edit-status').textContent;
current={ready:false,configured:false};
const clean=file=>fs.readFileSync(file,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
w.eval(clean('editor-dialog.js')+'\n'+clean('record-transfer.js')+'\n'+clean('history-editor.js')+'\nconst data={records:[]};historyEditor(()=>data,()=>{});');
assert.match(status(),/接続を確認/);assert(q('#history-add').disabled);
emit({ready:false,configured:true});assert.match(status(),/接続を確認/);
emit({ready:true,configured:false});assert.match(status(),/この端末に保存/);
emit({ready:true,configured:true,connectionIssue:'configuration',message:'接続先設定を確認してください。'});
assert.match(status(),/接続先設定/);assert(q('#history-add').disabled);
emit({ready:true,configured:true,connectionIssue:'network',message:'共通保存に接続できません。'});
assert.match(status(),/接続できません/);assert(q('#history-add').disabled);
emit({ready:true,configured:true,user:{uid:'viewer'},role:'viewer'});
onRead(null);assert.match(status(),/編集権限がありません/);assert(q('#history-add').hidden);
emit({ready:true,configured:true,user:{uid:'editor'},role:'editor'});
assert.match(status(),/記録を読み込んでいます/);assert(q('#history-add').disabled);
onError('模擬通信失敗');assert.match(status(),/読み込めませんでした/);assert(q('#history-add').disabled);
onRead({revision:1,items:[]});assert(!q('#history-add').disabled);
onError('模擬通信失敗');assert.match(status(),/前回取得した記録/);assert(q('#history-add').disabled);
w.close();
console.log('PASS connection, local mode, configuration, permission, loading, read failure and recovery states');
