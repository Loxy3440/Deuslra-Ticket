/* Deuslra Destek · yönetim paneli (framework yok, saf JS) */
const root = document.getElementById('root');
let cfg = null, meta = { connected: false, channels: [], categories: [], roles: [] };
let isDirty = false, previewEl = null, ticketPreviewEl = null, saveInfo = null, timer = null, refreshDiag = () => {};

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  if (value !== undefined) el.value = value;
  return el;
}

async function api(path, body) {
  const post = body !== undefined;
  const r = await fetch('/api/' + path, {
    method: post ? 'POST' : 'GET', cache: 'no-store',
    headers: post ? { 'Content-Type': 'application/json' } : {}, body: post ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && path.startsWith('admin/')) { location.reload(); throw new Error('Oturum bitti'); }
  if (!r.ok) throw new Error(d.error || 'Bir hata oluştu');
  return d;
}

function toast(msg, kind = 'ok') {
  const t = h('div', { class: `toast ${kind === 'err' ? 'err' : 'ok'}` }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 8000 : 3500);
}

async function act(btn, fn) {
  btn.disabled = true;
  try { const r = await fn(); if (r?.message) toast(r.message); }
  catch (e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; }
}

const dirty = () => { isDirty = true; if (saveInfo) saveInfo.textContent = '● Kaydedilmemiş değişiklikler var'; };
const pad = n => String(n || 0).padStart(4, '0');
function ago(ms) {
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s} sn önce`; if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`; return `${Math.floor(s / 86400)} gün önce`;
}

async function save() {
  const r = await api('admin/config', cfg);
  // ÖNEMLİ: cfg nesnesini değiştirme! Form kutuları bu nesnelere bağlı; değiştirirsen sonraki düzenlemeler
  // eski nesneye yazılır ve ikinci "Kaydet" hiçbir şey kaydetmez (Ctrl+R gerekirdi). Sadece sunucunun ürettiği id'leri işle.
  r.config.buttons.forEach((sb, i) => { if (cfg.buttons[i]) cfg.buttons[i].id = sb.id; });
  // Sunucu Tenor/Giphy sayfa linklerini doğrudan GIF adresine çevirmiş olabilir: kutuda göster.
  let fixed = false;
  for (const [obj, key, k] of [[cfg.panel, 'imageUrl', 'panel.imageUrl'], [cfg.panel, 'thumbnailUrl', 'panel.thumbnailUrl'], [cfg.ticketEmbed, 'imageUrl', 'ticketEmbed.imageUrl'], [cfg.ticketEmbed, 'thumbnailUrl', 'ticketEmbed.thumbnailUrl']]) {
    const saved = k.split('.').reduce((o, x) => o[x], r.config);
    if (saved !== obj[key]) { obj[key] = saved; fixed = true; const inp = document.querySelector(`[data-k="${k}"]`); if (inp) inp.value = saved; }
  }
  if (fixed) r.message = 'Ayarlar kaydedildi. GIF/görsel adresi otomatik doğrudan dosya adresine çevrildi.';
  isDirty = false;
  if (saveInfo) saveInfo.textContent = 'Tüm ayarlar kayıtlı';
  refreshPreview();
  return r;
}
// Önce kaydeder, sonra Discord'a gönderir; tek tuşla bitsin diye.
async function saveAndPublish() {
  await save();
  const r = await api('admin/panel/publish', {});
  refreshDiag();
  return r;
}

/* ---------- form parçaları ---------- */
function field(label, input, hint) { return h('div', { class: 'field' }, h('label', {}, label), input, hint && h('p', { class: 'hint' }, hint)); }

