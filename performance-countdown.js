const dayMs = 86_400_000;
const japanOffset = 9 * 3_600_000;
const messages = {
  7: 'いよいよあと一週間！',
  3: 'あと3日！',
  2: 'あと2日！',
  1: 'いよいよ明日！',
  0: '本日開演！',
};

export function japanDay(now) {
  return new Date(now + japanOffset).toISOString().slice(0, 10);
}

const scheduleKey = event => event.date + (event.time || '23:59');
const endOn = (event, date) => Date.parse(date + 'T' + event.endTime + '+09:00');

export function performanceCountdown(events, now = Date.now()) {
  const date = japanDay(now);
  const midnight = Date.parse(date + 'T00:00:00+09:00');
  const tomorrow = japanDay(midnight + dayMs);
  const yesterday = japanDay(midnight - 1);
  let next;
  let overnight;
  for (const event of events) {
    if (event.archivedAt || event.cancelled || event.canceled || event.status === '中止') continue;
    if (event.date >= date && (!next || scheduleKey(event) < scheduleKey(next))) next = event;
    if (event.date === yesterday && event.time && event.endTime &&
        event.endTime < event.time && now < endOn(event, date) &&
        (!overnight || event.time < overnight.time)) overnight = event;
  }
  const event = overnight || next;
  let updateAt = midnight + dayMs;
  if (!event) return {event, text: '', updateAt};
  if (overnight) return {event, text: messages[0], updateAt: endOn(event, date)};
  const days = Math.round((Date.parse(event.date) - Date.parse(date)) / dayMs);
  if (days === 0 && event.endTime) {
    const end = endOn(event, event.time && event.endTime < event.time ? tomorrow : date);
    if (now >= end) return {event, text: 'お疲れさまでした！', updateAt};
    if (end < updateAt) updateAt = end;
  }
  return {event, text: messages[days] || `あと${days}日`, updateAt};
}
