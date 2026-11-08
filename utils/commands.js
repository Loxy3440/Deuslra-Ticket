const { EmbedBuilder } = require('discord.js');
const { parseTicket } = require('./config');
const { isStaff } = require('./permissions');
const { ACTIONS } = require('./commandDefs');
const { msg, render } = require('./messages');
const store = require('./store');
const t = require('./tickets');

const lastUse = new Map(); // "komutId:kullanıcı" -> zaman (bekleme süresi için)
const sleep = ms => new Promise(r => setTimeout(r, ms));
const unix = ms => Math.floor(ms / 1000);

function findCommand(config, name) {
  const n = String(name || '').toLowerCase();
  return config.commands.list.find(c => c.enabled && (c.name === n || c.aliases.includes(n))) || null;
}

function canUse(cmd, member, ticket, userId, config) {
  if (cmd.roleIds.some(id => member?.roles?.cache?.has(id))) return true;
  const staff = isStaff(member, config);
  const owner = Boolean(ticket && ticket.ownerId === userId);
  return { everyone: true, staff, owner, ownerOrStaff: staff || owner }[cmd.permission] ?? false;
}

// Etiketten ya da ID'den kişi bulur
async function resolveUser(message, rest) {
  const mentioned = message.mentions.users.first();
  if (mentioned) return mentioned;
  const id = rest.match(/\d{15,25}/)?.[0];
  return id ? message.client.users.fetch(id).catch(() => null) : null;
}

