const { PermissionFlagsBits, PermissionsBitField } = require('discord.js');

function isSupportMember(member, config) {
  const roleIds = config.supportRoleIds ?? [];
  if (!roleIds.length) return false;
  const roles = member?.roles;
  if (roles?.cache) return roleIds.some(id => roles.cache.has(id));
  if (Array.isArray(roles)) return roleIds.some(id => roles.includes(id));
  return false;
}

function isServerManager(member) {
  const raw = member?.permissions;
  const bits = typeof raw === 'string' && /^\d+$/.test(raw) ? BigInt(raw) : raw ?? 0n;
  const perms = new PermissionsBitField(bits);
  return perms.has(PermissionFlagsBits.ManageGuild) || perms.has(PermissionFlagsBits.Administrator);
}

// Destek rolü olan veya sunucuyu yönetebilen herkes yetkili sayılır.
function isStaff(member, config) {
  return isSupportMember(member, config) || isServerManager(member);
}

// Botun çalışması için gereken izinler ve Türkçe adları (Discord'daki görünen adlarla aynı)
const PERM_LABELS = {
  ViewChannel: 'Kanalları Gör',
  SendMessages: 'Mesaj Gönder',
  EmbedLinks: 'Bağlantı Göm',
  AttachFiles: 'Dosya Ekle',
  ReadMessageHistory: 'Mesaj Geçmişini Oku',
  ManageChannels: 'Kanalları Yönet',
  ManageRoles: 'Rolleri Yönet (kanal izinleri için)',
  ManageMessages: 'Mesajları Yönet',
};
const BOT_REQUIRED = ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory', 'ManageChannels', 'ManageRoles', 'ManageMessages'];
const PANEL_CHANNEL_REQUIRED = ['ViewChannel', 'SendMessages', 'EmbedLinks', 'ReadMessageHistory'];
const LOG_CHANNEL_REQUIRED = ['ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles'];
const CATEGORY_REQUIRED = ['ViewChannel', 'ManageChannels'];

// perms: PermissionsBitField | null. Yönetici izni her şeyi kapsar. Eksik izinlerin Türkçe adlarını döndürür.
function missingPermissions(perms, keys) {
  if (!perms) return keys.map(k => PERM_LABELS[k] || k);
  if (perms.has(PermissionFlagsBits.Administrator)) return [];
  return keys.filter(k => !perms.has(PermissionFlagsBits[k])).map(k => PERM_LABELS[k] || k);
}

module.exports = {
  isSupportMember, isServerManager, isStaff, missingPermissions,
  PERM_LABELS, BOT_REQUIRED, PANEL_CHANNEL_REQUIRED, LOG_CHANNEL_REQUIRED, CATEGORY_REQUIRED,
};
