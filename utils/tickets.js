const {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder,
  ModalBuilder, OverwriteType, PermissionFlagsBits, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const store = require('./store');
const db = require('./db');
const { attachmentFor } = require('./media');
const { buildTicketTopic, parseTicket } = require('./config');
const { isStaff } = require('./permissions');
const { buildOpenRows, buildClosedRows } = require('./panel');
const { buildTranscript } = require('./transcript');
const { replyPrivate } = require('./replies');
const { msg } = require('./messages');

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

// Talep içindeki butonların bekleme süresi (kanal başına): bir kez basılınca süre dolana kadar o ticketta kimse tekrar basamaz.
const actionUse = new Map();
const unixNow = () => Math.floor(Date.now() / 1000);
function actionWaitMs(channelId, config, key) {
  const sec = Number(config.actions?.[key]?.cooldownSeconds) || 0;
  if (!sec) return 0;
  return Math.max(0, (actionUse.get(`${channelId}:${key}`) || 0) + sec * 1000 - Date.now());
}
const markAction = (channelId, key) => actionUse.set(`${channelId}:${key}`, Date.now());
// true dönerse süre dolmamıştır ve kullanıcıya söylenmiştir.
async function gateAction(interaction, config, key) {
  const wait = actionWaitMs(interaction.channelId, config, key);
  if (wait <= 0) return false;
  await replyPrivate(interaction, msg(config, 'actionWait', { time: `<t:${unixNow() + Math.ceil(wait / 1000)}:R>` }));
  return true;
}

async function textChannel(guild, id) {
  if (!id) return null;
  const ch = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
  return ch?.isTextBased() ? ch : null;
}

async function logEvent(guild, config, { title, color = config.colors.main, description, fields = [], files = [], components = [] }) {
  const ch = await textChannel(guild, config.logChannelId);
  if (!ch) return;
  const embed = new EmbedBuilder().setColor(color).setTitle(title).setTimestamp().setFooter({ text: config.brandName });
  if (description) embed.setDescription(description);
  if (fields.length) embed.addFields(fields);
  await ch.send({ embeds: [embed], files, components, allowedMentions: { parse: [] } }).catch(err => console.error('[LOG]', err.message));
}

async function makeTranscript(channel, config, number) {
  if (!config.settings.transcript) return null;
  try { return await buildTranscript(channel, `Ticket #${pad(number)}`); }
  catch (err) { console.error('[TRANSCRIPT]', err.message); return null; }
}
const attach = t => (t ? [new AttachmentBuilder(t.buffer, { name: t.name })] : []);

// Transcript log kanalına dosya olarak değil, veritabanına kaydedilip "indir" butonuyla verilir:
// sadece ticket sahibi (ve ayarlardaki ekstra kişiler) indirebilir, destek ekibi bile indiremez.
async function storeTranscript(transcript, ownerId, number) {
  if (!transcript) return null;
  if (transcript.buffer.length > 12 * 1024 * 1024) { console.error('[TRANSCRIPT] çok büyük, kaydedilmedi'); return null; }
  const key = `${number}-${Date.now().toString(36)}`;
  try {
    await db.putBlob(key, { ownerId, number, name: transcript.name, html: transcript.buffer.toString('utf8'), createdAt: Date.now() });
    return key;
  } catch (err) { console.error('[TRANSCRIPT] kaydedilemedi:', err.message); return null; }
}
const transcriptRow = (config, key) => (key ? [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`transcript-dl:${key}`).setLabel(msg(config, 'btnTranscript').slice(0, 80)).setStyle(ButtonStyle.Primary),
)] : []);

/* ------------------------------------------------------------------ */
/* Çekirdek işlemler (Discord komutları ve web paneli ortak kullanır)   */
/* ------------------------------------------------------------------ */

