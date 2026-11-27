const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { renderAll } = require('./messages');

// Ticket açılınca, ana karşılama mesajından SONRA gönderilen ek mesajlar.
// Genel liste (config.openMessages) her kategoride, kategori listesi (button.openMessages) sadece o kategoride gönderilir.
// Her mesaj: type 'embed' | 'line' (çizgi / ayraç resmi) | 'text'. Yazılarda ticket değişkenleri ({user} {category} {number} ...) kullanılır.
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hexNum = v => { const m = /^#?([0-9a-f]{6})$/i.exec(String(v || '').trim()); return m ? parseInt(m[1], 16) : null; };
const okUrl = v => (/^https?:\/\/\S+$/i.test(String(v || '').trim()) ? String(v).trim().slice(0, 2000) : '');
const okEmoji = v => { const s = String(v || '').trim(); return /^<a?:\w{2,32}:\d{15,25}>$/.test(s) || /^[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}][\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]*$/u.test(s) ? s : ''; };

// Bir mesajı Discord gönderim verisine çevirir (null = gönderilecek bir şey yok)
function buildOpenMessage(config, m, V, { ownerId = '', staffRoleIds = [] } = {}) {
  const fill = t => renderAll(config, String(t || ''), V);
  const payload = { allowedMentions: { users: [], roles: [] } };
  const pings = [];
  if (m.pingOwner && ownerId) { pings.push(`<@${ownerId}>`); payload.allowedMentions.users.push(ownerId); }
  if (m.pingStaff) for (const id of staffRoleIds) { pings.push(`<@&${id}>`); payload.allowedMentions.roles.push(id); }
  let content = fill(m.content).trim();
  if (m.type === 'line') {
    const url = okUrl(fill(m.lineUrl));
    if (!url) return null;
    if (m.lineMode === 'embed') payload.embeds = [new EmbedBuilder().setColor(hexNum(m.embed?.color) ?? config.colors.main).setImage(url)];
    else content = [content, url].filter(Boolean).join('\n');
  } else if (m.type === 'embed') {
    const e = m.embed || {};
    const emb = new EmbedBuilder().setColor(hexNum(e.color) ?? config.colors.main);
    const title = fill(e.title).trim(), desc = fill(e.description).trim(), author = fill(e.authorName).trim(), footer = fill(e.footer).trim();
    if (title) emb.setTitle(title.slice(0, 256));
    if (desc) emb.setDescription(desc.slice(0, 4000));
    if (author) emb.setAuthor({ name: author.slice(0, 256), ...(okUrl(fill(e.authorIcon)) ? { iconURL: okUrl(fill(e.authorIcon)) } : {}) });
    if (footer) emb.setFooter({ text: footer.slice(0, 2048) });
    if (okUrl(fill(e.thumbnailUrl))) emb.setThumbnail(okUrl(fill(e.thumbnailUrl)));
    if (okUrl(fill(e.imageUrl))) emb.setImage(okUrl(fill(e.imageUrl)));
    if (e.timestamp) emb.setTimestamp();
    const fields = (e.fields || []).map(f => ({ name: fill(f.name).trim().slice(0, 256), value: fill(f.value).trim().slice(0, 1024), inline: Boolean(f.inline) })).filter(f => f.name && f.value);
    if (fields.length) emb.addFields(fields.slice(0, 10));
    if (!title && !desc && !author && !fields.length && !okUrl(fill(e.imageUrl))) { if (!content) return null; } else payload.embeds = [emb];
  }
  if (!content && !payload.embeds && !pings.length) return null;
  payload.content = [pings.join(' '), content].filter(Boolean).join('\n').slice(0, 2000) || undefined;
  const links = (m.buttons || []).filter(b => okUrl(b.url) && (b.label || okEmoji(b.emoji))).slice(0, 5);
  if (links.length) {
    payload.components = [new ActionRowBuilder().addComponents(links.map(b => {
      const btn = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(okUrl(fill(b.url)) || okUrl(b.url));
      if (b.label) btn.setLabel(fill(b.label).slice(0, 80));
      if (okEmoji(b.emoji)) btn.setEmoji(okEmoji(b.emoji));
      return btn;
    }))];
  }
  return payload;
}

// Kanala sırayla gönderir. Bekleme süresi olan mesajlar yüzünden ticket açma gecikmesin diye çağıran taraf bunu arka planda çalıştırabilir.
async function sendOpenMessages({ channel, config, button, V, ownerId, staffRoleIds = [] }) {
  const list = [...(config.openMessages || []), ...(button?.openMessages || [])].filter(m => m.enabled);
  for (const m of list) {
    if (m.delaySeconds > 0) await sleep(m.delaySeconds * 1000);
    try {
      const payload = buildOpenMessage(config, m, V, { ownerId, staffRoleIds });
      if (!payload) continue;
      const sent = await channel.send(payload);
      if (m.pin) await sent.pin().catch(() => null);
    } catch (err) { console.error('[AÇILIŞ MESAJI]', m.name || m.type, err.message); }
  }
}
const hasDelay = (config, button) => [...(config.openMessages || []), ...(button?.openMessages || [])].some(m => m.enabled && m.delaySeconds > 0);

module.exports = { buildOpenMessage, sendOpenMessages, hasDelay, okEmoji };
