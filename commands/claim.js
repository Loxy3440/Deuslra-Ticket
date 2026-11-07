const { SlashCommandBuilder } = require('discord.js');
const { readConfig } = require('../utils/config');
const { handleClaim } = require('../utils/tickets');

module.exports = {
  data: new SlashCommandBuilder().setName('claim').setDescription('Bu ticket\'ı üstlen'),
  async execute(interaction) { await handleClaim(interaction, readConfig()); },
};