async function openTicket({ guild, user, config, button, answers = [] }) {
  const mine = [...guild.channels.cache.values()].filter(ch => {
    const t = parseTicket(ch);
    return t && t.ownerId === user.id && t.status === 'open';
  });
  if (mine.length >= config.settings.maxOpenPerUser) {
    return { error: msg(config, 'alreadyOpen', { channel: `${mine[0]}` }) };
  }

  const categoryId = button.categoryId || config.ticketCategoryId;
  const category = categoryId ? guild.channels.cache.get(categoryId) : null;
  const parent = category?.type === ChannelType.GuildCategory ? category.id : undefined;
  const number = store.nextNumber();
  const safe = user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'user';
  const roleIds = config.supportRoleIds.filter(id => guild.roles.cache.has(id));

  const channel = await guild.channels.create({
    name: config.settings.channelNameFormat.replace(/\{number\}/g, pad(number)).replace(/\{user\}/g, safe).slice(0, 100),
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
  const te = config.ticketEmbed;
  const fill = text => String(text || '').replace(/\{user\}/gi, `<@${user.id}>`).replace(/\{category\}/gi, button.label).replace(/\{number\}/gi, pad(number));
  const embed = new EmbedBuilder()
    .setColor(te.color || config.colors.main)
    .setTitle(fill(te.title).slice(0, 256) || `Ticket #${pad(number)}`)
    .setDescription(welcome)
    .setFooter({ text: te.footer || config.brandName });
  if (te.showDetails) {
    embed.addFields(
      { name: msg(config, 'fieldOwner'), value: `<@${user.id}>`, inline: true },
      { name: msg(config, 'fieldCategory'), value: button.label, inline: true },
      { name: msg(config, 'fieldOpened'), value: `<t:${unix(Date.now())}:R>`, inline: true },
    );
  }
  const imgFile = await attachmentFor(te.imageUrl, 'ticket-image');
  const thumbFile = await attachmentFor(te.thumbnailUrl, 'ticket-thumb');
  if (imgFile) embed.setImage(`attachment://${imgFile.name}`); else if (te.imageUrl) embed.setImage(te.imageUrl);
  if (thumbFile) embed.setThumbnail(`attachment://${thumbFile.name}`); else if (te.thumbnailUrl) embed.setThumbnail(te.thumbnailUrl);
  const answerFields = answers.filter(a => a.value).slice(0, 5).map(a => ({ name: a.label.slice(0, 256), value: a.value.slice(0, 1000) }));
  const embeds = [embed];
  if (answerFields.length) embeds.push(new EmbedBuilder().setColor(config.colors.main).setTitle(msg(config, 'formAnswersTitle').slice(0, 256)).addFields(answerFields));

  const ping = config.settings.pingSupportOnOpen ? roleIds : [];
  await channel.send({
    content: [`<@${user.id}>`, ...ping.map(id => `<@&${id}>`)].join(' '),
    embeds,
    files: [imgFile?.file, thumbFile?.file].filter(Boolean),
    components: buildOpenRows(config),
    allowedMentions: { users: [user.id], roles: ping },
  });

  store.upsert(channel.id, {
    channelId: channel.id, number, ownerId: user.id, ownerTag: user.username, buttonId: button.id,
    buttonLabel: button.label, status: 'open', createdAt: Date.now(), answers: answerFields,
  });
  await logEvent(guild, config, {
    title: msg(config, 'logOpenedTitle', { number: pad(number) }), color: config.colors.success,
    fields: [
      { name: msg(config, 'fieldChannel'), value: `${channel}`, inline: true },
      { name: msg(config, 'fieldOwner'), value: `<@${user.id}>`, inline: true },
      { name: msg(config, 'fieldCategory'), value: button.label, inline: true },
    ],
  });
  return { channel, number };
}

async function closeTicket({ channel, config, actor, reason }) {
  const t = parseTicket(channel);
  if (!t) return { error: msg(config, 'errNotTicketChannel') };
  if (t.status !== 'open') return { error: msg(config, 'errAlreadyClosed') };
  const why = String(reason || '').trim().slice(0, 400) || msg(config, 'closeReasonDefault');
  const guild = channel.guild;

  const transcript = await makeTranscript(channel, config, t.number);
  const tKey = await storeTranscript(transcript, t.ownerId, t.number);
  const prefix = config.settings.closedPrefix;
  const name = channel.name.startsWith(prefix) ? channel.name : `${prefix}${channel.name}`.slice(0, 100);
  await editSoft(channel, { name, topic: buildTicketTopic({ ...t, status: 'closed' }) });
  const hideFailed = await hideFromMembers(channel, t.ownerId);

  await channel.send({
    embeds: [new EmbedBuilder().setColor(config.colors.warning).setTitle(msg(config, 'closedTitle', { number: pad(t.number) }).slice(0, 256))
      .addFields({ name: msg(config, 'fieldClosedBy'), value: actor.mention, inline: true }, { name: msg(config, 'fieldReason'), value: why })
      .setDescription(msg(config, 'closedDescription'))
      .setFooter({ text: config.brandName })],
    components: buildClosedRows(config),
    allowedMentions: { parse: [] },
  }).catch(() => null);

  let dmSent = false;
  if (config.settings.dmOnClose && t.ownerId) {
    const owner = await channel.client.users.fetch(t.ownerId).catch(() => null);
    if (owner) {
      dmSent = await owner.send({
        embeds: [new EmbedBuilder().setColor(config.colors.warning).setTitle(msg(config, 'dmClosedTitle', { number: pad(t.number) }).slice(0, 256))
          .setDescription(msg(config, 'dmClosedDescription', { server: guild.name }))
          .addFields({ name: msg(config, 'fieldReason'), value: why }).setFooter({ text: config.brandName })],
        files: config.settings.dmTranscript ? attach(transcript) : [],
      }).then(() => true).catch(() => false);
    }
  }

  store.upsert(channel.id, { status: 'closed', closedAt: Date.now(), closedBy: actor.label, closeReason: why });
  await logEvent(guild, config, {
    title: msg(config, 'logClosedTitle', { number: pad(t.number) }), color: config.colors.warning,
    fields: [
      { name: msg(config, 'fieldChannel'), value: `${channel}`, inline: true },
      { name: msg(config, 'fieldClosedBy'), value: actor.mention, inline: true },
      { name: msg(config, 'fieldReason'), value: why },
    ],
    components: transcriptRow(config, tKey),
    ...(tKey ? { description: msg(config, 'transcriptNote') } : {}),
  });
  return { dmSent, hideFailed };
}

async function reopenTicket({ channel, config, actor }) {
  const t = parseTicket(channel);
  if (!t) return { error: msg(config, 'errNotTicketChannel') };
  if (t.status !== 'closed') return { error: msg(config, 'ticketAlreadyOpen') };
  if (t.ownerId) {
    await channel.permissionOverwrites.edit(t.ownerId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true }).catch(() => null);
  }
  await editSoft(channel, { name: channel.name.startsWith(config.settings.closedPrefix) ? channel.name.slice(config.settings.closedPrefix.length) : channel.name, topic: buildTicketTopic({ ...t, status: 'open' }) });
  await channel.send({
    content: t.ownerId ? `<@${t.ownerId}>` : undefined,
    embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle(msg(config, 'reopenedTitle', { number: pad(t.number) }).slice(0, 256))
      .setDescription(msg(config, 'reopenedDescription', { staff: actor.mention })).setFooter({ text: config.brandName })],
    components: buildOpenRows(config),
    allowedMentions: { users: t.ownerId ? [t.ownerId] : [] },
  }).catch(() => null);
  store.upsert(channel.id, { status: 'open', reopenedAt: Date.now(), closedAt: null, closeReason: null });
  await logEvent(channel.guild, config, {
    title: msg(config, 'logReopenedTitle', { number: pad(t.number) }), color: config.colors.success,
    fields: [{ name: msg(config, 'fieldChannel'), value: `${channel}`, inline: true }, { name: msg(config, 'fieldOwner'), value: actor.mention, inline: true }],
  });
  return { ok: true };
}

