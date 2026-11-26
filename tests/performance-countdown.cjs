const assert = require('node:assert/strict');
const {performanceCountdown} = require('../performance-countdown.js');

const event = {id:'show', date:'2026-12-20', time:'14:00', endTime:'17:00'};
const next = {id:'next', date:'2027-01-10'};
const events = [next, {...event, id:'later', time:'18:00', endTime:'20:00'}, event,
  {...event, date:'2026-12-19', archivedAt:true}];
const at = (time, rows=events) => performanceCountdown(rows, Date.parse(time));

for (const [day,text] of [[3,'あと17日'],[13,'いよいよあと一週間！'],[17,'あと3日！'],
  [18,'あと2日！'],[19,'いよいよ明日！'],[20,'本日開演！']]) {
  assert.equal(at(`2026-12-${String(day).padStart(2,'0')}T00:00:00+09:00`).text,text);
}
assert.equal(at('2026-12-19T14:59:59Z').text,'いよいよ明日！');
assert.equal(at('2026-12-19T15:00:00Z').text,'本日開演！');
assert.equal(at('2026-12-20T07:59:59Z').updateAt,Date.parse('2026-12-20T08:00:00Z'));
assert.equal(at('2026-12-20T08:00:00Z').text,'お疲れさまでした！');
assert.equal(at('2026-12-20T14:59:59Z').event.id,'show');
assert.equal(at('2026-12-20T15:00:00Z').event.id,'next');
assert.equal(at('2026-12-20T15:00:00Z',[event]).text,'');
assert.equal(at('2026-12-20T10:00:00Z',[{...event,endTime:''}]).text,'本日開演！');
const overnight = {...event,time:'23:00',endTime:'01:00'};
assert.equal(at('2026-12-20T15:59:59Z',[overnight,next]).event.id,'show');
assert.equal(at('2026-12-20T16:00:00Z',[overnight,next]).event.id,'next');
console.log('Performance countdown passed');
