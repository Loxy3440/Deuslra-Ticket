const { Events } = require('discord.js');
const gw = require('../utils/giveaways');

// Çekiliş "davet sayısı" şartı: yeni üyenin hangi davetle girdiğini bulur (GUILD_MEMBERS_INTENT=true gerekir).
module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    try { await gw.onMemberJoin(member); } catch (err) { console.error('[ÇEKİLİŞ] davet takibi:', err.message); }
  },
};
