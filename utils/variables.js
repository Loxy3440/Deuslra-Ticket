// Yazılarda kullanılabilen {değişkenler}. Hepsi büyük/küçük harfe duyarsızdır: {User} = {user}.
// Bilinmeyen bir değişken olduğu gibi kalır. Panelde "Bot mesajları" sekmesinin en üstünde listelenir.
// Bu dosya başka dosyaları en tepede yüklemez (döngüyü önlemek için); gerekenler fonksiyon içinde yüklenir.

const TZ = 'Europe/Istanbul';
let clientRef = null;
const setClient = c => { clientRef = c; };

const NONE = '—';
const pad = n => String(n || 0).padStart(4, '0');
const unix = ms => Math.floor(ms / 1000);

function parts(date = new Date()) {
  const f = (opts) => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, ...opts }).format(date);
  return {
    date: f({ day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: f({ hour: '2-digit', minute: '2-digit', hour12: false }),
    day: f({ weekday: 'long' }),
    month: f({ month: 'long' }),
    year: f({ year: 'numeric' }),
    hour: Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(date)) % 24,
  };
}

function greetingFor(hour) {
  if (hour >= 5 && hour < 12) return 'Günaydın';
  if (hour >= 12 && hour < 18) return 'İyi günler';
  if (hour >= 18 && hour < 23) return 'İyi akşamlar';
  return 'İyi geceler';
}

// Her yazıda otomatik kullanılabilenler (sunucu, marka, tarih/saat, sayılar)
function globalVars(config) {
  const now = new Date();
  const p = parts(now);
  const ws = require('./hours').workStatus(config, now);
  const guild = clientRef?.isReady?.() ? (clientRef.guilds.cache.get(config?.guildId || process.env.DISCORD_GUILD_ID) || clientRef.guilds.cache.first()) : null;
  let counts = { open: 0, total: 0 };
  try { const s = require('./store').stats(); counts = { open: s.open, total: s.total }; } catch { /* kayıt yoksa 0 */ }
  return {
    brand: config?.brandName || '',
    prefix: config?.commands?.prefix || '.',
    server: guild?.name || '',
    serverid: guild?.id || '',
    membercount: guild ? String(guild.memberCount) : '',
    botname: clientRef?.user?.username || '',
    opentickets: String(counts.open),
    totaltickets: String(counts.total),
    date: p.date, time: p.time, datetime: `${p.date} ${p.time}`, day: p.day, month: p.month, year: p.year,
    greeting: greetingFor(p.hour),
    workhours: ws.summary || '—',
    workstatus: ws.enabled ? (ws.open ? 'çalışma saatleri içinde' : 'çalışma saatleri dışında') : 'her zaman açık',
    timestamp: `<t:${unix(now.getTime())}:F>`,
    relative: `<t:${unix(now.getTime())}:R>`,
  };
}

// Ticket kanalına ait değişkenler. user/member verilmezse ticket sahibi kayıttan alınır.
function ticketVars(config, { channel, guild, user = null, member = null, actor = null, button = null, number = null, extra = {} } = {}) {
  const { parseTicket } = require('./config');
  const store = require('./store');
  const t = (channel && parseTicket(channel)) || {};
  const rec = (channel && store.get(channel.id)) || {};
  const g = guild || channel?.guild || null;
  const ownerId = user?.id || t.ownerId || rec.ownerId || '';
  const ownerMember = member || (g && ownerId ? g.members?.cache?.get?.(ownerId) : null) || null;
  const ownerUser = user || ownerMember?.user || null;
  const ownerName = ownerUser?.username || rec.ownerTag || '';
  const cat = button || config?.buttons?.find(b => b.id === (t.buttonId || rec.buttonId)) || null;
  const num = number ?? t.number ?? rec.number ?? 0;
  const openedMs = rec.createdAt || 0;
  const roleMentions = (config?.supportRoleIds || []).filter(id => g?.roles?.cache?.has?.(id)).map(id => `<@&${id}>`).join(' ');
  const prio = { low: '🟢 düşük', high: '🟠 yüksek', urgent: '🔴 acil' }[rec.priority] || 'normal';
  const created = ownerUser?.createdTimestamp;
  const joined = ownerMember?.joinedTimestamp;
  const vars = {
    user: ownerId ? `<@${ownerId}>` : NONE,
    username: ownerName || NONE,
    userid: ownerId || NONE,
    displayname: ownerMember?.displayName || ownerName || NONE,
    useravatar: ownerUser?.displayAvatarURL?.({ size: 256 }) || '',
    usercreated: created ? `<t:${unix(created)}:R>` : NONE,
    userjoined: joined ? `<t:${unix(joined)}:R>` : NONE,
    owner: ownerId ? `<@${ownerId}>` : NONE,
    ownername: ownerName || NONE,
    ownerid: ownerId || NONE,
    category: cat?.label || rec.buttonLabel || NONE,
    categoryemoji: cat?.emoji || '',
    number: pad(num),
    numberraw: String(num || 0),
    channel: channel ? `<#${channel.id}>` : NONE,
    channelname: channel?.name || NONE,
    channelid: channel?.id || NONE,
    ticketurl: g && channel ? `https://discord.com/channels/${g.id}/${channel.id}` : '',
    staff: actor?.mention || NONE,
    staffname: actor?.label || NONE,
    staffid: actor?.id || NONE,
    claimer: t.claimId ? `<@${t.claimId}>` : NONE,
    claimername: rec.claimedByTag || NONE,
    opened: openedMs ? `<t:${unix(openedMs)}:R>` : NONE,
    openedat: openedMs ? `<t:${unix(openedMs)}:F>` : NONE,
    status: t.status === 'closed' ? 'kapalı' : t.status === 'open' ? 'açık' : NONE,
    priority: prio,
    supportroles: roleMentions || NONE,
    reason: '',
    ...extra,
  };
  return vars;
}

