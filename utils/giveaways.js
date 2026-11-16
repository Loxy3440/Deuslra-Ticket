const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
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

// ".gstart 1h 3 Ödül adı" -> { ms, winners, prize }
function parseStart(rest) {
  const parts = String(rest || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const ms = parseDuration(parts[0]);
  let winners = 1, from = 1;
  if (parts.length > 2 && /^\d{1,2}$/.test(parts[1])) { winners = Number(parts[1]); from = 2; }
  const prize = parts.slice(from).join(' ').slice(0, 200);
  if (!prize) return null;
  return { ms, winners: Math.min(Math.max(winners, 1), 20), prize };
}

const mentionList = ids => ids.map(id => `• <@${id}>`).join('\n');
function pick(pool, n) {
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
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
  return e;
}
const joinRow = (config, disabled = false) => [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('gw-join').setLabel(baseMsg(config, 'gwJoinBtn').slice(0, 80)).setEmoji('🎉').setStyle(ButtonStyle.Primary).setDisabled(disabled),
)];
const resultRow = (config, id) => [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`gw-claim:${id}`).setLabel(baseMsg(config, 'gwClaimBtn').slice(0, 80)).setEmoji('🎁').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId(`gw-reroll:${id}`).setLabel(baseMsg(config, 'gwRerollBtn').slice(0, 80)).setEmoji('🔔').setStyle(ButtonStyle.Secondary),
)];

async function fetchChannel(client, id) { return client.channels.cache.get(id) || (await client.channels.fetch(id).catch(() => null)); }
async function tagOf(client, id) { return (await client.users.fetch(id).catch(() => null))?.username || id; }

async function start({ client, config, channel, hostId, ms, winners, prize, roleId }) {
  if (!config.giveaways.enabled) return { error: baseMsg(config, 'gwDisabled') };
  if (ms < MIN_MS || ms > MAX_MS) return { error: baseMsg(config, 'gwBadDuration') };
  if (!channel?.send) return { error: 'Kanal bulunamadı.' };
  const g = { id: '', channelId: channel.id, guildId: channel.guild?.id || '', prize, winnersCount: winners, hostId, hostTag: await tagOf(client, hostId), roleId: roleId || '', endsAt: Date.now() + ms, createdAt: Date.now(), status: 'running', entries: [], winners: [], winnerTags: {}, wonAt: {}, claims: {} };
  const sent = await channel.send({ embeds: [runningEmbed(config, g)], components: joinRow(config) }).catch(err => ({ err }));
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

async function postResult({ client, config, g, ids, header }) {
  const ch = await fetchChannel(client, g.channelId);
  if (!ch?.send) return null;
  const m = (k, v) => baseMsg(config, k, v);
  const body = [`${m('gwResultPrize')} \`${g.prize}\``, m('gwResultWinners'), mentionList(ids), '', m('gwResultText', { claimbtn: m('gwClaimBtn'), prize: g.prize })].join('\n');
  const embed = new EmbedBuilder().setColor(config.colors.success).setTitle(m('gwResultTitle').slice(0, 256)).setDescription(body.slice(0, 4000))
    .setFooter({ text: `ID: ${g.id} • ${config.brandName} • ${m('gwResultFooter')}` });
  const content = `${header ? `${header}\n` : ''}${ids.map(id => `<@${id}>`).join(' ')}`.slice(0, 2000);
  const sent = await ch.send({ content, embeds: [embed], components: resultRow(config, g.id), allowedMentions: { users: ids } }).catch(() => null);
  if (sent) { g.resultMessageId = sent.id; g.resultUrl = sent.url; }
  return sent;
}

async function finish({ client, config, id }) {
  const g = get(id);
  if (!g || g.status !== 'running') return { error: baseMsg(config, 'gwNotRunning') };
  g.status = 'ended'; g.endedAt = Date.now();
  g.winners = pick(g.entries, g.winnersCount);
  for (const w of g.winners) { g.wonAt[w] = Date.now(); g.winnerTags[w] = await tagOf(client, w); }
  save();
  const ch = await fetchChannel(client, g.channelId);
  const orig = await ch?.messages?.fetch?.(g.id).catch(() => null);
  if (orig) {
    const e = EmbedBuilder.from(runningEmbed(config, g)).setColor(config.colors.warning).setTitle(`${baseMsg(config, 'gwEndedTitle')} · ${g.prize}`.slice(0, 256))
      .setDescription(g.winners.length ? mentionList(g.winners) : baseMsg(config, 'gwNoEntries'));
    await orig.edit({ embeds: [e], components: joinRow(config, true) }).catch(() => null);
  }
  if (!g.winners.length) { await ch?.send?.({ content: baseMsg(config, 'gwNoEntries'), allowedMentions: { parse: [] } }).catch(() => null); save(); return { giveaway: g }; }
  await postResult({ client, config, g, ids: g.winners });
  save();
  return { giveaway: g };
}

async function reroll({ client, config, id, count = 1 }) {
  const g = get(id);
  if (!g || g.status !== 'ended') return { error: baseMsg(config, 'gwNotRunning') };
  const pool = g.entries.filter(u => !g.winners.includes(u));
  if (!pool.length) return { error: baseMsg(config, 'gwNoCandidates') };
  const fresh = pick(pool, Math.min(Math.max(Number(count) || 1, 1), 20));
  for (const w of fresh) { g.winners.push(w); g.wonAt[w] = Date.now(); g.winnerTags[w] = await tagOf(client, w); }
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
    await orig.edit({ embeds: [e], components: joinRow(config, true) }).catch(() => null);
  }
  return { giveaway: g };
}