// Kanalı kalıcı siler. Silmeden önce transcript log kanalına gönderilir.
async function deleteTicket({ channel, config, actor, reason = '' }) {
  const t = parseTicket(channel);
  if (!t) return { error: msg(config, 'errNotTicketChannel') };
  const delay = config.settings.deleteDelaySeconds;
  const transcript = await makeTranscript(channel, config, t.number);
  const tKey = await storeTranscript(transcript, t.ownerId, t.number);

  await channel.send({
    embeds: [new EmbedBuilder().setColor(config.colors.danger).setTitle(msg(config, 'deletingTitle').slice(0, 256))
      .setDescription(delay > 0 ? msg(config, 'deletingDelay', { delay }) : msg(config, 'deletingNow'))
      .setFooter({ text: msg(config, 'deletingFooter', { staff: actor.label }).slice(0, 2048) })],
  }).catch(() => null);

  store.upsert(channel.id, { status: 'deleted', deletedAt: Date.now(), deletedBy: actor.label });
  await logEvent(channel.guild, config, {
    title: msg(config, 'logDeletedTitle', { number: pad(t.number) }), color: config.colors.danger,
    fields: [
      { name: msg(config, 'fieldDeletedBy'), value: actor.mention, inline: true },
      { name: msg(config, 'fieldTicketOwner'), value: t.ownerId ? `<@${t.ownerId}>` : '—', inline: true },
      ...(reason ? [{ name: msg(config, 'fieldReason'), value: reason.slice(0, 400) }] : []),
    ],
    components: transcriptRow(config, tKey),
    ...(tKey ? { description: msg(config, 'transcriptNote') } : {}),
  });
  if (delay > 0) await sleep(delay * 1000);
  await channel.delete(`Ticket silindi: ${actor.label}`).catch(err => console.error('[TICKET] kanal silinemedi:', err.message));
  return { ok: true };
}

