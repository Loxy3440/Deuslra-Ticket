const { ActionRowBuilder, ActivityType, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits, StringSelectMenuBuilder } = require('discord.js');
const { okEmoji } = require('./openMessages');
const db = require('./db');
const { msg: baseMsg } = require('./messages');
const { isStaff } = require('./permissions');
const { replyPrivate } = require('./replies');

// Çekilişler: kayıtlar db 'giveaways' anahtarında. ID = çekiliş mesajının ID'si.
const MAX_RECORDS = 300;
const MIN_MS = 10 * 1000;
const MAX_MS = 30 * 24 * 3600 * 1000;
const unix = ms => Math.floor(ms / 1000);

let state = null;
function data() {
  if (!state) { state = db.get('giveaways', null) || { items: {} }; if (!state.items) state.items = {}; }
  return state;
}
function save() {
  const ids = Object.keys(data().items);
  if (ids.length > MAX_RECORDS) {
    ids.sort((a, b) => (state.items[a].createdAt || 0) - (state.items[b].createdAt || 0));
    for (const id of ids.slice(0, ids.length - MAX_RECORDS)) if (state.items[id].status !== 'running') delete state.items[id];
  }
  db.set('giveaways', state);
}
const get = id => data().items[id] || null;
const list = () => Object.values(data().items).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
const running = () => list().filter(g => g.status === 'running');

// "1h30m", "2 saat", "45dk", "1d" -> milisaniye (anlaşılmazsa 0)
function parseDuration(text) {
  const s = String(text || '').toLowerCase().replace(/\s+/g, '');
  if (!s) return 0;
  const re = /(\d+)(saniye|saat|sa|sn|s|dakika|dk|m|h|gün|gun|g|d)/gy;
  const unit = { s: 1e3, sn: 1e3, saniye: 1e3, m: 6e4, dk: 6e4, dakika: 6e4, h: 36e5, sa: 36e5, saat: 36e5, d: 864e5, g: 864e5, gun: 864e5, 'gün': 864e5 };
  let total = 0, m, last = 0;
  while ((m = re.exec(s))) { total += Number(m[1]) * unit[m[2]]; last = re.lastIndex; }
  return last === s.length ? total : 0;
}

// ---- Şartlar ----
// requirements: { roleIds, serverTag, statusText, voiceMinutes, messages, invites }
// Mesaj / ses / invite sayıları ÇEKİLİŞ BAŞLADIKTAN sonrasını sayar. Şartlar katılımı engellemez:
// çekiliş bitince kazananlar kontrol edilir, şartı yapmayan "kazanmadı" sayılır ve tekrar çekilebilir.
const emptyReq = () => ({ roleIds: [], serverTag: false, statusText: '', voiceMinutes: 0, messages: 0, invites: 0 });
function cleanReq(r) {
  const x = r && typeof r === 'object' ? r : {};
  const int = (v, max) => Math.min(Math.max(parseInt(v, 10) || 0, 0), max);
  return {
    roleIds: [...new Set((Array.isArray(x.roleIds) ? x.roleIds : []).map(String).filter(id => /^\d{5,25}$/.test(id)))].slice(0, 10),
    serverTag: x.serverTag === true || x.serverTag === 'true',
    statusText: String(x.statusText || '').trim().slice(0, 100),
    voiceMinutes: int(x.voiceMinutes, 100000),
    messages: int(x.messages, 100000),
    invites: int(x.invites, 10000),
  };
}
const hasReq = g => { const r = g?.requirements; return Boolean(r && (r.roleIds?.length || r.serverTag || r.statusText || r.voiceMinutes || r.messages || r.invites)); };
function ensure(g) { g.requirements ||= emptyReq(); g.progress ||= {}; g.checks ||= {}; g.replaced ||= {}; return g; }
const prog = (g, uid) => (g.progress[uid] ||= { messages: 0, voiceMs: 0, invitedIds: [] });

// ".gstart 1h 3 Ödül | invite=2 mesaj=50 ses=30 tag rol=<@&ID> durum=.gg/deuslra" -> { ms, winners, prize, req }
function parseReqFlags(text) {
  const req = emptyReq();
  for (const tok of String(text || '').trim().split(/\s+/).filter(Boolean)) {
    const [k0, ...v0] = tok.split('=');
    const k = k0.toLowerCase(); const v = v0.join('='); const n = parseInt(v, 10) || 0;
    if (['invite', 'davet'].includes(k)) req.invites = n;
    else if (['mesaj', 'msg'].includes(k)) req.messages = n;
    else if (['ses', 'voice'].includes(k)) req.voiceMinutes = n;
    else if (['tag', 'etiket'].includes(k)) req.serverTag = !['0', 'false', 'hayir', 'hayır', 'no'].includes(v.toLowerCase());
    else if (['rol', 'role'].includes(k)) { const id = (v.match(/\d{5,25}/) || [])[0]; if (id) req.roleIds.push(id); }
    else if (['durum', 'status'].includes(k)) req.statusText = v;
  }
  return cleanReq(req);
}

// ".gstart 1h 3 Ödül adı" -> { ms, winners, prize, req }
function parseStart(rest, allowFlags = true) {
  const raw = String(rest || '');
  const bar = allowFlags ? raw.indexOf('|') : -1;
  const head = bar >= 0 ? raw.slice(0, bar) : raw;
  let host = '';
  const flagText = bar >= 0 ? raw.slice(bar + 1).split(/\s+/).filter(t => {
    const m = /^(?:duzenleyen|düzenleyen|host)=(.*)$/i.exec(t);
    if (m) { host = (m[1].match(/\d{5,25}/) || [])[0] || ''; return false; }
    return true;
  }).join(' ') : '';
  const req = bar >= 0 ? parseReqFlags(flagText) : emptyReq();
  const parts = head.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const ms = parseDuration(parts[0]);
  let winners = 1, from = 1;
  if (parts.length > 2 && /^\d{1,2}$/.test(parts[1])) { winners = Number(parts[1]); from = 2; }
  const prize = parts.slice(from).join(' ').slice(0, 200);
  if (!prize) return null;
  return { ms, winners: Math.min(Math.max(winners, 1), 20), prize, req, host };
}

const mentionList = ids => ids.map(id => `• <@${id}>`).join('\n');
function pick(pool, n) {
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

// ---------- Şart takibi (mesaj / ses / invite) ----------
// Sadece çalışan çekilişlerin kayıtlarına yazılır; kayıtlar 10 sn'de bir toplu kaydedilir.
const runningFast = () => Object.values(data().items).filter(g => g.status === 'running');
let saveTimer = null;
const scheduleSave = () => { if (saveTimer) return; saveTimer = setTimeout(() => { saveTimer = null; save(); }, 10000); };
function flush() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; save(); } }

// Mesaj: spam ile şişirilmesin diye aynı kişiden 3 sn içindeki mesajlar tek sayılır.
const MSG_GAP_MS = 3000;
const lastCount = new Map();
function trackMessage(message) {
  if (!message.guild || message.author?.bot) return;
  const gs = runningFast().filter(g => g.guildId === message.guild.id && g.requirements?.messages > 0);
  if (!gs.length) return;
  const uid = message.author.id; const now = Date.now();
  if (now - (lastCount.get(uid) || 0) < MSG_GAP_MS) return;
  if (lastCount.size > 5000) lastCount.clear();
  lastCount.set(uid, now);
  for (const g of gs) { ensure(g); prog(g, uid).messages += 1; }
  scheduleSave();
}

