import {cloud,startCloud,mountAccount} from './cloud.js?v=20261124-map3';
import {toRecord,readRecords,mergeRecords} from './record-transfer.js?v=20261124-map3';
let backupExpected='',backupOwner='',backupBusy=false;
const $=id=>document.getElementById(id),status=$('admin-status');let docs={},past=[],members=[],accountGeneration=0,archiveBusy=false;
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=async name=>(await cloud.readShared(name))||{items:[],revision:0};
async function refresh(){const generation=accountGeneration,local=!cloud.state.configured;const practice=local?JSON.parse(localStorage.getItem('yuitei.rehearsals.v1')||'{"items":[],"attendance":{}}'):null;const [events,rehearsals,history]=local?[{items:JSON.parse(localStorage.getItem('yuitei.events.v1')||'[]')},practice,{items:readRecords()}]:await Promise.all(['events','rehearsals','history'].map(read));if(generation!==accountGeneration)return;docs={events,rehearsals,history};past=[...events.items.filter(r=>!r.archivedAt&&r.date<today()).map(source=>({type:'event',source})),...rehearsals.items.filter(r=>!r.archivedAt&&r.date<today()).map(source=>({type:'rehearsal',source}))].sort((a,b)=>a.source.date.localeCompare(b.source.date));$('past-items').innerHTML=past.length?past.map((p,i)=>`<label><input type="checkbox" data-past="${i}"> ${esc(p.source.date)} ${esc(p.source.title)} ／ ${esc(p.source.venue)}</label>`).join(''):'<p>日付が過ぎた未転記の予定はありません。</p>';$('archive-selected').disabled=true;}
$('past-items').onchange=()=>$('archive-selected').disabled=archiveBusy||!document.querySelector('[data-past]:checked');
$('refresh-past').onclick=()=>refresh().catch(e=>status.textContent=e.message);
async function refreshAfterSave(update,result){
 try{await update()}
 catch{result.textContent+=' 一覧を更新できませんでした。再読み込みして確認してください。'}
}
$('archive-selected').onclick=async()=>{
 if(archiveBusy)return;
 const button=$('archive-selected'),feedback=$('archive-result');
 const selected=[...document.querySelectorAll('[data-past]:checked')].map(el=>past[Number(el.dataset.past)]);
 if(!selected.length||!confirm(selected.length+'件を稽古・公演記録へ移しますか？'))return;
 const snapshot=docs,generation=accountGeneration;
 archiveBusy=true;button.disabled=true;
 try{
  if(!cloud.state.configured){
   const keys=['yuitei.events.v1','yuitei.rehearsals.v1','yuitei.history.v1'],backup=keys.map(key=>localStorage.getItem(key));
   const events=JSON.parse(backup[0]||'[]'),rehearsals=JSON.parse(backup[1]||'{"items":[],"attendance":{}}');
   if(JSON.stringify(events)!==JSON.stringify(snapshot.events.items)||JSON.stringify(rehearsals.items)!==JSON.stringify(snapshot.rehearsals.items)){
    throw Error('予定が更新されています。「一覧を更新」で確認してから移してください。');
   }
   const records=selected.map(p=>toRecord(p.type,p.source,Object.keys(rehearsals.attendance?.[p.source.id]||{}),p.type==='rehearsal'?(rehearsals.attendance?.[p.source.id]||{}):{}));
   const archivedAt=new Date().toISOString();
   const archived=(type,items)=>{
    const ids=new Set(selected.filter(p=>p.type===type).map(p=>p.source.id));
    return items.map(item=>ids.has(item.id)?{...item,archivedAt}:item);
   };
   try{
    mergeRecords(records);
    localStorage.setItem(keys[0],JSON.stringify(archived('event',events)));
    localStorage.setItem(keys[1],JSON.stringify({...rehearsals,items:archived('rehearsal',rehearsals.items)}));
   }catch(error){keys.forEach((key,i)=>backup[i]===null?localStorage.removeItem(key):localStorage.setItem(key,backup[i]));throw error}
   feedback.textContent=selected.length+'件をこの端末の稽古・公演記録へ移しました。';
  }else{
   const revisions=Object.fromEntries(Object.entries(snapshot).map(([key,doc])=>[key,doc.revision]));
   const names=(await cloud.roster()).map(member=>member.name);
   const transfers=await Promise.all(selected.map(async p=>{
    const responses=p.type==='rehearsal'?Object.fromEntries((await cloud.readAttendance(p.source.id)).map(row=>[row.stageName,row.status])):{};
    return {type:p.type,id:p.source.id,record:toRecord(p.type,p.source,names,responses)};
   }));
   if(generation!==accountGeneration)return;
   const result=await cloud.archivePast({transfers,revisions});
   feedback.textContent=result.count+'件を記録へ移しました。';
  }
  await refreshAfterSave(refresh,feedback);
 }catch(error){feedback.textContent=error.message}
 finally{archiveBusy=false;button.disabled=!document.querySelector('[data-past]:checked')}
};

