const { SlashCommandBuilder } = require('discord.js');
const { readConfig } = require('../utils/config');
const { handleCallStaff } = require('../utils/tickets');

module.exports = {
  data: new SlashCommandBuilder().setName('call-staff').setDescription('Ticket kanalında destek yetkililerini çağır'),
  async execute(interaction) { await handleCallStaff(interaction, readConfig()); },
};
