const {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder,
  ModalBuilder, OverwriteType, PermissionFlagsBits, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const store = require('./store');
const { buildTicketTopic, parseTicket } = require('./config');
const { isStaff } = require('./permissions');
const { buildOpenTicketRow, buildClosedTicketRow } = require('./panel');
const { buildTranscript } = require('./transcript');
const { replyPrivate } = require('./replies');

const COLORS = { main: '#8B5CF6', green: '#22C55E', amber: '#F59E0B', red: '#EF4444' };
const PANEL_ACTOR = { id: null, label: 'Web paneli', mention: '**Web paneli**' };

const OPEN_PERMS = [
  PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks,
];
const BOT_PERMS = [...OPEN_PERMS, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages];

const pad = n => String(n || 0).padStart(4, '0');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const actorOf = interaction => ({ id: interaction.user.id, label: interaction.user.username, mention: `<@${interaction.user.id}>` });
const unix = ms => Math.floor(ms / 1000);

// Kanal düzenlemeleri (isim/konu) Discord'da 10 dakikada 2 kez sınırlı; takılırsa beklemeden devam et.
async function editSoft(channel, data) {
  await Promise.race([channel.edit(data).catch(err => console.error('[TICKET] kanal düzenlenemedi:', err.message)), sleep(8000)]);
}

// Kapanan ticket'ı kullanıcılar görmesin: sahibi ve /add ile eklenen kişiler için kanal gizlenir.
// Destek rolleri görmeye devam eder. Başarısız olan kişi sayısını döndürür (genelde botta "Rolleri Yönet" izni yoktur).
async function hideFromMembers(channel, ownerId) {
  const botId = channel.client.user.id;
  const ids = new Set(ownerId ? [ownerId] : []);
  for (const ow of channel.permissionOverwrites.cache.values()) {
    if (ow.type === OverwriteType.Member && ow.id !== botId) ids.add(ow.id);
  }
  let failed = 0;
  for (const id of ids) {
    const ok = await channel.permissionOverwrites.edit(id, { ViewChannel: false, SendMessages: false, AddReactions: false }).then(() => true).catch(() => false);
    if (!ok) failed++;
  }
  return failed;
}

// Kategori butonundaki bekleme süresi: kullanıcı aynı kategoriden son açtığı talepten sonra bu kadar beklemeli.
// Silinen ticketlar da kayıtta durduğu için silerek süre atlatılamaz. Destek ekibi muaftır.
function cooldownLeftMs(interaction, config, button) {
  const seconds = Number(button.cooldownSeconds) || 0;
  if (!seconds || isStaff(interaction.member, config)) return 0;
  const last = store.list().filter(r => r.ownerId === interaction.user.id && r.buttonId === button.id)
    .reduce((m, r) => Math.max(m, r.createdAt || 0), 0);
  return Math.max(0, last + seconds * 1000 - Date.now());
}

async function textChannel(guild, id) {
  if (!id) return null;
  const ch = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
  return ch?.isTextBased() ? ch : null;
}

async function logEvent(guild, config, { title, color = COLORS.main, description, fields = [], files = [] }) {
  const ch = await textChannel(guild, config.logChannelId);
  if (!ch) return;
  const embed = new EmbedBuilder().setColor(color).setTitle(title).setTimestamp().setFooter({ text: config.brandName });
  if (description) embed.setDescription(description);
  if (fields.length) embed.addFields(fields);
  await ch.send({ embeds: [embed], files, allowedMentions: { parse: [] } }).catch(err => console.error('[LOG]', err.message));
}

async function makeTranscript(channel, config, number) {
  if (!config.settings.transcript) return null;
  try { return await buildTranscript(channel, `Ticket #${pad(number)}`); }
  catch (err) { console.error('[TRANSCRIPT]', err.message); return null; }
}
const attach = t => (t ? [new AttachmentBuilder(t.buffer, { name: t.name })] : []);

/* ------------------------------------------------------------------ */
/* Çekirdek işlemler (Discord komutları ve web paneli ortak kullanır)   */
/* ------------------------------------------------------------------ */

async function openTicket({ guild, user, config, button, answers = [] }) {
  const mine = [...guild.channels.cache.values()].filter(ch => {
    const t = parseTicket(ch);
    return t && t.ownerId === user.id && t.status === 'open';
  });
  if (mine.length >= config.settings.maxOpenPerUser) {
    return { error: `Zaten açık bir ticket'ın var: ${mine[0]}` };
  }

  const categoryId = button.categoryId || config.ticketCategoryId;
  const category = categoryId ? guild.channels.cache.get(categoryId) : null;
  const parent = category?.type === ChannelType.GuildCategory ? category.id : undefined;
  const number = store.nextNumber();
  const safe = user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'user';
  const roleIds = config.supportRoleIds.filter(id => guild.roles.cache.has(id));

  const channel = await guild.channels.create({
    name: `ticket-${pad(number)}-${safe}`,
    type: ChannelType.GuildText,
    ...(parent ? { parent } : {}),
    topic: buildTicketTopic({ ownerId: user.id, buttonId: button.id, number }),
    reason: `Ticket #${pad(number)} · ${user.username}`,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: guild.client.user.id, allow: BOT_PERMS },
      { id: user.id, allow: OPEN_PERMS },
      ...roleIds.map(id => ({ id, allow: OPEN_PERMS })),
    ],
  });

  const welcome = config.settings.welcomeMessage
    .replace(/\{user\}/gi, `<@${user.id}>`)
    .replace(/\{category\}/gi, button.label)
    .replace(/\{number\}/gi, pad(number));
  const embed = new EmbedBuilder()
    .setColor(COLORS.main)
    .setTitle(`Ticket #${pad(number)} · ${button.label}`)
    .setDescription(welcome)
    .addFields(
      { name: 'Açan', value: `<@${user.id}>`, inline: true },
      { name: 'Kategori', value: button.label, inline: true },
      { name: 'Açılış', value: `<t:${unix(Date.now())}:R>`, inline: true },
    )
    .setFooter({ text: config.brandName });
  const answerFields = answers.filter(a => a.value).slice(0, 5).map(a => ({ name: a.label.slice(0, 256), value: a.value.slice(0, 1000) }));
  const embeds = [embed];
  if (answerFields.length) embeds.push(new EmbedBuilder().setColor(COLORS.main).setTitle('Form yanıtları').addFields(answerFields));

  const ping = config.settings.pingSupportOnOpen ? roleIds : [];
  await channel.send({
    content: [`<@${user.id}>`, ...ping.map(id => `<@&${id}>`)].join(' '),
    embeds,
    components: [buildOpenTicketRow(config)],
    allowedMentions: { users: [user.id], roles: ping },
  });

  store.upsert(channel.id, {
    channelId: channel.id, number, ownerId: user.id, ownerTag: user.username, buttonId: button.id,
    buttonLabel: button.label, status: 'open', createdAt: Date.now(), answers: answerFields,
  });
  await logEvent(guild, config, {
    title: `Ticket açıldı · #${pad(number)}`, color: COLORS.green,
    fields: [
      { name: 'Kanal', value: `${channel}`, inline: true },
      { name: 'Açan', value: `<@${user.id}>`, inline: true },
      { name: 'Kategori', value: button.label, inline: true },
    ],
  });
  return { channel, number };
}

