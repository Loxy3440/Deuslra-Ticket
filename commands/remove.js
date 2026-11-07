const { SlashCommandBuilder } = require('discord.js');
const { readConfig } = require('../utils/config');
const { handleRemoveUser } = require('../utils/tickets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Bir kullanıcıyı ticket\'tan çıkar')
    .addUserOption(o => o.setName('user').setDescription('Çıkarılacak kullanıcı').setRequired(true)),
  async execute(interaction) { await handleRemoveUser(interaction, readConfig(), interaction.options.getUser('user', true)); },
};
