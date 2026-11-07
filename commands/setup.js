const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { readConfig } = require('../utils/config');
const { isServerManager } = require('../utils/permissions');
const { publishPanel } = require('../utils/panel');
const { replyPrivate } = require('../utils/replies');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Ticket panelini yayınla veya güncelle')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    if (!isServerManager(interaction.member)) return replyPrivate(interaction, 'Ticket panelini yalnızca sunucu yöneticileri yenileyebilir.');
    await interaction.deferReply({ ephemeral: true });
    try {
      const { channel, updated } = await publishPanel(interaction.guild, readConfig(), interaction.channelId);
      return replyPrivate(interaction, `Ticket paneli ${channel} kanalında ${updated ? 'güncellendi' : 'yayınlandı'}.`);
    } catch (err) {
      return replyPrivate(interaction, `Panel yayınlanamadı: ${err.message}`);
    }
  },
};
