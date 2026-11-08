const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder, StringSelectMenuBuilder,
} = require('discord.js');
const { parseTicket } = require('./config');
const { isStaff } = require('./permissions');
const { ACTIONS } = require('./commandDefs');
const { msg } = require('./messages');
const { replyPrivate } = require('./replies');
const { canUse, performAction, lastUse, priorityLabel } = require('./commands');
const t = require('./tickets');

const unix = ms => Math.floor(ms / 1000);
const cdKey = (interaction, def) => `btn:${interaction.channelId}:${def.id}`;

// Butonu bulur, ticket / yetki / bekleme süresini kontrol eder. Sorun varsa kullanıcıya söyler ve null döner.
async function prepare(interaction, config, id, { checkCooldown = false } = {}) {
  const def = (config.ticketButtons || []).find(b => b.id === id && b.enabled);
  if (!def) { await replyPrivate(interaction, msg(config, 'buttonGone')); return null; }
  const ticket = parseTicket(interaction.channel);
  if (ACTIONS[def.action].needsTicket && !ticket) { await replyPrivate(interaction, msg(config, 'cmdOnlyTicket')); return null; }
  if (!canUse(def, interaction.member, ticket, interaction.user.id, config)) { await replyPrivate(interaction, msg(config, 'cmdNoPermission')); return null; }
  if (checkCooldown && def.cooldownSeconds) {
    const left = (lastUse.get(cdKey(interaction, def)) || 0) + def.cooldownSeconds * 1000 - Date.now();
    if (left > 0) { await replyPrivate(interaction, msg(config, 'actionWait', { time: `<t:${unix(Date.now() + left)}:R>` })); return null; }
  }
  return { def, ticket };
}

async function run(interaction, config, def, ticket, extra = {}) {
  if (def.cooldownSeconds) lastUse.set(cdKey(interaction, def), Date.now());
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
  const say = (content, more = {}) => interaction.editReply({ content: content || '', components: [], embeds: [], ...more });
  const sendReply = text => interaction.channel.send({ content: text, allowedMentions: { users: [interaction.user.id] } });
  const cmd = { ...def, name: def.label, ticketOnly: false };
  await performAction({
    config, cmd, channel: interaction.channel, guild: interaction.guild, member: interaction.member, user: interaction.user,
    ticket, rest: extra.rest || '', targetUser: extra.targetUser || null, say, sendReply, usageOf: () => def.label,
  });
  // "Özel cevap": cevap kanala yazıldı, geçici "düşünüyor" mesajı kaldırılır
  if (def.action === 'reply') await interaction.deleteReply().catch(() => null);
}

function textModal(customId, title, label, placeholder, required) {
  const input = new TextInputBuilder().setCustomId('value').setLabel(label.slice(0, 45)).setPlaceholder(placeholder.slice(0, 100))
    .setStyle(TextInputStyle.Short).setRequired(required).setMaxLength(100);
  return new ModalBuilder().setCustomId(customId).setTitle(title.slice(0, 45)).addComponents(new ActionRowBuilder().addComponents(input));
}

async function handleCustomButton(interaction, config, id) {
  const p = await prepare(interaction, config, id, { checkCooldown: true });
  if (!p) return undefined;
  const { def, ticket } = p;
  switch (def.action) {
    case 'close': {
      const mode = config.settings.askCloseReason;
      const asked = mode === 'everyone' || (mode === 'staff' && isStaff(interaction.member, config));
      if (!asked) return run(interaction, config, def, ticket);
      const modal = t.buildCloseModal(config).setCustomId(`ticket-custom-modal:close:${def.id}`);
      return interaction.showModal(modal);
    }
    case 'rename':
      return interaction.showModal(textModal(`ticket-custom-modal:rename:${def.id}`, msg(config, 'renameModalTitle'), msg(config, 'renameModalLabel'), msg(config, 'renameModalPlaceholder'), true));
    case 'priority':
      return interaction.reply({
        content: msg(config, 'priorityPrompt'), ephemeral: true,
        components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`ticket-custom-prio:${def.id}`).setPlaceholder(msg(config, 'priorityPrompt').slice(0, 100))
          .addOptions(['low', 'normal', 'high', 'urgent'].map(k => ({ label: priorityLabel(config, k).slice(0, 100), value: k }))))],
      });
    case 'useradd':
    case 'userremove':
    case 'block':
    case 'unblock':
      return interaction.reply({
        content: msg(config, 'customUserPrompt'), ephemeral: true,
        components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`ticket-custom-user:${def.id}`).setPlaceholder(msg(config, 'customUserPlaceholder').slice(0, 100)).setMinValues(1).setMaxValues(1))],
      });
    case 'delete':
      return interaction.reply({
        content: msg(config, 'deleteConfirm'), ephemeral: true,
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ticket-custom-confirm:${def.id}`).setLabel(msg(config, 'btnDeleteConfirm').slice(0, 80)).setStyle(ButtonStyle.Danger))],
      });
    default:
      return run(interaction, config, def, ticket);
  }
}

async function handleCustomModal(interaction, config, rest) {
  const [kind, id] = [rest.slice(0, rest.indexOf(':')), rest.slice(rest.indexOf(':') + 1)];
  const p = await prepare(interaction, config, id);
  if (!p) return undefined;
  if (kind === 'close') return run(interaction, config, p.def, p.ticket, { rest: interaction.fields.getTextInputValue('ticket-close-reason') });
  if (kind === 'rename') return run(interaction, config, p.def, p.ticket, { rest: interaction.fields.getTextInputValue('value') });
  return undefined;
}

async function handleCustomUser(interaction, config, id) {
  const p = await prepare(interaction, config, id);
  if (!p) return undefined;
  await interaction.deferUpdate();
  return run(interaction, config, p.def, p.ticket, { targetUser: interaction.users.first() || null });
}

async function handleCustomPriority(interaction, config, id) {
  const p = await prepare(interaction, config, id);
  if (!p) return undefined;
  await interaction.deferUpdate();
  return run(interaction, config, p.def, p.ticket, { rest: interaction.values[0] });
}

async function handleCustomConfirm(interaction, config, id) {
  const p = await prepare(interaction, config, id);
  if (!p) return undefined;
  await interaction.deferUpdate();
  return run(interaction, config, p.def, p.ticket);
}

module.exports = { handleCustomPriority, handleCustomButton, handleCustomModal, handleCustomUser, handleCustomConfirm };
