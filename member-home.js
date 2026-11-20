import {cloud} from './cloud.js?v=20261120-performers1';
import {validRehearsal,validAttendance} from './rehearsal-model.js?v=20261120-performers1';
import {rehearsalTitle} from './record-transfer.js?v=20261120-performers1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=s=>s==='未回答'||!s?'未登録':s;
export function mountMemberHome(){
 const practicePage=location.pathname.endsWith('/rehearsals.html');
 const resource=practicePage?'rehearsals':'events';
 const panel=document.createElement('section');panel.className='member-home';panel.setAttribute('aria-label','次回の予定と自分の出欠');
 const tabs=document.querySelector('main .tabs');if(!tabs)return;tabs.after(panel);
 let events=[],practices=[],answers={},names=[],stops=[],stopAnswer,watching='',answerState='loading',busy=false,error='',success='',generation=0,loadedEvents=false,loadedPractices=false,scheduleError=false;
 function local(){try{const e=JSON.parse(localStorage.getItem('yuitei.events.v1')||'[]'),p=JSON.parse(localStorage.getItem('yuitei.rehearsals.v1')||'{"items":[],"attendance":{}}');if(!Array.isArray(e)||!Array.isArray(p.items)||!p.items.every(validRehearsal)||!p.attendance||!Object.values(p.attendance).every(validAttendance))throw Error();events=e;practices=p.items;answers=p.attendance;error=''}catch{error='端末の予定を読み込めません。データ管理から保存済みの内容を確認してください。'}render()}
 function person(){return cloud.state.configured?cloud.state.stageName:localStorage.getItem('yuitei.attendance.person')||''}
 function next(rows){return rows.filter(r=>!r.archivedAt&&r.date&&new Date(r.date+'T'+(r.time||'23:59')).getTime()>=Date.now()).sort((a,b)=>(a.date+(a.time||'23:59')).localeCompare(b.date+(b.time||'23:59')))[0]}
 function plan(r,type){return `<h3>${esc(type==='practice'?rehearsalTitle(r):r.title)}</h3><p>${esc(r.date)} ${esc(r.time||'時間未定')}<br>会場：${esc(r.venue)}</p>`}
 function render(){
  const p=practicePage?next(practices):null,e=practicePage?null:next(events),first=p||e,self=person();
  panel.innerHTML=`<h2>${practicePage?'次回の稽古':'次回の公演'}</h2>${cloud.state.configured&&!cloud.state.role?`<p>会員ログインすると、${practicePage?'稽古の予定と自分の出欠':'公演の予定'}を確認できます。</p>`:first?plan(first,first===p?'practice':'event'):cloud.state.configured&&!(practicePage?loadedPractices:loadedEvents)?'<p>予定を読み込み中…</p>':'<p>これからの予定はありません。</p>'}${p?`<div class="quick-attendance">${first!==p?'<h3>次回の稽古出欠</h3>'+plan(p,'practice'):''}${!cloud.state.configured?`<label>自分の名前<select id="quick-person"><option value="">選んでください</option>${names.map(n=>`<option value="${esc(n)}" ${n===self?'selected':''}>${esc(n)}</option>`).join('')}</select></label><p class="muted">名前をこのブラウザに覚えます。共有端末では自分の名前に切り替えてください。現在は端末内保存で、本人認証・端末間の同期は未接続です。</p>`:''}<p>自分の回答${self?'（'+esc(self)+'）':''}：<strong>${cloud.state.configured&&answerState!=='ready'?(answerState==='error'?'取得できませんでした':answerState==='stale'?esc(label(answers[p.id]?.[self]))+'（前回取得分）':'確認中…'):esc(label(answers[p.id]?.[self]))}</strong></p>${answerState==='stale'?'<p class="sync-warning">出欠を更新できませんでした。</p>':''}<div class="rsvp-buttons">${['出席','欠席','未定'].map(s=>`<button type="button" class="secondary" data-quick-status="${s}" aria-pressed="${answers[p.id]?.[self]===s}" ${!self||!names.includes(self)||busy||cloud.state.configured&&answerState!=='ready'?'disabled':''}>${s}</button>`).join('')}</div><a data-open-rehearsal="${esc(p.id)}" href="rehearsals.html?v=20261120-performers1&detail=${encodeURIComponent(p.id)}">出欠一覧・稽古の詳細を見る</a></div>`:''}<p class="save-feedback" role="status">${esc(error||success)}</p>`;
  panel.querySelector('[data-open-rehearsal]')?.addEventListener('click',event=>{if(location.pathname.endsWith('/rehearsals.html')){event.preventDefault();window.dispatchEvent(new CustomEvent('rehearsal-detail',{detail:{id:event.currentTarget.dataset.openRehearsal}}))}});
  panel.querySelector('#quick-person')?.addEventListener('change',event=>{try{localStorage.setItem('yuitei.attendance.person',event.target.value);success='';window.dispatchEvent(new Event('member-person-changed'));render()}catch{error='名前を記憶できませんでした。ブラウザの保存設定を確認してください。';render()}});
  for(const b of panel.querySelectorAll('[data-quick-status]'))b.onclick=async()=>{
   if(busy||cloud.state.configured&&answerState!=='ready'||!self||!names.includes(self)||!p||answers[p.id]?.[self]===b.dataset.quickStatus)return;const status=b.dataset.quickStatus,version=generation;busy=true;error='';success='保存しています…';render();
   try{if(cloud.state.configured){await cloud.respondAttendance(p.id,status);if(version!==generation)return;answers[p.id]={...answers[p.id],[self]:status}}
    else{const stored=JSON.parse(localStorage.getItem('yuitei.rehearsals.v1')||'null');if(!stored||!Array.isArray(stored.items)||!stored.items.every(validRehearsal)||!stored.items.some(r=>r.id===p.id&&!r.archivedAt)||!stored.attendance||!Object.values(stored.attendance).every(validAttendance))throw Error('予定が変更されています。再読み込みしてから回答してください。');stored.attendance[p.id]={...stored.attendance[p.id],[self]:status};localStorage.setItem('yuitei.rehearsals.v1',JSON.stringify(stored));answers=stored.attendance;window.dispatchEvent(new Event('schedule-data-changed'))}
    success=status+'で登録しました。'+(cloud.state.configured?'':'この端末に保存しました。');
   }catch(ex){if(version!==generation)return;success='';error='保存できませんでした。'+ex.message+' 回答を選び直してお試しください。'}finally{if(version===generation){busy=false;render()}}
  };
 }
 function watchAnswer(){
  const p=practicePage?next(practices):null;
  const id=cloud.state.configured&&cloud.state.role&&p?p.id:'';
  if(watching===id)return;
  stopAnswer?.();stopAnswer=null;watching=id;answerState='loading';
  if(!id)return;
  stopAnswer=cloud.watchAttendance(id,rows=>{
   if(watching!==id)return;
   answers[id]=Object.fromEntries(rows.map(r=>[r.stageName,r.status]));
   answerState='ready';render();
  },()=>{
   if(watching!==id)return;
   answerState=Object.hasOwn(answers,id)?'stale':'error';render();
  });
 }
 cloud.onState(async s=>{
  if(s.ready===false)return;
  const version=++generation;
  stops.forEach(stop=>stop());stops=[];stopAnswer?.();stopAnswer=null;
  watching='';answerState='loading';events=[];practices=[];answers={};names=[];
  loadedEvents=false;loadedPractices=false;busy=false;error='';success='';scheduleError=false;
  if(!s.configured){
   local();
   if(!practicePage)return;
   try{
    const response=await fetch('./history-data.json');const data=await response.json();
    if(version!==generation)return;
    names=data.names.filter(n=>n!=='藤本');render();
   }catch{if(version===generation){error='会員名を読み込めません。再読み込みしてください。';render()}}
   return;
  }
  if(s.stageName)names=[s.stageName];
  render();
  if(!s.role)return;
  stops.push(cloud.watch(resource,doc=>{
   if(version!==generation)return;
   if(doc&&!Array.isArray(doc.items)){error='予定の形式を確認してください。';render();return}
   if(scheduleError)error='';scheduleError=false;
   if(resource==='events'){events=doc?.items||[];loadedEvents=true}
   else{practices=doc?.items||[];loadedPractices=true;watchAnswer()}
   render();
  },message=>{scheduleError=true;error=loadedEvents||loadedPractices?'更新できませんでした。前回取得した予定を表示しています。':message;render()}));
 });
 window.addEventListener('schedule-data-changed',()=>{if(!cloud.state.configured)local()});window.addEventListener('member-person-changed',()=>render());
}
