const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const nf = n => Number(n || 0).toLocaleString('tr-TR');

function fmtUp(s) {
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return d ? `${d} gün ${h} sa` : h ? `${h} sa ${m} dk` : `${m} dk ${s % 60} sn`;
}

// Discord panelinin gerçek ayarlarına göre (buton / açılır liste / ikisi) küçük önizleme
function drawMock(s) {
  const p = s.panel;
  $('mock-embed').style.borderLeftColor = p.color || '#8B5CF6';
  $('mock-title').textContent = p.title || '';
  $('mock-desc').textContent = p.description || '';
  $('mock-foot').textContent = p.footer || '';
  const ui = $('mock-ui'); ui.replaceChildren();
  if (p.style !== 'dropdown') {
    const row = el('div', 'mock-btns');
    for (const c of s.categories) row.append(el('span', `mb ${c.color || 'primary'}`, `${c.emoji ? c.emoji + ' ' : ''}${c.label}`));
    ui.append(row);
  }
  if (p.style !== 'buttons') {
    const sel = el('div', 'mock-select');
    sel.append(el('span', null, p.placeholder || 'Bir kategori seç…'), el('i', null, '⌄'));
    ui.append(sel);
  }
}

function drawCats(list) {
  const box = $('cats'); box.replaceChildren();
  if (!list.length) { box.append(el('p', 'muted', 'Kategoriler yüklenemedi.')); return; }
  for (const c of list) {
    const card = el('article', 'cat');
    card.append(el('span', 'cat-ico', c.emoji || '🎫'), el('h3', null, c.label), el('p', null, c.description || 'Bu kategoride talep açarak ekibe ulaşabilirsin.'));
    box.append(card);
  }
}

// Panelden değiştirilen site yazılarını yerleştirir (data-t="anahtar" olan her alan)
// Site yazılarındaki {değişkenler}: {server} {members} {open} {closed} {total} {brand} {bot} {ping} {date} {time} {greeting}
function siteFill(text, s) {
  const now = new Date();
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false }).format(now)) % 24;
  const tr = o => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', ...o }).format(now);
  const v = {
    server: s.guild?.name || '', members: s.guild ? nf(s.guild.members) : '', membercount: s.guild ? nf(s.guild.members) : '',
    open: nf(s.tickets.open), opentickets: nf(s.tickets.open), closed: nf(s.tickets.closed), total: nf(s.tickets.total), totaltickets: nf(s.tickets.total),
    brand: s.brand || '', bot: s.bot?.tag || '', botname: s.bot?.tag || '', ping: s.ping ?? '',
    date: tr({ day: '2-digit', month: '2-digit', year: 'numeric' }), time: tr({ hour: '2-digit', minute: '2-digit', hour12: false }),
    day: tr({ weekday: 'long' }), year: tr({ year: 'numeric' }),
    greeting: h >= 5 && h < 12 ? 'Günaydın' : h >= 12 && h < 18 ? 'İyi günler' : h >= 18 && h < 23 ? 'İyi akşamlar' : 'İyi geceler',
  };
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (k.toLowerCase() in v ? v[k.toLowerCase()] : m));
}

function applyTexts(site, hasLink, stats) {
  if (!site) return;
  document.querySelectorAll('[data-t]').forEach(el => {
    const k = el.dataset.t;
    if (k === 'ctaTextNoLink' && hasLink) return; // link varken ctaText kullanılır
    if (site[k]) el.textContent = stats ? siteFill(site[k], stats) : site[k];
  });
}

let catKey = '';
async function tick() {
  try {
    const s = await (await fetch('/api/stats', { cache: 'no-store' })).json();
    const on = s.ready;
    $('dot').classList.toggle('off', !on);
    $('status').textContent = on ? 'Ekip çevrimiçi' : 'Bot çevrimdışı';
    $('brand').textContent = s.brand; $('foot').textContent = s.brand; document.title = s.brand;
    if (s.guild) { $('gname').textContent = s.guild.name; $('s-members').textContent = nf(s.guild.members); }
    if (s.bot) {
      $('mock-bot').textContent = s.bot.tag;
      if (s.bot.avatar) { const img = el('img'); img.src = s.bot.avatar; img.alt = ''; img.onerror = () => img.remove(); $('avatar-box').replaceChildren(img); }
    }
    $('open').textContent = nf(s.tickets.open);
    $('s-open').textContent = nf(s.tickets.open);
    $('s-closed').textContent = nf(s.tickets.closed);
    $('s-total').textContent = nf(s.tickets.total);
    $('s-ping').textContent = s.ping == null ? '–' : `${s.ping} ms`;
    $('s-up').textContent = fmtUp(s.uptime);
    if (s.panelUrl) { $('cta').href = s.panelUrl; $('cta').target = '_blank'; $('cta').rel = 'noopener'; $('cta').textContent = (s.site && s.site.ctaText) || 'Discord\'da talep aç'; }
    applyTexts(s.site, Boolean(s.panelUrl), s);
    const key = JSON.stringify([s.panel, s.categories]);
    if (key !== catKey) { catKey = key; drawMock(s); drawCats(s.categories); }
  } catch {
    $('dot').classList.add('off'); $('status').textContent = 'Sunucuya ulaşılamıyor';
  }
}
tick();
setInterval(tick, 5000);
