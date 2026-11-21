const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const window=new JSDOM('<section><p data-roster-status></p><button data-roster-retry></button></section>',{runScripts:'outside-only'}).window;
window.structuredClone=structuredClone;
const clean=name=>fs.readFileSync(name,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
window.eval(clean('performer-picker.js')+'\n'+clean('record-transfer.js')+
 '\nObject.assign(window,{performerPicker,updatePerformerPickers,readPerformer,showPerformerRoster,toRecord});');
const section=window.document.querySelector('section');
const names=['会員甲','会員乙','会員丙'];
const performance=(person,roster)=>{
 const row=window.document.createElement('div');
 row.append(window.performerPicker(person,roster));
 section.append(row);
 return row;
};
const select=(row,value)=>{
 const el=row.querySelector('select');
 el.value=value;
 el.dispatchEvent(new window.Event('change'));
};
const guest=performance({},[]);
select(guest,'guest');
const guestInput=guest.querySelector('input');
guestInput.value='結友亭 会員甲';
for(const [state,roster,expected] of [
 ['loading',[],/取得中/],['error',[],/取得できません/],['ready',[],/いません/],
 ['ready',[names[0]],/1人/],['ready',names,/3人/]
]){
 let retries=0;
 window.showPerformerRoster(section,state,roster,()=>retries++);
 const retry=section.querySelector('button');
 assert.equal(retry.hidden,state==='loading');
 if(!retry.hidden){retry.click();assert.equal(retries,1)}
 assert.match(section.querySelector('[data-roster-status]').textContent,expected);
 window.updatePerformerPickers(section,roster);
 assert.equal(guestInput.value,'結友亭 会員甲');
 assert.equal(window.readPerformer(guest).guest,true);
}
const member=performance({stageName:names[1]},[]);
window.updatePerformerPickers(section,names);
assert.equal(member.querySelector('select').value,names[1]);
assert(!member.querySelector('input').required);
const restored=performance(window.readPerformer(guest),names);
assert.equal(restored.querySelector('input').value,'結友亭 会員甲');
assert(restored.querySelector('input').required);
const oldName=performance({stageName:'以前の演者'},names);
assert.match(oldName.querySelector('select').selectedOptions[0].textContent,/保存済み/);

for(const type of ['event','rehearsal']){
 for(const kinds of [['member','member'],['guest','guest'],['member','guest','member','guest']]){
  const entries=kinds.map((kind,i)=>({
   ...(kind==='member'?{stageName:names[0]}:window.readPerformer(restored)),
   piece:'演目'+i,minutes:5+i,durationSeconds:305+i, name:''
  }));
  const record=window.toRecord(type,{
   id:'test',title:'試験',date:'2020-01-02',time:'14:00',venue:'会場',
   performers:entries,practices:entries
  },names,{[names[1]]:'出席'});
  entries.forEach((entry,i)=>{
   assert.match(record.pieces[entry.stageName],new RegExp('演目'+i));
   if(type==='event')assert.match(record.note,new RegExp((i+1)+'\\. '+entry.stageName+'｜'+entry.piece));
  });
  assert.equal(record.sourceData[type==='event'?'performers':'practices'].length,kinds.length);
  if(type==='rehearsal'){
   assert.equal(record.pieces[names[1]],'○');
   assert.equal(record.note,'会場：会場\n開始：14:00');
   assert.equal(record.attendance[names[1]],'出席');
   assert.equal(record.sourceData.practices[0].durationSeconds,305);
  }
 }
}
console.log('PASS explicit member/guest input, roster state and retry, late updates preserve guest input, stored names, mixed and repeated performers, ordered transfers');