async function claimTicket({ channel, config, actor }) {
  const t = parseTicket(channel);
  if (!t || t.status !== 'open') return { error: msg(config, 'errNeedOpen') };
  if (t.claimId && t.claimId !== actor.id) return { error: msg(config, 'claimTaken', { claimer: `<@${t.claimId}>` }) };
  await editSoft(channel, { topic: buildTicketTopic({ ...t, claimId: actor.id }) });
  await channel.send({
    embeds: [new EmbedBuilder().setColor(config.colors.main).setDescription(msg(config, 'claimedMessage', { staff: actor.mention }))],
    allowedMentions: { users: [actor.id] },
  }).catch(() => null);
  store.upsert(channel.id, { claimedBy: actor.id, claimedByTag: actor.label });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Discord etkileşimleri (buton / modal / slash komut)                  */
/* ------------------------------------------------------------------ */

function buildTicketForm(button, config) {
  const modal = new ModalBuilder().setCustomId(`ticket-form-submit:${button.id}`).setTitle(msg(config, 'formTitle', { category: button.label }).slice(0, 45));
  button.formFields.slice(0, 5).forEach((field, i) => {
    const input = new TextInputBuilder().setCustomId(`ticket-field-${i}`).setLabel(field.label.slice(0, 45))
      .setStyle(TextInputStyle.Paragraph).setRequired(Boolean(field.required)).setMaxLength(1000);
    if (field.placeholder) input.setPlaceholder(field.placeholder.slice(0, 100));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  });
  return modal;
}

function buildCloseModal(config) {
  const reason = new TextInputBuilder().setCustomId('ticket-close-reason').setLabel(msg(config, 'closeModalLabel').slice(0, 45))
    .setPlaceholder(msg(config, 'closeModalPlaceholder').slice(0, 100)).setStyle(TextInputStyle.Paragraph).setRequired(config.settings.closeReasonRequired).setMaxLength(400);
  return new ModalBuilder().setCustomId('ticket-close-submit').setTitle(msg(config, 'closeModalTitle').slice(0, 45)).addComponents(new ActionRowBuilder().addComponents(reason));
}

// Ortak ön kontrol: kanal ticket mı, açık mı, yetki var mı. Sorun varsa kullanıcıya söyler ve null döner.
async function guard(interaction, config, { staff = false, ownerOrStaff = false, status = null } = {}) {
  const t = parseTicket(interaction.channel);
  if (!t) { await replyPrivate(interaction, msg(config, 'notTicket')); return null; }
  if (status && t.status !== status) {
    await replyPrivate(interaction, status === 'open' ? msg(config, 'ticketClosed') : msg(config, 'ticketAlreadyOpen'));
    return null;
  }
  const staffOk = isStaff(interaction.member, config);
  if (staff && !staffOk) { await replyPrivate(interaction, msg(config, 'staffOnly')); return null; }
  if (ownerOrStaff && !staffOk && t.ownerId !== interaction.user.id) {
    await replyPrivate(interaction, msg(config, 'ownerOrStaffOnly'));
    return null;
  }
  return t;
}

async function handleOpenButton(interaction, config, buttonId) {
  const button = config.buttons.find(b => b.id === buttonId);
  if (!button) return replyPrivate(interaction, msg(config, 'buttonGone'));
  const wait = cooldownLeftMs(interaction, config, button);
  if (wait > 0) return replyPrivate(interaction, msg(config, 'cooldownOpen', { time: `<t:${unix(Date.now() + wait)}:R>` }));
  if (button.formEnabled && button.formFields.length) return interaction.showModal(buildTicketForm(button, config));
  await interaction.deferReply({ ephemeral: true });
  return createFromInteraction(interaction, config, button, []);
}

async function handleFormSubmit(interaction, config, buttonId) {
  const button = config.buttons.find(b => b.id === buttonId);
  if (!button) return replyPrivate(interaction, msg(config, 'formGone'));
  const wait = cooldownLeftMs(interaction, config, button);
  if (wait > 0) return replyPrivate(interaction, msg(config, 'cooldownOpen', { time: `<t:${unix(Date.now() + wait)}:R>` }));
  const answers = button.formFields.map((field, i) => ({ label: field.label, value: interaction.fields.getTextInputValue(`ticket-field-${i}`) }));
  await interaction.deferReply({ ephemeral: true });
  return createFromInteraction(interaction, config, button, answers);
}

async function createFromInteraction(interaction, config, button, answers) {
  const res = await openTicket({ guild: interaction.guild, user: interaction.user, config, button, answers });
  return replyPrivate(interaction, res.error || msg(config, 'openedReply', { channel: `${res.channel}`, category: button.label, number: pad(res.number) }));
}

// "Kapat" butonu: sebep penceresi sadece ayarlandığı kişiye açılır (varsayılan: yalnızca destek ekibi).
async function handleCloseButton(interaction, config) {
  const t = await guard(interaction, config, { ownerOrStaff: true, status: 'open' });
  if (!t) return;
  if (await gateAction(interaction, config, 'close')) return;
  markAction(interaction.channelId, 'close');
  const mode = config.settings.askCloseReason;
  const ask = mode === 'everyone' || (mode === 'staff' && isStaff(interaction.member, config));
  if (ask) return interaction.showModal(buildCloseModal(config));
  return handleClose(interaction, config, '');
}

async function handleClose(interaction, config, reason) {
  if (!await guard(interaction, config, { ownerOrStaff: true, status: 'open' })) return;
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
  // Sebep yazılmadıysa ve kapatan destek ekibinden değilse "ticket sahibi kapattı" yazılır
  if (!String(reason || '').trim() && !isStaff(interaction.member, config)) reason = msg(config, 'closeReasonOwner');
  const res = await closeTicket({ channel: interaction.channel, config, actor: actorOf(interaction), reason });
  if (res.error) return replyPrivate(interaction, res.error);
  const note = res.hideFailed ? ` ${msg(config, 'closeHideFailed')}` : '';
  return replyPrivate(interaction, msg(config, res.dmSent ? 'closeReplyDm' : 'closeReplyNoDm') + note);
}

async function handleTranscriptDownload(interaction, config, key) {
  await interaction.deferReply({ ephemeral: true });
  const doc = await db.getBlob(key).catch(() => null);
  if (!doc) return replyPrivate(interaction, msg(config, 'transcriptMissing'));
  const allowed = interaction.user.id === doc.ownerId || (config.settings.transcriptAdminIds || []).includes(interaction.user.id);
  if (!allowed) return replyPrivate(interaction, msg(config, 'transcriptDenied'));
  return interaction.editReply({ content: msg(config, 'transcriptFile', { number: pad(doc.number) }), files: [new AttachmentBuilder(Buffer.from(doc.html, 'utf8'), { name: doc.name })] });
}

async function handleReopen(interaction, config) {
  if (!await guard(interaction, config, { staff: true, status: 'closed' })) return;
  await interaction.deferReply({ ephemeral: true });
  const res = await reopenTicket({ channel: interaction.channel, config, actor: actorOf(interaction) });
  return replyPrivate(interaction, res.error || msg(config, 'reopenReply'));
}

// Silme düğmesi: yanlışlıkla tıklamaya karşı önce onay ister.
async function handleDeleteRequest(interaction, config) {
  if (!await guard(interaction, config, { staff: true })) return;
  return interaction.reply({
    content: msg(config, 'deleteConfirm'),
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket-action:delete-confirm').setLabel(msg(config, 'btnDeleteConfirm').slice(0, 80)).setStyle(ButtonStyle.Danger),
    )],
    ephemeral: true,
  });
}

