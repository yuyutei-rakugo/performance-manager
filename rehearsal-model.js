export const statuses=['出席','欠席','未定','未回答'];
export const kinds=['師匠稽古','自主稽古'];
export function validRehearsal(r){
 if(!r||!['id','title','date','time','venue','kind','notes'].every(k=>typeof r[k]==='string'))return false;
 const d=new Date(r.date+'T00:00:00Z');
 return !!r.id.trim()&&!!r.title.trim()&&!!r.venue.trim()&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&!isNaN(d)&&d.toISOString().slice(0,10)===r.date&&/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)&&kinds.includes(r.kind);
}
export function validAttendance(a){return a&&typeof a==='object'&&!Array.isArray(a)&&Object.values(a).every(s=>statuses.includes(s))}
export function attendanceSummary(names,responses){const present=names.filter(n=>responses[n]==='出席');return {present,count:present.length,unanswered:names.filter(n=>!responses[n]||responses[n]==='未回答').length}}
