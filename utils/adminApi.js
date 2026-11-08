const { ChannelType } = require('discord.js');
const { ConfigError, readConfig, writeConfig, getGuildId, parseTicket } = require('./config');
const store = require('./store');
const tickets = require('./tickets');
const { publishPanel } = require('./panel');
const { runDiagnostics } = require('./diagnostics');
const { resolveMediaUrl } = require('./media');
const { MESSAGE_DEFS, SITE_DEFS } = require('./messages');
const { ACTIONS, PERMISSIONS } = require('./commandDefs');

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function getGuild(client) {
  const id = getGuildId(readConfig());
  return (id && client.guilds.cache.get(id)) || client.guilds.cache.first() || null;
}

function needGuild(client) {
  const guild = client.isReady() ? getGuild(client) : null;
  if (!guild) throw new ApiError(503, 'Bot henüz bir sunucuya bağlı değil. Token ve sunucu ID\'sini kontrol et.');
  return guild;
}

// Canlı sayım: kanal konusundan okunur; bot hazır değilse kayıt dosyasına düşer.
function liveCounts(client) {
  const guild = client.isReady() ? getGuild(client) : null;
  const saved = store.stats();
  if (!guild) return { open: saved.open, closed: saved.closed, total: saved.total };
  let open = 0; let closed = 0;
  for (const ch of guild.channels.cache.values()) {
    const t = parseTicket(ch);
    if (!t) continue;
    if (t.status === 'open') open++; else closed++;
  }
  return { open, closed, total: Math.max(saved.total, open + closed) };
}

// Herkese açık site için: sadece zararsız bilgiler (kategori adları, panel yazısı, sayılar)
function publicStats(client) {
  const cfg = readConfig();
  const ready = client.isReady();
  const guild = ready ? getGuild(client) : null;
  const panelUrl = guild && cfg.panel.channelId ? `https://discord.com/channels/${guild.id}/${cfg.panel.channelId}` : '';
  return {
    ready,
    brand: cfg.brandName,
    bot: ready ? { tag: client.user.username, avatar: client.user.displayAvatarURL({ size: 128 }) } : null,
    guild: guild ? { name: guild.name, icon: guild.iconURL({ size: 128 }), members: guild.memberCount } : null,
    tickets: liveCounts(client),
    ping: ready ? Math.round(client.ws.ping) : null,
    uptime: Math.floor(process.uptime()),
    now: Date.now(),
    panelUrl,
    panel: {
      style: cfg.panel.style, placeholder: cfg.panel.placeholder, title: cfg.panel.title,
      description: cfg.panel.description, color: cfg.panel.color, footer: cfg.panel.footer,
    },
    site: cfg.site,
    categories: cfg.buttons.map(b => ({ id: b.id, label: b.label, emoji: b.emoji, description: b.description, color: b.color })),
  };
}

function findTicketChannel(client, channelId) {
  const guild = needGuild(client);
  const channel = guild.channels.cache.get(String(channelId || ''));
  if (!channel || !parseTicket(channel)) throw new ApiError(404, 'Ticket kanalı bulunamadı (silinmiş olabilir).');
  return channel;
}

