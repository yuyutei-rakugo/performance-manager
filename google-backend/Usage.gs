const usagePrefix_ = 'USAGE_MEMBER_';
const usageDayMs_ = 86400000;
const usageGapMs_ = 30 * 60000;

function usageDay_(now) {
 return Math.floor((now + 9 * 3600000) / usageDayMs_);
}
function usageRow_(raw, now) {
 const row=JSON.parse(raw||'{"days":{}}');
 const oldest=usageDay_(now)-89;
 for(const day of Object.keys(row.days))if(Number(day)<oldest)delete row.days[day];
 if(row.last<=now-90*usageDayMs_)delete row.last;
 return row;
}
function trackUsage_(member, now=Date.now()) {
 const props=PropertiesService.getScriptProperties();
 const key=usagePrefix_+member.id;
 const row=usageRow_(props.getProperty(key),now);
 const day=usageDay_(now);
 // A return across midnight can add a distinct day without starting another visit.
 row.days[day]=(row.days[day]||0)+Number(!row.last||now-row.last>usageGapMs_);
 row.last=now;
 props.setProperty(key,JSON.stringify(row));
 return {};
}
function usageReport_(db, now=Date.now()) {
 const props=PropertiesService.getScriptProperties();
 const today=usageDay_(now);
 const rows=db.members.filter(member=>member.active).map(member=>{
  const row=usageRow_(props.getProperty(usagePrefix_+member.id),now);
  let count7=0,count30=0,days30=0;
  for(const [day,count] of Object.entries(row.days)){
   if(Number(day)<today-29||Number(day)>today)continue;
   days30++;
   count30+=count;
   if(Number(day)>=today-6)count7+=count;
  }
  return {name:member.name,count7,count30,days30,last:row.last||null,
   used7:Object.keys(row.days).some(day=>Number(day)>=today-6&&Number(day)<=today)};
 });
 return {total:rows.length,used7:rows.filter(row=>row.used7).length,
  used30:rows.filter(row=>row.days30>0).length,
  rows:rows.map(({used7,...row})=>row)};
}
// Run once daily using an Apps Script time-driven trigger.
function pruneNotebookUsage() {
 const lock=LockService.getScriptLock();
 lock.waitLock(20000);
 try{
  const props=PropertiesService.getScriptProperties(),now=Date.now();
  for(const key of props.getKeys().filter(key=>key.startsWith(usagePrefix_))){
   const raw=props.getProperty(key),row=usageRow_(raw,now),updated=JSON.stringify(row);
   if(!row.last&&!Object.keys(row.days).length)props.deleteProperty(key);
   else if(raw!==updated)props.setProperty(key,updated);
  }
 }finally{lock.releaseLock()}
}
