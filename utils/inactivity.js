const { ChannelType } = require('discord.js');
const { readConfig, parseTicket, getGuildId } = require('./config');
const { msg } = require('./messages');
const { ticketVars } = require('./variables');
const t = require('./tickets');

// Hareketsiz ticket takibi: son mesajdan "uyarı süresi" geçince uyarır, uyarıdan sonra "kapatma süresi" içinde
// yazışma olmazsa otomatik kapatır. Son mesaj REST ile okunur, bu yüzden ek bir intent gerekmez.
const warned = new Map(); // kanal ID -> { id: uyarı mesajı ID, at: zaman }
const HOUR = 3600 * 1000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const snowflakeTime = id => Number((BigInt(id) >> 22n) + 1420070400000n);

async function checkChannel(client, channel, config, now) {
  const ticket = parseTicket(channel);
  if (!ticket || ticket.status !== 'open') { warned.delete(channel.id); return; }
  const last = (await channel.messages.fetch({ limit: 1 }).catch(() => null))?.first();
  const lastAt = last ? snowflakeTime(last.id) : snowflakeTime(channel.id);
  const w = warned.get(channel.id);

  if (w && last && last.id === w.id) {
    if (now - w.at >= config.settings.inactivityCloseHours * HOUR) {
      warned.delete(channel.id);
      const actor = { id: client.user.id, label: client.user.username, mention: `<@${client.user.id}>` };
      await t.closeTicket({ channel, config, actor, reason: msg(config, 'inactivityReason') });
    }
    return;
  }
  if (w) warned.delete(channel.id); // yazışma olmuş, sayaç sıfırlanır
  if (now - lastAt >= config.settings.inactivityWarnHours * HOUR) {
    const sent = await channel.send({
      content: msg(config, 'inactivityWarn', { ...ticketVars(config, { channel }), hours: String(config.settings.inactivityCloseHours) }),
      allowedMentions: ticket.ownerId ? { users: [ticket.ownerId] } : { parse: [] },
    }).catch(() => null);
    if (sent) warned.set(channel.id, { id: sent.id, at: now });
  }
}

async function sweep(client) {
  const config = readConfig();
  if (!config.settings.inactivityEnabled || !client.isReady()) return;
  const guild = client.guilds.cache.get(getGuildId(config)) || client.guilds.cache.first();
  if (!guild) return;
  const now = Date.now();
  for (const channel of [...guild.channels.cache.values()]) {
    if (channel.type !== ChannelType.GuildText) continue;
    try { await checkChannel(client, channel, config, now); } catch (err) { console.error('[HAREKETSİZ]', err.message); }
    await sleep(300);
  }
}

function startInactivityWatcher(client) {
  setTimeout(() => sweep(client), 60 * 1000);
  setInterval(() => sweep(client), 10 * 60 * 1000);
}

module.exports = { startInactivityWatcher, checkChannel, warned };
