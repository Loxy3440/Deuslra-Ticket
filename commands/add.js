const { SlashCommandBuilder } = require('discord.js');
const { readConfig } = require('../utils/config');
const { handleAddUser } = require('../utils/tickets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('add')
    .setDescription('Bir kullanıcıyı ticket\'a ekle')
    .addUserOption(o => o.setName('user').setDescription('Eklenecek kullanıcı').setRequired(true)),
  async execute(interaction) { await handleAddUser(interaction, readConfig(), interaction.options.getUser('user', true)); },
};
