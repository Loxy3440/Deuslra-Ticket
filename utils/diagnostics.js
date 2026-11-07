const { PermissionFlagsBits } = require('discord.js');
const { readPanelState } = require('./config');
const db = require('./db');
const {
  missingPermissions, BOT_REQUIRED, PANEL_CHANNEL_REQUIRED, LOG_CHANNEL_REQUIRED, CATEGORY_REQUIRED,
} = require('./permissions');

// Botu doğru izinlerle davet etmek için bağlantı (gerekli tüm izinler tek seferde)
function inviteUrl(client) {
  try {
    return client.generateInvite({
      scopes: ['bot', 'applications.commands'],
      permissions: BOT_REQUIRED.map(k => PermissionFlagsBits[k]),
    });
  } catch { return ''; }
}

const ok = (id, title, detail) => ({ id, title, status: 'ok', detail });
const warn = (id, title, detail, fix) => ({ id, title, status: 'warn', detail, fix });
const bad = (id, title, detail, fix) => ({ id, title, status: 'bad', detail, fix });

// Kurulumun her adımını kontrol eder; panel "Genel bakış" sekmesinde kontrol listesi olarak gösterilir.
async function runDiagnostics({ client, guild, config }) {
  const checks = [];

  if (!client.isReady() || !guild) {
    checks.push(bad('bot', 'Bot sunucuya bağlı', 'Bot Discord\'a bağlanamadı veya sunucuyu göremiyor.',
      '.env içindeki DISCORD_BOT_TOKEN ve DISCORD_GUILD_ID değerlerini kontrol et, botun bu sunucuda olduğundan emin ol ve botu yeniden başlat.'));
    return { connected: false, inviteUrl: '', checks, ready: false };
  }
  checks.push(ok('bot', 'Bot sunucuya bağlı', `${client.user.username} · ${guild.name}`));

  const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);

  // 1) Sunucu genelindeki izinler
  const missingGuild = missingPermissions(me?.permissions ?? null, BOT_REQUIRED);
  checks.push(missingGuild.length
    ? bad('perms', 'Bot izinleri', `Eksik: ${missingGuild.join(', ')}`,
      'Sunucu Ayarları > Roller > bot rolü > İzinler bölümünden bunları aç. En kolayı: aşağıdaki "Botu doğru izinlerle davet et" bağlantısını aç, sunucunu seç ve onayla (bot zaten ekliyse sadece izinler güncellenir).')
    : ok('perms', 'Bot izinleri', 'Gerekli tüm sunucu izinleri var.'));

  // 2) Panel kanalı
  const panelChannel = config.panel.channelId ? guild.channels.cache.get(config.panel.channelId) : null;
  if (!config.panel.channelId) {
    checks.push(bad('panel-channel', 'Panel kanalı', 'Panel kanalı seçilmemiş.', 'Ayarlar sekmesinde "Panel kanalı"nı seç ve kaydet.'));
  } else if (!panelChannel) {
    checks.push(bad('panel-channel', 'Panel kanalı', 'Seçili kanal sunucuda bulunamadı.', 'Ayarlar sekmesinden kanalı yeniden seç.'));
  } else {
    const miss = missingPermissions(me ? panelChannel.permissionsFor(me) : null, PANEL_CHANNEL_REQUIRED);
    checks.push(miss.length
      ? bad('panel-channel', 'Panel kanalı', `#${panelChannel.name} kanalında botun şu izinleri yok: ${miss.join(', ')}`,
        `#${panelChannel.name} > Kanalı Düzenle > İzinler: bot rolünü ekle ve bu izinleri "izin ver" yap. Kanalda "@everyone" için "Kanalı Gör" kapalıysa botun rolüne ayrıca açman gerekir.`)
      : ok('panel-channel', 'Panel kanalı', `#${panelChannel.name} · bot mesaj gönderebilir`));
  }

  // 3) Ticket kategorisi
  const category = config.ticketCategoryId ? guild.channels.cache.get(config.ticketCategoryId) : null;
  if (!config.ticketCategoryId) {
    checks.push(warn('category', 'Ticket kategorisi', 'Seçilmedi; ticket kanalları kategorisiz açılır.', 'Ayarlar sekmesinden bir kategori seçersen düzenli durur.'));
  } else if (!category) {
    checks.push(bad('category', 'Ticket kategorisi', 'Seçili kategori bulunamadı.', 'Ayarlar sekmesinden kategoriyi yeniden seç.'));
  } else {
    const miss = missingPermissions(me ? category.permissionsFor(me) : null, CATEGORY_REQUIRED);
    checks.push(miss.length
      ? bad('category', 'Ticket kategorisi', `"${category.name}" kategorisinde botun şu izinleri yok: ${miss.join(', ')}`,
        'Kategori ayarlarından (İzinler) bot rolüne bu izinleri ver; yoksa ticket kanalı oluşturulamaz.')
      : ok('category', 'Ticket kategorisi', `${category.name} · bot kanal oluşturabilir`));
  }

  // 4) Log kanalı
  const logChannel = config.logChannelId ? guild.channels.cache.get(config.logChannelId) : null;
  if (!config.logChannelId) {
    checks.push(warn('log', 'Log kanalı', 'Seçilmedi; açılış/kapanış kayıtları ve transcript gönderilmez.', 'Ayarlar sekmesinden bir log kanalı seç.'));
  } else if (!logChannel) {
    checks.push(bad('log', 'Log kanalı', 'Seçili log kanalı bulunamadı.', 'Ayarlar sekmesinden yeniden seç.'));
  } else {
    const miss = missingPermissions(me ? logChannel.permissionsFor(me) : null, LOG_CHANNEL_REQUIRED);
    checks.push(miss.length
      ? bad('log', 'Log kanalı', `#${logChannel.name} kanalında botun şu izinleri yok: ${miss.join(', ')}`, 'Kanal izinlerinden bot rolüne ver.')
      : ok('log', 'Log kanalı', `#${logChannel.name}`));
  }

  // 5) Destek rolleri
  const roles = config.supportRoleIds.filter(id => guild.roles.cache.has(id));
  checks.push(roles.length
    ? ok('roles', 'Destek rolleri', roles.map(id => guild.roles.cache.get(id).name).join(', '))
    : warn('roles', 'Destek rolleri', 'Hiç destek rolü seçilmemiş; ticketları sadece sunucu yöneticileri görür.', 'Ayarlar sekmesinden destek ekibi rolünü seç.'));

  // 6) Panel mesajı Discord'da var mı
  const state = readPanelState();
  let published = null;
  if (state?.messageId && panelChannel && state.channelId === panelChannel.id && panelChannel.messages) {
    const msg = await panelChannel.messages.fetch(state.messageId).catch(() => null);
    if (msg) published = { url: `https://discord.com/channels/${guild.id}/${panelChannel.id}/${msg.id}`, channel: panelChannel.name };
  }
  if (published) checks.push(ok('published', 'Panel mesajı', `#${published.channel} kanalında yayında. Ayarları değiştirdiysen tekrar gönder.`));
  else if (state?.messageId && state.channelId !== config.panel.channelId) {
    checks.push(warn('published', 'Panel mesajı', 'Panel başka bir kanalda yayınlanmış; "Discord\'a gönder" dersen yeni seçtiğin kanala atılır.', ''));
  } else {
    checks.push(warn('published', 'Panel mesajı', 'Panel henüz Discord\'a gönderilmemiş (veya mesaj silinmiş).', '"Kaydet ve Discord\'a gönder" düğmesine bas.'));
  }

  // Depolama: Render'da MongoDB olmadan ayarlar her yeniden başlatmada silinir
  if (db.getMode() === 'mongo' && db.getLastError()) checks.push(bad('storage', 'Veritabanı', `MongoDB'ye yazılamıyor: ${db.getLastError()}`, 'Atlas > Database Access: kullanıcıya "Read and write to any database" yetkisi ver.'));
  else if (db.getMode() === 'mongo') checks.push(ok('storage', 'Veritabanı', 'MongoDB Atlas bağlı; ayarlar ve ticket kayıtları kalıcı.'));
  else if (process.env.RENDER) checks.push(bad('storage', 'Veritabanı', 'Render\'dasın ama MONGODB_URI tanımlı değil; ayarların her yeniden başlatmada silinir.', 'Render > Environment bölümüne MONGODB_URI ekle.'));
  else checks.push(warn('storage', 'Veritabanı', 'Yerel dosyalar kullanılıyor (bilgisayarında sorun değil).', 'Render\'a taşırken MONGODB_URI ekle.'));

  // 7) Transcript için mesaj içeriği
  if (config.settings.transcript && process.env.MESSAGE_CONTENT_INTENT !== 'true') {
    checks.push(warn('intent', 'Transcript mesaj metinleri', 'Message Content Intent kapalı; kayıtta sadece yazar, zaman ve dosyalar görünür.',
      'Developer Portal > Bot > Message Content Intent\'i aç, .env içinde MESSAGE_CONTENT_INTENT=true yap.'));
  }

  const ready = checks.every(c => c.status !== 'bad');
  return { connected: true, inviteUrl: inviteUrl(client), checks, ready, published };
}

module.exports = { runDiagnostics, inviteUrl };