// Ses: kanala girince oturum açılır, çıkınca (AFK kanalı sayılmaz) çalışan çekilişlere süre eklenir.
const sessions = new Map(); // "guildId:userId" -> başlangıç zamanı
function openSession(guildId, uid) { const k = `${guildId}:${uid}`; if (!sessions.has(k)) sessions.set(k, Date.now()); }
function closeSession(guildId, uid) {
  const k = `${guildId}:${uid}`; const start = sessions.get(k);
  if (!start) return;
  sessions.delete(k);
  const end = Date.now(); let changed = false;
  for (const g of runningFast()) {
    if (g.guildId !== guildId || !g.requirements?.voiceMinutes) continue;
    const ms = end - Math.max(start, g.createdAt || 0);
    if (ms > 0) { ensure(g); prog(g, uid).voiceMs += ms; changed = true; }
  }
  if (changed) scheduleSave();
}
function voiceUpdate(oldS, newS) {
  const member = newS.member || oldS.member;
  if (!member || member.user?.bot) return;
  const inVoice = s => Boolean(s.channelId) && s.channelId !== s.guild.afkChannelId;
  const was = inVoice(oldS), now = inVoice(newS);
  if (!was && now) openSession(newS.guild.id, member.id);
  else if (was && !now) closeSession(newS.guild.id, member.id);
}
function seedVoice(client) {
  for (const guild of client.guilds.cache.values()) {
    for (const vs of guild.voiceStates.cache.values()) {
      if (vs.channelId && vs.channelId !== guild.afkChannelId && !vs.member?.user?.bot) openSession(guild.id, vs.id);
    }
  }
}
// Çekiliş biterken açık kalan oturumların bitişe kadarki kısmı kayda geçirilir.
function flushVoice(g) {
  if (!g.requirements?.voiceMinutes) return;
  const end = g.endedAt || Date.now();
  for (const [k, start] of sessions) {
    const [gid, uid] = k.split(':');
    if (gid !== g.guildId) continue;
    const ms = end - Math.max(start, g.createdAt || 0);
    if (ms > 0) { ensure(g); prog(g, uid).voiceMs += ms; }
  }
}
function voiceMsOf(g, uid) {
  let ms = g.progress?.[uid]?.voiceMs || 0;
  const start = sessions.get(`${g.guildId}:${uid}`);
  if (g.status === 'running' && start) ms += Math.max(0, Date.now() - Math.max(start, g.createdAt || 0));
  return ms;
}

// Invite: kim kimin davetiyle girdi, davet önbelleğinin farkından bulunur (GUILD_MEMBERS_INTENT + Sunucuyu Yönet izni gerekir).
const inviteCache = new Map(); // guildId -> Map(code -> { uses, maxUses, inviterId })
async function cacheInvites(guild) {
  const invs = await guild.invites.fetch().catch(() => null);
  if (!invs) return null;
  const map = new Map(invs.map(i => [i.code, { uses: i.uses || 0, maxUses: i.maxUses || 0, inviterId: i.inviter?.id || '' }]));
  inviteCache.set(guild.id, map);
  return map;
}
async function onMemberJoin(member) {
  if (member.user?.bot) return;
  const guild = member.guild;
  if (!runningFast().some(g => g.guildId === guild.id && g.requirements?.invites > 0)) { cacheInvites(guild).catch(() => null); return; }
  const before = inviteCache.get(guild.id);
  const after = await cacheInvites(guild);
  if (!before || !after) return;
  let used = null;
  for (const [code, a] of after) { if (a.uses > (before.get(code)?.uses || 0)) { used = a; break; } }
  if (!used) for (const [code, b] of before) { if (!after.has(code) && b.maxUses && b.uses + 1 >= b.maxUses) { used = b; break; } } // son hakkı kullanılıp silinen davet
  if (!used?.inviterId || used.inviterId === member.id) return;
  let changed = false;
  for (const g of runningFast()) {
    if (g.guildId !== guild.id || !g.requirements?.invites) continue;
    const p = prog(ensure(g), used.inviterId);
    if (!p.invitedIds.includes(member.id)) { p.invitedIds.push(member.id); changed = true; }
  }
  if (changed) scheduleSave();
}
// Davet ettiği kişi sunucudan çıkarsa davet sayısından düşer.
function onMemberLeave(member) {
  let changed = false;
  for (const g of runningFast()) {
    if (g.guildId !== member.guild.id || !g.requirements?.invites) continue;
    for (const p of Object.values(g.progress || {})) {
      const i = p.invitedIds?.indexOf(member.id);
      if (i >= 0) { p.invitedIds.splice(i, 1); changed = true; }
    }
  }
  if (changed) scheduleSave();
}

// Şart listesi (embed ve mesajlarda gösterilen satırlar)
function reqItems(config, g) {
  const r = g.requirements || {}; const m = (k, v) => baseMsg(config, k, v); const out = [];
  if (r.roleIds?.length) out.push({ key: 'role', label: m('gwReqRole', { roles: r.roleIds.map(id => `<@&${id}>`).join(' ') }) });
  if (r.serverTag) out.push({ key: 'tag', label: m('gwReqTag') });
  if (r.statusText) out.push({ key: 'status', label: m('gwReqStatus', { text: r.statusText }) });
  if (r.voiceMinutes) out.push({ key: 'voice', label: m('gwReqVoice', { n: String(r.voiceMinutes) }), need: r.voiceMinutes });
  if (r.messages) out.push({ key: 'messages', label: m('gwReqMessages', { n: String(r.messages) }), need: r.messages });
  if (r.invites) out.push({ key: 'invites', label: m('gwReqInvites', { n: String(r.invites) }), need: r.invites });
  return out;
}

// Bir kişinin şartları sağlayıp sağlamadığı: { ok, results: [{ key, label, ok, cur?, need? }] }
async function evaluate({ client, config, g, userId }) {
  const r = g.requirements || {};
  const guild = client.guilds.cache.get(g.guildId) || await client.guilds.fetch(g.guildId).catch(() => null);
  const member = guild ? (guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null)) : null;
  const p = g.progress?.[userId] || {};
  const results = [];
  for (const it of reqItems(config, g)) {
    let ok = false; let cur;
    if (member) {
      if (it.key === 'role') ok = r.roleIds.every(id => member.roles.cache.has(id));
      else if (it.key === 'tag') {
        const user = await client.users.fetch(userId, { force: true }).catch(() => member.user);
        const pg = user?.primaryGuild; // sunucu etiketi: profilde takılı ve bu sunucunun etiketi olmalı
        ok = Boolean(pg && pg.identityGuildId === g.guildId && pg.identityEnabled !== false);
      } else if (it.key === 'status') {
        const act = (guild.presences?.cache?.get(userId)?.activities || []).find(a => a.type === ActivityType.Custom);
        ok = Boolean(act?.state) && act.state.toLowerCase().includes(r.statusText.toLowerCase());
      } else if (it.key === 'voice') { cur = Math.floor(voiceMsOf(g, userId) / 60000); ok = cur >= it.need; }
      else if (it.key === 'messages') { cur = p.messages || 0; ok = cur >= it.need; }
      else if (it.key === 'invites') { cur = p.invitedIds?.length || 0; ok = cur >= it.need; }
    } else if (it.need) cur = 0;
    results.push({ ...it, ok, cur });
  }
  return { ok: results.every(x => x.ok), results };
}
async function checkAndStore({ client, config, g, userId }) {
  ensure(g);
  const res = await evaluate({ client, config, g, userId });
  g.checks[userId] = { ok: res.ok, failed: res.results.filter(x => !x.ok).map(x => x.need ? `${x.label} (${x.cur}/${x.need})` : x.label), at: Date.now() };
  return res;
}