async function closeTicket({ channel, config, actor, reason }) {
  const t = parseTicket(channel);
  if (!t) return { error: 'Bu kanal bir ticket değil.' };
  if (t.status !== 'open') return { error: 'Bu ticket zaten kapatılmış.' };
  const why = String(reason || '').trim().slice(0, 400) || 'Sebep belirtilmedi';
  const guild = channel.guild;

  const transcript = await makeTranscript(channel, config, t.number);
  const name = channel.name.startsWith('closed-') ? channel.name : `closed-${channel.name}`.slice(0, 100);
  await editSoft(channel, { name, topic: buildTicketTopic({ ...t, status: 'closed' }) });
  const hideFailed = await hideFromMembers(channel, t.ownerId);

  await channel.send({
    embeds: [new EmbedBuilder().setColor(COLORS.amber).setTitle(`Ticket #${pad(t.number)} kapatıldı`)
      .addFields({ name: 'Kapatan', value: actor.mention, inline: true }, { name: 'Sebep', value: why })
      .setDescription('Destek ekibi bu ticket\'ı yeniden açabilir veya kalıcı olarak silebilir.')
      .setFooter({ text: config.brandName })],
    components: [buildClosedTicketRow()],
    allowedMentions: { parse: [] },
  }).catch(() => null);

  let dmSent = false;
  if (config.settings.dmOnClose && t.ownerId) {
    const owner = await channel.client.users.fetch(t.ownerId).catch(() => null);
    if (owner) {
      dmSent = await owner.send({
        embeds: [new EmbedBuilder().setColor(COLORS.amber).setTitle(`Ticket'ın kapatıldı · #${pad(t.number)}`)
          .setDescription(`**${guild.name}** sunucusundaki destek talebin kapatıldı.`)
          .addFields({ name: 'Sebep', value: why }).setFooter({ text: config.brandName })],
        files: config.settings.dmTranscript ? attach(transcript) : [],
      }).then(() => true).catch(() => false);
    }
  }

  store.upsert(channel.id, { status: 'closed', closedAt: Date.now(), closedBy: actor.label, closeReason: why });
  await logEvent(guild, config, {
    title: `Ticket kapatıldı · #${pad(t.number)}`, color: COLORS.amber,
    fields: [
      { name: 'Kanal', value: `${channel}`, inline: true },
      { name: 'Kapatan', value: actor.mention, inline: true },
      { name: 'Sebep', value: why },
    ],
    files: attach(transcript),
  });
  return { dmSent, hideFailed };
}

