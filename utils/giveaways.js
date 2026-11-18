const { ActionRowBuilder, ActivityType, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
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
  const req = bar >= 0 ? parseReqFlags(raw.slice(bar + 1)) : emptyReq();
  const parts = head.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const ms = parseDuration(parts[0]);
  let winners = 1, from = 1;
  if (parts.length > 2 && /^\d{1,2}$/.test(parts[1])) { winners = Number(parts[1]); from = 2; }
  const prize = parts.slice(from).join(' ').slice(0, 200);
  if (!prize) return null;
  return { ms, winners: Math.min(Math.max(winners, 1), 20), prize, req };
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

function runningEmbed(config, g) {
  const m = k => baseMsg(config, k);
  const e = new EmbedBuilder().setColor(config.colors.main)
    .setTitle(`${m('gwRunningTitle')} · ${g.prize}`.slice(0, 256))
    .setDescription(m('gwRunningText'))
    .addFields(
      { name: m('gwFieldPrize'), value: g.prize.slice(0, 1000), inline: true },
      { name: m('gwFieldWinners'), value: String(g.winnersCount), inline: true },
      { name: m('gwFieldEnds'), value: `<t:${unix(g.endsAt)}:R> (<t:${unix(g.endsAt)}:f>)`, inline: true },
      { name: m('gwFieldHost'), value: `<@${g.hostId}>`, inline: true },
      { name: m('gwFieldEntries'), value: String(g.entries.length), inline: true },
    )
    .setFooter({ text: `ID: ${g.id} • ${config.brandName}` });
  if (g.roleId) e.addFields({ name: m('gwFieldRole'), value: `<@&${g.roleId}>`, inline: true });
  if (hasReq(g)) e.addFields({ name: m('gwFieldReqs'), value: reqItems(config, g).map(x => `• ${x.label}`).join('\n').slice(0, 1000) });
  return e;
}
const joinRow = (config, disabled = false, g = null) => {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('gw-join').setLabel(baseMsg(config, 'gwJoinBtn').slice(0, 80)).setEmoji('<:giveaway:1568552724457586739> ').setStyle(ButtonStyle.Primary).setDisabled(disabled),
  );
  if (g && hasReq(g)) row.addComponents(new ButtonBuilder().setCustomId('gw-status').setLabel(baseMsg(config, 'gwStatusBtn').slice(0, 80)).setEmoji('<:ruless:1568552732502269982> ').setStyle(ButtonStyle.Secondary).setDisabled(disabled));
  return [row];
};
const resultRow = (config, id) => [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`gw-claim:${id}`).setLabel(baseMsg(config, 'gwClaimBtn').slice(0, 80)).setEmoji('<:giveaway:1568552724457586739> ').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId(`gw-reroll:${id}`).setLabel(baseMsg(config, 'gwRerollBtn').slice(0, 80)).setEmoji('<:refreshh:1572617938014576760>').setStyle(ButtonStyle.Secondary),
)];

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
  const g = { id: '', channelId: channel.id, guildId: channel.guild?.id || '', prize, winnersCount: winners, hostId, hostTag: await tagOf(client, hostId), roleId: roleId || '', endsAt: Date.now() + ms, createdAt: Date.now(), status: 'running', entries: [], winners: [], winnerTags: {}, wonAt: {}, claims: {}, requirements: req, progress: {}, checks: {}, replaced: {} };
  const sent = await channel.send({ embeds: [runningEmbed(config, g)], components: joinRow(config, false, g) }).catch(err => ({ err }));
  if (!sent || sent.err) return { error: `Çekiliş mesajı gönderilemedi: ${sent?.err?.message || 'bilinmeyen hata'}` };
  g.id = sent.id;
  data().items[g.id] = g; save();
  await sent.edit({ embeds: [runningEmbed(config, g)] }).catch(() => null); // ID'yi alt yazıya işle
  g.url = sent.url; save();
  return { giveaway: g, url: sent.url };
}