function text(obj, key, o = {}) {
  const el = o.multi ? h('textarea', { rows: o.rows || 3 }) : h('input', { type: o.type || 'text' });
  el.value = obj[key] ?? ''; el.placeholder = o.ph || '';
  if (o.max) el.maxLength = o.max;
  if (o.k) el.dataset.k = o.k;
  el.addEventListener('input', () => { obj[key] = el.value; dirty(); refreshPreview(); });
  return el;
}
function num(obj, key, min, max) {
  const el = h('input', { type: 'number', min, max }); el.value = obj[key];
  el.addEventListener('input', () => { obj[key] = Number(el.value); dirty(); });
  return el;
}
function check(obj, key, label) {
  const el = h('input', { type: 'checkbox', checked: obj[key] });
  el.addEventListener('change', () => { obj[key] = el.checked; dirty(); refreshPreview(); });
  return h('label', { class: 'chk' }, el, label);
}
// Sunucudaki kanal/kategori/rol listesinden seçtiren açılır liste
function picker(obj, key, items, empty = '— Seçilmedi —') {
  const sel = h('select', {}, h('option', { value: '' }, empty), items.map(i => h('option', { value: i.id }, i.label)));
  if (obj[key] && !items.some(i => i.id === obj[key])) sel.append(h('option', { value: obj[key] }, `(bulunamadı) ${obj[key]}`));
  sel.value = obj[key] || '';
  sel.addEventListener('change', () => { obj[key] = sel.value; dirty(); });
  return sel;
}
const chanItems = () => meta.channels.map(c => ({ id: c.id, label: `#${c.name}${c.parent ? ` · ${c.parent}` : ''}` }));
const catItems = () => meta.categories.map(c => ({ id: c.id, label: c.name }));

