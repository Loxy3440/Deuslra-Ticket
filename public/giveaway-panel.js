/* Deuslra · Çekiliş bölümü (panel.js ile aynı sayfada çalışır: h, api, act, field, check, num, picker, textsPane... oradan gelir) */

/* ---------- ortak yardımcılar ---------- */
const GW_ST = { running: '🟢 Çalışıyor', ended: '🏁 Bitti', cancelled: '🚫 İptal' };
const gwDate = ms => (ms ? new Date(ms).toLocaleString('tr-TR') : '—');
const gwLeft = ms => {
  const s = Math.floor((ms - Date.now()) / 1000);
  if (s <= 0) return 'bitiyor…';
  const d = Math.floor(s / 86400), hr = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d} gün ${hr} sa` : hr ? `${hr} sa ${m} dk` : m ? `${m} dk` : `${s} sn`;
};
const gwChanName = id => { const c = (meta.channels || []).find(x => x.id === id); return c ? `#${c.name}` : id || '—'; };
const gwRoleName = id => (meta.roles || []).find(x => x.id === id)?.name || id;

/* Çekiliş formundaki şart kutuları (ayar kaydı gerektirmez, "kaydedilmemiş değişiklik" uyarısı çıkarmaz) */
function reqRoles(arr, onChange) {
  const box = h('div', { class: 'roles' });
  const draw = () => box.replaceChildren(...(meta.roles || []).map(r => {
    const el = h('label', { class: `role ${arr.includes(r.id) ? 'on' : ''}` }, h('i', {}), r.name);
    el.firstChild.style.background = r.color && r.color !== '#000000' ? r.color : '#99aab5';
    el.addEventListener('click', e => { e.preventDefault(); const i = arr.indexOf(r.id); if (i >= 0) arr.splice(i, 1); else arr.push(r.id); draw(); onChange && onChange(); });
    return el;
  }));
  draw();
  return box;
}
function reqCheck(obj, key, label, onChange) { const el = h('input', { type: 'checkbox' }); el.checked = Boolean(obj[key]); el.addEventListener('change', () => { obj[key] = el.checked; onChange && onChange(); }); return h('label', { class: 'chk' }, el, label); }
function reqText(obj, key, ph, onChange) { const el = h('input', { type: 'text', maxLength: 100, placeholder: ph }); el.value = obj[key] || ''; el.addEventListener('input', () => { obj[key] = el.value; onChange && onChange(); }); return el; }
function reqNum(obj, key, max, onChange) { const el = h('input', { type: 'number', min: 0, max }); el.value = obj[key] || 0; el.addEventListener('input', () => { obj[key] = Number(el.value) || 0; onChange && onChange(); }); return el; }
function reqList(r) {
  if (!r) return [];
  return [
    r.roleIds?.length && `🎭 Rol: ${r.roleIds.map(gwRoleName).join(', ')}`,
    r.serverTag && '🏷️ Sunucu etiketi (tag)',
    r.statusText && `💬 Durum: ${r.statusText}`,
    r.voiceMinutes && `🔊 Ses: ${r.voiceMinutes} dk`,
    r.messages && `✉️ Mesaj: ${r.messages}`,
    r.invites && `📨 Davet: ${r.invites}`,
  ].filter(Boolean);
}
const reqSummary = r => reqList(r).join('  ·  ');

/* Açılır pencere */
function gwModal(title) {
  const body = h('div', { class: 'modal-body' });
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  const overlay = h('div', { class: 'overlay', onclick: e => { if (e.target === overlay) close(); } },
    h('div', { class: 'modal card' }, h('div', { class: 'bhead' }, h('h2', {}, title), h('button', { class: 'btn ghost sm', onclick: close }, 'Kapat ✕')), body));
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  return { body, close };
}

/* Tüm çekiliş sayfalarının paylaştığı veri */
let gwItems = [];
let gwError = '';
const gwSubs = [];
async function gwReload() {
  try { gwItems = (await api('admin/giveaways')).items; gwError = ''; } catch (e) { gwError = e.message; }
  gwSubs.forEach(f => f());
}
const gwBox = (render) => { const box = h('div', {}); const draw = () => { box.replaceChildren(gwError ? h('div', { class: 'banner bad' }, gwError) : render()); }; gwSubs.push(draw); draw(); return box; };
const gwCall = (path, body, ask) => async btn => { if (ask && !confirm(ask)) return; await act(btn, async () => { const r = await api(path, body); await gwReload(); return r; }); };
const gwStat = (l, v, sub) => h('div', { class: 'card stat' }, h('div', { class: 'lbl' }, l), h('strong', {}, String(v)), sub ? h('div', { class: 'muted sm' }, sub) : null);
const gwBars = (rows) => {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return h('div', { class: 'bars' }, rows.map(([l, v, sub]) => h('div', { class: 'brow' }, h('span', { class: 'bl', title: l }, l), h('span', { class: 'track' }, h('i', { style: `width:${Math.max(2, v / max * 100)}%` })), h('span', { class: 'bv' }, String(v), sub ? h('small', {}, ` ${sub}`) : null))));
};
const gwValidWinners = it => it.winners.filter(w => !w.disq);

/* ---------- 📊 Genel bakış ---------- */
function gwOverviewPane() {
  const setup = h('div', {});
  async function loadSetup() {
    try {
      const { rows } = await api('admin/giveaways/setup');
      const bad = rows.filter(r => !r.ok && ['bot', 'enabled', 'channel', 'category'].includes(r.id)).length;
      setup.replaceChildren(
        h('div', { class: 'bhead' }, h('div', {}, h('h2', {}, 'Kurulum kontrolü'), h('p', { class: 'hint' }, bad ? '⚠ Çekilişin çalışması için aşağıdaki kırmızı maddeleri düzelt.' : 'Temel kurulum tamam. Şart maddeleri sadece o şartı kullanacaksan gerekir.')), h('button', { class: 'btn ghost sm', onclick: loadSetup }, 'Yeniden kontrol et')),
        h('div', { class: 'tablewrap' }, h('table', {}, h('tbody', {}, rows.map(r => h('tr', {},
          h('td', { style: 'width:34px' }, r.ok ? '✅' : '⚠️'), h('td', {}, h('b', {}, r.label)), h('td', { class: 'muted sm' }, r.detail), h('td', { class: 'sm' }, r.fix || '')))))));
    } catch (e) { setup.replaceChildren(h('p', { class: 'hint' }, e.message)); }
  }
  loadSetup();

  const main = gwBox(() => {
    const running = gwItems.filter(i => i.status === 'running');
    const ended = gwItems.filter(i => i.status === 'ended');
    const winners = ended.reduce((n, i) => n + i.winners.length, 0);
    const disq = ended.reduce((n, i) => n + i.winners.filter(w => w.disq).length, 0);
    const claimed = ended.reduce((n, i) => n + i.winners.filter(w => w.claimed).length, 0);
    const entries = gwItems.reduce((n, i) => n + i.entries, 0);
    return h('div', {},
      h('div', { class: 'cards4' }, gwStat('Çalışan', running.length), gwStat('Biten', ended.length), gwStat('Toplam katılım', entries), gwStat('Kazanan', winners, `${claimed} ödül talebi açtı`), gwStat('Şartı yapmayan', disq, winners ? `%${Math.round(disq / winners * 100)} kazananın` : '')),
      h('div', { class: 'card' }, h('div', { class: 'bhead' }, h('h2', {}, 'Çalışan çekilişler'), h('button', { class: 'btn ghost sm', onclick: gwReload }, 'Yenile')),
        running.length ? h('div', { class: 'gw-cards' }, running.map(it => gwRunningCard(it))) : h('div', { class: 'empty' }, 'Şu an çalışan çekiliş yok. "Çekiliş başlat" sekmesinden yenisini başlat.')),
      h('div', { class: 'card' }, h('h2', {}, 'Son biten çekilişler'),
        ended.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Ödül', 'Katılımcı', 'Kazananlar', 'Bitiş', ''].map(x => h('th', {}, x)))),
          h('tbody', {}, ended.slice(0, 6).map(it => h('tr', {}, h('td', {}, h('b', {}, it.prize), reqList(it.requirements).length ? h('div', { class: 'muted sm' }, reqSummary(it.requirements)) : null), h('td', {}, String(it.entries)),
            h('td', {}, gwWinnerText(it)), h('td', {}, gwDate(it.endedAt)), h('td', {}, h('button', { class: 'btn ghost sm', onclick: () => gwDetail(it.id) }, 'Ayrıntı'))))))) : h('div', { class: 'empty' }, 'Henüz biten çekiliş yok.')));
  });
  const t = setInterval(() => { if (pane.classList.contains('on')) gwReload(); }, 20000);
  void t;
  const pane = h('div', { class: 'pane', id: 'pane-gwoverview' }, h('div', { class: 'card' }, setup), main);
  return pane;
}
const gwWinnerText = it => (it.winners.length ? it.winners.map(w => `${w.tag}${w.disq ? ' ❌' : w.claimed ? ' ✅' : ''}`).join(', ') : '—');
function gwRunningCard(it) {
  return h('div', { class: 'gw-card' },
    h('div', { class: 'gw-top' }, h('b', {}, it.prize), h('span', { class: 'badge' }, `⏳ ${gwLeft(it.endsAt)}`)),
    h('div', { class: 'muted sm' }, `${it.entries} katılımcı · ${it.winnersCount} kazanan · ID ${it.id}`),
    reqList(it.requirements).length ? h('div', { class: 'chips' }, reqList(it.requirements).map(x => h('span', { class: 'chip' }, x))) : h('div', { class: 'muted sm' }, 'Şart yok'),
    h('div', { class: 'acts', style: 'margin-top:10px' },
      h('button', { class: 'btn ghost sm', onclick: () => gwDetail(it.id) }, 'Ayrıntı'),
      h('button', { class: 'btn sm', onclick: e => gwCall('admin/giveaways/end', { id: it.id }, 'Çekiliş şimdi bitirilsin mi?')(e.target) }, 'Şimdi bitir'),
      h('button', { class: 'btn ghost sm', onclick: e => gwCall('admin/giveaways/cancel', { id: it.id }, 'Çekiliş iptal edilsin mi?')(e.target) }, 'İptal')));
}