// Ortak eylem yürütücü: yazıyla komutlar ve ticket içi butonlar aynı kodu kullanır.
// ctx: { config, cmd (action/name/response...), channel, guild, member, user, ticket, rest, targetUser, say, sendReply, usageOf }
async function performAction(ctx) {
  const { config, cmd, channel, guild, member, user, ticket, rest = '', say } = ctx;
  const prefix = config.commands.prefix;
  const usageOf = ctx.usageOf || (() => '');
  const actor = { id: user.id, label: user.username, mention: `<@${user.id}>` };
  const staff = isStaff(member, config);
  const pad = t.pad;

  switch (cmd.action) {
    case 'close': {
      let reason = rest.trim();
      const mode = config.settings.askCloseReason;
      const asked = mode === 'everyone' || (mode === 'staff' && staff);
      if (asked && config.settings.closeReasonRequired && !reason) return say(msg(config, 'cmdNeedReason', { usage: usageOf() }));
      if (!reason && !staff) reason = msg(config, 'closeReasonOwner');
      const res = await t.closeTicket({ channel, config, actor, reason });
      if (res.error) return say(res.error);
      const note = res.hideFailed ? ` ${msg(config, 'closeHideFailed')}` : '';
      return say(msg(config, res.dmSent ? 'closeReplyDm' : 'closeReplyNoDm') + note);
    }
    case 'reopen': {
      const res = await t.reopenTicket({ channel, config, actor });
      return say(res.error || msg(config, 'reopenReply'));
    }
    case 'delete': {
      await say(msg(config, 'deleteReply'));
      await t.deleteTicket({ channel, config, actor, reason: '' });
      return undefined;
    }
    case 'claim': {
      const res = await t.claimTicket({ channel, config, actor });
      return say(res.error || msg(config, 'claimReply'));
    }
    case 'callstaff': {
      if (ticket.status !== 'open') return say(msg(config, 'ticketClosed'));
      const roleIds = config.supportRoleIds.filter(id => guild.roles.cache.has(id));
      if (!roleIds.length) return say(msg(config, 'callStaffNoRole'));
      await channel.send({ content: msg(config, 'callStaffMessage', { roles: roleIds.map(id => `<@&${id}>`).join(' ') }), allowedMentions: { roles: roleIds } });
      return say(msg(config, 'callStaffReply'));
    }
    case 'useradd': {
      if (ticket.status !== 'open') return say(msg(config, 'ticketClosed'));
      const user = ctx.targetUser;
      if (!user) return say(msg(config, 'cmdUserNotFound', { usage: usageOf() }));
      await channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true });
      await channel.send({ content: msg(config, 'userAddedChannel', { user: `${user}` }), allowedMentions: { users: [user.id] } });
      return say(msg(config, 'userAddedReply', { username: user.username }));
    }
    case 'userremove': {
      if (ticket.status !== 'open') return say(msg(config, 'ticketClosed'));
      const user = ctx.targetUser;
      if (!user) return say(msg(config, 'cmdUserNotFound', { usage: usageOf() }));
      if (ticket.ownerId === user.id) return say(msg(config, 'cannotRemoveOwner'));
      await channel.permissionOverwrites.delete(user.id).catch(() => null);
      await channel.send({ content: msg(config, 'userRemovedChannel', { username: user.username }), allowedMentions: { parse: [] } });
      return say(msg(config, 'userRemovedReply', { username: user.username }));
    }
    case 'rename': {
      const name = rest.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').slice(0, 100);
      if (!name) return say(msg(config, 'cmdUsage', { usage: usageOf() }));
      const ok = await Promise.race([channel.setName(name).then(() => true).catch(() => false), sleep(8000).then(() => false)]);
      return say(ok ? msg(config, 'cmdRenamed', { name }) : msg(config, 'cmdRenameFailed'));
    }
    case 'ticketinfo': {
      const rec = store.get(channel.id);
      const cat = config.buttons.find(b => b.id === ticket.buttonId);
      const none = msg(config, 'fieldNone');
      const embed = new EmbedBuilder().setColor(config.colors.main).setTitle(msg(config, 'infoTitle', { number: pad(ticket.number) }).slice(0, 256))
        .addFields(
          { name: msg(config, 'fieldOwner'), value: ticket.ownerId ? `<@${ticket.ownerId}>` : none, inline: true },
          { name: msg(config, 'fieldCategory'), value: cat?.label || rec?.buttonLabel || none, inline: true },
          { name: msg(config, 'fieldStatus'), value: msg(config, ticket.status === 'open' ? 'statusOpen' : 'statusClosed'), inline: true },
          { name: msg(config, 'fieldClaimedBy'), value: ticket.claimId ? `<@${ticket.claimId}>` : none, inline: true },
          { name: msg(config, 'fieldOpened'), value: rec?.createdAt ? `<t:${unix(rec.createdAt)}:R>` : none, inline: true },
        ).setFooter({ text: config.brandName });
      return say('', { embeds: [embed] });
    }
    case 'help': {
      const lines = config.commands.list
        .filter(c => c.enabled && c.action !== 'help' && canUse(c, member, ticket, user.id, config) && (!c.ticketOnly || ticket))
        .map(c => `**${prefix}${c.name}** ${ACTIONS[c.action].usage ? `\`${ACTIONS[c.action].usage}\` ` : ''}${c.description ? `— ${c.description}` : ''}`);
      if (!lines.length) return say(msg(config, 'helpEmpty'));
      const embed = new EmbedBuilder().setColor(config.colors.main).setTitle(msg(config, 'helpTitle').slice(0, 256)).setDescription(lines.join('\n').slice(0, 4000)).setFooter({ text: config.brandName });
      return say('', { embeds: [embed] });
    }
    case 'reply': {
      const text = render(cmd.response, {
        user: `<@${user.id}>`, username: user.username, server: guild.name,
        channel: `${channel}`, number: ticket ? pad(ticket.number) : '', prefix,
      });
      return ctx.sendReply(text.slice(0, 2000));
    }
    default: return undefined;
  }
}

async function runCommand({ message, config, cmd, rest }) {
  const meta = ACTIONS[cmd.action];
  const prefix = config.commands.prefix;
  const usageOf = () => `${prefix}${cmd.name}${meta.usage ? ` ${meta.usage}` : ''}`;
  const channel = message.channel;
  const ticket = parseTicket(channel);

  // Cevaplar komutun yazıldığı mesaja yanıt olarak gider; istenirse bir süre sonra silinir.
  const say = async (content, extra = {}) => {
    const sent = await message.reply({ content, allowedMentions: { repliedUser: false, parse: [] }, ...extra }).catch(() => null);
    const sec = config.commands.replyDeleteSeconds;
    if (sent && sec > 0) setTimeout(() => sent.delete().catch(() => null), sec * 1000);
    return sent;
  };

  if ((cmd.ticketOnly || meta.needsTicket) && !ticket) return say(msg(config, 'cmdOnlyTicket'));
  if (!canUse(cmd, message.member, ticket, message.author.id, config)) return say(msg(config, 'cmdNoPermission'));

  if (cmd.cooldownSeconds) {
    const key = `${cmd.id}:${message.author.id}`;
    const left = (lastUse.get(key) || 0) + cmd.cooldownSeconds * 1000 - Date.now();
    if (left > 0) return say(msg(config, 'cmdWait', { time: `<t:${unix(Date.now() + left)}:R>` }));
    lastUse.set(key, Date.now());
  }

  const targetUser = ['useradd', 'userremove'].includes(cmd.action) ? await resolveUser(message, rest) : null;
  const sendReply = async text => {
    const sent = await message.reply({ content: text, allowedMentions: { users: [message.author.id], repliedUser: false } }).catch(() => null);
    const sec = config.commands.replyDeleteSeconds;
    if (sent && sec > 0) setTimeout(() => sent.delete().catch(() => null), sec * 1000);
  };
  return performAction({ config, cmd, channel, guild: message.guild, member: message.member, user: message.author, ticket, rest, targetUser, say, sendReply, usageOf });
}

module.exports = { findCommand, runCommand, performAction, canUse, lastUse };