/* ---------- Discord önizlemesi ---------- */
function refreshPreview() {
  if (!previewEl) return;
  const p = cfg.panel;
  const emb = h('div', { class: 'emb' });
  emb.style.borderLeftColor = p.color || '#8B5CF6';
  if (p.title) emb.append(h('div', { class: 't' }, p.title));
  if (p.description) emb.append(h('div', { class: 'd' }, p.description));
  if (/^https?:\/\//.test(p.imageUrl)) emb.append(h('img', { src: p.imageUrl, alt: '' }));
  if (p.footer) emb.append(h('div', { class: 'f' }, p.footer));
  previewEl.replaceChildren(
    h('div', { class: 'dc' },
      p.content && h('div', {}, p.content),
      (p.title || p.description || p.footer) && emb,
      p.style !== 'dropdown' && h('div', { class: 'bt' }, cfg.buttons.map(b => h('span', { class: b.color }, `${b.emoji ? b.emoji + ' ' : ''}${b.label}`))),
      p.style !== 'buttons' && h('div', { class: 'sel' }, h('span', {}, p.placeholder || 'Bir kategori seç…'), h('span', {}, '⌄'))));
  refreshTicketPreview();
}

function refreshTicketPreview() {
  if (!ticketPreviewEl) return;
  const te = cfg.ticketEmbed, st = cfg.settings;
  const fill = t => String(t || '').replace(/\{user\}/gi, '@kullanıcı').replace(/\{category\}/gi, cfg.buttons[0]?.label || 'Kategori').replace(/\{number\}/gi, '0001');
  const emb = h('div', { class: 'emb' });
  emb.style.borderLeftColor = te.color || '#8B5CF6';
  emb.append(h('div', { class: 't' }, fill(te.title) || 'Ticket #0001'), h('div', { class: 'd' }, fill(st.welcomeMessage)));
  if (te.showDetails) emb.append(h('div', { class: 'd', style: 'display:flex;gap:18px;font-size:12px' }, h('span', {}, 'Açan\n@kullanıcı'), h('span', {}, `Kategori\n${cfg.buttons[0]?.label || ''}`), h('span', {}, 'Açılış\nşimdi')));
  if (/^https?:\/\//.test(te.imageUrl)) emb.append(h('img', { src: te.imageUrl, alt: '' }));
  emb.append(h('div', { class: 'f' }, te.footer || cfg.brandName));
  ticketPreviewEl.replaceChildren(h('div', { class: 'dc' }, emb,
    h('div', { class: 'bt' }, ['close', 'claim', 'callStaff'].map(k => h('span', { class: cfg.actions[k].color }, `${cfg.actions[k].emoji ? cfg.actions[k].emoji + ' ' : ''}${cfg.actions[k].label}`)))));
}

/* ---------- kurulum kontrol listesi ---------- */
function diagCard() {
  const list = h('div', { class: 'checks' });
  const banner = h('div', {});
  const links = h('div', { class: 'acts' });
  async function load() {
    try {
      const d = await api('admin/diagnostics');
      const bad = d.checks.filter(c => c.status === 'bad').length;
      banner.className = `banner ${bad ? 'bad' : 'ok'}`;
      banner.textContent = bad ? `${bad} sorun var: önce aşağıdaki kırmızı maddeleri düzelt.` : 'Her şey hazır görünüyor. Panel gönderilebilir.';
      list.replaceChildren(...d.checks.map(c => h('div', { class: `chk-item ${c.status}` },
        h('span', { class: 'ic' }, { ok: '✓', warn: '!', bad: '✕' }[c.status]),
        h('div', {}, h('b', {}, c.title), h('p', {}, c.detail), c.fix && c.status !== 'ok' && h('p', { class: 'fix' }, '→ ' + c.fix)))));
      links.replaceChildren(...[
        h('button', { class: 'btn ghost sm', onclick: e => act(e.target, async () => { await load(); }) }, 'Yeniden kontrol et'),
        d.inviteUrl && h('a', { class: 'btn ghost sm', href: d.inviteUrl, target: '_blank', rel: 'noopener' }, 'Botu doğru izinlerle davet et'),
        d.published && h('a', { class: 'btn ghost sm', href: d.published.url, target: '_blank', rel: 'noopener' }, 'Paneli Discord\'da aç'),
      ].filter(Boolean));
    } catch (e) { banner.className = 'banner bad'; banner.textContent = e.message; }
  }
  refreshDiag = load; load();
  return h('div', { class: 'card' },
    h('div', { class: 'bhead' }, h('div', {}, h('h2', {}, 'Kurulum durumu'), h('p', { class: 'hint' }, 'Panel Discord\'a gitmiyorsa sebebi burada yazar.')), links),
    banner, list);
}

/* ---------- sekmeler ---------- */
function overviewPane() {
  const stats = h('div', { class: 'cards4' });
  const body = h('div', { class: 'tablewrap' });
  async function load() {
    try {
      const d = await api('admin/tickets');
      const c = d.counts;
      stats.replaceChildren(...[['Açık ticket', c.open], ['Kapatılan', c.closed], ['Toplam açılan', c.total], ['Kayıtlı', d.tickets.length]]
        .map(([l, v]) => h('div', { class: 'card stat' }, h('div', { class: 'lbl' }, l), h('strong', {}, v))));
      if (!d.tickets.length) { body.replaceChildren(h('div', { class: 'empty' }, 'Henüz ticket yok. Yukarıdaki kurulum maddeleri tamamsa alttaki çubuktan "Kaydet ve Discord\'a gönder"e bas.')); return; }
      body.replaceChildren(h('table', {},
        h('thead', {}, h('tr', {}, ['#', 'Kullanıcı', 'Kategori', 'Durum', 'Üstlenen', 'Açılış', ''].map(x => h('th', {}, x)))),
        h('tbody', {}, d.tickets.map(t => {
          const gone = !t.exists && t.status !== 'deleted';
          const acts = h('div', { class: 'acts' });
          if (t.exists && t.status === 'open') acts.append(
            h('button', { class: 'btn ghost sm', onclick: e => { const r = prompt('Kapatma sebebi?', 'Sorun çözüldü'); if (r) act(e.target, async () => { const x = await api('admin/tickets/close', { channelId: t.channelId, reason: r }); load(); return x; }); } }, 'Kapat'));
          if (t.exists && t.status === 'closed') acts.append(
            h('button', { class: 'btn good sm', onclick: e => act(e.target, async () => { const x = await api('admin/tickets/reopen', { channelId: t.channelId }); load(); return x; }) }, 'Yeniden aç'));
          if (t.exists) acts.append(
            h('button', { class: 'btn danger sm', onclick: e => { if (confirm(`Ticket #${pad(t.number)} kalıcı silinsin mi?`)) act(e.target, async () => { const x = await api('admin/tickets/delete', { channelId: t.channelId }); setTimeout(load, 7000); return x; }); } }, 'Sil'));
          return h('tr', {},
            h('td', {}, `#${pad(t.number)}`), h('td', {}, t.ownerTag || t.ownerId), h('td', {}, t.buttonLabel || '—'),
            h('td', {}, h('span', { class: `st ${gone ? 'deleted' : t.status}` }, gone ? 'kanal yok' : { open: 'Açık', closed: 'Kapalı', deleted: 'Silindi' }[t.status] || t.status)),
            h('td', {}, t.claimedByTag || '—'), h('td', { title: new Date(t.createdAt).toLocaleString('tr-TR') }, ago(t.createdAt)), h('td', {}, acts));
        }))));
    } catch (e) { body.replaceChildren(h('div', { class: 'empty' }, e.message)); }
  }
  load();
  clearInterval(timer); timer = setInterval(() => { if (!document.hidden && document.getElementById('pane-overview')?.classList.contains('on')) load(); }, 10000);
  return h('div', { class: 'pane on', id: 'pane-overview' },
    diagCard(), stats,
    h('div', { class: 'card' },
      h('div', { class: 'bhead' }, h('div', {}, h('h2', {}, 'Ticketlar'), h('p', { class: 'hint' }, 'Son 200 ticket. Kapatılan ticketı kullanıcı görmez, sadece destek ekibi görür.')),
        h('div', { class: 'acts' },
          h('button', { class: 'btn ghost sm', onclick: load }, 'Yenile'),
          h('button', { class: 'btn sm', onclick: e => act(e.target, saveAndPublish) }, 'Kaydet ve Discord\'a gönder'))),
      body));
}

function generalPane() {
  const roles = h('div', { class: 'roles' });
  const drawRoles = () => roles.replaceChildren(...(meta.roles.length ? meta.roles : cfg.supportRoleIds.map(id => ({ id, name: id, color: '#99aab5' }))).map(r => {
    const on = cfg.supportRoleIds.includes(r.id);
    const el = h('label', { class: `role ${on ? 'on' : ''}` }, h('i', {}), r.name);
    el.firstChild.style.background = r.color && r.color !== '#000000' ? r.color : '#99aab5';
    el.addEventListener('click', e => { e.preventDefault(); const i = cfg.supportRoleIds.indexOf(r.id); if (i >= 0) cfg.supportRoleIds.splice(i, 1); else cfg.supportRoleIds.push(r.id); dirty(); drawRoles(); });
    return el;
  }));
  drawRoles();
  const s = cfg.settings;
  return h('div', { class: 'pane', id: 'pane-general' },
    !meta.connected && h('div', { class: 'banner bad' }, 'Bot şu an sunucuya bağlı değil; kanal ve rol listeleri boş. Token ve sunucu ID\'sini kontrol edip sayfayı yenile.'),
    h('div', { class: 'card' }, h('h2', {}, 'Kanallar'),
      h('div', { class: 'grid2' },
        field('Panel kanalı', picker(cfg.panel, 'channelId', chanItems()), 'Ticket butonlarının çıkacağı kanal.'),
        field('Log kanalı', picker(cfg, 'logChannelId', chanItems()), 'Açılış/kapanış kayıtları ve transcript buraya gider.'),
        field('Ticket kategorisi', picker(cfg, 'ticketCategoryId', catItems()), 'Ticket kanalları bu kategorinin altında açılır.'),
        field('Marka adı', text(cfg, 'brandName', { max: 40 }), 'Site başlığı ve embed altlıklarında görünür.'))),
    h('div', { class: 'card' }, h('h2', {}, 'Destek rolleri'),
      h('p', { class: 'hint', style: 'margin-bottom:12px' }, 'Seçilen roller ticketları görür, üstlenir, kapatır ve siler; bekleme süresinden de muaftır. Sunucuyu yönetebilenler zaten yetkilidir.'), roles),
    h('div', { class: 'card' }, h('h2', {}, 'Ticket kuralları'),
      h('div', { class: 'grid2' },
        field('Kişi başı en fazla açık ticket', num(s, 'maxOpenPerUser', 1, 5)),
        field('Silmeden önce bekleme (sn)', num(s, 'deleteDelaySeconds', 0, 60), 'Silme komutundan sonra kanal bu kadar sonra kaybolur.')),
      h('p', { class: 'hint' }, 'Talep açılınca çıkan mesajı Panel görünümü sekmesinden düzenleyebilirsin.'),
      check(s, 'pingSupportOnOpen', 'Ticket açılınca destek rollerini etiketle'),
      check(s, 'transcript', 'Kapatma ve silmede transcript (HTML kayıt) oluştur'),
      check(s, 'dmOnClose', 'Ticket kapanınca kullanıcıya DM gönder'),
      check(s, 'dmTranscript', 'DM\'e transcript dosyasını da ekle')),
    h('div', { class: 'card' }, h('h2', {}, 'Sunucu ID (isteğe bağlı)'),
      field('Sunucu ID', text(cfg, 'guildId', { ph: '.env içindeki DISCORD_GUILD_ID öncelikli' }), '.env dosyasında DISCORD_GUILD_ID varsa o kullanılır.')));
}

function appearancePane() {
  previewEl = h('div', {}); ticketPreviewEl = h('div', {});
  const p = cfg.panel;
  const color = h('input', { type: 'color', value: p.color }); color.addEventListener('input', () => { p.color = color.value; dirty(); refreshPreview(); });
  const styles = [['buttons', 'Butonlar'], ['dropdown', 'Açılır liste'], ['both', 'İkisi birden']];
  const tcolor = h('input', { type: 'color', value: cfg.ticketEmbed.color }); tcolor.addEventListener('input', () => { cfg.ticketEmbed.color = tcolor.value; dirty(); refreshPreview(); });
  const colorSel = obj => { const sel = h('select', {}, ['primary', 'secondary', 'success', 'danger'].map(c => h('option', { value: c }, { primary: 'Mavi', secondary: 'Gri', success: 'Yeşil', danger: 'Kırmızı' }[c]))); sel.value = obj.color; sel.addEventListener('change', () => { obj.color = sel.value; dirty(); refreshPreview(); }); return sel; };
  const seg = h('div', { class: 'seg' });
  const drawSeg = () => seg.replaceChildren(...styles.map(([v, l]) => h('button', {
    class: p.style === v ? 'on' : '', onclick: () => {
      if (v === 'both' && cfg.buttons.length > 20) return toast('Buton + liste modunda en fazla 20 kategori olabilir.', 'err');
      p.style = v; dirty(); drawSeg(); ph.style.display = v === 'buttons' ? 'none' : ''; refreshPreview();
    },
  }, l)));
  const ph = field('Açılır liste yazısı', text(p, 'placeholder', { max: 100, ph: 'Bir kategori seç…' }), 'Liste kapalıyken görünen ipucu. Kategorilerin altındaki kısa açıklamalar "Butonlar & formlar" sekmesinden yazılır.');
  ph.style.display = p.style === 'buttons' ? 'none' : '';
  drawSeg();
  const pane = h('div', { class: 'pane', id: 'pane-look' }, h('div', { class: 'split' },
    h('div', {},
      h('div', { class: 'card' }, h('h2', {}, 'Kategori seçimi'),
        h('p', { class: 'hint', style: 'margin-bottom:12px' }, 'Kullanıcılar ticket açarken butona mı tıklasın, listeden mi seçsin?'), seg, h('div', { style: 'margin-top:14px' }, ph)),
      h('div', { class: 'card' }, h('h2', {}, 'Panel mesajı'),
        field('Başlık', text(p, 'title', { max: 256 })),
        field('Açıklama', text(p, 'description', { multi: true, rows: 5, max: 4000 })),
        field('Embed dışı üst yazı (isteğe bağlı)', text(p, 'content', { max: 2000 })),
        field('Alt yazı', text(p, 'footer', { max: 200 })),
        h('div', { class: 'grid2' },
          field('Renk', color),
          field('Küçük görsel URL', text(p, 'thumbnailUrl', { type: 'url', ph: 'https://…', k: 'panel.thumbnailUrl' }))),
        field('Büyük görsel / GIF URL', text(p, 'imageUrl', { type: 'url', ph: 'https://…/resim.gif', k: 'panel.imageUrl' }), 'Doğrudan .gif adresi koy. Tenor veya Giphy sayfa linki yapıştırırsan kaydederken otomatik GIF adresine çevrilir. Discord\'a yüklediğin dosyanın linki bir süre sonra bozulur; imgur gibi kalıcı bir adres daha güvenli.')),
      h('div', { class: 'card' }, h('h2', {}, 'Talep açılınca görünen mesaj'),
        h('p', { class: 'hint', style: 'margin-bottom:12px' }, 'Kullanıcı ticket açınca kanalda çıkan karşılama mesajı.'),
        field('Başlık', text(cfg.ticketEmbed, 'title', { max: 256 }), '{number} {category} {user} yazabilirsin.'),
        field('Karşılama yazısı', text(cfg.settings, 'welcomeMessage', { multi: true, max: 500 }), '{user} {category} {number} yazabilirsin.'),
        field('Alt yazı', text(cfg.ticketEmbed, 'footer', { max: 200 }), 'Boşsa marka adı yazılır.'),
        h('div', { class: 'grid2' },
          field('Renk', tcolor),
          field('Küçük görsel URL', text(cfg.ticketEmbed, 'thumbnailUrl', { type: 'url', ph: 'https://…', k: 'ticketEmbed.thumbnailUrl' }))),
        field('Büyük görsel / GIF URL', text(cfg.ticketEmbed, 'imageUrl', { type: 'url', ph: 'https://…/resim.gif', k: 'ticketEmbed.imageUrl' }), 'Doğrudan .gif adresi koy. Tenor veya Giphy sayfa linki yapıştırırsan kaydederken otomatik GIF adresine çevrilir. Discord\'a yüklediğin dosyanın linki bir süre sonra bozulur; imgur gibi kalıcı bir adres daha güvenli.'),
        check(cfg.ticketEmbed, 'showDetails', 'Açan / Kategori / Açılış bilgi satırını göster')),
      h('div', { class: 'card' }, h('h2', {}, 'Talep içindeki butonlar'),
        h('p', { class: 'hint', style: 'margin-bottom:12px' }, 'Bekleme süresi: biri butona bastıktan sonra süre dolana kadar o ticketta butona kimse tekrar basamaz. 0 = sınırsız. Örnek: "Ekibi çağır" için 300 saniye yazarsan ekip sürekli etiketlenemez.'),
        ...['close', 'claim', 'callStaff'].map(k => h('div', { class: 'bcard' },
          h('div', { class: 'grid2' },
            field({ close: 'Kapat · ad', claim: 'Üstlen · ad', callStaff: 'Ekibi çağır · ad' }[k], text(cfg.actions[k], 'label', { max: 80 })),
            field('Emoji', text(cfg.actions[k], 'emoji', { max: 64 })),
            field('Renk', colorSel(cfg.actions[k])),
            field('Bekleme süresi (saniye)', num(cfg.actions[k], 'cooldownSeconds', 0, 86400))))))),
    h('div', { class: 'preview' }, h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Panel mesajı önizleme'), previewEl), h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Talep açılınca önizleme'), ticketPreviewEl))));
  refreshPreview();
  return pane;
}