async function handleDelete(interaction, config, reason = '') {
  if (!await guard(interaction, config, { staff: true })) return;
  await replyPrivate(interaction, msg(config, 'deleteReply'));
  await deleteTicket({ channel: interaction.channel, config, actor: actorOf(interaction), reason });
}

async function handleClaim(interaction, config) {
  if (!await guard(interaction, config, { staff: true, status: 'open' })) return;
  if (await gateAction(interaction, config, 'claim')) return;
  markAction(interaction.channelId, 'claim');
  await interaction.deferReply({ ephemeral: true });
  const res = await claimTicket({ channel: interaction.channel, config, actor: actorOf(interaction) });
  return replyPrivate(interaction, res.error || msg(config, 'claimReply'));
}

async function handleCallStaff(interaction, config) {
  const t = await guard(interaction, config, { ownerOrStaff: true, status: 'open' });
  if (!t) return;
  if (await gateAction(interaction, config, 'callStaff')) return;
  const roleIds = config.supportRoleIds.filter(id => interaction.guild.roles.cache.has(id));
  if (!roleIds.length) return replyPrivate(interaction, msg(config, 'callStaffNoRole'));
  markAction(interaction.channelId, 'callStaff');
  await interaction.channel.send({
    content: msg(config, 'callStaffMessage', { roles: roleIds.map(id => `<@&${id}>`).join(' ') }),
    allowedMentions: { roles: roleIds },
  });
  return replyPrivate(interaction, msg(config, 'callStaffReply'));
}