async function refreshMembers(){const generation=accountGeneration;const rows=await cloud.members();if(generation!==accountGeneration)return;members=rows;$('member-list').innerHTML=members.map(m=>`<div class="admin-member"><span>${esc(m.name)} ／ ${{admin:'管理者',editor:'編集担当',viewer:'会員'}[m.role]}${m.active?'':'（停止中）'}</span>${m.owner?'':`<button type="button" data-member="${esc(m.id)}">編集する</button>`}</div>`).join('');$('member-form').elements.role.querySelector('[value="admin"]').disabled=!cloud.state.owner;}
let memberDirty=false,memberBusy=false;
function leaveMember(){
 if(memberBusy){$('member-result').textContent='保存中です。結果が出るまでお待ちください。';return false}
 if(memberDirty&&!confirm('変更が保存されていません。変更を破棄しますか？'))return false;
 return true;
}
function openMember(member){
 if(!leaveMember())return;
 const f=$('member-form');f.reset();
 if(member){f.elements.id.value=member.id;f.elements.name.value=member.name;f.elements.role.value=member.role;f.elements.active.checked=member.active}
 f.elements.pin.value='';memberDirty=false;f.hidden=false;$('member-feedback').textContent='';
 $('member-result').textContent='編集中';f.scrollIntoView({behavior:'smooth'});
}
$('member-list').onclick=e=>{const button=e.target.closest('[data-member]');if(!button)return;const m=members.find(m=>m.id===button.dataset.member);if(m)openMember(m)};
$('new-member').onclick=()=>openMember(null);
$('cancel-member').onclick=()=>{if(leaveMember()){$('member-form').reset();$('member-form').hidden=true;memberDirty=false}};
$('member-form').addEventListener('input',()=>{memberDirty=true;$('member-result').textContent='未保存'});
$('member-form').addEventListener('change',()=>{memberDirty=true;$('member-result').textContent='未保存'});
window.addEventListener('beforeunload',event=>{if(memberDirty||memberBusy){event.preventDefault();event.returnValue=''}});
$('member-form').onsubmit=async e=>{
 e.preventDefault();if(memberBusy)return;
 const f=e.target,b=f.querySelector('button[type=submit]'),generation=accountGeneration;
 memberBusy=true;b.disabled=true;for(const child of f.children)if(!child.classList.contains('editor-bar'))child.inert=true;$('member-result').textContent='保存中…';
 try{
  await cloud.memberSave({id:f.elements.id.value,name:f.elements.name.value.trim(),role:f.elements.role.value,active:f.elements.active.checked,pin:f.elements.pin.value});
  if(generation!==accountGeneration)return;
  f.reset();memberDirty=false;f.hidden=true;$('member-result').textContent='保存しました。';$('member-feedback').textContent='保存しました。';
  await refreshAfterSave(refreshMembers,$('member-feedback'));
 }catch(error){if(generation===accountGeneration)$('member-result').textContent='保存できませんでした。'+error.message+' 入力はそのままです。'}
 finally{memberBusy=false;b.disabled=false;for(const child of f.children)child.inert=false}
};
$('migrate-local').onclick=async()=>{const b=$('migrate-local');b.disabled=true;try{if(!confirm('この端末の予定・記録・出欠を共通保存へ追加しますか？'))return;const response=await fetch('./history-data.json?v=20261124-map3');if(!response.ok)throw Error('原記録を読み込めません。');const history=await response.json(),events=JSON.parse(localStorage.getItem('yuitei.events.v1')||'[]'),rehearsals=JSON.parse(localStorage.getItem('yuitei.rehearsals.v1')||'{"items":[],"attendance":{}}');await cloud.importLocal({documents:{events,rehearsals:rehearsals.items,history:[...new Map([...history.records,...readRecords()].map(record=>[record.id,record])).values()]},attendance:rehearsals.attendance});$('migrate-result').textContent='共通保存へ追加しました。別のスマホでも確認してください。';await refreshAfterSave(refresh,$('migrate-result'))}catch(e){$('migrate-result').textContent=e.message}finally{b.disabled=false}};
$('pin-form').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button');if(b.disabled)return;b.disabled=true;f.elements.pin.disabled=true;f.querySelector('p').textContent='保存中…';try{await cloud.changePin(f.elements.pin.value);f.reset();f.querySelector('p').textContent='保存しました。新しい番号でログインしてください。'}catch(error){f.querySelector('p').textContent='保存できませんでした。'+error.message}finally{b.disabled=false;f.elements.pin.disabled=false}};
$('data-open').onclick=()=>$('data-dialog').showModal();$('data-close').onclick=()=>$('data-dialog').close();
cloud.onState(s=>{backupOwner=s.user?.uid||'';backupExpected='';$('backup-panel').hidden=!(s.configured&&s.provider==='apps-script'&&s.role==='admin');$('backup-choice').replaceChildren(new Option('一覧を確認してください',''));$('backup-restore').disabled=true;$('backup-status').textContent='';accountGeneration++;memberDirty=false;$('member-form').hidden=true;$('member-feedback').textContent='';docs={};past=[];members=[];$('past-items').replaceChildren();$('member-list').replaceChildren();$('member-form').reset();$('pin-form').reset();if($('data-dialog').open)$('data-dialog').close();const ready=s.configured&&s.provider==='apps-script';$('admin-tools').hidden=s.ready===false||s.configured&&(!ready||s.role!=='admin');$('member-tools').hidden=!ready||s.role!=='admin';$('pin-form').querySelector('button').disabled=!ready||!s.user;if(s.ready===false)return;if(!s.configured){status.textContent='現在は端末内保存です。下で選んだ予定を、この端末の記録へ移せます。共通保存と会員・管理者の認証はまだ設定されていません。';refresh().catch(e=>status.textContent=e.message)}else if(!ready)status.textContent='この接続では管理者機能を利用できません。';else if(!s.user)status.textContent='登録名と暗証番号でログインしてください。';else if(s.role!=='admin')status.textContent='会員としてログインしています。管理者の操作は利用できません。';else{status.textContent=s.stageName+'：管理者としてログイン中';Promise.all([refresh(),refreshMembers()]).catch(e=>status.textContent=e.message)}});mountAccount();startCloud();