// Panelde gösterilen liste: [grup, değişken, açıklama, örnek]
const VAR_DOCS = [
  ['Her yerde', 'server', 'Sunucu adı', 'Deuslra'], ['Her yerde', 'serverid', 'Sunucu ID', '1522670187810127912'],
  ['Her yerde', 'membercount', 'Sunucudaki üye sayısı', '1280'], ['Her yerde', 'brand', 'Marka adı (Ayarlar)', 'Deuslra Destek'],
  ['Her yerde', 'botname', 'Botun adı', 'Deuslra Bot'], ['Her yerde', 'prefix', 'Komut öneki', '.'],
  ['Her yerde', 'opentickets', 'Şu an açık talep sayısı', '4'], ['Her yerde', 'totaltickets', 'Toplam açılan talep', '312'],
  ['Her yerde', 'date', 'Bugünün tarihi', '08.11.2026'], ['Her yerde', 'time', 'Şu anki saat', '23:41'],
  ['Her yerde', 'datetime', 'Tarih ve saat', '08.11.2026 23:41'], ['Her yerde', 'day', 'Haftanın günü', 'Pazar'],
  ['Her yerde', 'month', 'Ay adı', 'Kasım'], ['Her yerde', 'year', 'Yıl', '2026'],
  ['Her yerde', 'greeting', 'Saate göre selam (Günaydın / İyi günler / İyi akşamlar / İyi geceler)', 'İyi akşamlar'],
  ['Her yerde', 'workhours', 'Çalışma saatleri özeti', 'Pzt 10:00–22:00, Sal …'], ['Her yerde', 'workstatus', 'Şu an çalışma saatlerinde miyiz', 'çalışma saatleri içinde'],
  ['Her yerde', 'timestamp', 'Discord\'da okuyanın saatine göre tam tarih', '8 Kasım 2026 23:41'],
  ['Her yerde', 'relative', 'Discord\'da "şimdi / 5 dk önce" biçimi', 'şimdi'],
  ['Talep yazılarında', 'user', 'Talep sahibi (etiket)', '@Ali'], ['Talep yazılarında', 'username', 'Talep sahibinin adı', 'ali'],
  ['Talep yazılarında', 'displayname', 'Talep sahibinin sunucudaki takma adı', 'Ali'], ['Talep yazılarında', 'userid', 'Talep sahibinin ID\'si', '1400…'],
  ['Talep yazılarında', 'useravatar', 'Talep sahibinin profil resmi adresi', 'https://…'],
  ['Talep yazılarında', 'usercreated', 'Hesabın açılış zamanı', '2 yıl önce'], ['Talep yazılarında', 'userjoined', 'Sunucuya katılma zamanı', '3 ay önce'],
  ['Talep yazılarında', 'owner / ownername / ownerid', '{user} ile aynı (etiket / ad / ID)', '@Ali'],
  ['Talep yazılarında', 'category', 'Talebin kategorisi', 'Satın alma'], ['Talep yazılarında', 'categoryemoji', 'Kategorinin emojisi', '🛒'],
  ['Talep yazılarında', 'number', 'Talep numarası (0007)', '0007'], ['Talep yazılarında', 'numberraw', 'Talep numarası (başında sıfır yok)', '7'],
  ['Talep yazılarında', 'channel', 'Talep kanalı (tıklanır)', '#ticket-0007'], ['Talep yazılarında', 'channelname', 'Kanal adı', 'ticket-0007-ali'],
  ['Talep yazılarında', 'channelid', 'Kanal ID', '1523…'], ['Talep yazılarında', 'ticketurl', 'Kanalın bağlantısı', 'https://discord.com/channels/…'],
  ['Talep yazılarında', 'staff', 'İşlemi yapan yetkili (etiket) — kapatan, açan, üstlenen', '@Mod'],
  ['Talep yazılarında', 'staffname / staffid', 'İşlemi yapanın adı / ID\'si', 'mod'],
  ['Talep yazılarında', 'claimer / claimername', 'Talebi üstlenen (yoksa —)', '@Mod'],
  ['Talep yazılarında', 'opened / openedat', 'Talebin açılış zamanı (göreli / tam)', '2 saat önce'],
  ['Talep yazılarında', 'status', 'Durum (açık / kapalı)', 'açık'], ['Talep yazılarında', 'priority', 'Öncelik', '🔴 acil'],
  ['Talep yazılarında', 'supportroles', 'Destek rollerinin etiketleri', '@Destek Ekibi'],
  ['Talep yazılarında', 'reason', 'Kapatma sebebi (sadece kapatma yazılarında)', 'Sorun çözüldü'],
];

module.exports = { setClient, globalVars, ticketVars, VAR_DOCS, greetingFor };
