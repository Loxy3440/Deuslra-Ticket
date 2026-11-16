const { Events } = require('discord.js');
const gw = require('../utils/giveaways');

// Davet edilen kişi çıkarsa davet edenin çekiliş davet sayısından düşer.
module.exports = {
  name: Events.GuildMemberRemove,
  execute(member) {
    try { gw.onMemberLeave(member); } catch (err) { console.error('[ÇEKİLİŞ] davet takibi:', err.message); }
  },
};
