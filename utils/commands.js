const { EmbedBuilder } = require('discord.js');
const { parseTicket, readConfig, writeConfig, buildTicketTopic } = require('./config');
const { slug } = require('./config');
const { isStaff } = require('./permissions');
const { ACTIONS } = require('./commandDefs');
const { msg: baseMsg, renderAll } = require('./messages');
const { ticketVars } = require('./variables');
const msg = baseMsg;
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

// Öncelik düzeyleri: kanal adının başına işaret eklenir
const PRIORITY_EMOJI = { low: '🟢', normal: '', high: '🟠', urgent: '🔴' };
const PRIO_STRIP = /^(?:🟢|🟠|🔴)-?/u;
const PRIO_KEYS = { low: 'priorityLow', normal: 'priorityNormal', high: 'priorityHigh', urgent: 'priorityUrgent' };
const PRIO_ALIASES = { low: ['low', 'dusuk', 'düşük', '1'], normal: ['normal', '2'], high: ['high', 'yuksek', 'yüksek', '3'], urgent: ['urgent', 'acil', '4'] };
const priorityLabel = (config, key) => `${PRIORITY_EMOJI[key] ? PRIORITY_EMOJI[key] + ' ' : ''}${msg(config, PRIO_KEYS[key])}`;
const priorityList = config => Object.keys(PRIO_KEYS).map(k => msg(config, PRIO_KEYS[k])).join(' / ');
function parsePriority(config, text) {
  const w = String(text || '').trim().split(/\s+/)[0]?.toLowerCase();
  if (!w) return null;
  return Object.keys(PRIO_KEYS).find(k => msg(config, PRIO_KEYS[k]).toLowerCase() === w || PRIO_ALIASES[k].includes(w)) || null;
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
  // Bu işlemdeki tüm yazılar talep değişkenlerini ({owner}, {category}, {claimer}...) kullanabilir.
  // {user}/{username}/{staff}: komutu yazan / butona basan kişi.
  const invoker = {
    user: `<@${user.id}>`, username: user.username, userid: user.id, displayname: member?.displayName || user.username,
    useravatar: user.displayAvatarURL?.({ size: 256 }) || '', staff: `<@${user.id}>`, staffname: user.username, staffid: user.id,
  };
  const vars = () => ({ ...ticketVars(config, { channel, guild, actor }), ...invoker });
  const msg = (c, k, v) => baseMsg(c, k, { ...vars(), ...v });
  const sw = cmd.action;

  switch (sw) {
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
    case 'priority': {
      const key = parsePriority(config, rest);
      if (!key) return say(msg(config, 'priorityUsage', { list: priorityList(config) }));
      const base = channel.name.replace(PRIO_STRIP, '');
      const name = (PRIORITY_EMOJI[key] ? `${PRIORITY_EMOJI[key]}-${base}` : base).slice(0, 100);
      if (name !== channel.name) {
        const ok = await Promise.race([channel.setName(name).then(() => true).catch(() => false), sleep(8000).then(() => false)]);
        if (!ok) return say(msg(config, 'cmdRenameFailed'));
      }
      store.upsert(channel.id, { priority: key });
      return say(msg(config, 'priorityChanged', { priority: priorityLabel(config, key) }));
    }
    case 'block': {
      const target = ctx.targetUser;
      if (!target) return say(msg(config, 'cmdUserNotFound', { usage: usageOf() }));
      if (target.id === user.id || target.bot) return say(msg(config, 'blockSelf'));
      const reason = rest.replace(/<@!?\d+>/g, '').replace(/\b\d{15,25}\b/, '').trim().slice(0, 200);
      const cur = readConfig();
      cur.settings.blockedUsers = [...cur.settings.blockedUsers.filter(b => b.id !== target.id), { id: target.id, reason, tag: target.username }];
      writeConfig(cur);
      return say(msg(config, 'blockAdded', { username: target.username }));
    }
    case 'unblock': {
      const target = ctx.targetUser;
      if (!target) return say(msg(config, 'cmdUserNotFound', { usage: usageOf() }));
      const cur = readConfig();
      if (!cur.settings.blockedUsers.some(b => b.id === target.id)) return say(msg(config, 'blockNotFound', { username: target.username }));
      cur.settings.blockedUsers = cur.settings.blockedUsers.filter(b => b.id !== target.id);
      writeConfig(cur);
      return say(msg(config, 'blockRemoved', { username: target.username }));
    }
    case 'rename': {
      const name = rest.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').slice(0, 100);
      if (!name) return say(msg(config, 'cmdUsage', { usage: usageOf() }));
      const ok = await Promise.race([channel.setName(name).then(() => true).catch(() => false), sleep(8000).then(() => false)]);
      return say(ok ? msg(config, 'cmdRenamed', { name }) : msg(config, 'cmdRenameFailed'));
    }
    case 'transfer': {
      const target = ctx.targetUser;
      if (!target || target.bot) return say(msg(config, 'transferUsage'));
      await channel.permissionOverwrites.edit(target.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true }).catch(() => null);
      await Promise.race([channel.edit({ topic: buildTicketTopic({ ...ticket, claimId: target.id }) }).catch(() => null), sleep(8000)]);
      store.upsert(channel.id, { claimedBy: target.id, claimedByTag: target.username });
      await channel.send({ content: msg(config, 'transferDone', { target: `<@${target.id}>`, targetname: target.username }), allowedMentions: { users: [target.id] } }).catch(() => null);
      return ctx.afterQuiet?.();
    }
    case 'move': {
      const q = slug(rest);
      const list = config.buttons.map(b => b.label).join(' / ');
      if (!q) return say(msg(config, 'moveUsage', { list }));
      const dest = config.buttons.find(b => b.id === q || slug(b.label) === q) || config.buttons.find(b => slug(b.label).startsWith(q));
      if (!dest) return say(msg(config, 'moveNotFound', { list }));
      const old = config.buttons.find(b => b.id === ticket.buttonId);
      const keep = new Set([...config.supportRoleIds, ...(dest.roleIds || [])]);
      for (const id of (old?.roleIds || [])) if (!keep.has(id)) await channel.permissionOverwrites.delete(id).catch(() => null);
      for (const id of (dest.roleIds || [])) if (guild.roles.cache.has(id)) await channel.permissionOverwrites.edit(id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true }).catch(() => null);
      const parentId = dest.categoryId || config.ticketCategoryId;
      if (parentId && channel.parentId !== parentId) await Promise.race([channel.setParent(parentId, { lockPermissions: false }).catch(() => null), sleep(8000)]);
      await Promise.race([channel.edit({ topic: buildTicketTopic({ ...ticket, buttonId: dest.id }) }).catch(() => null), sleep(8000)]);
      store.upsert(channel.id, { buttonId: dest.id, buttonLabel: dest.label });
      await channel.send({ content: msg(config, 'moveDone', { newcategory: dest.label, category: dest.label }), allowedMentions: { parse: [] } }).catch(() => null);
      return ctx.afterQuiet?.();
    }
    case 'canned': {
      const q = slug(rest);
      const item = (config.canned || []).find(c => c.name === q);
      if (!(config.canned || []).length) return say(msg(config, 'cannedNone'));
      if (!item) return say(msg(config, 'cannedList', { list: config.canned.map(c => c.name).join(', ') }));
      const text = renderAll(config, item.text, { ...ticketVars(config, { channel, guild, actor }), staff: invoker.staff, staffname: invoker.staffname, staffid: invoker.staffid });
      await channel.send({ content: text.slice(0, 2000), allowedMentions: { parse: ['users'] } }).catch(() => null);
      return ctx.afterQuiet?.();
    }
    case 'note': {
      const textNote = rest.trim().slice(0, 500);
      if (!textNote) return say(msg(config, 'noteUsage', { usage: usageOf() }));
      const rec = store.get(channel.id) || {};
      const notes = [...(rec.notes || []), { by: user.username, byId: user.id, text: textNote, at: Date.now() }].slice(-50);
      store.upsert(channel.id, { notes });
      await ctx.hideInvocation?.();
      await t.logEvent(guild, config, {
        title: msg(config, 'noteLogTitle', { number: pad(ticket.number) }), color: config.colors.main, description: textNote,
        fields: [{ name: msg(config, 'fieldChannel'), value: `${channel}`, inline: true }, { name: msg(config, 'fieldStaff') , value: `<@${user.id}>`, inline: true }],
      });
      return say(msg(config, 'noteSaved'));
    }
    case 'notes': {
      const notes = store.get(channel.id)?.notes || [];
      if (!notes.length) return say(msg(config, 'notesEmpty'));
      const body = notes.map(n => `• <t:${unix(n.at)}:f> **${n.by}**: ${n.text}`).join('\n').slice(0, 3900);
      const sent = await user.send({ embeds: [new EmbedBuilder().setColor(config.colors.main).setTitle(`#${pad(ticket.number)}`).setDescription(body)] }).then(() => true).catch(() => false);
      return say(msg(config, sent ? 'notesDm' : 'notesDmFail'));
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
      const text = renderAll(config, cmd.response, vars());
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

  const targetUser = ['useradd', 'userremove', 'block', 'unblock', 'transfer'].includes(cmd.action) ? await resolveUser(message, rest) : null;
  const sendReply = async text => {
    const sent = await message.reply({ content: text, allowedMentions: { users: [message.author.id], repliedUser: false } }).catch(() => null);
    const sec = config.commands.replyDeleteSeconds;
    if (sent && sec > 0) setTimeout(() => sent.delete().catch(() => null), sec * 1000);
  };
  const hideInvocation = () => message.delete().catch(() => null);
  return performAction({ config, cmd, channel, guild: message.guild, member: message.member, user: message.author, ticket, rest, targetUser, say, sendReply, usageOf, hideInvocation });
}

module.exports = { findCommand, runCommand, performAction, canUse, lastUse, priorityLabel };
