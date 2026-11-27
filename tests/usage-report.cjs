const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const values = new Map();
const props = {
 getProperty: key => values.get(key),
 setProperty: (key,value) => values.set(key,value),
 deleteProperty: key => values.delete(key),
 getKeys: () => [...values.keys()],
};
const now=Date.parse('2026-11-27T23:50:00+09:00');
const a={id:'a',name:'模擬会員',active:true};
const b={id:'b',name:'未利用会員',active:true};
const inactive={id:'c',name:'停止会員',active:false};
const c=vm.createContext({a,b,inactive,now,PropertiesService:{getScriptProperties:()=>props},
 LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}});
vm.runInContext(fs.readFileSync('google-backend/Usage.gs','utf8'),c);
const run=source=>vm.runInContext(source,c);
run('trackUsage_(a,now);trackUsage_(a,now+20*60000);trackUsage_(a,now+50*60000)');
let report=run('usageReport_({members:[a,b,inactive]},now+50*60000)');
assert.equal(report.total,2);
assert.equal(report.used7,1);
assert.deepEqual(JSON.parse(JSON.stringify(report.rows[0])),
 {name:a.name,count7:1,count30:1,days30:2,last:now+50*60000});
run('trackUsage_(a,now+81*60000)');
report=run('usageReport_({members:[a,b]},now+8*86400000)');
assert.equal(report.used7,0);
assert.equal(report.used30,1);
assert.equal(report.rows[0].count30,2);
assert.equal(report.rows[1].last,null);
values.set('PUSH_MODE','members');
values.set('PUSH_SUB_fixture','unchanged');
run('trackUsage_(b,Date.now()-91*86400000);pruneNotebookUsage()');
assert.equal(values.has('USAGE_MEMBER_b'),false);
assert.equal(values.get('PUSH_MODE'),'members');
assert.equal(values.get('PUSH_SUB_fixture'),'unchanged');
console.log('PASS 30-minute grouping, Japanese calendar days, inactive members and automatic pruning');
