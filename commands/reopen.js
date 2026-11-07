const { SlashCommandBuilder } = require('discord.js');
const { readConfig } = require('../utils/config');
const { handleReopen } = require('../utils/tickets');

module.exports = {
  data: new SlashCommandBuilder().setName('reopen').setDescription('Kapatılmış bir ticket\'ı yeniden aç'),
  async execute(interaction) { await handleReopen(interaction, readConfig()); },
};