async function reopenTicket({ channel, config, actor }) {
  const t = parseTicket(channel);
  if (!t) return { error: 'Bu kanal bir ticket değil.' };
  if (t.status !== 'closed') return { error: 'Bu ticket zaten açık.' };
  if (t.ownerId) {
    await channel.permissionOverwrites.edit(t.ownerId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true }).catch(() => null);
  }
  await editSoft(channel, { name: channel.name.replace(/^closed-/, ''), topic: buildTicketTopic({ ...t, status: 'open' }) });
  await channel.send({
    content: t.ownerId ? `<@${t.ownerId}>` : undefined,
    embeds: [new EmbedBuilder().setColor(COLORS.green).setTitle(`Ticket #${pad(t.number)} yeniden açıldı`)
      .setDescription(`${actor.mention} bu ticket'ı yeniden açtı.`).setFooter({ text: config.brandName })],
    components: [buildOpenTicketRow(config)],
    allowedMentions: { users: t.ownerId ? [t.ownerId] : [] },
  }).catch(() => null);
  store.upsert(channel.id, { status: 'open', reopenedAt: Date.now(), closedAt: null, closeReason: null });
  await logEvent(channel.guild, config, {
    title: `Ticket yeniden açıldı · #${pad(t.number)}`, color: COLORS.green,
    fields: [{ name: 'Kanal', value: `${channel}`, inline: true }, { name: 'Açan', value: actor.mention, inline: true }],
  });
  return { ok: true };
}

// Kanalı kalıcı siler. Silmeden önce transcript log kanalına gönderilir.
async function deleteTicket({ channel, config, actor, reason = '' }) {
  const t = parseTicket(channel);
  if (!t) return { error: 'Bu kanal bir ticket değil.' };
  const delay = config.settings.deleteDelaySeconds;
  const transcript = await makeTranscript(channel, config, t.number);

  await channel.send({
    embeds: [new EmbedBuilder().setColor(COLORS.red).setTitle('Ticket siliniyor')
      .setDescription(delay > 0 ? `Bu kanal **${delay} saniye** içinde silinecek.` : 'Bu kanal siliniyor.')
      .setFooter({ text: `${actor.label} tarafından` })],
  }).catch(() => null);

  store.upsert(channel.id, { status: 'deleted', deletedAt: Date.now(), deletedBy: actor.label });
  await logEvent(channel.guild, config, {
    title: `Ticket silindi · #${pad(t.number)}`, color: COLORS.red,
    fields: [
      { name: 'Silen', value: actor.mention, inline: true },
      { name: 'Sahibi', value: t.ownerId ? `<@${t.ownerId}>` : '—', inline: true },
      ...(reason ? [{ name: 'Sebep', value: reason.slice(0, 400) }] : []),
    ],
    files: attach(transcript),
  });
  if (delay > 0) await sleep(delay * 1000);
  await channel.delete(`Ticket silindi: ${actor.label}`).catch(err => console.error('[TICKET] kanal silinemedi:', err.message));
  return { ok: true };
}