/* ---------- 🎉 Çekiliş başlat ---------- */
function gwStartPane() {
  const g = cfg.giveaways;
  const f = { channelId: g.channelId || '', duration: '1h', winners: 1, prize: '', hostId: '' };
  const req = { roleIds: [], serverTag: false, statusText: '', voiceMinutes: 0, messages: 0, invites: 0 };
  const cmdEl = h('code', { class: 'cmd' });
  const sumEl = h('div', { class: 'chips' });
  const upd = () => {
    const p = [];
    if (req.invites) p.push(`invite=${req.invites}`);
    if (req.messages) p.push(`mesaj=${req.messages}`);
    if (req.voiceMinutes) p.push(`ses=${req.voiceMinutes}`);
    if (req.serverTag) p.push('tag');
    req.roleIds.forEach(id => p.push(`rol=<@&${id}>`));
    if (/^\d{5,25}$/.test(f.hostId.trim())) p.push(`duzenleyen=${f.hostId.trim()}`);
    if (req.statusText) p.push(`durum=${req.statusText.replace(/\s+/g, '')}`);
    cmdEl.textContent = `.gstart ${f.duration || '1h'} ${f.winners || 1} ${f.prize || 'Ödül'}${p.length ? ` | ${p.join(' ')}` : ''}`;
    const l = reqList(req);
    sumEl.replaceChildren(...(l.length ? l.map(x => h('span', { class: 'chip' }, x)) : [h('span', { class: 'muted sm' }, 'Şart yok: herkes katılabilir ve kazanan direkt geçerli sayılır.')]));
  };

  const dur = h('input', { type: 'text', placeholder: '30m, 2h, 1d, 1h30m' }); dur.value = f.duration;
  dur.addEventListener('input', () => { f.duration = dur.value; upd(); });
  const win = h('input', { type: 'number', min: 1, max: 20 }); win.value = f.winners; win.addEventListener('input', () => { f.winners = Number(win.value); upd(); });
  const prize = h('input', { type: 'text', maxLength: 200, placeholder: 'Örn: 1M OwO Cash' }); prize.addEventListener('input', () => { f.prize = prize.value; upd(); });
  const hostIn = h('input', { type: 'text', inputmode: 'numeric', maxLength: 25, placeholder: g.hostId ? `Varsayılan: ${g.hostId}` : 'Kullanıcı ID (boşsa bot)' });
  hostIn.addEventListener('input', () => { f.hostId = hostIn.value.replace(/\D/g, ''); upd(); });
  const chan = picker(f, 'channelId', chanItems(), '— Varsayılan kanal —');
  chan.addEventListener('change', () => { f.channelId = chan.value; });
  const durChips = h('div', { class: 'chips' }, [['30 dk', '30m'], ['1 saat', '1h'], ['6 saat', '6h'], ['1 gün', '1d'], ['3 gün', '3d'], ['7 gün', '7d']].map(([l, v]) =>
    h('button', { class: 'chip btn-chip', onclick: () => { dur.value = v; f.duration = v; upd(); } }, l)));

  const reqBox = h('div', {});
  const buildReq = () => {
    const note = (ok, on, off) => (ok ? on : off);
    reqBox.replaceChildren(h('div', { class: 'grid2' },
      field('🎭 Gereken roller (hepsi gerekli)', reqRoles(req.roleIds, upd), 'Seçmezsen rol şartı yok. Çekiliş bitince kontrol edilir.'),
      field('🏷️ Sunucu etiketi (tag)', reqCheck(req, 'serverTag', 'Sunucunun etiketini profiline takmış olmalı', upd), 'Discord profilindeki "sunucu etiketi" bu sunucununki olmalı. Çekiliş bitince kontrol edilir.'),
      field('💬 Özel durum yazısı', reqText(req, 'statusText', '.gg/deuslra', upd), note(schema.presenceOn, 'Kişinin özel durumunda bu yazı geçmeli (büyük/küçük harf fark etmez). Çevrimdışı görünenin durumu okunamaz.', '⚠ Kapalı: .env\'ye USE_PRESENCE=true ekle ve Developer Portal > Bot > Presence Intent\'i aç.')),
      field('🔊 Ses aktifliği (dakika)', reqNum(req, 'voiceMinutes', 100000, upd), '0 = şart yok. Çekiliş başladıktan sonraki süre sayılır; AFK kanalı sayılmaz.'),
      field('✉️ Mesaj sayısı', reqNum(req, 'messages', 100000, upd), '0 = şart yok. Çekiliş başladıktan sonra yazılan mesajlar; aynı kişinin 3 sn içindeki mesajları tek sayılır.'),
      field('📨 Davet sayısı', reqNum(req, 'invites', 10000, upd), note(schema.membersOn, '0 = şart yok. Çekiliş başladıktan sonra davetle girenler; çıkan kişi sayıdan düşer. Botta "Sunucuyu Yönet" izni gerekir.', '⚠ Kapalı: .env\'ye GUILD_MEMBERS_INTENT=true ekle ve Developer Portal > Bot > Server Members Intent\'i aç.'))));
    upd();
  };
  const preset = (label, vals) => h('button', { class: 'chip btn-chip', onclick: () => { Object.assign(req, { roleIds: [], serverTag: false, statusText: '', voiceMinutes: 0, messages: 0, invites: 0 }, vals); buildReq(); } }, label);
  buildReq();

  return h('div', { class: 'pane', id: 'pane-gwstart' },
    h('div', { class: 'card' }, h('h2', {}, 'Çekiliş başlat'),
      !meta.connected && h('div', { class: 'banner bad' }, 'Bot bağlı değil.'),
      h('div', { class: 'grid2' }, field('Kanal', chan, 'Boş bırakırsan Ayarlar sekmesindeki varsayılan kanal kullanılır.'), field('Ödül', prize),
        field('Süre', dur, 'Örn: 30m, 2h, 1d, 1h30m (en az 10 sn, en fazla 30 gün)'), field('Kazanan sayısı', win, 'En fazla 20.'),
        field('Düzenleyen (kullanıcı ID)', hostIn, 'Çekiliş mesajında "Düzenleyen" olarak bu kişi görünür. Discord\'da kullanıcıya sağ tıkla > ID\'yi kopyala. Boşsa Ayarlar\'daki varsayılan düzenleyen, o da boşsa bot görünür.')),
      durChips),
    h('div', { class: 'card' }, h('h2', {}, 'Şartlar (isteğe bağlı)'),
      h('p', { class: 'hint', style: 'margin-bottom:10px' }, 'Herkes katılabilir; çekiliş bitince kazananlar kontrol edilir. Şartı yapmayan kazanan, sonuç mesajında yine kazanan görünür ama "Ödülünü Al"a basınca "kazanmadın" der; yetkili "Tekrar çek" yapınca yerine yeni kazanan seçilir. Önceki geçerli kazananlar kendi mesajındaki butonla ödülünü almaya devam eder. Kullanıcılar çekiliş mesajındaki "Şartlarım" butonuyla durumlarına bakabilir.'),
      h('div', { class: 'chips', style: 'margin-bottom:12px' }, h('span', { class: 'muted sm' }, 'Hazır şablonlar:'),
        preset('Hiç şart yok', {}), preset('📨 Davet çekilişi (2 invite)', { invites: 2 }), preset('💬 Aktif üye (50 mesaj + 30 dk ses)', { messages: 50, voiceMinutes: 30 }), preset('🏷️ Tag + durum', { serverTag: true, statusText: '.gg/' })),
      reqBox),
    h('div', { class: 'card' }, h('h2', {}, 'Özet'), sumEl,
      h('p', { class: 'hint', style: 'margin:12px 0 6px' }, 'Aynısını Discord\'da yazıyla başlatmak istersen:'), cmdEl,
      h('div', { style: 'margin-top:14px' }, h('button', { class: 'btn accent', onclick: e => act(e.target, async () => {
        const r = await api('admin/giveaways/start', { channelId: f.channelId, duration: f.duration, winners: f.winners, prize: f.prize, hostId: f.hostId, requirements: req });
        await gwReload(); return r;
      }) }, '🎉 Çekilişi başlat'))));
}