const handlers = {
  'GET config': async () => readConfig(),

  'POST config': async (client, body) => {
    try {
      // Tenor/Giphy sayfa linklerini doğrudan GIF adresine çevir
      const data = body && typeof body === 'object' ? body : {};
      if (data.panel) {
        data.panel.imageUrl = await resolveMediaUrl(data.panel.imageUrl, 'Büyük görsel');
        data.panel.thumbnailUrl = await resolveMediaUrl(data.panel.thumbnailUrl, 'Küçük görsel');
      }
      if (data.ticketEmbed) {
        data.ticketEmbed.imageUrl = await resolveMediaUrl(data.ticketEmbed.imageUrl, 'Talep içi büyük görsel');
        data.ticketEmbed.thumbnailUrl = await resolveMediaUrl(data.ticketEmbed.thumbnailUrl, 'Talep içi küçük görsel');
      }
      return { ok: true, config: writeConfig(data), message: 'Ayarlar kaydedildi.' };
    }
    catch (err) { if (err instanceof ConfigError) throw new ApiError(400, err.message); throw err; }
  },

  // Mesajlar ve site yazılarının listesi (panelde otomatik form olarak çizilir)
  'GET schema': async () => ({
    messages: MESSAGE_DEFS, site: SITE_DEFS, actions: ACTIONS, permissions: PERMISSIONS,
    intentOn: process.env.MESSAGE_CONTENT_INTENT === 'true', // yazıyla komutlar için şart
  }),

  'GET meta': async client => {
    const guild = client.isReady() ? getGuild(client) : null;
    if (!guild) return { connected: false, channels: [], categories: [], roles: [] };
    const all = [...guild.channels.cache.values()];
    const byPos = (a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0);
    return {
      connected: true,
      guild: { id: guild.id, name: guild.name },
      channels: all.filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
        .sort(byPos).map(c => ({ id: c.id, name: c.name, parent: c.parent?.name || '' })),
      categories: all.filter(c => c.type === ChannelType.GuildCategory).sort(byPos).map(c => ({ id: c.id, name: c.name })),
      roles: [...guild.roles.cache.values()].filter(r => r.id !== guild.id && !r.managed)
        .sort((a, b) => b.position - a.position).map(r => ({ id: r.id, name: r.name, color: r.hexColor })),
    };
  },

  // Kurulum kontrol listesi: bot bağlı mı, izinler tam mı, panel gönderildi mi...
  'GET diagnostics': async client => {
    const guild = client.isReady() ? getGuild(client) : null;
    return runDiagnostics({ client, guild, config: readConfig() });
  },

  'GET tickets': async client => {
    const guild = client.isReady() ? getGuild(client) : null;
    const rated = store.list().filter(t => t.rating);
    return {
      counts: { ...liveCounts(client), ratings: rated.length, ratingAvg: rated.length ? Math.round(rated.reduce((a, t) => a + t.rating, 0) / rated.length * 10) / 10 : 0 },
      tickets: store.list().slice(0, 200).map(t => {
        const channel = guild?.channels.cache.get(t.channelId);
        return { ...t, exists: Boolean(channel), channelName: channel?.name || '' };
      }),
    };
  },

  'POST panel/publish': async client => {
    const guild = needGuild(client);
    try {
      const { channel, updated, url } = await publishPanel(guild, readConfig());
      return { ok: true, url, message: `Panel #${channel.name} kanalında ${updated ? 'güncellendi' : 'yayınlandı'}.` };
    } catch (err) { throw new ApiError(400, err.message); }
  },

  'POST tickets/close': async (client, body) => {
    const channel = findTicketChannel(client, body.channelId);
    const res = await tickets.closeTicket({ channel, config: readConfig(), actor: tickets.PANEL_ACTOR, reason: String(body.reason || 'Web panelinden kapatıldı') });
    if (res.error) throw new ApiError(400, res.error);
    return { ok: true, message: 'Ticket kapatıldı.' };
  },

  'POST tickets/reopen': async (client, body) => {
    const channel = findTicketChannel(client, body.channelId);
    const res = await tickets.reopenTicket({ channel, config: readConfig(), actor: tickets.PANEL_ACTOR });
    if (res.error) throw new ApiError(400, res.error);
    return { ok: true, message: 'Ticket yeniden açıldı.' };
  },

  'POST tickets/delete': async (client, body) => {
    const channel = findTicketChannel(client, body.channelId);
    // silme gecikmeli olduğu için beklemeden cevap veriyoruz
    tickets.deleteTicket({ channel, config: readConfig(), actor: tickets.PANEL_ACTOR, reason: 'Web panelinden silindi' })
      .catch(err => console.error('[PANEL] ticket silinemedi:', err.message));
    return { ok: true, message: 'Ticket siliniyor; transcript log kanalına gönderilecek.' };
  },
};

module.exports = { ApiError, handlers, publicStats };
