const { Events } = require('discord.js');
const gw = require('../utils/giveaways');

// Çekiliş "ses aktifliği" şartı: kanala giriş / çıkışları sayar.
module.exports = {
  name: Events.VoiceStateUpdate,
  execute(oldState, newState) {
    try { gw.voiceUpdate(oldState, newState); } catch (err) { console.error('[ÇEKİLİŞ] ses takibi:', err.message); }
  },
};