/* ---------- 📋 Çekilişler (liste + ayrıntı) ---------- */
function gwListPane() {
  const F = { q: '', status: '', req: '', disq: '' };
  const q = h('input', { type: 'text', placeholder: 'Ara: ödül veya ID…' });
  const st = h('select', {}, [['', 'Tüm durumlar'], ['running', 'Çalışan'], ['ended', 'Biten'], ['cancelled', 'İptal']].map(([v, l]) => h('option', { value: v }, l)));
  const rq = h('select', {}, [['', 'Şartlı / şartsız'], ['yes', 'Şartlı olanlar'], ['no', 'Şartsız olanlar']].map(([v, l]) => h('option', { value: v }, l)));
  const dq = h('select', {}, [['', 'Tüm kazananlar'], ['yes', 'Şartı yapmayan kazananı olanlar']].map(([v, l]) => h('option', { value: v }, l)));
  const out = h('div', {});
  const apply = () => { F.q = q.value.trim().toLowerCase(); F.status = st.value; F.req = rq.value; F.disq = dq.value; draw(); };
  [q, st, rq, dq].forEach(el => el.addEventListener('input', apply));
  const draw = () => {
    const rows = gwItems.filter(it => (!F.status || it.status === F.status)
      && (!F.q || `${it.prize} ${it.id}`.toLowerCase().includes(F.q))
      && (!F.req || (F.req === 'yes') === Boolean(reqList(it.requirements).length))
      && (!F.disq || it.winners.some(w => w.disq)));
    if (gwError) { out.replaceChildren(h('div', { class: 'banner bad' }, gwError)); return; }
    if (!gwItems.length) { out.replaceChildren(h('div', { class: 'empty' }, 'Henüz çekiliş yok.')); return; }
    if (!rows.length) { out.replaceChildren(h('div', { class: 'empty' }, 'Filtrelere uyan çekiliş yok.')); return; }
    out.replaceChildren(h('p', { class: 'hint', style: 'margin-bottom:8px' }, `${rows.length} / ${gwItems.length} çekiliş`), h('div', { class: 'tablewrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Ödül', 'Durum', 'Katılımcı', 'Kazananlar', 'Bitiş', ''].map(x => h('th', {}, x)))),
      h('tbody', {}, rows.map(it => h('tr', {},
        h('td', {}, h('b', {}, it.prize), h('div', { class: 'muted sm' }, `ID ${it.id}`), reqList(it.requirements).length ? h('div', { class: 'muted sm' }, reqSummary(it.requirements)) : null),
        h('td', {}, GW_ST[it.status] || it.status), h('td', {}, String(it.entries)),
        h('td', {}, it.winners.length ? it.winners.map(w => `${w.tag}${w.disq ? ' ❌ (şartı yapmadı)' : w.claimed ? ' ✅' : ''}`).join(', ') : '—'),
        h('td', {}, gwDate(it.status === 'running' ? it.endsAt : it.endedAt || it.endsAt)),
        h('td', {}, h('div', { class: 'acts' },
          h('button', { class: 'btn ghost sm', onclick: () => gwDetail(it.id) }, 'Ayrıntı'),
          it.status === 'running' && h('button', { class: 'btn sm', onclick: e => gwCall('admin/giveaways/end', { id: it.id })(e.target) }, 'Şimdi bitir'),
          it.status === 'running' && h('button', { class: 'btn ghost sm', onclick: e => gwCall('admin/giveaways/cancel', { id: it.id }, 'Çekiliş iptal edilsin mi?')(e.target) }, 'İptal'),
          it.status === 'ended' && h('button', { class: 'btn sm', onclick: e => gwCall('admin/giveaways/reroll', { id: it.id })(e.target) }, 'Tekrar çek'),
          it.status !== 'running' && h('button', { class: 'btn danger sm', onclick: e => gwCall('admin/giveaways/delete', { id: it.id }, 'Kayıt silinsin mi? (Discord mesajı silinmez)')(e.target) }, 'Sil')))))))));
  };
  gwSubs.push(draw);
  draw();
  return h('div', { class: 'pane', id: 'pane-gwlist' }, h('div', { class: 'card' },
    h('div', { class: 'bhead' }, h('h2', {}, 'Tüm çekilişler'), h('button', { class: 'btn ghost sm', onclick: gwReload }, 'Yenile')),
    h('div', { class: 'filters', style: 'grid-template-columns:2fr 1fr 1fr 1fr' }, q, st, rq, dq), out));
}

