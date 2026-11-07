const { SlashCommandBuilder } = require('discord.js');
const { readConfig } = require('../utils/config');
const { handleDelete } = require('../utils/tickets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Bu ticket kanalını kalıcı olarak sil (transcript log kanalına gider)')
    .addStringOption(o => o.setName('reason').setDescription('Silme sebebi (isteğe bağlı)').setMaxLength(400)),
  async execute(interaction) {
    await handleDelete(interaction, readConfig(), interaction.options.getString('reason') || '');
  },
};
