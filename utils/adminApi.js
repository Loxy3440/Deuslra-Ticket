const { ChannelType } = require('discord.js');
const { ConfigError, readConfig, writeConfig, getGuildId, parseTicket } = require('./config');
const store = require('./store');
const tickets = require('./tickets');
const { publishPanel } = require('./panel');
const { runDiagnostics } = require('./diagnostics');
const { resolveMediaUrl } = require('./media');
const { MESSAGE_DEFS, SITE_DEFS } = require('./messages');
const { ACTIONS, PERMISSIONS } = require('./commandDefs');
const { VAR_DOCS } = require('./variables');

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

const TRZ = 'Europe/Istanbul';
const hourOf = ms => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TRZ, hour: '2-digit', hour12: false }).format(new Date(ms))) % 24;
const dayKey = ms => new Intl.DateTimeFormat('en-CA', { timeZone: TRZ }).format(new Date(ms)); // YYYY-MM-DD
const weekdayOf = ms => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone: TRZ, weekday: 'short' }).format(new Date(ms)));
const avg = a => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : 0);

function computeStats(all) {
  const recs = all.filter(t => t.status !== 'deleted' || t.createdAt);
  const closed = recs.filter(t => t.closedAt && t.createdAt && t.closedAt >= t.createdAt);
  const rated = recs.filter(t => t.rating);
  const res = t => (t.closedAt - t.createdAt) / 60000; // dakika
  const group = (keyFn, labelFn) => {
    const m = new Map();
    for (const t of recs) { const k = keyFn(t); if (!k) continue; (m.get(k) || m.set(k, { label: labelFn(t), items: [] }).get(k)).items.push(t); }
    return [...m.values()].map(({ label, items }) => {
      const c = items.filter(t => t.closedAt && t.createdAt);
      return { label, count: items.length, closed: c.length, avgResolutionMin: Math.round(avg(c.map(res))), avgRating: avg(items.filter(t => t.rating).map(t => t.rating)), ratings: items.filter(t => t.rating).length };
    }).sort((a, b) => b.count - a.count);
  };
  const today = Date.now();
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(dayKey(today - i * 86400000));
  const opened = Object.fromEntries(days.map(d => [d, 0])); const closedBy = { ...opened };
  const byHour = Array(24).fill(0); const byWeekday = Array(7).fill(0); // Pzt..Paz
  for (const t of recs) {
    if (!t.createdAt) continue;
    byHour[hourOf(t.createdAt)]++;
    byWeekday[(weekdayOf(t.createdAt) + 6) % 7]++;
    const d = dayKey(t.createdAt); if (d in opened) opened[d]++;
    if (t.closedAt) { const c = dayKey(t.closedAt); if (c in closedBy) closedBy[c]++; }
  }
  return {
    total: recs.length,
    open: recs.filter(t => t.status === 'open').length,
    closed: recs.filter(t => t.status === 'closed').length,
    avgRating: avg(rated.map(t => t.rating)), ratings: rated.length,
    ratingDist: [1, 2, 3, 4, 5].map(n => rated.filter(t => t.rating === n).length),
    avgResolutionMin: Math.round(avg(closed.map(res))),
    byStaff: group(t => t.claimedBy, t => t.claimedByTag || t.claimedBy),
    byCategory: group(t => t.buttonId || t.buttonLabel, t => t.buttonLabel || t.buttonId),
    unclaimed: recs.filter(t => t.status === 'open' && !t.claimedBy).length,
    byHour, byWeekday,
    daily: days.map(d => ({ day: d, opened: opened[d], closed: closedBy[d] })),
  };
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
    messages: MESSAGE_DEFS, site: SITE_DEFS, vars: VAR_DOCS, actions: ACTIONS, permissions: PERMISSIONS,
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
      tickets: store.list().slice(0, 1000).map(t => {
        const channel = guild?.channels.cache.get(t.channelId);
        const { transcriptKey, ...rest } = t;
        return { ...rest, exists: Boolean(channel), channelName: channel?.name || '', hasTranscript: Boolean(transcriptKey), notes: (t.notes || []).slice(-20) };
      }),
      panelTranscript: readConfig().settings.panelTranscriptDownload,
    };
  },

  // Yetkili notu panelden ekle (kullanıcı görmez; kayda ve log kanalına yazılır)
  'POST tickets/note': async (client, body) => {
    const text = String(body.text || '').trim().slice(0, 500);
    if (!text) throw new ApiError(400, 'Not boş olamaz.');
    const rec = store.get(String(body.channelId || ''));
    if (!rec) throw new ApiError(404, 'Ticket kaydı bulunamadı.');
    store.upsert(rec.channelId, { notes: [...(rec.notes || []), { by: 'Web paneli', byId: '', text, at: Date.now() }].slice(-50) });
    return { ok: true, message: 'Not eklendi.' };
  },

  // İstatistikler (kayıtlı ticketlardan hesaplanır)
  'GET stats': async () => computeStats(store.list()),

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

module.exports = { ApiError, handlers, publicStats, computeStats };