async function handleAddUser(interaction, config, user) {
  if (!await guard(interaction, config, { staff: true, status: 'open' })) return;
  await interaction.channel.permissionOverwrites.edit(user.id, {
    ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true,
  });
  await interaction.channel.send({ content: msg(config, 'userAddedChannel', { user: `${user}` }), allowedMentions: { users: [user.id] } });
  return replyPrivate(interaction, msg(config, 'userAddedReply', { username: user.username }));
}

async function handleRemoveUser(interaction, config, user) {
  const t = await guard(interaction, config, { staff: true, status: 'open' });
  if (!t) return;
  if (t.ownerId === user.id) return replyPrivate(interaction, msg(config, 'cannotRemoveOwner'));
  await interaction.channel.permissionOverwrites.delete(user.id).catch(() => null);
  await interaction.channel.send({ content: msg(config, 'userRemovedChannel', { username: user.username }), allowedMentions: { parse: [] } });
  return replyPrivate(interaction, msg(config, 'userRemovedReply', { username: user.username }));
}

module.exports = {
  PANEL_ACTOR, pad,
  openTicket, closeTicket, reopenTicket, deleteTicket, claimTicket,
  buildCloseModal, handleCloseButton, gateAction, markAction,
  handleTranscriptDownload, handleOpenButton, handleFormSubmit, handleClose, handleReopen, handleDeleteRequest, handleDelete,
  handleClaim, handleCallStaff, handleAddUser, handleRemoveUser,
};