// ---------- Embed şablonları ----------
// Çekiliş embed'lerinin her parçası Panel > Çekiliş > Çekiliş mesajları'ndan düzenlenir; {prize} {winners} {entries} {host} {ends} {user} gibi değişkenler kullanılabilir.
const hexColor = v => { const m = /^#?([0-9a-f]{6})$/i.exec(String(v || '').trim()); return m ? parseInt(m[1], 16) : null; };
const httpUrl = v => { const t = String(v || '').trim(); return /^https?:\/\/\S+$/i.test(t) ? t.slice(0, 500) : null; };

function tplVars(config, g, extra = {}) {
  const entries = g.entries || [];
  const m = k => baseMsg(config, k);
  const ids = extra.ids || g.winners || [];
  return {
    prize: g.prize, winnercount: String(g.winnersCount), winners: mentionList(ids), entries: String(entries.length),
    participants: entries.length ? `${entries.slice(0, 15).map(id => `<@${id}>`).join(' ')}${entries.length > 15 ? ` +${entries.length - 15}` : ''}` : '—',
    host: `<@${g.hostId}>`, id: g.id, brand: config.brandName,
    ends: `<t:${unix(g.endsAt)}:R>`, endsfull: `<t:${unix(g.endsAt)}:f>`, started: g.createdAt ? `<t:${unix(g.createdAt)}:R>` : '',
    role: g.roleId ? `<@&${g.roleId}>` : '', channel: `<#${g.channelId}>`,
    requirements: hasReq(g) ? reqItems(config, g).map(x => `• ${x.label}`).join('\n') : '',
    claimbtn: m('gwClaimBtn'), note: m('gwResultReqNote'), hostname: g.hostTag || '', state: '', you: '', myrequirements: '', claimhours: String(config.giveaways?.claimHours || '∞'),
    status: hasReq(g) ? ids.map(id => {
      const c = g.checks?.[id];
      return c && c.ok === false ? baseMsg(config, 'gwStatusFail', { user: `<@${id}>`, missing: c.failed.join(', ') }) : baseMsg(config, 'gwStatusOk', { user: `<@${id}>` });
    }).join('\n') : '',
    ...extra,
  };
}

// Alan tanımları: id -> [ad anahtarı, değer anahtarı, yan yana mı]
const BASE_FIELDS = {
  prize: ['gwFieldPrize', 'gwValPrize', true], winners: ['gwFieldWinners', 'gwValWinners', true], ends: ['gwFieldEnds', 'gwValEnds', true],
  host: ['gwFieldHost', 'gwValHost', true], entries: ['gwFieldEntries', 'gwValEntries', true], role: ['gwFieldRole', 'gwValRole', true],
  reqs: ['gwFieldReqs', 'gwValReqs', false], status: ['gwFieldStatus', 'gwValStatus', false],
};
const RUN_FIELDS = { ...BASE_FIELDS, x1: ['gwRunX1Name', 'gwRunX1Val', false], x2: ['gwRunX2Name', 'gwRunX2Val', false] };
const RES_FIELDS = { ...BASE_FIELDS, reqs: ['gwFieldReqs', 'gwValReqsRes', false], x1: ['gwResX1Name', 'gwResX1Val', false], x2: ['gwResX2Name', 'gwResX2Val', false] };

// Discord alan sınırı (1024): uzunsa satır ortasından değil, son tam satırdan keser
const cutLines = (t, max) => { if (t.length <= max) return t; const c = t.slice(0, max - 2); const i = c.lastIndexOf('\n'); return `${i > 200 ? c.slice(0, i) : c}\n…`; };

function templEmbed(config, g, vars, o) {
  const m = k => baseMsg(config, k, vars);
  const e = new EmbedBuilder().setColor(hexColor(m(o.colorKey)) ?? o.defColor);
  const title = m(o.titleKey).trim(); if (title) e.setTitle(title.slice(0, 256));
  const desc = (o.desc ?? m(o.descKey)).trim(); if (desc) e.setDescription(desc.slice(0, 4000));
  const author = o.authorKey ? m(o.authorKey).trim() : ''; if (author) e.setAuthor({ name: author.slice(0, 256) });
  const thumb = o.thumbKey && httpUrl(m(o.thumbKey)); if (thumb) e.setThumbnail(thumb);
  const image = o.imageKey && httpUrl(m(o.imageKey)); if (image) e.setImage(image);
  const inlineOn = !/^(hay[ıi]r|no|false|0)$/i.test(baseMsg(config, 'gwFieldsInline').trim());
  const fields = [];
  for (const id of baseMsg(config, o.orderKey).toLowerCase().split(/[\s,;|]+/).filter(Boolean)) {
    const def = o.fields[id]; if (!def) continue;
    const name = m(def[0]).trim(), value = m(def[1]).trim();
    if (!name || !value || fields.some(f => f.id === id)) continue;
    fields.push({ id, name: name.slice(0, 256), value: cutLines(value, 1024), inline: def[2] && inlineOn });
  }
  if (fields.length) e.addFields(fields.slice(0, 25).map(({ name, value, inline }) => ({ name, value, inline })));
  const footer = o.footerKey ? m(o.footerKey).trim() : ''; if (footer) e.setFooter({ text: footer.slice(0, 2048) });
  return e;
}
const RUN_KEYS = { titleKey: 'gwRunTitle', descKey: 'gwRunDesc', colorKey: 'gwRunColor', authorKey: 'gwRunAuthor', thumbKey: 'gwRunThumb', imageKey: 'gwRunImage', footerKey: 'gwRunFooter', orderKey: 'gwRunOrder', fields: RUN_FIELDS };

const runningEmbed = (config, g) => templEmbed(config, g, tplVars(config, g), { ...RUN_KEYS, defColor: config.colors.main });
const endedEmbed = (config, g) => templEmbed(config, g, tplVars(config, g), { ...RUN_KEYS, titleKey: 'gwEndTitle', descKey: 'gwEndDesc', colorKey: 'gwEndColor', defColor: config.colors.warning,
  desc: g.winners.length ? undefined : baseMsg(config, 'gwNoEntries') });
const cancelledEmbed = (config, g) => templEmbed(config, g, tplVars(config, g), { ...RUN_KEYS, titleKey: 'gwCancelTitle', descKey: 'gwCancelDesc', colorKey: 'gwCancelColor', defColor: config.colors.danger || config.colors.warning });
// Sonuç / tekrar çek mesajı: altta her kazananın şartları yapıp yapmadığı yazar
const resultEmbed = (config, g, ids) => templEmbed(config, g, tplVars(config, g, { ids }), {
  titleKey: 'gwResTitle', descKey: 'gwResBody', colorKey: 'gwResColor', authorKey: 'gwResAuthor', thumbKey: 'gwResThumb', imageKey: 'gwResImage', footerKey: 'gwResFooter', orderKey: 'gwResOrder', fields: RES_FIELDS, defColor: config.colors.success });

const joinRow = (config, disabled = false, g = null) => {
  const btns = [gwBtn(config, 'join', 'gw-join', disabled)];
  if (g && hasReq(g)) btns.push(gwBtn(config, 'status', 'gw-status', disabled));
  if (g) btns.push(gwBtn(config, 'info', `gw-info:${g.id || ''}`), gwBtn(config, 'people', `gw-people:${g.id || ''}:0:all:join`));
  return [new ActionRowBuilder().addComponents(...btns.filter(Boolean))];
};
const resultRow = (config, id) => [new ActionRowBuilder().addComponents(...[gwBtn(config, 'claim', `gw-claim:${id}`), gwBtn(config, 'reroll', `gw-reroll:${id}`), gwBtn(config, 'info', `gw-info:${id}`)].filter(Boolean))];

async function fetchChannel(client, id) { return client.channels.cache.get(id) || (await client.channels.fetch(id).catch(() => null)); }
async function tagOf(client, id) { return (await client.users.fetch(id).catch(() => null))?.username || id; }

async function start({ client, config, channel, hostId, ms, winners, prize, roleId, requirements }) {
  if (!config.giveaways.enabled) return { error: baseMsg(config, 'gwDisabled') };
  if (ms < MIN_MS || ms > MAX_MS) return { error: baseMsg(config, 'gwBadDuration') };
  if (!channel?.send) return { error: 'Kanal bulunamadı.' };
  const req = cleanReq(requirements);
  if (req.statusText && process.env.USE_PRESENCE !== 'true') return { error: baseMsg(config, 'gwNeedPresence') };
  if (req.invites) {
    if (process.env.GUILD_MEMBERS_INTENT !== 'true') return { error: baseMsg(config, 'gwNeedMembers') };
    if (!channel.guild?.members?.me?.permissions?.has(PermissionFlagsBits.ManageGuild)) return { error: baseMsg(config, 'gwNeedManageGuild') };
    await cacheInvites(channel.guild); // davet sayımı için başlangıç anındaki kullanım sayıları
  }
  const hostUser = await client.users.fetch(hostId).catch(() => null);
  if (!hostUser) return { error: baseMsg(config, 'gwBadHost') };
  const g = { id: '', channelId: channel.id, guildId: channel.guild?.id || '', prize, winnersCount: winners, hostId: hostUser.id, hostTag: hostUser.username, roleId: roleId || '', endsAt: Date.now() + ms, createdAt: Date.now(), status: 'running', entries: [], winners: [], winnerTags: {}, wonAt: {}, claims: {}, requirements: req, progress: {}, checks: {}, replaced: {} };
  const sent = await channel.send({ embeds: [runningEmbed(config, g)], components: joinRow(config, false, g) }).catch(err => ({ err }));
  if (!sent || sent.err) return { error: `Çekiliş mesajı gönderilemedi: ${sent?.err?.message || 'bilinmeyen hata'}` };
  g.id = sent.id;
  data().items[g.id] = g; save();
  await sent.edit({ embeds: [runningEmbed(config, g)], components: joinRow(config, false, g) }).catch(() => null); // ID'yi alt yazıya ve butonlara işle
  g.url = sent.url; save();
  return { giveaway: g, url: sent.url };
}

// Katıl butonu: bas = katıl, tekrar bas = ayrıl
const editTimers = new Map();
async function handleJoin(interaction, config) {
  const mu = (k, v) => baseMsg(config, k, { user: `<@${interaction.user.id}>`, ...v });
  const g = get(interaction.message.id);
  if (!g || g.status !== 'running') return replyPrivate(interaction, baseMsg(config, 'gwNotRunning'));
  if (g.roleId && !interaction.member?.roles?.cache?.has(g.roleId)) return replyPrivate(interaction, mu('gwNeedRole', { role: `<@&${g.roleId}>` }));
  const i = g.entries.indexOf(interaction.user.id);
  if (i >= 0) g.entries.splice(i, 1); else g.entries.push(interaction.user.id);
  save();
  const note = replyPrivate(interaction, mu(i >= 0 ? 'gwLeft' : 'gwJoined'));
  clearTimeout(editTimers.get(g.id)); // çok katılım olunca mesajı her seferinde değil, 3 sn sonra bir kez güncelle
  editTimers.set(g.id, setTimeout(() => { editTimers.delete(g.id); interaction.message.edit({ embeds: [runningEmbed(config, g)] }).catch(() => null); }, 3000));
  return note;
}

// ---------- Buton ayarları (emoji / renk / gösterme Panel > Çekiliş > Butonlar'dan) ----------
const STYLES = { primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger };
const BTN = { // id: [yazı anahtarı, emoji anahtarı, renk anahtarı, gösterme anahtarı, yedek yazı]
  join: ['gwJoinBtn', 'gwEmojiJoin', 'gwColorJoin', null, 'Katıl'], status: ['gwStatusBtn', 'gwEmojiStatus', 'gwColorStatus', 'gwShowStatus', 'Şartlarım'],
  info: ['gwInfoBtn', 'gwEmojiInfo', 'gwColorInfo', 'gwShowInfo', 'Detaylar'], people: ['gwPeopleBtn', 'gwEmojiPeople', 'gwColorPeople', 'gwShowPeople', 'Katılımcılar'],
  claim: ['gwClaimBtn', 'gwEmojiClaim', 'gwColorClaim', null, 'Ödülünü Al'], reroll: ['gwRerollBtn', 'gwEmojiReroll', 'gwColorReroll', null, 'Tekrar Çek'],
  refresh: ['gwRefreshBtn', 'gwEmojiRefresh', 'gwColorRefresh', null, 'Yenile'],
};
const isOff = v => /^(hay[ıi]r|no|false|0|kapal[ıi]|off)$/i.test(String(v || '').trim());
function gwBtn(config, id, customId, disabled = false) {
  const d = BTN[id];
  if (d[3] && isOff(baseMsg(config, d[3]))) return null;
  const label = baseMsg(config, d[0]).trim().slice(0, 80), emoji = okEmoji(baseMsg(config, d[1]));
  const b = new ButtonBuilder().setCustomId(customId).setStyle(STYLES[baseMsg(config, d[2]).trim().toLowerCase()] || ButtonStyle.Secondary).setDisabled(disabled);
  if (label) b.setLabel(label);
  if (emoji) b.setEmoji(emoji);
  if (!label && !emoji) b.setLabel(d[4]);
  return b;
}
function navBtn(config, key, customId, disabled) {
  const b = new ButtonBuilder().setCustomId(customId).setStyle(STYLES[baseMsg(config, 'gwColorNav').trim().toLowerCase()] || ButtonStyle.Secondary).setDisabled(disabled);
  const e = okEmoji(baseMsg(config, `gwEmoji${key}`));
  return e ? b.setEmoji(e) : b.setLabel({ First: '«', Prev: '‹', Next: '›', Last: '»' }[key]);
}
function jumpBtn(config, url) {
  const label = baseMsg(config, 'gwJumpBtn').trim().slice(0, 80), emoji = okEmoji(baseMsg(config, 'gwEmojiJump'));
  const b = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url);
  if (label) b.setLabel(label);
  if (emoji) b.setEmoji(emoji);
  if (!label && !emoji) b.setLabel('Çekiliş mesajı');
  return b;
}

