const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');
const { readPanelState, writePanelState } = require('./config');
const { missingPermissions, PANEL_CHANNEL_REQUIRED } = require('./permissions');
const { attachmentFor } = require('./media');

const STYLES = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};

function withEmoji(button, emoji) {
  if (typeof emoji === 'string' && emoji.trim()) {
    try { button.setEmoji(emoji.trim()); } catch { /* geçersiz emoji yok sayılır */ }
  }
  return button;
}

function buildButtonRows(config) {
  const rows = [];
  for (let i = 0; i < config.buttons.length; i += 5) {
    const row = new ActionRowBuilder();
    for (const item of config.buttons.slice(i, i + 5)) {
      row.addComponents(withEmoji(
        new ButtonBuilder().setCustomId(`ticket-open:${item.id}`).setLabel(item.label.slice(0, 80)).setStyle(STYLES[item.color] ?? ButtonStyle.Primary),
        item.emoji,
      ));
    }
    rows.push(row);
  }
  return rows;
}

// Açılır liste (select menu): her kategori bir seçenek, açıklaması da seçeneğin altında görünür.
function buildSelectRow(config) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket-select')
    .setPlaceholder((config.panel.placeholder || 'Bir kategori seç…').slice(0, 150))
    .setMinValues(1).setMaxValues(1);
  for (const item of config.buttons.slice(0, 25)) {
    const option = new StringSelectMenuOptionBuilder().setLabel(item.label.slice(0, 100)).setValue(item.id);
    if (item.description) option.setDescription(item.description.slice(0, 100));
    if (item.emoji) { try { option.setEmoji(item.emoji.trim()); } catch { /* geçersiz emoji yok sayılır */ } }
    menu.addOptions(option);
  }
  return new ActionRowBuilder().addComponents(menu);
}

function buildPanelPayload(config, imgs = {}) {
  const panel = config.panel;
  const embed = new EmbedBuilder().setColor(panel.color || '#8B5CF6');
  if (panel.title) embed.setTitle(panel.title);
  if (panel.description) embed.setDescription(panel.description);
  if (panel.footer) embed.setFooter({ text: panel.footer });
  // Görsel indirilebildiyse mesaja dosya olarak eklenir (bağlantı süresi dolsa bile kalır), yoksa adres kullanılır.
  if (imgs.image) embed.setImage(`attachment://${imgs.image.name}`); else if (panel.imageUrl) embed.setImage(panel.imageUrl);
  if (imgs.thumb) embed.setThumbnail(`attachment://${imgs.thumb.name}`); else if (panel.thumbnailUrl) embed.setThumbnail(panel.thumbnailUrl);
  const files = [imgs.image?.file, imgs.thumb?.file].filter(Boolean);
  const hasEmbed = [panel.title, panel.description, panel.footer, panel.imageUrl, panel.thumbnailUrl].some(v => v && v.trim());

  const style = panel.style || 'buttons';
  const rows = [];
  if (style === 'buttons' || style === 'both') rows.push(...buildButtonRows(config));
  if (style === 'dropdown' || style === 'both') rows.push(buildSelectRow(config));
  return {
    ...(panel.content ? { content: panel.content } : {}),
    ...(hasEmbed ? { embeds: [embed] } : {}),
    components: rows.slice(0, 5),
    ...(files.length ? { files } : {}),
    allowedMentions: { parse: [] },
  };
}

// Açık ticket içindeki butonlar: kapat / üstlen / ekibi çağır
function buildOpenTicketRow(config) {
  const defs = [
    ['close', config.actions.close, ButtonStyle.Danger],
    ['claim', config.actions.claim, ButtonStyle.Success],
    ['call-staff', config.actions.callStaff, ButtonStyle.Secondary],
  ];
  const row = new ActionRowBuilder();
  for (const [id, action, style] of defs) {
    row.addComponents(withEmoji(
      new ButtonBuilder().setCustomId(`ticket-action:${id}`).setLabel((action?.label || id).slice(0, 80)).setStyle(STYLES[action?.color] ?? style),
      action?.emoji,
    ));
  }
  return row;
}

// Kapatılmış ticket içindeki butonlar: yeniden aç / sil
function buildClosedTicketRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket-action:reopen').setLabel('Yeniden aç').setEmoji('🔓').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket-action:delete').setLabel('Sil').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
  );
}

// Discord'un teknik hata kodlarını anlaşılır Türkçeye çevirir.
function explainDiscordError(err, channel) {
  const where = channel ? `#${channel.name} kanalında` : 'bu kanalda';
  if (err?.code === 50001) return `Bot ${where} yok sayılıyor (Missing Access). Kanalı botun görebildiğinden emin ol: kanal ayarları > İzinler > botun rolüne "Kanalı Gör" izni ver.`;
  if (err?.code === 50013) return `Botun ${where} mesaj gönderme izni yok (Missing Permissions). Kanal ayarları > İzinler bölümünden botun rolüne "Mesaj Gönder" ve "Bağlantı Göm" izinlerini ver.`;
  if (err?.code === 50035) return `Panel mesajı Discord tarafından reddedildi: ${err.message}. Emoji, görsel adresi veya yazı uzunluklarını kontrol et.`;
  return err?.message || 'Bilinmeyen Discord hatası';
}

// Paneli yayınlar; daha önce yayınlanmış mesaj varsa yenisini atmak yerine onu günceller.
async function publishPanel(guild, config, fallbackChannelId = '') {
  const targetId = config.panel.channelId || fallbackChannelId;
  if (!targetId) throw new Error('Panel kanalı seçilmemiş. Ayarlar sekmesinden "Panel kanalı"nı seç ve kaydet.');
  const target = guild.channels.cache.get(targetId) ?? await guild.channels.fetch(targetId).catch(() => null);
  if (!target) throw new Error('Seçili panel kanalı bulunamadı (silinmiş olabilir veya bot göremiyor). Ayarlar sekmesinden kanalı yeniden seç.');
  if (!target.isTextBased() || !target.messages) throw new Error('Seçili kanal bir yazı kanalı değil. Panel için normal bir yazı kanalı seç.');
  if (!config.buttons.length) throw new Error('En az bir ticket kategorisi olmalı.');

  const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  const missing = missingPermissions(me ? target.permissionsFor(me) : null, PANEL_CHANNEL_REQUIRED);
  if (missing.length) {
    throw new Error(`Botun #${target.name} kanalında şu izinleri yok: ${missing.join(', ')}. Kanal ayarları > İzinler'den botun rolüne ver (ya da Yönetim panelindeki "Botu doğru izinlerle davet et" bağlantısını kullan).`);
  }

  const payload = buildPanelPayload(config, {
    image: await attachmentFor(config.panel.imageUrl, 'panel-image'),
    thumb: await attachmentFor(config.panel.thumbnailUrl, 'panel-thumb'),
  });
  const state = readPanelState();
  let message = null;
  if (state?.channelId === target.id && state?.messageId) {
    message = await target.messages.fetch(state.messageId).catch(() => null);
  }
  const updated = Boolean(message);
  try {
    message = message ? await message.edit({ ...payload, attachments: [] }) : await target.send(payload);
  } catch (err) {
    throw new Error(explainDiscordError(err, target));
  }
  writePanelState({ channelId: target.id, messageId: message.id });
  return { channel: target, message, updated, url: `https://discord.com/channels/${guild.id}/${target.id}/${message.id}` };
}

module.exports = { buildPanelPayload, buildOpenTicketRow, buildClosedTicketRow, publishPanel, withEmoji, explainDiscordError };