function backupAllowed(){return cloud.state.configured&&cloud.state.provider==='apps-script'&&cloud.state.role==='admin'}
function showBackups(result){
 backupExpected=result.expected;
 $('backup-choice').replaceChildren(new Option('日時を選んでください',''),...result.backups.map(row=>new Option(new Date(row.createdAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}),row.id)));
 $('backup-restore').disabled=true;
 return result.backups.length;
}
$('backup-choice').onchange=()=>$('backup-restore').disabled=backupBusy||!$('backup-choice').value||!backupExpected;
async function backupAction(action){
 if(backupBusy||!backupAllowed())return;
 const owner=backupOwner,generation=accountGeneration;backupBusy=true;
 for(const id of ['backup-list','backup-now','backup-restore','backup-choice'])$(id).disabled=true;
 $('backup-status').textContent='処理中…';
 try{
  if(action==='restore'){
   const id=$('backup-choice').value,expected=backupExpected;
   if(!id||!expected)return;
   const label=$('backup-choice').selectedOptions[0].textContent;
   if(!confirm(label+' の公演・稽古・記録・出欠に戻します。全会員に反映されます。現在の内容もバックアップします。実行しますか？')){$('backup-status').textContent='復元を中止しました。';return}
   await cloud.restoreBackup(id,expected);
   if(owner!==backupOwner||generation!==accountGeneration)return;
   $('backup-status').textContent='復元しました。他の画面・端末も開き直して確認してください。';
   backupExpected='';
   await refreshAfterSave(refresh,$('backup-status'));
  }else{
   const result=await (action==='create'?cloud.createBackup():cloud.backups());
   if(owner!==backupOwner||generation!==accountGeneration)return;
   const count=showBackups(result);
   $('backup-status').textContent=action==='create'?'今の内容をバックアップしました。':count+'件のバックアップがあります。';
  }
 }catch(error){if(owner===backupOwner&&generation===accountGeneration)$('backup-status').textContent='処理できませんでした。'+error.message+' 新機能が未対応の場合はApps Scriptを更新してください。'}
 finally{backupBusy=false;for(const id of ['backup-list','backup-now','backup-choice'])$(id).disabled=false;$('backup-restore').disabled=!backupExpected||!$('backup-choice').value}
}
$('backup-list').onclick=()=>backupAction('list');$('backup-now').onclick=()=>backupAction('create');$('backup-restore').onclick=()=>backupAction('restore');
