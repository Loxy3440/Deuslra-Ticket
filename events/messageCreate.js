const { Events } = require('discord.js');
const { readConfig } = require('../utils/config');
const { findCommand, runCommand } = require('../utils/commands');
const { msg } = require('../utils/messages');

// Her mesajda ayarları baştan okumamak için kısa süreli önbellek (ayar değişince en geç 3 sn'de geçerli olur)
let cached = null; let cachedAt = 0;
function config() {
  if (!cached || Date.now() - cachedAt > 3000) { cached = readConfig(); cachedAt = Date.now(); }
  return cached;
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot || !message.guild || !message.content) return;
    const cfg = config();
    const { enabled, prefix } = cfg.commands;
    if (!enabled || !message.content.startsWith(prefix)) return;
    const body = message.content.slice(prefix.length).trim();
    if (!body) return;
    const i = body.search(/\s/);
    const name = i < 0 ? body : body.slice(0, i);
    const rest = i < 0 ? '' : body.slice(i).trim();
    const cmd = findCommand(cfg, name);
    if (!cmd) return;
    try {
      if (!message.member) message.member = await message.guild.members.fetch(message.author.id).catch(() => null);
      await runCommand({ message, config: cfg, cmd, rest });
      if (cfg.commands.deleteInvocation && cmd.action !== 'delete') message.delete().catch(() => null);
    } catch (err) {
      console.error('[KOMUT]', cmd.name, err);
      message.reply({ content: msg(cfg, 'cmdFailed'), allowedMentions: { repliedUser: false } }).catch(() => null);
    }
  },
};