/* Tek çekilişin ayrıntı penceresi */
async function gwDetail(id) {
  const m = gwModal('Çekiliş ayrıntısı');
  m.body.replaceChildren(h('div', { class: 'empty' }, 'Yükleniyor…'));
  let d;
  const load = async () => { d = await api('admin/giveaways/detail', { id }); draw(); };
  const kv = (k, v) => h('div', { class: 'kv' }, h('span', { class: 'muted sm' }, k), h('b', {}, v));
  const draw = () => {
    const need = d.requirements || {};
    const reload = fn => async btn => act(btn, async () => { const r = await fn(); await load(); gwReload(); return r; });
    const winnerRows = d.winnersDetail.map(w => h('tr', {},
      h('td', {}, h('b', {}, w.tag), h('div', { class: 'muted sm' }, w.id)),
      h('td', {}, gwDate(w.wonAt)),
      h('td', {}, w.ok ? h('span', {}, '✅ Geçerli', w.manual ? ' (elle)' : '') : h('div', {}, h('span', {}, '❌ Düştü', w.manual ? ' (elle)' : '', w.replaced ? ' · yerine çekildi' : ''), ...w.failed.map(x => h('div', { class: 'muted sm' }, `• ${x}`)))),
      h('td', {}, w.claimChannelId ? `Açıldı: ${gwChanName(w.claimChannelId)}` : (w.ok ? 'Henüz almadı' : '—')),
      h('td', {}, d.status === 'ended' ? h('div', { class: 'acts' },
        w.ok ? h('button', { class: 'btn ghost sm', onclick: e => { const r = prompt('Düşürme sebebi?', 'Şartları yerine getirmedi'); if (r !== null) reload(() => api('admin/giveaways/override', { id, userId: w.id, ok: false, reason: r }))(e.target); } }, 'Düşür')
          : h('button', { class: 'btn good sm', onclick: e => reload(() => api('admin/giveaways/override', { id, userId: w.id, ok: true }))(e.target) }, 'Geri al')) : null)));
    const metric = (v, n) => (n ? h('span', { class: v >= n ? 'ok-t' : 'bad-t' }, `${v}/${n}`) : String(v));
    const q = h('input', { type: 'text', placeholder: 'Kullanıcı ID yapıştır' });
    const qOut = h('div', { style: 'margin-top:8px' });
    const ask = async btn => act(btn, async () => {
      const r = await api('admin/giveaways/check', { id, userId: q.value });
      qOut.replaceChildren(r.results.length ? h('div', {}, r.results.map(x => h('div', {}, `${x.ok ? '✅' : '❌'} ${x.label.replace(/<@&(\d+)>/g, (_, rid) => `@${gwRoleName(rid)}`)}${x.need ? ` (${x.cur}/${x.need})` : ''}`)), h('p', { class: 'hint', style: 'margin-top:6px' }, r.ok ? 'Tüm şartlar tamam.' : 'Eksik şart var.')) : h('p', { class: 'hint' }, 'Bu çekilişte şart yok.'));
    });
    m.body.replaceChildren(
      h('div', { class: 'kvgrid' }, kv('Ödül', d.prize), kv('Durum', GW_ST[d.status] || d.status), kv('Kanal', gwChanName(d.channelId)), kv('Düzenleyen ID', d.hostId || '—'),
        kv('Başlangıç', gwDate(d.createdAt)), kv(d.status === 'running' ? 'Bitiş (planlanan)' : 'Bitiş', gwDate(d.status === 'running' ? d.endsAt : d.endedAt || d.endsAt)), kv('Kazanan sayısı', String(d.winnersCount)), kv('Katılımcı', String(d.entries)),
        d.roleId ? kv('Katılım için rol', gwRoleName(d.roleId)) : null),
      h('div', { class: 'acts', style: 'margin:12px 0' },
        d.resultUrl && h('a', { class: 'btn ghost sm', href: d.resultUrl, target: '_blank', rel: 'noopener' }, 'Discord mesajı ↗'),
        d.status === 'running' && h('button', { class: 'btn sm', onclick: e => reload(() => api('admin/giveaways/end', { id }))(e.target) }, 'Şimdi bitir'),
        d.status === 'running' && h('button', { class: 'btn ghost sm', onclick: e => { if (confirm('Çekiliş iptal edilsin mi?')) reload(() => api('admin/giveaways/cancel', { id }))(e.target); } }, 'İptal'),
        d.status === 'ended' && h('button', { class: 'btn sm', onclick: e => reload(() => api('admin/giveaways/reroll', { id }))(e.target) }, 'Tekrar çek')),
      h('div', { class: 'card', style: 'margin:0 0 14px;padding:12px' }, h('b', {}, 'Düzenleyeni değiştir'), h('p', { class: 'hint', style: 'margin:4px 0 8px' }, 'Kullanıcı ID yaz; çekiliş ve sonuç mesajlarındaki "Düzenleyen" yeni kişiyle güncellenir.'),
        (() => { const i = h('input', { type: 'text', inputmode: 'numeric', placeholder: `Şu an: ${d.hostTag || d.hostId || '—'} (${d.hostId || ''})` });
          return h('div', { style: 'display:flex;gap:8px' }, i, h('button', { class: 'btn sm', onclick: e => reload(() => api('admin/giveaways/host', { id, hostId: i.value }))(e.target) }, 'Kaydet')); })()),
      h('h3', {}, 'Şartlar'),
      reqList(need).length ? h('div', { class: 'chips' }, reqList(need).map(x => h('span', { class: 'chip' }, x))) : h('p', { class: 'hint' }, 'Bu çekilişte şart yok.'),
      d.winnersDetail.length ? h('div', {}, h('h3', { style: 'margin-top:16px' }, 'Kazananlar'),
        h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Kazanan', 'Kazanma zamanı', 'Şart sonucu', 'Ödül talebi', ''].map(x => h('th', {}, x)))), h('tbody', {}, winnerRows)))) : null,
      h('h3', { style: 'margin-top:16px' }, 'Şart ilerlemeleri'),
      d.people.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Kişi', 'Katıldı', 'Mesaj', 'Ses (dk)', 'Davet'].map(x => h('th', {}, x)))),
        h('tbody', {}, d.people.map(p => h('tr', {}, h('td', {}, p.tag), h('td', {}, p.joined ? '✅' : '—'), h('td', {}, metric(p.messages, need.messages)), h('td', {}, metric(p.voiceMin, need.voiceMinutes)), h('td', {}, metric(p.invites, need.invites)))))))
        : h('p', { class: 'hint' }, 'Mesaj / ses / davet şartı yoksa ya da henüz kimse bir şey yapmadıysa burada kayıt olmaz. (İlk 50 kişi gösterilir.)'),
      reqList(need).length ? h('div', {}, h('h3', { style: 'margin-top:16px' }, 'Kişi sorgula'), h('p', { class: 'hint', style: 'margin-bottom:6px' }, 'Bir kullanıcının şartları şu an nasıl durduğunu gör (rol, tag ve durum anlık bakılır).'),
        h('div', { style: 'display:flex;gap:8px' }, q, h('button', { class: 'btn sm', onclick: e => ask(e.target) }, 'Sorgula')), qOut) : null,
      d.entriesSample.length ? h('details', { class: 'grp', style: 'margin-top:16px' }, h('summary', {}, `Katılımcılar (${d.entries})`), h('p', { class: 'hint' }, d.entries > d.entriesSample.length ? `İlk ${d.entriesSample.length} kişi gösteriliyor.` : ''),
        h('div', { class: 'chips' }, d.entriesSample.map(u => h('span', { class: 'chip', title: u.id }, u.tag)))) : null,
      d.status !== 'running' ? h('div', { style: 'margin-top:16px' }, h('button', { class: 'btn danger sm', onclick: e => { if (confirm('Kayıt silinsin mi? (Discord mesajı silinmez)')) act(e.target, async () => { const r = await api('admin/giveaways/delete', { id }); m.close(); gwReload(); return r; }); } }, 'Kaydı sil')) : null);
  };
  try { await load(); } catch (e) { m.body.replaceChildren(h('div', { class: 'banner bad' }, e.message)); }
}

/* ---------- ⚙️ Ayarlar ---------- */
function gwSettingsPane() {
  const g = cfg.giveaways;
  const catSel = h('select', {}, cfg.buttons.map(b => h('option', { value: b.id }, `${b.emoji || ''} ${b.label}`.trim())));
  catSel.value = g.categoryId; catSel.addEventListener('change', () => { g.categoryId = catSel.value; dirty(); });
  return h('div', { class: 'pane', id: 'pane-gwsettings' },
    h('div', { class: 'card' }, h('h2', {}, 'Çekiliş ayarları'),
      h('p', { class: 'hint', style: 'margin-bottom:10px' }, 'Çekiliş bitince bot sonuç mesajı atar: kazananlar "Ödülünü Al" butonuna basınca aşağıda seçtiğin kategoride bir destek talebi açılır ve kazandıkları ödül orada yazar. "Tekrar Çek" butonu yetkililer içindir. Değişiklikler alttaki "Ayarları kaydet" ile geçerli olur.'),
      check(g, 'enabled', 'Çekiliş sistemi açık'),
      h('div', { class: 'grid2' },
        field('Ödül talepleri hangi kategoride açılsın?', catSel, 'Destek bölümünün "Kategoriler & formlar" sekmesinden bu kategoriye özel roller / Discord kategorisi / form atayabilirsin. Gizli kategori panelde (buton/liste) görünmez.'),
        field('Varsayılan çekiliş kanalı', picker(g, 'channelId', chanItems()), 'Çekiliş başlatırken kanal seçmezsen burası kullanılır.'),
        field('Ödül alma süresi (saat)', num(g, 'claimHours', 0, 720), '0 = süresiz. Kazanan bu süreden sonra "Ödülünü Al"a basarsa reddedilir.'),
        field('Varsayılan düzenleyen (kullanıcı ID)', (() => { const i = h('input', { type: 'text', inputmode: 'numeric', maxLength: 25, placeholder: 'Boşsa çekilişi başlatan kişi / bot' }); i.value = g.hostId || ''; i.addEventListener('input', () => { g.hostId = i.value.replace(/\D/g, ''); dirty(); }); return i; })(), 'Çekiliş mesajlarında "Düzenleyen" olarak görünür. Her çekilişte ayrıca başka ID yazarak değiştirebilirsin.'))),
    h('div', { class: 'card' }, h('h2', {}, 'Sitede görünüm'),
      check(g, 'showOnSite', 'Sitede çalışan ve biten çekilişleri göster'),
      check(g, 'showWinnersOnSite', 'Sitede kazanan kullanıcı adlarını da göster (şartı yapmayanlar gizlenir)')),
    h('div', { class: 'card' }, h('h2', {}, 'Site çekiliş bölümü seçenekleri'),
      h('p', { class: 'hint', style: 'margin-bottom:10px' }, 'Sitedeki Çekilişler bölümünde nelerin görüneceğini seç. Başlıklar ve etiketler "Site yazıları" sekmesinden düzenlenir.'),
      h('div', { class: 'grid2' },
        check(g.site, 'filters', 'Sekmeler, arama ve sıralama göster'), check(g.site, 'countdown', 'Geri sayım ve ilerleme çubuğu göster'),
        check(g.site, 'entries', 'Katılımcı sayısını göster'), check(g.site, 'host', 'Düzenleyeni göster'),
        check(g.site, 'channel', 'Kanal adını göster'), check(g.site, 'requirements', 'Katılım şartlarını göster'),
        check(g.site, 'howTo', '"Nasıl katılırım?" kutusunu göster'), check(g.site, 'showCancelled', 'İptal edilen çekilişleri de göster (Tümü sekmesinde)'),
        field('Devam eden en fazla kaç çekiliş', num(g.site, 'maxRunning', 1, 30)), field('Biten en fazla kaç çekiliş', num(g.site, 'maxEnded', 1, 50)),
        field('Görünüm', (() => { const sel = h('select', {}, [['cards', 'Kartlar (ızgara)'], ['list', 'Liste (tek sütun)']].map(([v, l]) => h('option', { value: v }, l))); sel.value = g.site.layout; sel.addEventListener('change', () => { g.site.layout = sel.value; dirty(); }); return sel; })()))));
}