function remove(id) { const g = get(id); if (!g) return false; delete data().items[id]; save(); return true; }

// "Ödülünü Al": sadece kazanan basabilir -> çekiliş kategorisinde ödül talebi (ticket) açılır
async function handleClaim(interaction, config, id) {
  const g = get(id);
  if (!g || g.status !== 'ended') return replyPrivate(interaction, baseMsg(config, 'gwNotRunning'));
  if (!g.winners.includes(interaction.user.id)) return replyPrivate(interaction, baseMsg(config, 'gwNotWinner'));
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
async function runCommand({ action, config, client, channel, member, user, rest }) {
  if (!config.giveaways.enabled) return { text: baseMsg(config, 'gwDisabled') };
  if (!isStaff(member, config)) return { text: baseMsg(config, 'gwStaffOnly') };
  const arg = String(rest || '').trim().split(/\s+/).filter(Boolean);
  const latest = () => list().find(g => g.channelId === channel.id && g.status === (action === 'greroll' ? 'ended' : 'running')) || list().find(g => g.status === (action === 'greroll' ? 'ended' : 'running'));
  const pickId = () => (arg[0] && /^\d{5,}$/.test(arg[0]) ? arg[0] : latest()?.id);
  switch (action) {
    case 'gstart': {
      const p = parseStart(rest);
      if (!p) return { text: baseMsg(config, 'gwUsage', { usage: '.gstart <süre> <kazanan> <ödül>' }) };
      if (!p.ms) return { text: baseMsg(config, 'gwBadDuration') };
      const res = await start({ client, config, channel, hostId: user.id, ms: p.ms, winners: p.winners, prize: p.prize });
      return { text: res.error || baseMsg(config, 'gwStarted', { url: res.url }) };
    }
    case 'gend': { const id = pickId(); if (!id) return { text: baseMsg(config, 'gwNotRunning') }; const r = await finish({ client, config, id }); return { text: r.error || '✅' }; }
    case 'greroll': { const id = pickId(); if (!id) return { text: baseMsg(config, 'gwNotRunning') }; const n = /^\d{1,2}$/.test(arg[arg[0] && /^\d{5,}$/.test(arg[0]) ? 1 : 0] || '') ? Number(arg[arg[0] && /^\d{5,}$/.test(arg[0]) ? 1 : 0]) : 1; const r = await reroll({ client, config, id, count: n }); return { text: r.error || '✅' }; }
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
  winners: g.winners.map(id => ({ id, tag: g.winnerTags?.[id] || id, claimed: Boolean(g.claims?.[id]) })),
});

module.exports = { parseDuration, parseStart, list, running, get, start, finish, reroll, cancel, remove, handleJoin, handleClaim, handleReroll, runCommand, startGiveawayWatcher, view };