// ---------- Görsel yardımcılar: ilerleme çubuğu, sayısal şartlar ----------
const bar = (cur, need, len = 10) => { const r = need > 0 ? Math.max(0, Math.min(1, cur / need)) : 0; const f = Math.round(r * len); return '▰'.repeat(f) + '▱'.repeat(len - f); };
function numericReqs(g) {
  const r = g.requirements || {}; const out = [];
  if (r.messages) out.push({ key: 'messages', need: r.messages, icon: '✉️', unit: '' });
  if (r.voiceMinutes) out.push({ key: 'voice', need: r.voiceMinutes, icon: '🔊', unit: ' dk' });
  if (r.invites) out.push({ key: 'invites', need: r.invites, icon: '📨', unit: '' });
  return out;
}
const curOf = (g, uid, key) => (key === 'messages' ? (g.progress?.[uid]?.messages || 0) : key === 'voice' ? Math.floor(voiceMsOf(g, uid) / 60000) : (g.progress?.[uid]?.invitedIds?.length || 0));
const meets = (g, uid) => numericReqs(g).every(x => curOf(g, uid, x.key) >= x.need);
const scoreOf = (g, uid) => curOf(g, uid, 'messages') + curOf(g, uid, 'voice') + curOf(g, uid, 'invites') * 10;
const progText = (g, uid) => numericReqs(g).map(x => `${x.icon} ${curOf(g, uid, x.key)}/${x.need}${x.unit}`).join(' · ');
const reqLine = x => `${x.ok ? '✅' : '❌'} ${x.label}${x.need ? `\n　${bar(x.cur, x.need)} **${x.cur}/${x.need}**` : ''}`;