/* ---------- 🔘 Butonlar (emoji / renk / gösterme) ---------- */
const GW_BTN_ROWS = [
  ['Katıl', 'Çalışan çekiliş mesajında', 'gwJoinBtn', 'gwEmojiJoin', 'gwColorJoin', null],
  ['Şartlarım', 'Çalışan çekilişte (sadece şartlı çekilişlerde çıkar)', 'gwStatusBtn', 'gwEmojiStatus', 'gwColorStatus', 'gwShowStatus'],
  ['Detaylar', 'Çalışan çekiliş ve sonuç mesajında', 'gwInfoBtn', 'gwEmojiInfo', 'gwColorInfo', 'gwShowInfo'],
  ['Katılımcılar', 'Çalışan çekiliş mesajında', 'gwPeopleBtn', 'gwEmojiPeople', 'gwColorPeople', 'gwShowPeople'],
  ['Ödülünü Al', 'Sonuç mesajında (kazananlar)', 'gwClaimBtn', 'gwEmojiClaim', 'gwColorClaim', null],
  ['Tekrar Çek', 'Sonuç mesajında (yetkililer)', 'gwRerollBtn', 'gwEmojiReroll', 'gwColorReroll', null],
  ['Yenile', 'Detaylar ve Katılımcılar penceresinde', 'gwRefreshBtn', 'gwEmojiRefresh', 'gwColorRefresh', null],
  ['Çekiliş mesajı (link)', 'Detaylar penceresinde, çekiliş mesajına götürür (rengi Discord belirler)', 'gwJumpBtn', 'gwEmojiJump', null, null],
];
const GW_COLORS = { primary: 'Mavi', secondary: 'Gri', success: 'Yeşil', danger: 'Kırmızı' };
const gwEmojiOk = v => { const t = String(v || '').trim(); return !t || /^<a?:\w{2,32}:\d{17,19}>$/.test(t) || /^[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}][\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]*$/u.test(t); };
function gwButtonsPane() {
  const defs = Object.fromEntries(schema.messages.filter(d => d.key.startsWith('gw')).map(d => [d.key, d.def]));
  const val = k => (cfg.messages[k] && String(cfg.messages[k]).trim()) || defs[k] || '';
  const prevBox = h('div', { class: 'dc' });
  const chip = (label, emoji, color) => h('span', { class: `dc-btn ${color || 'secondary'}` }, `${emoji ? `${emoji} ` : ''}${label}`.trim());
  const drawPrev = () => {
    const on = k => !k || !/^(hay[ıi]r|no|false|0|kapal[ıi]|off)$/i.test(val(k).trim());
    const b = (i, forceShow) => { const r = GW_BTN_ROWS[i]; if (!forceShow && !on(r[5])) return null; return chip(val(r[2]), gwEmojiOk(val(r[3])) ? val(r[3]) : '', r[4] ? val(r[4]) : 'secondary'); };
    const row = (...items) => h('div', { style: 'margin:6px 0 12px;display:flex;gap:6px;flex-wrap:wrap' }, items.filter(Boolean));
    const nav = k => h('span', { class: `dc-btn ${val('gwColorNav')}` }, gwEmojiOk(val(`gwEmoji${k}`)) && val(`gwEmoji${k}`) ? val(`gwEmoji${k}`) : '•');
    prevBox.replaceChildren(
      h('p', { class: 'hint' }, 'Çalışan çekiliş mesajı'), row(b(0), b(1), b(2), b(3)),
      h('p', { class: 'hint' }, 'Sonuç mesajı'), row(b(4), b(5), b(2)),
      h('p', { class: 'hint' }, 'Detaylar penceresi'), row(b(6), b(3), chip(val('gwJumpBtn'), gwEmojiOk(val('gwEmojiJump')) ? val('gwEmojiJump') : '', 'secondary')),
      h('p', { class: 'hint' }, 'Katılımcılar penceresi (sayfa butonları)'), row(nav('First'), nav('Prev'), h('span', { class: 'dc-btn secondary' }, '1 / 4'), nav('Next'), nav('Last')));
  };
  const rowEl = ([name, where, lk, ek, ck, sk]) => {
    const lab = h('input', { type: 'text', maxLength: 80 }); lab.value = cfg.messages[lk] || defs[lk] || ''; lab.addEventListener('input', () => { cfg.messages[lk] = lab.value; dirty(); drawPrev(); });
    const emo = h('input', { type: 'text', maxLength: 64, placeholder: '🎉 veya <:ad:123456789012345678>' }); emo.value = cfg.messages[ek] ?? defs[ek] ?? '';
    const warn = h('div', { class: 'hint bad-t', style: 'display:none' }, 'Geçersiz emoji: normal bir emoji ya da <:ad:123456789012345678> biçiminde özel emoji yaz.');
    emo.addEventListener('input', () => { cfg.messages[ek] = emo.value; warn.style.display = gwEmojiOk(emo.value) ? 'none' : ''; dirty(); drawPrev(); });
    const colorBox = h('div', { class: 'seg' });
    const drawColors = () => colorBox.replaceChildren(...Object.entries(GW_COLORS).map(([c, l]) => h('button', { type: 'button', class: val(ck) === c ? 'on' : '', onclick: () => { cfg.messages[ck] = c; dirty(); drawColors(); drawPrev(); } }, l)));
    if (ck) drawColors();
    const show = sk ? (() => { const c = h('input', { type: 'checkbox' }); c.checked = !/^(hay[ıi]r|no|false|0|kapal[ıi]|off)$/i.test(val(sk)); c.addEventListener('change', () => { cfg.messages[sk] = c.checked ? 'evet' : 'hayır'; dirty(); drawPrev(); }); return h('label', { class: 'chk', style: 'margin:0' }, c, 'Göster'); })() : null;
    const reset = h('button', { class: 'btn ghost sm', onclick: () => { [lk, ek, ck, sk].filter(Boolean).forEach(k => { cfg.messages[k] = defs[k]; }); lab.value = defs[lk]; emo.value = defs[ek]; warn.style.display = 'none'; if (ck) drawColors(); drawPrev(); dirty(); } }, 'Varsayılan');
    return h('div', { class: 'bcard' }, h('div', { class: 'bhead' }, h('div', {}, h('b', {}, name), h('div', { class: 'muted sm' }, where)), h('div', { class: 'acts' }, show, reset)),
      h('div', { class: 'grid2' }, field('Yazı', lab, 'Boş bırakırsan varsayılan yazı kullanılır. Sadece emoji istiyorsan yazıyı kısa tut.'), field('Emoji', emo, 'Normal emoji ya da sunucu emojisi: <:ad:123456789012345678> (Discord\'da emojinin önüne \\ koyup gönder, kodu görürsün).'),
        ...(ck ? [field('Renk', colorBox, 'Discord butonlarında sadece bu 4 renk var.')] : [])), warn);
  };
  // sayfa butonları
  const navRow = () => {
    const wrap = h('div', { class: 'grid2' }, ...['First', 'Prev', 'Next', 'Last'].map(k => { const e = h('input', { type: 'text', maxLength: 64 }); e.value = cfg.messages[`gwEmoji${k}`] ?? defs[`gwEmoji${k}`] ?? ''; e.addEventListener('input', () => { cfg.messages[`gwEmoji${k}`] = e.value; dirty(); drawPrev(); }); return field({ First: 'İlk sayfa', Prev: 'Önceki sayfa', Next: 'Sonraki sayfa', Last: 'Son sayfa' }[k] + ' emojisi', e); }));
    const col = h('div', { class: 'seg' }); const dc = () => col.replaceChildren(...Object.entries(GW_COLORS).map(([c, l]) => h('button', { type: 'button', class: val('gwColorNav') === c ? 'on' : '', onclick: () => { cfg.messages.gwColorNav = c; dirty(); dc(); drawPrev(); } }, l))); dc();
    return h('div', { class: 'bcard' }, h('div', { class: 'bhead' }, h('div', {}, h('b', {}, 'Sayfa butonları'), h('div', { class: 'muted sm' }, 'Katılımcılar penceresinde ⏮ ◀ ▶ ⏭'))), wrap, field('Renk', col));
  };
  drawPrev();
  return h('div', { class: 'pane', id: 'pane-gwbuttons' },
    h('div', { class: 'card' }, h('h2', {}, 'Çekiliş butonları'),
      h('p', { class: 'hint', style: 'margin-bottom:10px' }, 'Çekiliş mesajlarındaki bütün butonların yazısını, emojisini ve rengini buradan değiştir; Şartlarım, Detaylar ve Katılımcılar\'ı tamamen gizleyebilirsin. Değişiklikler "Ayarları kaydet"ten sonra yeni gönderilen çekiliş mesajlarında geçerli olur; çalışan çekilişlerin butonları bir sonraki güncellemede (katılım / bitiş) yenilenir. Ticket butonları ise Destek > Talep butonları sekmesinde.'),
      h('div', { class: 'om-prev' }, prevBox)),
    ...GW_BTN_ROWS.map(rowEl), navRow());
}

