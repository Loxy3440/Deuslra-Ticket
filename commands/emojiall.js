const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { copyAppEmojis, progressText, reportText } = require('../utils/emojiall');

module.exports = {
  data: new SlashCommandBuilder().setName('emojiall')
    .setDescription('Developer Portal\'daki (uygulama) tüm emojileri bu sunucuya aktarır')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
    .setDMPermission(false)
    .addBooleanOption(o => o.setName('onizleme').setDescription('Sadece ne olacağını göster, emoji ekleme').setRequired(false)),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    let last = 0;
    const r = await copyAppEmojis({
      client: interaction.client, guild: interaction.guild, member: interaction.member, dryRun: interaction.options.getBoolean('onizleme') === true,
      onProgress: async s => { if (Date.now() - last > 4000) { last = Date.now(); await interaction.editReply({ content: progressText(s) }).catch(() => null); } },
    });
    return interaction.editReply({ content: r.error ? `❌ ${r.error}` : reportText(r.summary), allowedMentions: { parse: [] } });
  },
};
