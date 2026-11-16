const { SlashCommandBuilder } = require('discord.js');
const { readConfig } = require('../utils/config');
const gw = require('../utils/giveaways');

const idOpt = o => o.setName('id').setDescription('Çekiliş ID (boşsa en son)').setRequired(false);
module.exports = {
  data: new SlashCommandBuilder().setName('cekilis').setDescription('Çekiliş yönetimi (yetkililer)')
    .addSubcommand(s => s.setName('baslat').setDescription('Bu kanalda çekiliş başlat')
      .addStringOption(o => o.setName('sure').setDescription('Örn: 30m, 2h, 1d, 1h30m').setRequired(true))
      .addIntegerOption(o => o.setName('kazanan').setDescription('Kazanan sayısı').setMinValue(1).setMaxValue(20).setRequired(true))
      .addStringOption(o => o.setName('odul').setDescription('Ödül').setMaxLength(200).setRequired(true))
      .addRoleOption(o => o.setName('rol').setDescription('Şart: bu role sahip olmalı').setRequired(false))
      .addBooleanOption(o => o.setName('tag').setDescription('Şart: sunucu etiketini (tag) profiline takmış olmalı').setRequired(false))
      .addStringOption(o => o.setName('durum').setDescription('Şart: özel durumunda bu yazı geçmeli (örn: .gg/deuslra)').setMaxLength(100).setRequired(false))
      .addIntegerOption(o => o.setName('ses').setDescription('Şart: çekiliş boyunca seste en az kaç dakika kalmalı').setMinValue(1).setMaxValue(100000).setRequired(false))
      .addIntegerOption(o => o.setName('mesaj').setDescription('Şart: çekiliş boyunca en az kaç mesaj yazmalı').setMinValue(1).setMaxValue(100000).setRequired(false))
      .addIntegerOption(o => o.setName('invite').setDescription('Şart: çekiliş boyunca en az kaç kişi davet etmeli').setMinValue(1).setMaxValue(10000).setRequired(false)))
    .addSubcommand(s => s.setName('bitir').setDescription('Çekilişi şimdi bitir').addStringOption(idOpt))
    .addSubcommand(s => s.setName('tekrar').setDescription('Tekrar çek').addStringOption(idOpt).addIntegerOption(o => o.setName('adet').setDescription('Kaç yeni kazanan').setMinValue(1).setMaxValue(20)))
    .addSubcommand(s => s.setName('iptal').setDescription('Çekilişi iptal et').addStringOption(idOpt))
    .addSubcommand(s => s.setName('liste').setDescription('Çalışan çekilişler')),
  async execute(interaction) {
    const config = readConfig();
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();
    const id = interaction.options.getString('id') || '';
    const rest = sub === 'baslat'
      ? `${interaction.options.getString('sure')} ${interaction.options.getInteger('kazanan')} ${interaction.options.getString('odul')}`
      : `${id} ${interaction.options.getInteger('adet') || ''}`;
    const requirements = sub === 'baslat' ? {
      roleIds: [interaction.options.getRole('rol')?.id].filter(Boolean),
      serverTag: interaction.options.getBoolean('tag') === true,
      statusText: interaction.options.getString('durum') || '',
      voiceMinutes: interaction.options.getInteger('ses') || 0,
      messages: interaction.options.getInteger('mesaj') || 0,
      invites: interaction.options.getInteger('invite') || 0,
    } : undefined;
    const action = { baslat: 'gstart', bitir: 'gend', tekrar: 'greroll', iptal: 'gcancel', liste: 'glist' }[sub];
    const r = await gw.runCommand({ action, config, client: interaction.client, channel: interaction.channel, member: interaction.member, user: interaction.user, rest, requirements });
    await interaction.editReply({ content: r.text || '✅', allowedMentions: { parse: [] } });
  },
};