/* ---------- 💬 Çekiliş mesajları (+ canlı önizleme) ---------- */
function gwMessagesPane() {
  const BTN_KEYS = new Set([...GW_BTN_ROWS.flatMap(r => [r[2], r[3], r[4], r[5]]), 'gwEmojiFirst', 'gwEmojiPrev', 'gwEmojiNext', 'gwEmojiLast', 'gwColorNav'].filter(Boolean));
  const allDefs = schema.messages.filter(d => d.key.startsWith('gw'));
  const defs = allDefs.filter(d => !BTN_KEYS.has(d.key));
  const val = k => (cfg.messages[k] && String(cfg.messages[k]).trim()) || allDefs.find(d => d.key === k)?.def || '';
  const reqSample = () => [val('gwReqRole').replace('{roles}', '@VIP'), val('gwReqTag'), val('gwReqVoice').replace('{n}', '30'), val('gwReqMessages').replace('{n}', '50'), val('gwReqInvites').replace('{n}', '2')];
  // Sunucudaki şablon sistemiyle aynı mantık, örnek değerlerle
  const vars = () => {
    const rs = reqSample();
    const fill = (t, v) => String(t).replace(/\{(\w+)\}/g, (m, k) => (k.toLowerCase() in v ? v[k.toLowerCase()] : m));
    const v = { prize: '1M OwO Cash', winnercount: '2', winners: '• @ali\n• @veli', entries: '37', participants: '@ali @veli @ayse +34', host: '@yetkili', id: 'ab12cd', brand: cfg.brandName || 'Marka',
      ends: 'yarın 18:00', endsfull: '26 Kasım 18:00', started: '2 saat önce', role: '@VIP', channel: '#cekilis', requirements: rs.map(x => `• ${x}`).join('\n'), claimbtn: val('gwClaimBtn'), note: val('gwResultReqNote'), user: '@kullanıcı', missing: 'Davet (0/2)' };
    Object.assign(v, { servername: 'Sunucum', servericon: '', progressline: fill(val('gwProgRunning'), { timebar: '▰▰▰▰▰▰▱▱▱▱▱▱', percent: '50', ends: 'yarın 18:00', endsfull: '26 Kasım 18:00' }), timebar: '▰▰▰▰▰▰▱▱▱▱▱▱', percent: '50', meeting: '12 / 37 (%32)', meetingcount: '12', top: '🥇 @ali · ✉️ 54 · 🔊 40 dk · 📨 3\n🥈 @veli · ✉️ 41 · 🔊 22 dk · 📨 1', hostname: 'Loxy', state: val('gwStateRunning'), you: val('gwYouIn'), myrequirements: rs.map((x, i) => `${i % 2 ? '❌' : '✅'} ${x}`).join('\n'), claimhours: '72' });
    v.status = `${fill(val('gwStatusOk'), { ...v, user: '@ali' })}\n${fill(val('gwStatusFail'), { ...v, user: '@veli', missing: `${rs[4]} (0/2)` })}`;
    return { v, fill };
  };
  const BASE = { prize: ['gwFieldPrize', 'gwValPrize', 1], winners: ['gwFieldWinners', 'gwValWinners', 1], ends: ['gwFieldEnds', 'gwValEnds', 1], host: ['gwFieldHost', 'gwValHost', 1], entries: ['gwFieldEntries', 'gwValEntries', 1], role: ['gwFieldRole', 'gwValRole', 1], reqs: ['gwFieldReqs', 'gwValReqs', 0], status: ['gwFieldStatus', 'gwValStatus', 0] };
  const INFO = { ...BASE, state: ['gwFieldState', 'gwValState', 1], started: ['gwFieldStarted', 'gwValStarted', 1], you: ['gwFieldYou', 'gwValYou', 1], myreqs: ['gwFieldMyReqs', 'gwValMyReqs', 0], meeting: ['gwFieldMeeting', 'gwValMeeting', 1], top: ['gwFieldTop', 'gwValTop', 0], claim: ['gwFieldClaim', 'gwValClaim', 1], x1: ['gwInfoX1Name', 'gwInfoX1Val', 0], x2: ['gwInfoX2Name', 'gwInfoX2Val', 0] };
  const RUN = { ...BASE, x1: ['gwRunX1Name', 'gwRunX1Val', 0], x2: ['gwRunX2Name', 'gwRunX2Val', 0] };
  const RES = { ...BASE, reqs: ['gwFieldReqs', 'gwValReqsRes', 0], x1: ['gwResX1Name', 'gwResX1Val', 0], x2: ['gwResX2Name', 'gwResX2Val', 0] };
  const prev = h('div', {});
  const draw = () => {
    const { v, fill } = vars();
    const f = k => fill(val(k), v);
    const inline = !/^(hay[ıi]r|no|false|0)$/i.test(val('gwFieldsInline').trim());
    const emb = (o) => {
      const col = /^#?[0-9a-f]{6}$/i.test(f(o.color).trim()) ? `#${f(o.color).trim().replace('#', '')}` : o.def;
      const desc = o.desc !== undefined ? o.desc : f(o.descKey);
      const fields = val(o.order).toLowerCase().split(/[\s,;|]+/).filter(Boolean).map(id => o.fields[id]).filter(Boolean)
        .map(d => ({ n: f(d[0]).trim(), v: f(d[1]).trim(), inl: d[2] && inline })).filter(x => x.n && x.v);
      const img = k => (/^https?:\/\/\S+$/i.test(f(k).trim()) ? f(k).trim() : '');
      const el = h('div', { class: 'dc-emb', style: `border-left-color:${col}` },
        o.author && f(o.author).trim() ? h('div', { class: 'dc-foot' }, f(o.author)) : null,
        f(o.title).trim() ? h('b', {}, f(o.title)) : null,
        desc.trim() ? h('div', { class: 'dc-desc' }, desc) : null,
        fields.length ? h('div', { class: 'dc-fields' }, fields.map(x => h('div', { class: x.inl ? 'dc-inline' : '' }, h('b', { class: 'dc-fn' }, x.n), h('div', {}, x.v)))) : null,
        o.image && img(o.image) ? h('div', { class: 'dc-foot' }, `🖼️ Büyük resim: ${img(o.image)}`) : null,
        o.thumb && img(o.thumb) ? h('div', { class: 'dc-foot' }, `🖼️ Küçük resim: ${img(o.thumb)}`) : null,
        o.footer && f(o.footer).trim() ? h('div', { class: 'dc-foot' }, f(o.footer)) : null);
      return el;
    };
    const btn = (t, c) => h('span', { class: `dc-btn ${({ p: 'primary', g: 'success' })[c] || c || 'secondary'}` }, t.trim());
    const run = { title: 'gwRunTitle', descKey: 'gwRunDesc', color: 'gwRunColor', author: 'gwRunAuthor', thumb: 'gwRunThumb', image: 'gwRunImage', footer: 'gwRunFooter', order: 'gwRunOrder', fields: RUN, def: '#5865f2' };
    prev.replaceChildren(h('div', { class: 'dc' },
      h('p', { class: 'hint' }, '1) Çalışan çekiliş'), emb(run),
      h('div', { style: 'margin:6px 0 14px' }, btn(`${val('gwEmojiJoin')} ${val('gwJoinBtn')}`, val('gwColorJoin')), ' ', btn(`${val('gwEmojiStatus')} ${val('gwStatusBtn')}`, val('gwColorStatus')), ' ', btn(`${val('gwEmojiInfo')} ${val('gwInfoBtn')}`, val('gwColorInfo')), ' ', btn(`${val('gwEmojiPeople')} ${val('gwPeopleBtn')}`, val('gwColorPeople'))),
      h('p', { class: 'hint' }, '1b) "Detaylar" butonuna basınca (sadece basan kişi görür)'), emb({ ...run, title: 'gwInfoTitle', descKey: 'gwInfoDesc', color: 'gwInfoColor', author: 'gwInfoAuthor', thumb: 'gwInfoThumb', image: 'gwInfoImage', footer: 'gwInfoFooter', order: 'gwInfoOrder', fields: INFO, def: '#5865f2' }),
      h('div', { style: 'margin:6px 0 14px' }, btn(`${val('gwEmojiRefresh')} ${val('gwRefreshBtn')}`, val('gwColorRefresh')), ' ', btn(`${val('gwEmojiPeople')} ${val('gwPeopleBtn')}`, val('gwColorPeople')), ' ', btn(`${val('gwEmojiJump')} ${val('gwJumpBtn')}`, 'secondary')),
      h('p', { class: 'hint' }, '2) Biten çekiliş (ilk mesaj)'), emb({ ...run, title: 'gwEndTitle', descKey: 'gwEndDesc', color: 'gwEndColor', def: '#f0b232' }),
      h('p', { class: 'hint', style: 'margin-top:14px' }, '1c) "Katılımcılar" butonuna basınca (filtre + sıralama + sayfa butonları)'),
      (() => { const pv = { ...v, meetingline: f('gwPeopleMeeting').replace('{meetingCount}', '12').replace('{meetingBar}', '▰▰▰▱▱▱▱▱▱▱').replace('{meetingPercent}', '32'), filter: val('gwFilterAll'), sort: val('gwSortJoin') };
        const line = (n, user, mark, prog) => fill(val('gwPeopleLine'), { n, user, mark, progress: prog }).split('\n').filter(x => x.trim()).join('\n');
        return h('div', { class: 'dc-emb', style: 'border-left-color:#5865f2' }, h('b', {}, fill(val('gwPeopleTitle'), v)), h('div', { class: 'dc-desc' }, `${fill(val('gwPeopleHead'), pv)}\n\n${[line('1', '@ali', val('gwMarkWinner'), '✉️ 54/50 · 🔊 40/30 dk · 📨 2/2'), line('2', '@veli', val('gwMarkOk'), '✉️ 51/50 · 🔊 31/30 dk · 📨 2/2'), line('3', '@ayse', val('gwMarkTodo'), '✉️ 12/50 · 🔊 5/30 dk · 📨 0/2')].join('\n')}`),
          h('div', { class: 'dc-foot' }, fill(val('gwPeopleFooter'), { page: '1', pages: '4' }))); })(),
      h('div', { style: 'margin:6px 0 4px' }, ['gwEmojiFirst', 'gwEmojiPrev', 'gwEmojiNext', 'gwEmojiLast'].map(k => h('span', { class: `dc-btn ${val('gwColorNav')}`, style: 'margin-right:4px' }, val(k) || '•')), h('span', { class: 'dc-btn secondary', style: 'margin-left:6px' }, '1 / 4')),
      h('div', { style: 'margin:0 0 14px' }, h('span', { class: 'dc-btn secondary' }, `▾ ${val('gwFilterPh')}`), ' ', h('span', { class: 'dc-btn secondary' }, `▾ ${val('gwSortPh')}`)),
      h('p', { class: 'hint', style: 'margin-top:14px' }, '3) İptal edilen çekiliş'), emb({ ...run, title: 'gwCancelTitle', descKey: 'gwCancelDesc', color: 'gwCancelColor', def: '#da373c' }),
      h('p', { class: 'hint', style: 'margin-top:14px' }, '4) Sonuç / tekrar çek mesajı (altta şart durumu)'),
      emb({ title: 'gwResTitle', descKey: 'gwResBody', color: 'gwResColor', author: 'gwResAuthor', thumb: 'gwResThumb', image: 'gwResImage', footer: 'gwResFooter', order: 'gwResOrder', fields: RES, def: '#248046' }),
      h('div', { style: 'margin:6px 0 14px' }, btn(`${val('gwEmojiClaim')} ${val('gwClaimBtn')}`, val('gwColorClaim')), ' ', btn(`${val('gwEmojiReroll')} ${val('gwRerollBtn')}`, val('gwColorReroll')), ' ', btn(`${val('gwEmojiInfo')} ${val('gwInfoBtn')}`, val('gwColorInfo'))),
      h('p', { class: 'hint' }, '5) Şartı yapmayan kazanan "Ödülünü Al"a basınca'), h('div', { class: 'dc-eph' }, f('gwReqFailed'))));
  };
  draw();
  const pane = textsPane('gwmessages', 'Çekiliş mesajları', 'Çekiliş embed\'lerinin HER parçası burada: başlık, açıklama, renk, üst yazı, resimler, alt yazı, alan adları, alan değerleri, alanların sırası (yazmadığın alan gizlenir) ve 2\'şer ek alan. Her yere {prize} {winners} {winnerCount} {entries} {participants} {host} {id} {ends} {endsFull} {started} {role} {channel} {requirements} {brand} yazabilirsin; kullanıcıya giden cevaplarda {user} (basan kişi) da çalışır. Renk #RRGGBB, resim linki https://… olmalı. Alanlar: prize, winners, ends, host, entries, role, reqs, status, x1, x2 (Detaylar embedinde ayrıca state, started, you, myreqs, claim). Ayrıca {hostName} {state} {you} {myRequirements} {claimHours} Detaylar embedinde çalışır.', defs, cfg.messages);
  pane.addEventListener('input', draw);
  pane.addEventListener('click', () => setTimeout(draw));
  const card = h('div', { class: 'card' }, h('h2', {}, 'Önizleme'), h('p', { class: 'hint', style: 'margin-bottom:10px' }, 'Yazıları düzenledikçe aşağıdaki örnekler güncellenir (örnek değerlerle). Sonuç mesajında "Şart durumu" alanı, şartlı çekilişlerde her kazananın şartları yapıp yapmadığını gösterir.'), prev);
  pane.insertBefore(card, pane.firstChild);
  return pane;
}

