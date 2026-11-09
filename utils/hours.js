// Çalışma saatleri (Türkiye saati). Günler Pazartesi'den başlar.
const TZ = 'Europe/Istanbul';
const DAY_NAMES = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const toMin = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };

function nowParts(now = new Date()) {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now);
  const idx = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(wd);
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  return { day: idx, minutes: toMin(hm.replace('24:', '00:')) };
}

// { enabled, open, summary }: kapalıysa (özellik kapalı) hep açık sayılır.
function workStatus(config, now = new Date()) {
  const hrs = config?.settings?.hours;
  const summary = hrs ? hrs.days.map((d, i) => (d.on ? `${DAY_NAMES[i]} ${d.start}–${d.end}` : null)).filter(Boolean).join(', ') || 'her gün kapalı' : '';
  if (!hrs?.enabled) return { enabled: false, open: true, summary };
  const { day, minutes } = nowParts(now);
  const today = hrs.days[day];
  const prev = hrs.days[(day + 6) % 7];
  const inRange = (d, m, overnightTail) => {
    const s = toMin(d.start); const e = toMin(d.end);
    if (e > s) return !overnightTail && m >= s && m < e;
    return overnightTail ? m < e : m >= s; // gece yarısını aşan vardiya (örn. 22:00–02:00)
  };
  const open = (today.on && inRange(today, minutes, false)) || (prev.on && toMin(prev.end) <= toMin(prev.start) && inRange(prev, minutes, true));
  return { enabled: true, open: Boolean(open), summary };
}

module.exports = { workStatus, DAY_NAMES };