// Katıl butonu: bas = katıl, tekrar bas = ayrıl
const editTimers = new Map();
async function handleJoin(interaction, config) {
  const g = get(interaction.message.id);
  if (!g || g.status !== 'running') return replyPrivate(interaction, baseMsg(config, 'gwNotRunning'));
  if (g.roleId && !interaction.member?.roles?.cache?.has(g.roleId)) return replyPrivate(interaction, baseMsg(config, 'gwNeedRole', { role: `<@&${g.roleId}>` }));
  const i = g.entries.indexOf(interaction.user.id);
  if (i >= 0) g.entries.splice(i, 1); else g.entries.push(interaction.user.id);
  save();
  const note = replyPrivate(interaction, baseMsg(config, i >= 0 ? 'gwLeft' : 'gwJoined'));
  clearTimeout(editTimers.get(g.id)); // çok katılım olunca mesajı her seferinde değil, 3 sn sonra bir kez güncelle
  editTimers.set(g.id, setTimeout(() => { editTimers.delete(g.id); interaction.message.edit({ embeds: [runningEmbed(config, g)] }).catch(() => null); }, 3000));
  return note;
}

// "Şartlarım": kişi şartları ne kadar yaptığını gizli olarak görür (5 sn bekleme)
const statusWait = new Map();
async function handleStatus(interaction, config) {
  const g = get(interaction.message.id);
  if (!g || g.status !== 'running') return replyPrivate(interaction, baseMsg(config, 'gwNotRunning'));
  if (!hasReq(g)) return replyPrivate(interaction, baseMsg(config, 'gwStatusNone'));
  const uid = interaction.user.id;
  if (Date.now() - (statusWait.get(uid) || 0) < 5000) return replyPrivate(interaction, baseMsg(config, 'gwStatusWait'));
  statusWait.set(uid, Date.now());
  if (statusWait.size > 2000) statusWait.clear();
  await interaction.deferReply({ ephemeral: true }).catch(() => null);
  const res = await evaluate({ client: interaction.client, config, g, userId: uid });
  const lines = res.results.map(x => `${x.ok ? '✅' : '❌'} ${x.label}${x.need ? ` (${x.cur}/${x.need})` : ''}`);
  const e = new EmbedBuilder().setColor(res.ok ? config.colors.success : config.colors.warning).setTitle(baseMsg(config, 'gwStatusTitle').slice(0, 256))
    .setDescription(lines.join('\n').slice(0, 4000)).setFooter({ text: `ID: ${g.id} • ${config.brandName}` });
  return interaction.editReply({ embeds: [e], components: [], content: '', allowedMentions: { parse: [] } });
}

async function postResult({ client, config, g, ids, header }) {
  const ch = await fetchChannel(client, g.channelId);
  if (!ch?.send) return null;
  const m = (k, v) => baseMsg(config, k, v);
  const body = [`${m('gwResultPrize')} \`${g.prize}\``, m('gwResultWinners'), mentionList(ids), '', m('gwResultText', { claimbtn: m('gwClaimBtn'), prize: g.prize })].join('\n');
  const embed = new EmbedBuilder().setColor(config.colors.success).setTitle(m('gwResultTitle').slice(0, 256)).setDescription(body.slice(0, 4000))
    .setFooter({ text: `ID: ${g.id} • ${config.brandName} • ${m('gwResultFooter')}` });
  if (hasReq(g)) embed.addFields({ name: m('gwFieldReqs'), value: `${reqItems(config, g).map(x => `• ${x.label}`).join('\n')}\n\n${m('gwResultReqNote')}`.slice(0, 1000) });
  const content = `${header ? `${header}\n` : ''}${ids.map(id => `<@${id}>`).join(' ')}`.slice(0, 2000);
  const sent = await ch.send({ content, embeds: [embed], components: resultRow(config, g.id), allowedMentions: { users: ids } }).catch(() => null);
  if (sent) { g.resultMessageId = sent.id; g.resultUrl = sent.url; }
  return sent;
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
    const e = EmbedBuilder.from(runningEmbed(config, g)).setColor(config.colors.warning).setTitle(`${baseMsg(config, 'gwEndedTitle')} · ${g.prize}`.slice(0, 256))
      .setDescription(g.winners.length ? mentionList(g.winners) : baseMsg(config, 'gwNoEntries'));
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
    const e = EmbedBuilder.from(runningEmbed(config, g)).setColor(config.colors.danger || config.colors.warning).setTitle(`${baseMsg(config, 'gwCancelledTitle')} · ${g.prize}`.slice(0, 256));
    await orig.edit({ embeds: [e], components: joinRow(config, true, g) }).catch(() => null);
  }
  return { giveaway: g };
}