/* ---------- 🌐 Site yazıları ---------- */
function gwSitePane() {
  return textsPane('gwsite', 'Çekiliş — site yazıları', 'Sitedeki "Çekilişler" bölümünün başlıkları, açıklamaları ve etiketleri.', schema.site.filter(d => d.key.startsWith('gw')), cfg.site);
}

/* ---------- 📈 İstatistikler ---------- */
function gwStatsPane() {
  return h('div', { class: 'pane', id: 'pane-gwstats' }, gwBox(() => {
    const all = gwItems; const ended = all.filter(i => i.status === 'ended');
    if (!all.length) return h('div', { class: 'empty' }, 'Henüz çekiliş yok.');
    const winners = ended.reduce((n, i) => n + i.winners.length, 0);
    const disq = ended.reduce((n, i) => n + i.winners.filter(w => w.disq).length, 0);
    const claimed = ended.reduce((n, i) => n + i.winners.filter(w => w.claimed).length, 0);
    const valid = winners - disq;
    const withReq = all.filter(i => reqList(i.requirements).length).length;
    const avg = all.length ? Math.round(all.reduce((n, i) => n + i.entries, 0) / all.length) : 0;
    const days = [];
    for (let k = 13; k >= 0; k--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - k); days.push(d); }
    const daily = days.map(d => { const a = d.getTime(), b = a + 86400000; return [`${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`, all.filter(i => i.createdAt >= a && i.createdAt < b).length]; });
    const use = { 'Rol': 0, 'Sunucu etiketi': 0, 'Durum': 0, 'Ses': 0, 'Mesaj': 0, 'Davet': 0 };
    all.forEach(i => { const r = i.requirements; if (!r) return; if (r.roleIds?.length) use['Rol']++; if (r.serverTag) use['Sunucu etiketi']++; if (r.statusText) use['Durum']++; if (r.voiceMinutes) use['Ses']++; if (r.messages) use['Mesaj']++; if (r.invites) use['Davet']++; });
    const top = [...all].sort((a, b) => b.entries - a.entries).slice(0, 5);
    return h('div', {},
      h('div', { class: 'cards4' }, gwStat('Toplam çekiliş', all.length), gwStat('Ortalama katılımcı', avg), gwStat('Şartlı çekiliş', withReq, `%${Math.round(withReq / all.length * 100)}`),
        gwStat('Şartı yapmayan kazanan', disq, winners ? `%${Math.round(disq / winners * 100)}` : ''), gwStat('Ödül alma oranı', valid ? `%${Math.round(claimed / valid * 100)}` : '—', `${claimed} / ${valid} geçerli kazanan`)),
      h('div', { class: 'split2' },
        h('div', { class: 'card' }, h('h2', {}, 'Son 14 gün'), h('p', { class: 'hint' }, 'Başlatılan çekilişler'), gwBars(daily)),
        h('div', { class: 'card' }, h('h2', {}, 'Şart kullanımı'), h('p', { class: 'hint' }, 'Hangi şart kaç çekilişte kullanıldı'), gwBars(Object.entries(use)))),
      h('div', { class: 'card' }, h('h2', {}, 'En çok katılım alan çekilişler'), gwBars(top.map(i => [i.prize.slice(0, 22), i.entries]))));
  }));
}