// ---------- Ayrıntı (Detaylar) butonu ----------
const INFO_FIELDS = {
  ...BASE_FIELDS,
  state: ['gwFieldState', 'gwValState', true], started: ['gwFieldStarted', 'gwValStarted', true], you: ['gwFieldYou', 'gwValYou', true],
  myreqs: ['gwFieldMyReqs', 'gwValMyReqs', false], claim: ['gwFieldClaim', 'gwValClaim', true], meeting: ['gwFieldMeeting', 'gwValMeeting', true], top: ['gwFieldTop', 'gwValTop', false],
  x1: ['gwInfoX1Name', 'gwInfoX1Val', false], x2: ['gwInfoX2Name', 'gwInfoX2Val', false],
};
const infoWait = new Map();
const peopleRow = (config, g) => [gwBtn(config, 'refresh', `gw-info:${g.id}:r`), gwBtn(config, 'people', `gw-people:${g.id}:0:all:join`)].filter(Boolean);
async function handleInfo(interaction, config, rest) {
  const [gidPart, flag] = String(rest || '').split(':');
  const g = get(gidPart || interaction.message.id) || get(interaction.message.id);
  const mu = (k, v) => baseMsg(config, k, { user: `<@${interaction.user.id}>`, ...v });
  if (!g) return replyPrivate(interaction, mu('gwNotRunning'));
  const uid = interaction.user.id;
  if (Date.now() - (infoWait.get(uid) || 0) < 3000) return replyPrivate(interaction, mu('gwStatusWait'));
  infoWait.set(uid, Date.now());
  if (infoWait.size > 2000) infoWait.clear();
  if (flag === 'r') await interaction.deferUpdate().catch(() => null); else await interaction.deferReply({ ephemeral: true }).catch(() => null);

  ensure(g);
  const check = g.checks[uid];
  let you = g.entries.includes(uid) ? baseMsg(config, 'gwYouIn') : baseMsg(config, 'gwYouOut');
  if (g.status === 'ended' && g.winners.includes(uid)) you = check?.ok === false ? baseMsg(config, 'gwYouDisq') : baseMsg(config, 'gwYouWon');
  let myreq = '';
  if (hasReq(g)) {
    const res = await evaluate({ client: interaction.client, config, g, userId: uid });
    myreq = res.results.map(reqLine).join('\n');
  }
  // zaman çubuğu + sayısal şartları tamamlayanlar + en aktifler
  const now = Date.now(), total = Math.max(1, g.endsAt - g.createdAt);
  const percent = g.status === 'running' ? Math.min(100, Math.max(0, Math.round((now - g.createdAt) / total * 100))) : 100;
  const tv = { timeBar: bar(percent, 100, 12), percent: String(percent), ends: `<t:${unix(g.endsAt)}:R>`, endsfull: `<t:${unix(g.endsAt)}:f>`, endedfull: `<t:${unix(g.endedAt || g.endsAt)}:F>` };
  const progressLine = baseMsg(config, g.status === 'running' ? 'gwProgRunning' : g.status === 'ended' ? 'gwProgEnded' : 'gwProgCancelled', tv);
  const nums = numericReqs(g);
  const okCount = nums.length ? g.entries.filter(id => meets(g, id)).length : 0;
  const meeting = nums.length && g.entries.length ? `${okCount} / ${g.entries.length} (%${Math.round(okCount / g.entries.length * 100)})` : '';
  const medals = ['🥇', '🥈', '🥉'];
  const topList = nums.length ? [...g.entries].map(id => ({ id, s: scoreOf(g, id) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3) : [];
  const top = topList.map((x, i) => `${medals[i]} <@${x.id}> · ${progText(g, x.id)}`).join('\n');
  const guild = interaction.guild;
  const vars = tplVars(config, g, {
    state: baseMsg(config, g.status === 'running' ? 'gwStateRunning' : g.status === 'ended' ? 'gwStateEnded' : 'gwStateCancelled'),
    you, myrequirements: myreq, claimhours: String(config.giveaways.claimHours || '∞'), hostname: g.hostTag || '',
    servername: guild?.name || '', servericon: guild?.iconURL?.({ size: 256 }) || '', progressline: progressLine, timebar: tv.timeBar, percent: tv.percent,
    meeting, meetingcount: String(okCount), top,
  });
  const embed = templEmbed(config, g, vars, { titleKey: 'gwInfoTitle', descKey: 'gwInfoDesc', colorKey: 'gwInfoColor', authorKey: 'gwInfoAuthor', thumbKey: 'gwInfoThumb', imageKey: 'gwInfoImage', footerKey: 'gwInfoFooter', orderKey: 'gwInfoOrder', fields: INFO_FIELDS, defColor: config.colors.main });
  const row = new ActionRowBuilder().addComponents(...peopleRow(config, g), ...(g.url ? [jumpBtn(config, g.url)] : []));
  return interaction.editReply({ embeds: [embed], components: [row], content: '', allowedMentions: { parse: [] } });
}

// ---------- Katılımcı listesi: filtre, sıralama, sayfalar ----------
const PEOPLE_PER_PAGE = 10;
const FILTERS = ['all', 'ok', 'todo', 'win'], SORTS = ['join', 'active'];
const FILTER_KEY = { all: 'gwFilterAll', ok: 'gwFilterOk', todo: 'gwFilterTodo', win: 'gwFilterWin' }, SORT_KEY = { join: 'gwSortJoin', active: 'gwSortActive' };
function peoplePayload(interaction, config, g, { page = 0, filter = 'all', sort = 'join' }) {
  const nums = numericReqs(g);
  const filters = FILTERS.filter(f => (f === 'ok' || f === 'todo' ? nums.length > 0 : f === 'win' ? g.status === 'ended' : true));
  if (!filters.includes(filter)) filter = 'all';
  if (!SORTS.includes(sort)) sort = 'join';
  let rows = g.entries.map((id, i) => ({ id, i, ok: meets(g, id), win: g.winners.includes(id), score: scoreOf(g, id) }));
  if (filter === 'ok') rows = rows.filter(r => r.ok); else if (filter === 'todo') rows = rows.filter(r => !r.ok); else if (filter === 'win') rows = rows.filter(r => r.win);
  if (sort === 'active') rows.sort((a, b) => b.score - a.score || a.i - b.i);
  const pages = Math.max(1, Math.ceil(rows.length / PEOPLE_PER_PAGE));
  page = Math.min(Math.max(page, 0), pages - 1);
  const slice = rows.slice(page * PEOPLE_PER_PAGE, (page + 1) * PEOPLE_PER_PAGE);
  const okCount = nums.length ? g.entries.filter(id => meets(g, id)).length : 0;
  const mPct = g.entries.length ? Math.round(okCount / g.entries.length * 100) : 0;
  const meetingLine = nums.length ? baseMsg(config, 'gwPeopleMeeting', { meetingcount: String(okCount), meetingbar: bar(okCount, g.entries.length || 1, 10), meetingpercent: String(mPct) }) : '';
  const base = tplVars(config, g);
  const head = baseMsg(config, 'gwPeopleHead', { ...base, meetingline: meetingLine, filter: baseMsg(config, FILTER_KEY[filter]), sort: baseMsg(config, SORT_KEY[sort]) }).replace(/\n{3,}/g, '\n\n').trim();
  const lines = slice.map((r, k) => {
    const mark = r.win ? baseMsg(config, 'gwMarkWinner') : nums.length ? baseMsg(config, r.ok ? 'gwMarkOk' : 'gwMarkTodo') : '';
    return baseMsg(config, 'gwPeopleLine', { n: String(page * PEOPLE_PER_PAGE + k + 1), user: `<@${r.id}>`, mark, progress: nums.length ? progText(g, r.id) : '' }).split('\n').map(x => x.replace(/\s+$/u, '').replace(/^　$/u, '')).filter((x, idx, a) => x || idx === 0).join('\n').trim();
  });
  const empty = baseMsg(config, 'gwPeopleEmpty');
  const e = new EmbedBuilder().setColor(config.colors.main).setTitle(baseMsg(config, 'gwPeopleTitle', base).slice(0, 256))
    .setDescription(`${head}\n\n${lines.length ? lines.join('\n') : empty}`.slice(0, 4000))
    .setFooter({ text: `${baseMsg(config, 'gwPeopleFooter', { page: String(page + 1), pages: String(pages) })}${nums.length ? `\n${baseMsg(config, 'gwPeopleNote')}` : ''}`.slice(0, 2048) });
  const icon = interaction.guild?.iconURL?.({ size: 128 }); if (icon) e.setThumbnail(icon);
  const st = `${filter}:${sort}`;
  const navRow = new ActionRowBuilder().addComponents(
    navBtn(config, 'First', `gw-people:${g.id}:0:${st}:n1`, page <= 0), navBtn(config, 'Prev', `gw-people:${g.id}:${page - 1}:${st}:n2`, page <= 0),
    new ButtonBuilder().setCustomId(`gw-pg:${g.id}`).setLabel(`${page + 1} / ${pages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    navBtn(config, 'Next', `gw-people:${g.id}:${page + 1}:${st}:n3`, page >= pages - 1), navBtn(config, 'Last', `gw-people:${g.id}:${pages - 1}:${st}:n4`, page >= pages - 1),
  );
  const fSel = new StringSelectMenuBuilder().setCustomId(`gw-pf:${g.id}:${sort}`).setPlaceholder(baseMsg(config, 'gwFilterPh').slice(0, 100))
    .addOptions(filters.map(f => ({ label: baseMsg(config, FILTER_KEY[f]).slice(0, 100), value: f, default: f === filter })));
  const sSel = new StringSelectMenuBuilder().setCustomId(`gw-ps:${g.id}:${filter}`).setPlaceholder(baseMsg(config, 'gwSortPh').slice(0, 100))
    .addOptions(SORTS.map(s => ({ label: baseMsg(config, SORT_KEY[s]).slice(0, 100), value: s, default: s === sort })));
  const last = [gwBtn(config, 'info', `gw-info:${g.id}`), gwBtn(config, 'refresh', `gw-people:${g.id}:${page}:${st}:n5`)].filter(Boolean);
  const components = [navRow, new ActionRowBuilder().addComponents(fSel), new ActionRowBuilder().addComponents(sSel), ...(last.length ? [new ActionRowBuilder().addComponents(...last)] : [])];
  return { embeds: [e], components, content: '', allowedMentions: { parse: [] } };
}
async function handlePeople(interaction, config, rest) {
  const [gidPart, pageStr, filter = 'all', sort = 'join', nav] = String(rest || '').split(':');
  const g = get(gidPart || interaction.message.id) || get(interaction.message.id);
  if (!g) return replyPrivate(interaction, baseMsg(config, 'gwNotRunning', { user: `<@${interaction.user.id}>` }));
  if (String(nav || '').startsWith('n')) await interaction.deferUpdate().catch(() => null); else await interaction.deferReply({ ephemeral: true }).catch(() => null);
  return interaction.editReply(peoplePayload(interaction, config, g, { page: parseInt(pageStr, 10) || 0, filter, sort }));
}
// Filtre / sıralama menüleri
async function handlePeopleSelect(interaction, config) {
  const [kind, gid, other] = interaction.customId.split(':');
  const g = get(gid);
  if (!g) return replyPrivate(interaction, baseMsg(config, 'gwNotRunning', { user: `<@${interaction.user.id}>` }));
  const v = interaction.values?.[0];
  const st = kind === 'gw-pf' ? { filter: v, sort: other } : { filter: other, sort: v };
  return interaction.update(peoplePayload(interaction, config, g, { page: 0, ...st }));
}

// Panel / komut: çekilişin düzenleyenini ID ile değiştirir, Discord mesajlarını yeniler
async function refreshMain({ client, config, g }) {
  const ch = await fetchChannel(client, g.channelId);
  const msg = await ch?.messages?.fetch?.(g.id).catch(() => null);
  if (!msg) return;
  const embed = g.status === 'running' ? runningEmbed(config, g) : g.status === 'ended' ? endedEmbed(config, g) : cancelledEmbed(config, g);
  await msg.edit({ embeds: [embed] }).catch(() => null);
}
async function setHost({ client, config, id, hostId }) {
  const g = get(id);
  if (!g) return { error: baseMsg(config, 'gwNotRunning') };
  const u = await client.users.fetch(String(hostId || '').replace(/\D/g, '')).catch(() => null);
  if (!u) return { error: baseMsg(config, 'gwBadHost') };
  g.hostId = u.id; g.hostTag = u.username; save();
  await refreshMain({ client, config, g });
  await refreshResults({ client, config, g });
  return { giveaway: g };
}

// "Şartlarım": kişi şartları ne kadar yaptığını gizli olarak görür (5 sn bekleme)
const statusWait = new Map();
async function handleStatus(interaction, config) {
  const g = get(interaction.message.id);
  if (!g || g.status !== 'running') return replyPrivate(interaction, baseMsg(config, 'gwNotRunning'));
  if (!hasReq(g)) return replyPrivate(interaction, baseMsg(config, 'gwStatusNone', { user: `<@${interaction.user.id}>` }));
  const uid = interaction.user.id;
  if (Date.now() - (statusWait.get(uid) || 0) < 5000) return replyPrivate(interaction, baseMsg(config, 'gwStatusWait', { user: `<@${interaction.user.id}>` }));
  statusWait.set(uid, Date.now());
  if (statusWait.size > 2000) statusWait.clear();
  await interaction.deferReply({ ephemeral: true }).catch(() => null);
  const res = await evaluate({ client: interaction.client, config, g, userId: uid });
  const lines = res.results.map(reqLine);
  const e = new EmbedBuilder().setColor(res.ok ? config.colors.success : config.colors.warning).setTitle(baseMsg(config, 'gwStatusTitle').slice(0, 256))
    .setDescription(lines.join('\n').slice(0, 4000)).setFooter({ text: `ID: ${g.id} • ${config.brandName}` });
  return interaction.editReply({ embeds: [e], components: [], content: '', allowedMentions: { parse: [] } });
}

async function postResult({ client, config, g, ids, header }) {
  const ch = await fetchChannel(client, g.channelId);
  if (!ch?.send) return null;
  const embed = resultEmbed(config, g, ids);
  const content = `${header ? `${header}\n` : ''}${ids.map(id => `<@${id}>`).join(' ')}`.slice(0, 2000);
  const sent = await ch.send({ content, embeds: [embed], components: resultRow(config, g.id), allowedMentions: { users: ids } }).catch(() => null);
  if (sent) { g.resultMessageId = sent.id; g.resultUrl = sent.url; (g.results ||= []).push({ id: sent.id, ids: [...ids] }); }
  return sent;
}

// Sonuç mesajlarındaki şart durumu satırlarını günceller (örn. panelden kazanan düşürülünce)
async function refreshResults({ client, config, g }) {
  const ch = await fetchChannel(client, g.channelId);
  for (const r of g.results || []) {
    const msg = await ch?.messages?.fetch?.(r.id).catch(() => null);
    if (msg) await msg.edit({ embeds: [resultEmbed(config, g, r.ids)] }).catch(() => null);
  }
}

async function finish({ client, config, id }) {
  const g = get(id);
  if (!g || g.status !== 'running') return { error: baseMsg(config, 'gwNotRunning') };
  ensure(g);
  g.status = 'ended'; g.endedAt = Date.now();
  flushVoice(g);
  g.winners = pick(g.entries, g.winnersCount);
  for (const w of g.winners) { g.wonAt[w] = Date.now(); g.winnerTags[w] = await tagOf(client, w); await checkAndStore({ client, config, g, userId: w }); }
  save();
  const ch = await fetchChannel(client, g.channelId);
  const orig = await ch?.messages?.fetch?.(g.id).catch(() => null);
  if (orig) {
    const e = endedEmbed(config, g);
    await orig.edit({ embeds: [e], components: joinRow(config, true, g) }).catch(() => null);
  }
  if (!g.winners.length) { await ch?.send?.({ content: baseMsg(config, 'gwNoEntries'), allowedMentions: { parse: [] } }).catch(() => null); save(); return { giveaway: g }; }
  await postResult({ client, config, g, ids: g.winners });
  save();
  return { giveaway: g };
}

// Tekrar çek: daha önce çekilmiş (kazanan sayılmış) herkes havuzdan çıkar. Adet yazılmazsa
// şartı yapmadığı için düşen ve henüz yerine çekilmemiş kazanan sayısı kadar (en az 1) çekilir.
// Önceki geçerli kazananlar kendi sonuç mesajındaki "Ödülünü Al" butonunu kullanmaya devam eder.
async function reroll({ client, config, id, count }) {
  const g = get(id);
  if (!g || g.status !== 'ended') return { error: baseMsg(config, 'gwNotRunning') };
  ensure(g);
  const pending = g.winners.filter(w => g.checks[w]?.ok === false && !g.replaced[w]);
  const want = Number(count) > 0 ? Math.min(Number(count), 20) : Math.max(1, pending.length);
  const pool = g.entries.filter(u => !g.winners.includes(u));
  if (!pool.length) return { error: baseMsg(config, 'gwNoCandidates') };
  const fresh = pick(pool, want);
  for (const w of fresh) { g.winners.push(w); g.wonAt[w] = Date.now(); g.winnerTags[w] = await tagOf(client, w); await checkAndStore({ client, config, g, userId: w }); }
  for (const w of pending.slice(0, fresh.length)) g.replaced[w] = true;
  save();
  await postResult({ client, config, g, ids: fresh, header: baseMsg(config, 'gwRerolled', { winners: String(fresh.length) }) });
  save();
  return { giveaway: g, fresh };
}

async function cancel({ client, config, id }) {
  const g = get(id);
  if (!g || g.status !== 'running') return { error: baseMsg(config, 'gwNotRunning') };
  g.status = 'cancelled'; g.endedAt = Date.now(); save();
  const ch = await fetchChannel(client, g.channelId);
  const orig = await ch?.messages?.fetch?.(g.id).catch(() => null);
  if (orig) {
    const e = cancelledEmbed(config, g);
    await orig.edit({ embeds: [e], components: joinRow(config, true, g) }).catch(() => null);
  }
  return { giveaway: g };
}

function remove(id) { const g = get(id); if (!g) return false; delete data().items[id]; save(); return true; }

// "Ödülünü Al": sadece kazanan basabilir -> çekiliş kategorisinde ödül talebi (ticket) açılır
async function handleClaim(interaction, config, id) {
  const g = get(id);
  const mu = (k, v) => baseMsg(config, k, { user: `<@${interaction.user.id}>`, ...v });
  if (!g || g.status !== 'ended') return replyPrivate(interaction, mu('gwNotRunning'));
  if (!g.winners.includes(interaction.user.id)) return replyPrivate(interaction, mu('gwNotWinner'));
  const chk = g.checks?.[interaction.user.id];
  if (chk && chk.ok === false) return replyPrivate(interaction, mu('gwReqFailed', { missing: chk.failed.map(x => `• ${x}`).join('\n') }));
  const old = g.claims[interaction.user.id];
  if (old && interaction.guild.channels.cache.has(old)) return replyPrivate(interaction, mu('gwClaimExists', { channel: `<#${old}>` }));
  const hours = config.giveaways.claimHours;
  if (hours > 0 && Date.now() - (g.wonAt[interaction.user.id] || g.endedAt || 0) > hours * 3600 * 1000) return replyPrivate(interaction, mu('gwClaimExpired', { hours: String(hours) }));
  await interaction.deferReply({ ephemeral: true }).catch(() => null);
  const t = require('./tickets');
  const button = config.buttons.find(b => b.id === config.giveaways.categoryId) || config.buttons[0];
  if (!button) return replyPrivate(interaction, 'Çekiliş ödül kategorisi bulunamadı (Panel > Kategoriler).');
  const mm = (k, v) => baseMsg(config, k, { user: `<@${interaction.user.id}>`, prize: g.prize, ...v });
  const embed = new EmbedBuilder().setColor(config.colors.success).setTitle(mm('gwTicketTitle').slice(0, 256)).setDescription(mm('gwTicketText').slice(0, 4000))
    .addFields(
      { name: mm('gwFieldPrize'), value: g.prize.slice(0, 1000), inline: true },
      { name: mm('gwTicketGiveaway'), value: g.resultUrl || g.url ? `[ID: ${g.id}](${g.resultUrl || g.url})` : `ID: ${g.id}`, inline: true },
      { name: mm('gwTicketWon'), value: `<t:${unix(g.wonAt[interaction.user.id] || g.endedAt || Date.now())}:R>`, inline: true },
    );
  const res = await t.openTicket({ guild: interaction.guild, user: interaction.user, config, button, bypassLimit: true, extraEmbeds: [embed], extraRecord: { giveaway: { id: g.id, prize: g.prize, url: g.resultUrl || g.url || '' } } });
  if (res.error) return replyPrivate(interaction, res.error);
  g.claims[interaction.user.id] = res.channel.id; save();
  return replyPrivate(interaction, mu('gwClaimOpened', { channel: `${res.channel}` }));
}

async function handleReroll(interaction, config, id) {
  if (!isStaff(interaction.member, config)) return replyPrivate(interaction, baseMsg(config, 'gwStaffOnly'));
  await interaction.deferReply({ ephemeral: true }).catch(() => null);
  const res = await reroll({ client: interaction.client, config, id });
  return replyPrivate(interaction, res.error || baseMsg(config, 'gwRerolled', { winners: '1' }));
}

// Komutlar (yazıyla ve slash) ortak: metin döndürür
async function runCommand({ action, config, client, channel, member, user, rest, requirements, hostId }) {
  if (!config.giveaways.enabled) return { text: baseMsg(config, 'gwDisabled') };
  if (!isStaff(member, config)) return { text: baseMsg(config, 'gwStaffOnly') };
  const arg = String(rest || '').trim().split(/\s+/).filter(Boolean);
  const latest = () => list().find(g => g.channelId === channel.id && g.status === (action === 'greroll' ? 'ended' : 'running')) || list().find(g => g.status === (action === 'greroll' ? 'ended' : 'running'));
  const pickId = () => (arg[0] && /^\d{5,}$/.test(arg[0]) ? arg[0] : latest()?.id);
  switch (action) {
    case 'gstart': {
      const p = parseStart(rest, !requirements);
      if (!p) return { text: baseMsg(config, 'gwUsage', { usage: '.gstart <süre> <kazanan> <ödül>' }) };
      if (!p.ms) return { text: baseMsg(config, 'gwBadDuration') };
      const res = await start({ client, config, channel, hostId: hostId || p.host || config.giveaways.hostId || user.id, ms: p.ms, winners: p.winners, prize: p.prize, requirements: requirements ? cleanReq(requirements) : p.req });
      return { text: res.error || baseMsg(config, 'gwStarted', { url: res.url }) };
    }
    case 'gend': { const id = pickId(); if (!id) return { text: baseMsg(config, 'gwNotRunning') }; const r = await finish({ client, config, id }); return { text: r.error || '✅' }; }
    case 'greroll': { const id = pickId(); if (!id) return { text: baseMsg(config, 'gwNotRunning') }; const cnt = arg[arg[0] && /^\d{5,}$/.test(arg[0]) ? 1 : 0] || ''; const n = /^\d{1,2}$/.test(cnt) ? Number(cnt) : undefined; const r = await reroll({ client, config, id, count: n }); return { text: r.error || '✅' }; }
    case 'gcancel': { const id = pickId(); if (!id) return { text: baseMsg(config, 'gwNotRunning') }; const r = await cancel({ client, config, id }); return { text: r.error || baseMsg(config, 'gwCancelled') }; }
    case 'glist': {
      const rows = running();
      if (!rows.length) return { text: baseMsg(config, 'gwListEmpty') };
      return { text: rows.slice(0, 15).map(g => `**${g.prize}** · ID \`${g.id}\` · <#${g.channelId}> · ${g.entries.length} katılımcı · <t:${unix(g.endsAt)}:R>`).join('\n') };
    }
    default: return { text: '' };
  }
}

// Süresi dolan çekilişleri bitirir. Birden fazla bot kopyası çalışsa da biri işler (claimOnce).
let timer = null;
function startGiveawayWatcher(client) {
  if (timer) return;
  seedVoice(client);
  if (process.env.GUILD_MEMBERS_INTENT === 'true') for (const guild of client.guilds.cache.values()) cacheInvites(guild).catch(() => null);
  const tick = async () => {
    const { readConfig } = require('./config');
    const config = readConfig();
    for (const g of running()) {
      if (g.endsAt > Date.now()) continue;
      if (!(await db.claimOnce(`gwend:${g.id}`))) continue;
      await finish({ client, config, id: g.id }).catch(err => console.error('[ÇEKİLİŞ] bitirilemedi:', err.message));
    }
  };
  timer = setInterval(() => tick().catch(() => null), 15000);
  setTimeout(() => tick().catch(() => null), 3000);
}

// Panel: tek çekilişin tüm ayrıntısı (şart ilerlemeleri, kazananların şart sonucu, ödül talepleri, zaman çizelgesi)
function detail({ client, id }) {
  const g = get(id);
  if (!g) return null;
  const nameOf = uid => client.users.cache.get(uid)?.username || g.winnerTags?.[uid] || uid;
  const uids = new Set([...Object.keys(g.progress || {}), ...g.winners]);
  const people = [...uids].map(uid => ({
    id: uid, tag: nameOf(uid), joined: g.entries.includes(uid),
    messages: g.progress?.[uid]?.messages || 0, voiceMin: Math.floor(voiceMsOf(g, uid) / 60000), invites: g.progress?.[uid]?.invitedIds?.length || 0,
  })).sort((a, b) => (b.messages + b.voiceMin + b.invites * 10) - (a.messages + a.voiceMin + a.invites * 10)).slice(0, 50);
  return {
    ...view(g), createdAt: g.createdAt || 0, hostId: g.hostId, roleId: g.roleId || '', resultUrl: g.resultUrl || '', channelId: g.channelId,
    entriesSample: g.entries.slice(0, 100).map(u => ({ id: u, tag: nameOf(u) })),
    people,
    winnersDetail: g.winners.map(uid => ({
      id: uid, tag: g.winnerTags?.[uid] || nameOf(uid), wonAt: g.wonAt?.[uid] || 0, claimChannelId: g.claims?.[uid] || '',
      ok: g.checks?.[uid] ? g.checks[uid].ok : true, failed: g.checks?.[uid]?.failed || [], manual: Boolean(g.checks?.[uid]?.manual), replaced: Boolean(g.replaced?.[uid]),
    })),
  };
}

// Panel: yetkili bir kazananı elle düşürür / geri alır (şart sonucunu değiştirir)
async function override({ client, config, id, userId, ok, reason }) {
  const g = get(id);
  if (!g || g.status !== 'ended' || !g.winners.includes(userId)) return { error: 'Bu kişi bu çekilişin kazananı değil.' };
  ensure(g);
  g.checks[userId] = { ok: Boolean(ok), failed: ok ? [] : [String(reason || 'Yetkili tarafından düşürüldü').slice(0, 200)], at: Date.now(), manual: true };
  if (ok) delete g.replaced[userId];
  save();
  if (client && config) await refreshResults({ client, config, g });
  return { giveaway: g };
}

// Panel: bir kişinin şartlarının şu anki durumu
async function checkUser({ client, config, id, userId }) {
  const g = get(id);
  if (!g) return { error: 'Çekiliş bulunamadı.' };
  if (!hasReq(g)) return { results: [], ok: true };
  const res = await evaluate({ client, config, g, userId });
  return { ok: res.ok, results: res.results.map(x => ({ label: x.label, ok: x.ok, cur: x.cur, need: x.need })) };
}

// Siteye / panele giden sade görünüm
const view = g => ({
  id: g.id, prize: g.prize, status: g.status, winnersCount: g.winnersCount, entries: g.entries.length,
  endsAt: g.endsAt, endedAt: g.endedAt || 0, createdAt: g.createdAt || 0, hostTag: g.hostTag || '', channelId: g.channelId, url: g.url || '',
  requirements: g.requirements || null,
  winners: g.winners.map(id => ({ id, tag: g.winnerTags?.[id] || id, claimed: Boolean(g.claims?.[id]), disq: g.checks?.[id]?.ok === false, failed: g.checks?.[id]?.failed || [] })),
});

module.exports = { parseDuration, parseStart, cleanReq, hasReq, list, running, get, start, finish, reroll, cancel, remove, handleJoin, handleStatus, handleInfo, handlePeople, handlePeopleSelect, setHost, handleClaim, handleReroll, runCommand, startGiveawayWatcher, view, detail, override, checkUser, trackMessage, voiceUpdate, onMemberJoin, onMemberLeave, flush };