function remove(id) { const g = get(id); if (!g) return false; delete data().items[id]; save(); return true; }

// "Ödülünü Al": sadece kazanan basabilir -> çekiliş kategorisinde ödül talebi (ticket) açılır
async function handleClaim(interaction, config, id) {
  const g = get(id);
  if (!g || g.status !== 'ended') return replyPrivate(interaction, baseMsg(config, 'gwNotRunning'));
  if (!g.winners.includes(interaction.user.id)) return replyPrivate(interaction, baseMsg(config, 'gwNotWinner'));
  const chk = g.checks?.[interaction.user.id];
  if (chk && chk.ok === false) return replyPrivate(interaction, baseMsg(config, 'gwReqFailed', { missing: chk.failed.map(x => `• ${x}`).join('\n') }));
  const old = g.claims[interaction.user.id];
  if (old && interaction.guild.channels.cache.has(old)) return replyPrivate(interaction, baseMsg(config, 'gwClaimExists', { channel: `<#${old}>` }));
  const hours = config.giveaways.claimHours;
  if (hours > 0 && Date.now() - (g.wonAt[interaction.user.id] || g.endedAt || 0) > hours * 3600 * 1000) return replyPrivate(interaction, baseMsg(config, 'gwClaimExpired', { hours: String(hours) }));
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
  return replyPrivate(interaction, baseMsg(config, 'gwClaimOpened', { channel: `${res.channel}` }));
}

async function handleReroll(interaction, config, id) {
  if (!isStaff(interaction.member, config)) return replyPrivate(interaction, baseMsg(config, 'gwStaffOnly'));
  await interaction.deferReply({ ephemeral: true }).catch(() => null);
  const res = await reroll({ client: interaction.client, config, id });
  return replyPrivate(interaction, res.error || baseMsg(config, 'gwRerolled', { winners: '1' }));
}

// Komutlar (yazıyla ve slash) ortak: metin döndürür
async function runCommand({ action, config, client, channel, member, user, rest, requirements }) {
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
      const res = await start({ client, config, channel, hostId: user.id, ms: p.ms, winners: p.winners, prize: p.prize, requirements: requirements ? cleanReq(requirements) : p.req });
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

// Siteye / panele giden sade görünüm
const view = g => ({
  id: g.id, prize: g.prize, status: g.status, winnersCount: g.winnersCount, entries: g.entries.length,
  endsAt: g.endsAt, endedAt: g.endedAt || 0, hostTag: g.hostTag || '', channelId: g.channelId, url: g.url || '',
  requirements: g.requirements || null,
  winners: g.winners.map(id => ({ id, tag: g.winnerTags?.[id] || id, claimed: Boolean(g.claims?.[id]), disq: g.checks?.[id]?.ok === false, failed: g.checks?.[id]?.failed || [] })),
});

module.exports = { parseDuration, parseStart, cleanReq, hasReq, list, running, get, start, finish, reroll, cancel, remove, handleJoin, handleStatus, handleClaim, handleReroll, runCommand, startGiveawayWatcher, view, trackMessage, voiceUpdate, onMemberJoin, onMemberLeave, flush };