async function claimTicket({ channel, config, actor }) {
  const t = parseTicket(channel);
  if (!t || t.status !== 'open') return { error: 'Bu işlem açık bir ticket kanalında yapılabilir.' };
  if (t.claimId && t.claimId !== actor.id) return { error: `Bu ticket zaten <@${t.claimId}> tarafından üstlenilmiş.` };
  await editSoft(channel, { topic: buildTicketTopic({ ...t, claimId: actor.id }) });
  await channel.send({
    embeds: [new EmbedBuilder().setColor(COLORS.main).setDescription(`🙋 ${actor.mention} bu ticket'ı üstlendi.`)],
    allowedMentions: { users: [actor.id] },
  }).catch(() => null);
  store.upsert(channel.id, { claimedBy: actor.id, claimedByTag: actor.label });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Discord etkileşimleri (buton / modal / slash komut)                  */
/* ------------------------------------------------------------------ */

function buildTicketForm(button) {
  const modal = new ModalBuilder().setCustomId(`ticket-form-submit:${button.id}`).setTitle(`Ticket: ${button.label}`.slice(0, 45));
  button.formFields.slice(0, 5).forEach((field, i) => {
    const input = new TextInputBuilder().setCustomId(`ticket-field-${i}`).setLabel(field.label.slice(0, 45))
      .setStyle(TextInputStyle.Paragraph).setRequired(Boolean(field.required)).setMaxLength(1000);
    if (field.placeholder) input.setPlaceholder(field.placeholder.slice(0, 100));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  });
  return modal;
}

function buildCloseModal() {
  const reason = new TextInputBuilder().setCustomId('ticket-close-reason').setLabel('Kapatma sebebi')
    .setPlaceholder('Kısa bir açıklama yaz').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(400);
  return new ModalBuilder().setCustomId('ticket-close-submit').setTitle('Ticket\'ı kapat').addComponents(new ActionRowBuilder().addComponents(reason));
}

// Ortak ön kontrol: kanal ticket mı, açık mı, yetki var mı. Sorun varsa kullanıcıya söyler ve null döner.
async function guard(interaction, config, { staff = false, ownerOrStaff = false, status = null } = {}) {
  const t = parseTicket(interaction.channel);
  if (!t) { await replyPrivate(interaction, 'Bu komut yalnızca bir ticket kanalında kullanılabilir.'); return null; }
  if (status && t.status !== status) {
    await replyPrivate(interaction, status === 'open' ? 'Bu ticket kapatılmış.' : 'Bu ticket zaten açık.');
    return null;
  }
  const staffOk = isStaff(interaction.member, config);
  if (staff && !staffOk) { await replyPrivate(interaction, 'Bu işlem destek ekibi içindir.'); return null; }
  if (ownerOrStaff && !staffOk && t.ownerId !== interaction.user.id) {
    await replyPrivate(interaction, 'Bu işlemi yalnızca ticket sahibi veya destek ekibi yapabilir.');
    return null;
  }
  return t;
}

async function handleOpenButton(interaction, config, buttonId) {
  const button = config.buttons.find(b => b.id === buttonId);
  if (!button) return replyPrivate(interaction, 'Bu ticket butonu artık kullanılmıyor.');
  const wait = cooldownLeftMs(interaction, config, button);
  if (wait > 0) return replyPrivate(interaction, `Bu kategoride yeni talep açmak için biraz beklemelisin. Tekrar deneyebileceğin zaman: <t:${unix(Date.now() + wait)}:R>`);
  if (button.formEnabled && button.formFields.length) return interaction.showModal(buildTicketForm(button));
  await interaction.deferReply({ ephemeral: true });
  return createFromInteraction(interaction, config, button, []);
}

async function handleFormSubmit(interaction, config, buttonId) {
  const button = config.buttons.find(b => b.id === buttonId);
  if (!button) return replyPrivate(interaction, 'Bu ticket formu artık kullanılmıyor.');
  const wait = cooldownLeftMs(interaction, config, button);
  if (wait > 0) return replyPrivate(interaction, `Bu kategoride yeni talep açmak için biraz beklemelisin. Tekrar deneyebileceğin zaman: <t:${unix(Date.now() + wait)}:R>`);
  const answers = button.formFields.map((field, i) => ({ label: field.label, value: interaction.fields.getTextInputValue(`ticket-field-${i}`) }));
  await interaction.deferReply({ ephemeral: true });
  return createFromInteraction(interaction, config, button, answers);
}

async function createFromInteraction(interaction, config, button, answers) {
  const res = await openTicket({ guild: interaction.guild, user: interaction.user, config, button, answers });
  return replyPrivate(interaction, res.error || `Ticket'ın açıldı: ${res.channel}`);
}

async function handleClose(interaction, config, reason) {
  if (!await guard(interaction, config, { ownerOrStaff: true, status: 'open' })) return;
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
  const res = await closeTicket({ channel: interaction.channel, config, actor: actorOf(interaction), reason });
  if (res.error) return replyPrivate(interaction, res.error);
  const note = res.hideFailed ? ' ⚠️ Kanal kullanıcıdan gizlenemedi: botun "Rolleri Yönet" izni yok.' : '';
  return replyPrivate(interaction, (res.dmSent ? 'Ticket kapatıldı; sebep kullanıcıya DM olarak gönderildi.' : 'Ticket kapatıldı; kullanıcıya DM gönderilemedi.') + note);
}

async function handleReopen(interaction, config) {
  if (!await guard(interaction, config, { staff: true, status: 'closed' })) return;
  await interaction.deferReply({ ephemeral: true });
  const res = await reopenTicket({ channel: interaction.channel, config, actor: actorOf(interaction) });
  return replyPrivate(interaction, res.error || 'Ticket yeniden açıldı.');
}

// Silme düğmesi: yanlışlıkla tıklamaya karşı önce onay ister.
async function handleDeleteRequest(interaction, config) {
  if (!await guard(interaction, config, { staff: true })) return;
  return interaction.reply({
    content: 'Bu ticket kalıcı olarak silinecek. Emin misin?',
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket-action:delete-confirm').setLabel('Evet, sil').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    )],
    ephemeral: true,
  });
}

async function handleDelete(interaction, config, reason = '') {
  if (!await guard(interaction, config, { staff: true })) return;
  await replyPrivate(interaction, 'Ticket siliniyor, transcript log kanalına gönderilecek.');
  await deleteTicket({ channel: interaction.channel, config, actor: actorOf(interaction), reason });
}

async function handleClaim(interaction, config) {
  if (!await guard(interaction, config, { staff: true, status: 'open' })) return;
  await interaction.deferReply({ ephemeral: true });
  const res = await claimTicket({ channel: interaction.channel, config, actor: actorOf(interaction) });
  return replyPrivate(interaction, res.error || 'Ticket\'ı üstlendin.');
}

async function handleCallStaff(interaction, config) {
  const t = await guard(interaction, config, { ownerOrStaff: true, status: 'open' });
  if (!t) return;
  const roleIds = config.supportRoleIds.filter(id => interaction.guild.roles.cache.has(id));
  if (!roleIds.length) return replyPrivate(interaction, 'Panelde destek yetkili rolü ayarlanmamış.');
  await interaction.channel.send({
    content: `📣 Yetkili çağrısı: ${roleIds.map(id => `<@&${id}>`).join(' ')}`,
    allowedMentions: { roles: roleIds },
  });
  return replyPrivate(interaction, 'Destek ekibi çağrıldı.');
}

async function handleAddUser(interaction, config, user) {
  if (!await guard(interaction, config, { staff: true, status: 'open' })) return;
  await interaction.channel.permissionOverwrites.edit(user.id, {
    ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true,
  });
  await interaction.channel.send({ content: `${user} ticket'a eklendi.`, allowedMentions: { users: [user.id] } });
  return replyPrivate(interaction, `${user.username} ticket'a eklendi.`);
}

async function handleRemoveUser(interaction, config, user) {
  const t = await guard(interaction, config, { staff: true, status: 'open' });
  if (!t) return;
  if (t.ownerId === user.id) return replyPrivate(interaction, 'Ticket sahibini ticket\'tan çıkaramazsın.');
  await interaction.channel.permissionOverwrites.delete(user.id).catch(() => null);
  await interaction.channel.send({ content: `${user.username} ticket'tan çıkarıldı.`, allowedMentions: { parse: [] } });
  return replyPrivate(interaction, `${user.username} ticket'tan çıkarıldı.`);
}

module.exports = {
  PANEL_ACTOR, pad,
  openTicket, closeTicket, reopenTicket, deleteTicket, claimTicket,
  buildCloseModal,
  handleOpenButton, handleFormSubmit, handleClose, handleReopen, handleDeleteRequest, handleDelete,
  handleClaim, handleCallStaff, handleAddUser, handleRemoveUser,
};