function buttonsPane() {
  const list = h('div', {});
  function draw() {
    list.replaceChildren(...cfg.buttons.map((b, i) => {
      const fields = h('div', {});
      const drawFields = () => fields.replaceChildren(...b.formFields.map((f, j) => {
        const req = h('input', { type: 'checkbox', checked: f.required }); req.addEventListener('change', () => { f.required = req.checked; dirty(); });
        return h('div', { class: 'frow' }, text(f, 'label', { ph: 'Soru (en fazla 45)', max: 45 }), text(f, 'placeholder', { ph: 'İpucu yazısı', max: 100 }),
          h('label', { class: 'chk', style: 'margin:0' }, req, 'Zorunlu'),
          h('button', { class: 'btn ghost sm', onclick: () => { b.formFields.splice(j, 1); dirty(); drawFields(); } }, '✕'));
      }));
      drawFields();
      const color = h('select', {}, ['primary', 'secondary', 'success', 'danger'].map(c => h('option', { value: c }, { primary: 'Mavi', secondary: 'Gri', success: 'Yeşil', danger: 'Kırmızı' }[c])));
      color.value = b.color; color.addEventListener('change', () => { b.color = color.value; dirty(); refreshPreview(); });
      // bekleme süresi dakika olarak girilir, saniye olarak saklanır
      const cd = h('input', { type: 'number', min: 0, max: 10080, step: 1 }); cd.value = Math.round((b.cooldownSeconds || 0) / 60);
      cd.addEventListener('input', () => { b.cooldownSeconds = Math.max(0, Math.round(Number(cd.value) || 0)) * 60; dirty(); });
      const formChk = h('input', { type: 'checkbox', checked: b.formEnabled });
      const formBox = h('div', { style: b.formEnabled ? '' : 'display:none' }, fields,
        h('button', { class: 'btn ghost sm', onclick: () => { if (b.formFields.length >= 5) return toast('En fazla 5 soru olabilir.', 'err'); b.formFields.push({ label: '', placeholder: '', required: true }); dirty(); drawFields(); } }, '+ Soru ekle'));
      formChk.addEventListener('change', () => { b.formEnabled = formChk.checked; if (b.formEnabled && !b.formFields.length) { b.formFields.push({ label: 'Konu', placeholder: '', required: true }); drawFields(); } formBox.style.display = b.formEnabled ? '' : 'none'; dirty(); });
      const move = d => { const k = i + d; if (k < 0 || k >= cfg.buttons.length) return; [cfg.buttons[i], cfg.buttons[k]] = [cfg.buttons[k], cfg.buttons[i]]; dirty(); draw(); refreshPreview(); };
      return h('div', { class: 'bcard' },
        h('div', { class: 'bhead' }, h('b', {}, `${i + 1}. kategori`),
          h('div', { class: 'acts' },
            h('button', { class: 'btn ghost sm', onclick: () => move(-1) }, '↑'), h('button', { class: 'btn ghost sm', onclick: () => move(1) }, '↓'),
            h('button', { class: 'btn danger sm', onclick: () => { if (cfg.buttons.length < 2) return toast('En az bir kategori kalmalı.', 'err'); cfg.buttons.splice(i, 1); dirty(); draw(); refreshPreview(); } }, 'Sil'))),
        h('div', { class: 'grid2' }, field('Ad', text(b, 'label', { max: 80 })), field('Emoji', text(b, 'emoji', { ph: '🎫', max: 64 })),
          field('Kısa açıklama', text(b, 'description', { max: 100, ph: 'Liste seçeneğinin altında ve sitede görünür' })), field('Renk (butonlar için)', color),
          field('Bekleme süresi (dakika)', cd, '0 = sınırsız. Kullanıcı bu kategoriden bir talep açtıktan sonra bu süre dolmadan yenisini açamaz (destek ekibi muaf).'),
          field('Özel kategori', picker(b, 'categoryId', catItems(), '— Varsayılan kategori —'), 'Boşsa genel ticket kategorisi kullanılır.')),
        h('label', { class: 'chk' }, formChk, 'Ticket açılmadan önce form sor'), formBox);
    }));
  }
  draw();
  return h('div', { class: 'pane', id: 'pane-buttons' }, h('div', { class: 'card' },
    h('div', { class: 'bhead' }, h('div', {}, h('h2', {}, 'Ticket kategorileri'), h('p', { class: 'hint' }, 'Her kategori bir buton ve/veya açılır liste seçeneğidir. En fazla 25 (butonla birlikte liste kullanıyorsan 20).')),
      h('button', { class: 'btn sm', onclick: () => { if (cfg.buttons.length >= 25) return toast('En fazla 25 kategori.', 'err'); cfg.buttons.push({ id: '', label: 'Yeni kategori', description: '', emoji: '', color: 'primary', categoryId: '', cooldownSeconds: 0, formEnabled: false, formFields: [] }); dirty(); draw(); refreshPreview(); } }, '+ Kategori ekle')),
    list));
}

