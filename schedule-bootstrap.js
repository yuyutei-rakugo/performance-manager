let configRequest;
const configKey='yuitei.config.20261120-performers1';
export function loadCloudConfig(){
 if(configRequest)return configRequest;
 try{
  const saved=JSON.parse(sessionStorage.getItem(configKey));
  if(saved&&Date.now()-saved.time>=0&&Date.now()-saved.time<5*60*1000){
   configRequest=Promise.resolve(saved.config);
   return configRequest;
  }
 }catch{}
 configRequest=fetch('./cloud-config.json',{cache:'no-store'}).then(response=>{
  if(!response.ok)throw Error('保存設定を確認できません。');
  return response.json();
 }).then(config=>{
  if(config.enabled&&config.provider==='apps-script'){
   try{sessionStorage.setItem(configKey,JSON.stringify({config,time:Date.now()}))}catch{}
  }
  return config;
 }).catch(error=>{configRequest=null;throw error});
 return configRequest;
}
// Apply this confirmed schedule once to both browser-local lists.
export async function applyConfirmedSchedule(){
 const marker='yuitei.confirmed-schedule.20261119';if(localStorage.getItem(marker))return;
 if((await loadCloudConfig()).enabled)return;
 const response=await fetch('./schedule-photo.json?v=20261120-performers1');if(!response.ok)throw Error('予定を読み込めません。');const seed=await response.json();
 const eventKey='yuitei.events.v1',rehearsalKey='yuitei.rehearsals.v1',oldEvents=localStorage.getItem(eventKey),oldRehearsals=localStorage.getItem(rehearsalKey);
 const events=oldEvents===null?[]:JSON.parse(oldEvents),rehearsals=oldRehearsals===null?{items:[],attendance:{}}:JSON.parse(oldRehearsals);
 if(!Array.isArray(events)||!events.every(e=>e&&typeof e.id==='string'&&typeof e.date==='string')||!Array.isArray(rehearsals.items)||!rehearsals.items.every(r=>r&&typeof r.id==='string'&&typeof r.date==='string')||!rehearsals.attendance||typeof rehearsals.attendance!=='object'||Array.isArray(rehearsals.attendance))throw Error('保存済みの予定を確認してください。自動追加を停止しています。');
 if(!Array.isArray(seed.events)||!Array.isArray(seed.rehearsals))throw Error('追加予定の形式を確認してください。');
 const latest=[...events].sort((a,b)=>(b.checklistUpdatedAt||b.date+'T'+(b.time||'')).localeCompare(a.checklistUpdatedAt||a.date+'T'+(a.time||'')))[0];if(latest?.checklist?.length)seed.events.forEach(e=>e.checklist=latest.checklist.map(t=>({label:t.label,done:false,assignees:[],dueDate:''})));
 const add=(current,incoming)=>[...current,...incoming.filter(n=>!current.some(o=>o.id===n.id||o.date===n.date))];
 try{localStorage.setItem(eventKey,JSON.stringify(add(events,seed.events)));localStorage.setItem(rehearsalKey,JSON.stringify({...rehearsals,items:add(rehearsals.items,seed.rehearsals)}));localStorage.setItem(marker,'done')}catch(error){for(const [key,value] of [[eventKey,oldEvents],[rehearsalKey,oldRehearsals]]){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value)}catch{}}throw error}
}
