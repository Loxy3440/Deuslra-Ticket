const { ActivityType, Events, REST, Routes } = require('discord.js');
const { readConfig, getGuildId } = require('../utils/config');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    try {
      const guildId = getGuildId(readConfig()) || client.guilds.cache.first()?.id;
      if (!guildId) throw new Error('Sunucu bulunamadı. .env içine DISCORD_GUILD_ID yaz veya botu bir sunucuya ekle.');
      const body = [...client.commands.values()].map(c => c.data.toJSON());
      await new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN)
        .put(Routes.applicationGuildCommands(client.user.id, guildId), { body });
      console.info(`[BOT] ${client.user.tag} hazır · ${body.length} komut kaydedildi`);
    } catch (err) {
      console.error('[BOT] Komutlar kaydedilemedi:', err.message);
    }
    client.user.setPresence({ status: 'online', activities: [{ name: '𝑫𝒆𝒖𝒔𝒍𝒓𝒂', type: ActivityType.Watching }] });
  },
};