/* ---------- ana iskelet ---------- */
function showApp() {
  const tabs = [['overview', '📊', 'Genel bakış', overviewPane], ['general', '⚙️', 'Ayarlar', generalPane], ['look', '🎨', 'Panel görünümü', appearancePane], ['buttons', '🎫', 'Kategoriler & formlar', buttonsPane]];
  const panes = tabs.map(t => t[3]());
  saveInfo = h('span', { class: 'muted sm' }, 'Tüm ayarlar kayıtlı');
  const nav = h('nav', { class: 'card side' }, tabs.map(([id, ico, name], i) => h('button', {
    class: i === 0 ? 'on' : '', onclick: e => {
      nav.querySelectorAll('button').forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on');
      panes.forEach(p => p.classList.remove('on')); panes[i].classList.add('on');
      if (id === 'look') refreshPreview();
    },
  }, `${ico}  ${name}`)),
    h('hr', {}), h('button', { onclick: () => { location.href = '/'; } }, '🏠  Siteye dön'),
    h('button', { onclick: async () => { await api('logout', {}); location.reload(); } }, '🚪  Çıkış yap'));
  root.replaceChildren(
    h('header', { class: 'top' }, h('div', { class: 'brand' }, h('div', { class: 'icobox' }, h('span', {}, '🛡️')), h('div', {}, h('b', {}, cfg.brandName), h('span', {}, 'Yönetim paneli'))),
      h('div', { class: 'right' }, h('span', { class: 'pill' }, h('i', { class: `dot ${meta.connected ? '' : 'off'}` }), meta.connected ? meta.guild.name : 'Bot bağlı değil'),
        h('button', { class: 'icon-btn', title: 'Açık / koyu tema', 'aria-label': 'Temayı değiştir', onclick: () => window.toggleTheme() }, '🌓'))),
    h('div', { class: 'shell' }, nav, h('main', {}, panes)),
    h('div', { class: 'savebar' }, saveInfo,
      h('button', { class: 'btn ghost', onclick: e => act(e.target, save) }, 'Ayarları kaydet'),
      h('button', { class: 'btn accent', onclick: e => act(e.target, saveAndPublish) }, 'Kaydet ve Discord\'a gönder')));
  window.addEventListener('beforeunload', e => { if (isDirty) { e.preventDefault(); e.returnValue = ''; } });
}