/* ---------- 📖 Rehber ---------- */
function gwGuidePane() {
  const tbl = (head, rows) => h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, head.map(x => h('th', {}, x)))), h('tbody', {}, rows.map(r => h('tr', {}, r.map(c => h('td', {}, c)))))));
  return h('div', { class: 'pane', id: 'pane-gwguide' },
    h('div', { class: 'card' }, h('h2', {}, 'Çekiliş nasıl işler?'),
      h('ol', { class: 'guide' },
        h('li', {}, 'Çekilişi panelden, ', h('code', {}, '/cekilis baslat'), ' ile ya da ', h('code', {}, '.gstart'), ' ile başlatırsın. Bot kanala çekiliş mesajını ve "Katıl" butonunu atar.'),
        h('li', {}, 'Herkes katılabilir. Mesaj, ses ve davet şartları çekiliş başladığı andan itibaren sayılır; kullanıcılar "Şartlarım" butonuyla durumlarına bakar.'),
        h('li', {}, 'Süre dolunca bot kazananları çeker ve her kazananın şartlarını kontrol eder. Sonuç mesajında kazananlar yine görünür.'),
        h('li', {}, 'Kazanan "Ödülünü Al"a basınca şartı yapmışsa ödül talebi (ticket) açılır; yapmamışsa "kazanmadın" cevabı ve eksik şartlar gelir.'),
        h('li', {}, 'Yetkili "Tekrar çek" yapınca daha önce çekilmemiş katılımcılardan, düşen kazanan sayısı kadar yeni kazanan seçilir. Önceki geçerli kazananlar kendi sonuç mesajındaki butonla ödülünü almaya devam eder.'),
        h('li', {}, 'Bir kazananı elle düşürmek ya da geri almak, düzenleyeni ID ile değiştirmek için çekilişin Ayrıntı penceresini kullan.'),
        h('li', {}, 'Discord mesajındaki butonlar: Katıl, Şartlarım, Detaylar (çekilişin her şeyi + senin durumun), Katılımcılar (sayfalı liste). Sonuç mesajında Ödülünü Al, Tekrar Çek ve Detaylar var.'),
        h('li', {}, 'Düzenleyen: çekilişi başlatırken ID yazabilirsin (panel, /cekilis baslat duzenleyen:, ya da .gstart ... | duzenleyen=ID).'))),
    h('div', { class: 'card' }, h('h2', {}, 'Şartlar'),
      tbl(['Şart', 'Yazıyla', 'Ne zaman / nasıl sayılır', 'Gerekli ayar'], [
        ['🎭 Rol', 'rol=@rol', 'Çekiliş bitince kazananın rolü olmalı', '—'],
        ['🏷️ Sunucu etiketi', 'tag', 'Bitince profilinde bu sunucunun etiketi takılı olmalı', '—'],
        ['💬 Özel durum', 'durum=.gg/deuslra', 'Bitince özel durumunda bu yazı geçmeli (çevrimdışı okunamaz)', 'USE_PRESENCE=true + Presence Intent'],
        ['🔊 Ses aktifliği', 'ses=30', 'Çekiliş başladıktan sonra seste geçen dakika (AFK sayılmaz)', '—'],
        ['✉️ Mesaj sayısı', 'mesaj=50', 'Çekiliş başladıktan sonra yazılan mesaj (3 sn içindekiler tek)', '—'],
        ['📨 Davet sayısı', 'invite=2', 'Çekiliş başladıktan sonra davetle girenler (çıkan düşer)', 'GUILD_MEMBERS_INTENT=true + Server Members Intent + Sunucuyu Yönet izni']])),
    h('div', { class: 'card' }, h('h2', {}, 'Komutlar'),
      tbl(['Komut', 'Ne yapar'], [
        [h('code', {}, '.gstart 1d 2 Nitro | invite=2 mesaj=50'), 'Çekiliş başlatır (süre, kazanan sayısı, ödül, | sonrası şartlar)'],
        [h('code', {}, '.gend [ID]'), 'Çekilişi hemen bitirir'], [h('code', {}, '.greroll [ID] [adet]'), 'Tekrar çeker (adet yazmazsan düşen kazanan sayısı kadar)'],
        [h('code', {}, '.gcancel [ID]'), 'Çekilişi iptal eder'], [h('code', {}, '.glist'), 'Çalışan çekilişleri listeler'],
        [h('code', {}, '/cekilis baslat | bitir | tekrar | iptal | liste'), 'Slash karşılıkları (şartlar: rol, tag, durum, ses, mesaj, invite seçenekleri)']]),
      h('p', { class: 'hint', style: 'margin-top:8px' }, 'Yazıyla komutlar için MESSAGE_CONTENT_INTENT açık olmalı ve komutlar Destek bölümündeki "Komutlar" sekmesinden açık olmalı.')));
}

/* Çekiliş bölümünün sekmeleri: [id, ikon, ad, panel kurucusu, açılınca çalışacak işlev] */
function gwTabs() {
  gwReload();
  return [
    ['gwoverview', '📊', 'Genel bakış', gwOverviewPane],
    ['gwstart', '🎉', 'Çekiliş başlat', gwStartPane],
    ['gwlist', '📋', 'Çekilişler', gwListPane],
    ['gwstats', '📈', 'İstatistikler', gwStatsPane],
    ['gwsettings', '⚙️', 'Ayarlar', gwSettingsPane],
    ['gwbuttons', '🔘', 'Butonlar', gwButtonsPane],
    ['gwmessages', '💬', 'Çekiliş mesajları', gwMessagesPane],
    ['gwsite', '🌐', 'Site yazıları', gwSitePane],
    ['gwguide', '📖', 'Rehber', gwGuidePane],
  ];
}
