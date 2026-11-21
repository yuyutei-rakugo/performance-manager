import {cloud} from './cloud.js?v=20261121-notes1';
export const historyKey='yuitei.history.v1';
export const validRecord=r=>r&&typeof r.id==='string'&&typeof r.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&typeof r.kind==='string'&&typeof r.occasion==='string'&&typeof r.note==='string'&&r.pieces&&typeof r.pieces==='object'&&!Array.isArray(r.pieces)&&Object.values(r.pieces).every(v=>typeof v==='string');
export function readRecords(){const raw=JSON.parse(localStorage.getItem(historyKey)||'{"version":1,"items":[]}');if(raw.version!==1||!Array.isArray(raw.items)||!raw.items.every(validRecord))throw Error('保存済みの記録を読み込めません。上書きを停止しています。');return raw.items;}
export function writeRecords(items){if(!Array.isArray(items)||items.length>500||!items.every(validRecord))throw Error('記録の形式を確認してください。');readRecords();localStorage.setItem(historyKey,JSON.stringify({version:1,items}));}
export function mergedRecords(incoming){
 if(!Array.isArray(incoming)||!incoming.every(validRecord))throw Error('記録の形式を確認してください。');
 const map=new Map(readRecords().map(record=>[record.id,record]));
 incoming.forEach(record=>map.set(record.id,record));
 if(map.size>500)throw Error('追加記録は500件までです。');
 return [...map.values()];
}
export function mergeRecords(incoming){
 const items=mergedRecords(incoming);
 localStorage.setItem(historyKey,JSON.stringify({version:1,items}));
 return items;
}
export function validPerformer(p){return p&&['name','stageName','piece'].every(k=>typeof p[k]==='string')&&p.stageName.trim()&&p.piece.trim()&&Number.isFinite(p.minutes)&&p.minutes>0&&p.minutes<=1440&&(p.type===undefined||['performance','break'].includes(p.type))&&(p.endTime===undefined||p.endTime===''||typeof p.endTime==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(p.endTime));}
export function timeline(start,people){if(!start)return people.map(p=>({...p,begin:'時間未定',end:p.endTime||'時間未定'}));let total=(Number(start.slice(0,2))*60+Number(start.slice(3)))*60;const label=seconds=>{const days=Math.floor(seconds/86400);seconds%=86400;const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),secs=seconds%60;return (days?'翌'+(days>1?days:'')+'日 ':'')+String(hours).padStart(2,'0')+':'+String(minutes).padStart(2,'0')+(secs?':'+String(secs).padStart(2,'0'):'')};return people.map(p=>{const begin=label(total),previous=total;total+=Math.round((Number(p.minutes)||0)*60);if(p.endTime){total=Math.floor(previous/86400)*86400+(Number(p.endTime.slice(0,2))*60+Number(p.endTime.slice(3)))*60;if(total<previous)total+=86400;}return {...p,begin,end:label(total)}});}

export function rehearsalTitle(r){return ['その他','その他稽古'].includes(r.title)?'その他'+(r.otherContent?'：'+r.otherContent:''):r.title;}
export function formatDuration(seconds){
 if(!Number.isFinite(seconds))return '未入力';
 const total=Math.round(seconds);
 return Math.floor(total/60)+'分'+String(total%60).padStart(2,'0')+'秒';
}
const duration=seconds=>`（${formatDuration(seconds)}）`;
function memberName(name,names){const short=name.replace(/^結友亭[ 　]*/, '').trim();return names.includes(short)?short:name;}
export function toRecord(type,source,names=[],responses={}){const pieces=Object.create(null);const add=(name,piece,guest)=>{const n=guest?name:memberName(name,names);pieces[n]=[pieces[n],piece].filter(Boolean).join('／')};let lines=[];
 if(type==='event'){const rows=timeline(source.time,source.performers);rows.forEach((p,i)=>{lines.push(`${i+1}. ${p.type==='break'?'仲入り':p.stageName}｜${p.piece}｜${formatDuration(Number.isFinite(p.minutes)?p.minutes*60:null)}｜終了予定 ${p.end}`);if(p.type!=='break')add(p.stageName,p.piece+duration(Number.isFinite(p.minutes)?p.minutes*60:null),p.guest)});}
 else{
  const practices=source.practices||[];
  practices.forEach(p=>add(p.stageName,p.piece+duration(p.durationSeconds),p.guest));
  for(const n of names)if(responses[n]==='出席'&&!pieces[n])pieces[n]='○';
 }

 return {id:`transferred:${type}:${source.id}`,date:source.date,kind:type==='event'?(source.kind||'その他公演'):(source.title==='師匠稽古'?'師匠稽古':source.title==='自主稽古'?'自主稽古':source.title==='通常稽古'?'通常稽古':'その他'),occasion:type==='event'?source.title:rehearsalTitle(source),pieces,note:[`会場：${source.venue}`,`開始：${source.time||'時間未定'}`,source.memo||source.notes||'',...lines].filter(Boolean).join('\n'),sourceType:type,sourceId:source.id,sourceData:structuredClone(source),attendance:type==='rehearsal'?structuredClone(responses):{},transferredAt:new Date().toISOString()};
}
export async function transferRecord(record){if(!validRecord(record))throw Error('記録の形式を確認してください。');if(!cloud.state.configured){mergeRecords([record]);return}if(!['admin','editor'].includes(cloud.state.role))throw Error('記録を移すには編集権限が必要です。');let stop;const doc=await new Promise((resolve,reject)=>{stop=cloud.watch('history',resolve,reject)});stop?.();const items=doc?.items||[];if(!items.every(validRecord))throw Error('共通記録の形式を確認してください。');const map=new Map(items.map(r=>[r.id,r]));map.set(record.id,record);if(map.size>500)throw Error('記録は500件までです。');await cloud.save('history',{items:[...map.values()]},doc?.revision||0);}