function showLogin(enabled) {
  const pw = h('input', { type: 'password', placeholder: 'Panel şifresi', autofocus: true });
  const go = async btn => act(btn, async () => { await api('login', { password: pw.value }); location.reload(); });
  const btn = h('button', { class: 'btn', style: 'width:100%', onclick: e => go(e.target) }, 'Giriş yap');
  pw.addEventListener('keydown', e => { if (e.key === 'Enter') go(btn); });
  root.replaceChildren(h('div', { class: 'card login' },
    h('div', { class: 'icobox', style: 'margin-bottom:16px' }, h('span', {}, '🛡️')), h('h1', {}, 'Yönetim paneli'),
    enabled ? h('div', {}, h('p', { class: 'muted' }, 'Devam etmek için şifreni gir.'), field('Şifre', pw), btn)
      : h('p', { class: 'muted' }, 'PANEL_PASSWORD tanımlı değil. Bir şifre yazıp botu yeniden başlat.'),
    h('p', { class: 'hint', style: 'margin-top:14px' }, h('a', { href: '/', style: 'color:var(--accent)' }, '← Siteye dön'))));
}

(async function init() {
  try {
    const s = await api('session');
    if (!s.authed) return showLogin(s.enabled);
    [cfg, meta] = await Promise.all([api('admin/config'), api('admin/meta')]);
    showApp();
  } catch (e) { root.replaceChildren(h('div', { class: 'card login' }, h('h1', {}, 'Bağlanılamadı'), h('p', { class: 'muted' }, e.message))); }
})();
