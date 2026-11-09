const { Events } = require('discord.js');
const { readConfig } = require('../utils/config');
const { replyPrivate } = require('../utils/replies');
const { buildPanelPayload } = require('../utils/panel');
const t = require('../utils/tickets');
const { msg } = require('../utils/messages');
const cb = require('../utils/customButtons');

async function handleButton(interaction, config) {
  const id = interaction.customId;
  if (id.startsWith('transcript-dl:')) return t.handleTranscriptDownload(interaction, config, id.slice('transcript-dl:'.length));
  if (id.startsWith('ticket-faq-go:')) return t.handleOpenButton(interaction, config, id.slice('ticket-faq-go:'.length), { skipFaq: true });
  if (id.startsWith('ticket-rate:')) { const [, ch, n] = id.split(':'); return t.handleRating(interaction, config, ch, n); }
  if (id.startsWith('ticket-custom:')) return cb.handleCustomButton(interaction, config, id.slice('ticket-custom:'.length));
  if (id.startsWith('ticket-custom-confirm:')) return cb.handleCustomConfirm(interaction, config, id.slice('ticket-custom-confirm:'.length));
  if (id.startsWith('ticket-open:')) return t.handleOpenButton(interaction, config, id.slice('ticket-open:'.length));
  switch (id) {
    case 'ticket-action:close': return t.handleCloseButton(interaction, config);
    case 'ticket-action:claim': return t.handleClaim(interaction, config);
    case 'ticket-action:call-staff': return t.handleCallStaff(interaction, config);
    case 'ticket-action:reopen': return t.handleReopen(interaction, config);
    case 'ticket-action:delete': return t.handleDeleteRequest(interaction, config);
    case 'ticket-action:delete-confirm': return t.handleDelete(interaction, config);
    default: return undefined;
  }
}

// Açılır listeden kategori seçildiğinde: buton tıklamasıyla aynı akış (form varsa modal, yoksa direkt ticket).
async function handleSelect(interaction, config) {
  if (interaction.customId.startsWith('ticket-custom-move:')) return cb.handleCustomMove(interaction, config, interaction.customId.slice('ticket-custom-move:'.length));
  if (interaction.customId.startsWith('ticket-custom-prio:')) return cb.handleCustomPriority(interaction, config, interaction.customId.slice('ticket-custom-prio:'.length));
  if (interaction.customId !== 'ticket-select') return undefined;
  // Seçilen seçenek menüde işaretli kalmasın diye paneli kısa süre sonra aynı haline döndür.
  setTimeout(() => { interaction.message?.edit({ components: buildPanelPayload(config).components }).catch(() => null); }, 800);
  return t.handleOpenButton(interaction, config, interaction.values[0]);
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    try {
      const config = readConfig();
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (command) await command.execute(interaction, client);
      } else if (interaction.isButton()) {
        await handleButton(interaction, config);
      } else if (interaction.isUserSelectMenu()) {
        if (interaction.customId.startsWith('ticket-custom-user:')) await cb.handleCustomUser(interaction, config, interaction.customId.slice('ticket-custom-user:'.length));
      } else if (interaction.isStringSelectMenu()) {
        await handleSelect(interaction, config);
      } else if (interaction.isModalSubmit()) {
        if (interaction.customId === 'ticket-close-submit') {
          await t.handleClose(interaction, config, interaction.fields.getTextInputValue('ticket-close-reason'));
        } else if (interaction.customId.startsWith('ticket-custom-modal:')) {
          await cb.handleCustomModal(interaction, config, interaction.customId.slice('ticket-custom-modal:'.length));
        } else if (interaction.customId.startsWith('ticket-form-submit:')) {
          await t.handleFormSubmit(interaction, config, interaction.customId.slice('ticket-form-submit:'.length));
        }
      }
    } catch (err) {
      console.error('[INTERACTION]', err);
      if (interaction.isRepliable()) {
        await replyPrivate(interaction, msg(readConfig(), 'interactionError')).catch(() => null);
      }
    }
  },
};
