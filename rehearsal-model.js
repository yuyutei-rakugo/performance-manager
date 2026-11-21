export const statuses=['出席','欠席','未定','未回答'];
export const rehearsalNames=['通常稽古','師匠稽古','自主稽古','その他'];
export function validRehearsal(r){
 if(!r||!['id','title','date','time','venue','notes'].every(k=>typeof r[k]==='string'))return false;
 const d=new Date(r.date+'T00:00:00Z');
 if(r.otherContent!==undefined&&typeof r.otherContent!=='string')return false;
 if(r.practices!==undefined&&(!Array.isArray(r.practices)||r.practices.length>200||!r.practices.every(p=>p&&typeof p.stageName==='string'&&p.stageName.trim()&&typeof p.piece==='string'&&p.piece.trim()&&(p.durationSeconds===null||Number.isInteger(p.durationSeconds)&&p.durationSeconds>=0&&p.durationSeconds<=86400))))return false;
 return !!r.id.trim()&&!!r.title.trim()&&!!r.venue.trim()&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&!isNaN(d)&&d.toISOString().slice(0,10)===r.date&&/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time);
}
export function validAttendance(a){return a&&typeof a==='object'&&!Array.isArray(a)&&Object.values(a).every(s=>statuses.includes(s))}
export function attendanceSummary(names,responses){const present=names.filter(n=>responses[n]==='出席');return {present,count:present.length,unanswered:names.filter(n=>!responses[n]||responses[n]==='未回答').length}}

const japanOffset=9*60*60*1000,dayLength=24*60*60*1000;
export function japanDate(now=Date.now()){
 return new Date(now+japanOffset).toISOString().slice(0,10);
}
export function untilJapanMidnight(now=Date.now()){
 return dayLength-(now+japanOffset)%dayLength;
}
export function featuredRehearsal(rows,today=japanDate()){
 return rows.filter(r=>!r.archivedAt&&r.date>=today)
  .sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)||a.id.localeCompare(b.id))[0];
}
export function rehearsalBadge(r,title,escape){
 const style=r.title==='通常稽古'?'regular':r.title==='師匠稽古'?'master':'other';
 return `<span class="rehearsal-kind rehearsal-kind--${style}">${escape(title)}</span>`;
}
export function rehearsalDateTime(r,escape){
 const [year,month,day]=r.date.split('-').map(Number);
 const weekday='日月火水木金土'[new Date(r.date+'T00:00:00Z').getUTCDay()];
 return `<time class="rehearsal-datetime" datetime="${escape(r.date)}T${escape(r.time)}+09:00"><span class="rehearsal-date"><span class="rehearsal-year">${year}年</span> ${month}月${day}日（${weekday}）</span> <span class="rehearsal-time">${escape(r.time)}</span></time>`;
}
