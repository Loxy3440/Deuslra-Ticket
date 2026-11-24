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
    for (const c of s.categories.filter(c => !c.hidden)) row.append(el('span', `mb ${c.color || 'primary'}`, `${c.emoji ? c.emoji + ' ' : ''}${c.label}`));
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
  for (const c of list.filter(c => !c.hidden || c.giveaway)) { // gizli kategoriler gösterilmez; çekiliş ödül kategorisi rozetle gösterilir
    const card = el('article', c.giveaway ? 'cat gw' : 'cat');
    card.append(el('span', 'cat-ico', c.emoji || '🎫'), el('h3', null, c.label), el('p', null, (c.giveaway && gwText.gwCatDesc) || c.description || 'Bu kategoride talep açarak ekibe ulaşabilirsin.'));
    if (c.giveaway) card.append(el('span', 'badge', `🎁 ${gwText.gwCatBadge || 'Çekiliş ödül kategorisi'}`));
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

let gwText = {};
// ---- Çekilişler bölümü: sekmeler, arama, sıralama, kartlar ve ayrıntı penceresi ----
const gwUI = { tab: '', q: '', sort: 'soon', ready: false, s: null, openId: '' };
const gwT = (k, fb) => (gwText[k] && String(gwText[k]).trim()) || fb;
const gwFill = (t, v) => String(t).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
const gwLeft = ms => {
  const t = Math.floor((ms - Date.now()) / 1000);
  if (t <= 0) return '0 sn';
  const d = Math.floor(t / 86400), h = Math.floor(t % 86400 / 3600), m = Math.floor(t % 3600 / 60), sec = t % 60;
  return d ? `${d} gün ${h} sa` : h ? `${h} sa ${m} dk` : m ? `${m} dk ${sec} sn` : `${sec} sn`;
};
const gwCap = t => String(t).charAt(0).toLocaleUpperCase('tr-TR') + String(t).slice(1);
const gwDateS = ms => (ms ? new Date(ms).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : '–');
function gwBold(text) { // **kalın** işaretini güvenli şekilde kalın yapar
  const f = document.createDocumentFragment();
  String(text).split('**').forEach((part, i) => f.append(i % 2 ? el('b', null, part) : document.createTextNode(part)));
  return f;
}
function gwReqLines(it, roles) {
  const r = it.requirements; if (!r) return [];
  const out = [];
  if (r.roleIds?.length) out.push(['🎭', gwFill(gwT('gwSReqRole', 'Rol: {roles}'), { roles: r.roleIds.map(id => roles[id] || 'rol').join(', ') })]);
  if (r.serverTag) out.push(['🏷️', gwT('gwSReqTag', 'Sunucu etiketini (tag) profiline tak')]);
  if (r.statusText) out.push(['💬', gwFill(gwT('gwSReqStatus', 'Özel durumunda "{text}" yazsın'), { text: r.statusText })]);
  if (r.voiceMinutes) out.push(['🔊', gwFill(gwT('gwSReqVoice', 'Çekiliş boyunca seste en az {n} dakika kal'), { n: r.voiceMinutes })]);
  if (r.messages) out.push(['✉️', gwFill(gwT('gwSReqMessages', 'Çekiliş boyunca en az {n} mesaj yaz'), { n: r.messages })]);
  if (r.invites) out.push(['📨', gwFill(gwT('gwSReqInvites', 'Çekiliş boyunca en az {n} kişiyi davet et'), { n: r.invites })]);
  return out;
}
function gwStateBadge(it) {
  const m = { running: ['🟢', gwT('gwTabRunning', 'Devam edenler').replace(/ler$/, '')], ended: ['🏁', gwT('gwEndedLabel', 'Bitti')], cancelled: ['🚫', 'İptal'] }[it.status] || ['', it.status];
  const b = el('span', `gw-state ${it.status}`, `${m[0]} ${it.status === 'running' ? 'Devam ediyor' : m[1]}`);
  return b;
}
function gwChip(icon, text, title) { const c = el('span', 'gw-chip', `${icon} ${text}`); if (title) c.title = title; return c; }

function gwCard(it, g) {
  const o = g.options, T = gwT;
  const c = el('article', `gw-card ${it.status}`);
  const top = el('div', 'gw-top'); top.append(gwStateBadge(it));
  if (it.status === 'running' && o.countdown) { const cd = el('span', 'gw-count', gwLeft(it.endsAt)); cd.dataset.end = it.endsAt; top.append(cd); }
  else if (it.status !== 'running') top.append(el('span', 'muted sm', gwDateS(it.endedAt || it.endsAt)));
  c.append(top, el('h3', 'gw-prize', it.prize));
  const chips = el('div', 'gw-chips');
  if (o.entries) chips.append(gwChip('👥', `${nf(it.entries)} ${T('gwEntriesLabel', 'katılımcı')}`));
  chips.append(gwChip('🏆', `${it.winnersCount} ${T('gwWinnersLabel', 'Kazanan').toLowerCase()}`));
  if (o.host && it.hostTag) chips.append(gwChip('🎤', it.hostTag, T('gwHostLabel', 'Düzenleyen')));
  if (o.channel && it.channelName) chips.append(gwChip('#', it.channelName, T('gwChannelLabel', 'Kanal')));
  c.append(chips);
  if (it.status === 'running' && o.countdown && it.endsAt > it.createdAt) {
    const bar = el('div', 'gw-bar-track'), fill = el('i'); fill.dataset.from = it.createdAt; fill.dataset.to = it.endsAt; bar.append(fill); c.append(bar);
  }
  const reqs = o.requirements ? gwReqLines(it, g.roles || {}) : [];
  if (reqs.length) { const r = el('div', 'gw-chips req'); reqs.slice(0, 3).forEach(([i, t]) => r.append(gwChip(i, t))); if (reqs.length > 3) r.append(gwChip('', `+${reqs.length - 3}`)); c.append(r); }
  if (it.status === 'ended' && g.showWinners) {
    const w = el('p', 'gw-win');
    w.textContent = it.winners.length ? `🏆 ${it.winners.slice(0, 3).map(x => x.tag + (x.claimed ? ' ✅' : '')).join(', ')}${it.winners.length > 3 ? ` +${it.winners.length - 3}` : ''}` : T('gwWinnersEmpty', 'Kazanan henüz belli değil.');
    c.append(w);
  }
  const btn = el('button', 'btn ghost sm', T('gwDetailBtn', 'Ayrıntılar')); btn.type = 'button';
  btn.addEventListener('click', () => gwOpen(it.id)); c.append(btn);
  return c;
}

function gwAllItems(g) { return [...g.running, ...g.ended, ...(g.cancelled || [])]; }
function gwRenderList() {
  const g = gwUI.s?.giveaways; if (!g) return;
  const base = gwUI.tab === 'running' ? g.running : gwUI.tab === 'ended' ? g.ended : gwAllItems(g);
  const q = gwUI.q.trim().toLowerCase();
  const items = base.filter(it => !q || `${it.prize} ${it.hostTag || ''}`.toLowerCase().includes(q));
  const by = {
    soon: (a, b) => (a.status === 'running' && b.status === 'running' ? a.endsAt - b.endsAt : (b.endedAt || b.endsAt) - (a.endedAt || a.endsAt)),
    entries: (a, b) => b.entries - a.entries, new: (a, b) => b.createdAt - a.createdAt,
  }[gwUI.sort];
  items.sort(by);
  const list = $('gw-list'); list.className = `gws ${g.options.layout === 'list' ? 'list' : ''}`;
  const none = q ? gwT('gwNoResults', 'Aramana uyan çekiliş yok.') : gwUI.tab === 'ended' ? gwT('gwNoneEnded', 'Henüz biten çekiliş yok.') : gwT('gwNone', 'Şu an çalışan çekiliş yok.');
  list.replaceChildren(...(items.length ? items.map(it => gwCard(it, g)) : [el('p', 'muted gw-none', none)]));
}
function gwInit() {
  gwUI.ready = true;
  $('gw-search').addEventListener('input', e => { gwUI.q = e.target.value; gwRenderList(); });
  $('gw-sort').addEventListener('change', e => { gwUI.sort = e.target.value; gwRenderList(); });
  const d = $('gw-dialog');
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  d.addEventListener('close', () => { gwUI.openId = ''; });
  setInterval(gwTickClock, 1000);
}
function gwTickClock() { // geri sayım ve ilerleme çubukları her saniye güncellenir
  const now = Date.now();
  document.querySelectorAll('.gw-count[data-end]').forEach(n => { n.textContent = gwLeft(Number(n.dataset.end)); });
  document.querySelectorAll('.gw-bar-track i').forEach(n => { const a = Number(n.dataset.from), b = Number(n.dataset.to); n.style.width = `${Math.min(100, Math.max(2, (now - a) / (b - a) * 100))}%`; });
}

function gwOpen(id) { gwUI.openId = id; gwDrawDialog(); const d = $('gw-dialog'); if (!d.open) (d.showModal ? d.showModal() : d.setAttribute('open', '')); }
function gwDrawDialog() {
  const s = gwUI.s, g = s?.giveaways, d = $('gw-dialog');
  if (!g || !gwUI.openId) return;
  const it = gwAllItems(g).find(x => x.id === gwUI.openId);
  if (!it) { if (d.open) d.close(); return; }
  const o = g.options, T = gwT;
  const head = el('div', 'gw-dh'); const close = el('button', 'btn ghost sm', T('gwCloseBtn', 'Kapat')); close.type = 'button'; close.addEventListener('click', () => d.close());
  head.append(el('div', null), close); head.firstChild.append(gwStateBadge(it), el('h3', 'gw-prize', it.prize));
  const kv = (k, v, cls) => { const n = el('div', `gw-kv ${cls || ''}`); n.append(el('span', 'muted sm', k)); const b = el('b'); if (v instanceof Node) b.append(v); else b.textContent = v; n.append(b); return n; };
  const grid = el('div', 'gw-grid');
  if (it.status === 'running') { const cd = el('span', 'gw-count', gwLeft(it.endsAt)); cd.dataset.end = it.endsAt; grid.append(kv(T('gwLeftLabel', 'Kalan süre'), cd)); }
  grid.append(kv(T('gwStartedLabel', 'Başlangıç'), gwDateS(it.createdAt)), kv(it.status === 'running' ? T('gwEndsLabel', 'Bitiş') : T('gwEndedLabel', 'Bitti'), gwDateS(it.status === 'running' ? it.endsAt : it.endedAt || it.endsAt)));
  if (o.entries) grid.append(kv(gwCap(T('gwEntriesLabel', 'katılımcı')), nf(it.entries)));
  grid.append(kv(T('gwWinnersLabel', 'Kazanan'), String(it.winnersCount)));
  if (o.host && it.hostTag) grid.append(kv(T('gwHostLabel', 'Düzenleyen'), it.hostTag));
  if (o.channel && it.channelName) grid.append(kv(T('gwChannelLabel', 'Kanal'), `#${it.channelName}`));
  const body = [head, grid];
  if (it.status === 'running' && o.countdown && it.endsAt > it.createdAt) { const bar = el('div', 'gw-bar-track big'), fill = el('i'); fill.dataset.from = it.createdAt; fill.dataset.to = it.endsAt; bar.append(fill); body.push(bar); }
  if (o.requirements) {
    const reqs = gwReqLines(it, g.roles || {});
    const box = el('div', 'gw-sec'); box.append(el('h4', null, T('gwReqLabel', 'Katılım şartları')));
    if (reqs.length) { const ul = el('ul', 'gw-req'); reqs.forEach(([i, t]) => { const li = el('li'); li.append(el('span', null, i), document.createTextNode(` ${t}`)); ul.append(li); }); box.append(ul); }
    else box.append(el('p', 'muted', T('gwNoReq', 'Ek şart yok, katılmak yeterli.')));
    body.push(box);
  }
  if (it.status === 'ended' && g.showWinners) {
    const box = el('div', 'gw-sec'); box.append(el('h4', null, T('gwWinnersLabel', 'Kazanan')));
    if (it.winners.length) { const w = el('div', 'gw-chips'); it.winners.forEach(x => w.append(gwChip(x.claimed ? '✅' : '🏆', x.tag))); box.append(w); } else box.append(el('p', 'muted', T('gwWinnersEmpty', 'Kazanan henüz belli değil.')));
    if (g.claimHours) box.append(el('p', 'muted sm', gwFill(T('gwClaimNote', 'Kazananlar ödüllerini {hours} saat içinde almalı.'), { hours: g.claimHours })));
    body.push(box);
  }
  if (o.howTo && it.status === 'running') {
    const box = el('div', 'gw-sec how'); box.append(el('h4', null, T('gwHowTitle', 'Nasıl katılırım?')));
    const p = el('p', 'muted'); p.append(gwBold(gwFill(T('gwHowText', 'Discord sunucusunda {channel} kanalındaki çekiliş mesajında **Katıl** butonuna bas.'), { channel: it.channelName ? `#${it.channelName}` : 'çekiliş' }))); box.append(p); body.push(box);
  }
  d.replaceChildren(...body);
  gwTickClock();
}

function drawGiveaways(s) {
  const sec = $('cekilisler'), g = s.giveaways;
  sec.hidden = !g; $('nav-gw').hidden = !g;
  if (!g) return;
  gwUI.s = s;
  if (!gwUI.ready) gwInit();
  const o = g.options, T = gwT;
  $('gw-lead').textContent = siteFill(String(gwText.gwLead || '').replace(/\{hours\}/gi, g.claimHours || '∞'), s);
  // üst özet
  const stat = (n, l) => { const c = el('div', 'gw-stat'); c.append(el('b', null, nf(n)), el('span', 'muted sm', l)); return c; };
  $('gw-stats').replaceChildren(stat(g.totals.running, T('gwStatRunning', 'Devam eden')), ...(o.entries ? [stat(g.totals.entries, T('gwStatEntries', 'Katılımcı'))] : []), stat(g.totals.ended, T('gwStatEnded', 'Biten')));
  // araç çubuğu
  $('gw-bar').hidden = !o.filters;
  if (!o.filters && gwUI.q) { gwUI.q = ''; $('gw-search').value = ''; }
  const tabs = [['running', `${T('gwTabRunning', 'Devam edenler')} (${g.running.length})`], ['ended', `${T('gwTabEnded', 'Biten')} (${g.ended.length})`], ['all', `${T('gwTabAll', 'Tümü')} (${gwAllItems(g).length})`]];
  if (!gwUI.tab || !tabs.some(t => t[0] === gwUI.tab)) gwUI.tab = g.running.length || !g.ended.length ? 'running' : 'ended';
  const tabBox = $('gw-tabs');
  tabBox.replaceChildren(...tabs.map(([id, label]) => { const b = el('button', `gw-tab ${gwUI.tab === id ? 'on' : ''}`, label); b.type = 'button'; b.setAttribute('role', 'tab'); b.addEventListener('click', () => { gwUI.tab = id; drawGiveaways(gwUI.s); }); return b; }));
  $('gw-search').placeholder = T('gwSearch', 'Ödül ara…');
  const sort = $('gw-sort'); const opts = [['soon', T('gwSortSoon', 'Yakında bitecek')], ['entries', T('gwSortEntries', 'En çok katılımcı')], ['new', T('gwSortNew', 'En yeni')]];
  if (sort.options.length !== opts.length) sort.replaceChildren(...opts.map(([v, l]) => { const op = el('option', null, l); op.value = v; return op; }));
  opts.forEach(([, l], i) => { sort.options[i].textContent = l; }); sort.value = gwUI.sort;
  gwRenderList();
  // genel "nasıl katılırım"
  const how = $('gw-how'); const firstRun = g.running[0];
  how.hidden = !(o.howTo && g.running.length);
  if (!how.hidden) { how.replaceChildren(el('b', null, T('gwHowTitle', 'Nasıl katılırım?')), (() => { const p = el('p', 'muted'); p.append(gwBold(gwFill(T('gwHowText', 'Discord sunucusunda {channel} kanalındaki çekiliş mesajında **Katıl** butonuna bas.'), { channel: firstRun?.channelName ? `#${firstRun.channelName}` : 'çekiliş' }))); return p; })()); }
  gwDrawDialog();
  gwTickClock();
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
    gwText = s.site || {};
    drawGiveaways(s);
    const key = JSON.stringify([s.panel, s.categories, s.site?.gwCatBadge, s.site?.gwCatDesc]);
    if (key !== catKey) { catKey = key; drawMock(s); drawCats(s.categories); }
  } catch {
    $('dot').classList.add('off'); $('status').textContent = 'Sunucuya ulaşılamıyor';
  }
}
tick();
setInterval(tick, 5000);
