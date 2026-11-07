const { SlashCommandBuilder } = require('discord.js');
const { readConfig } = require('../utils/config');
const { handleClose } = require('../utils/tickets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Bu ticket\'ı kapat ve sebebini kullanıcıya DM ile gönder')
    .addStringOption(o => o.setName('reason').setDescription('Kapatma sebebi').setMaxLength(400).setRequired(true)),
  async execute(interaction) {
    await handleClose(interaction, readConfig(), interaction.options.getString('reason', true));
  },
};
