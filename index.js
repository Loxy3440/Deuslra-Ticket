require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { startWebServer } = require('./utils/webServer');
const db = require('./utils/db');

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error('DISCORD_BOT_TOKEN eksik. ".env.example" dosyasını ".env" olarak kopyala ve token\'ı yaz.');
  process.exit(1);
}

// Çekiliş şartları için: mesaj sayısı (GuildMessages), ses aktifliği (GuildVoiceStates), davet takibi (GuildInvites) normal intent'lerdir, portalda açmak gerekmez.
const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildInvites];
// Transcript'te mesaj metni / yazıyla komutlar için (Developer Portal'da da açman gerekir)
if (process.env.MESSAGE_CONTENT_INTENT === 'true') intents.push(GatewayIntentBits.MessageContent);
// Çekiliş "durum" şartı için (Developer Portal > Presence Intent de açık olmalı)
if (process.env.USE_PRESENCE === 'true') intents.push(GatewayIntentBits.GuildPresences);
// Çekiliş "davet sayısı" şartı için: kim girdi / çıktı olaylarını görmek (Developer Portal > Server Members Intent de açık olmalı)
if (process.env.GUILD_MEMBERS_INTENT === 'true') intents.push(GatewayIntentBits.GuildMembers);

const client = new Client({ intents });
client.commands = new Collection();

// commands/*.js ve events/*.js otomatik yüklenir: yeni dosya eklemek yeterli.
for (const file of fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'))) {
  const command = require(`./commands/${file}`);
  if (command.data && command.execute) client.commands.set(command.data.name, command);
}
for (const file of fs.readdirSync(path.join(__dirname, 'events')).filter(f => f.endsWith('.js'))) {
  const event = require(`./events/${file}`);
  client[event.once ? 'once' : 'on'](event.name, (...args) => event.execute(...args, client));
}

process.on('unhandledRejection', err => console.error('[HATA] unhandledRejection:', err));
process.on('uncaughtException', err => console.error('[HATA] uncaughtException:', err));

(async () => {
  try {
    const mode = await db.init();
    console.info(mode === 'mongo' ? '[DB] MongoDB Atlas bağlandı.' : '[DB] MONGODB_URI yok: yerel dosyalar kullanılıyor (Render\'da kalıcı değildir).');
  } catch (err) {
    console.error('[DB] MongoDB\'ye bağlanılamadı. MONGODB_URI\'yi ve Atlas > Network Access ayarını kontrol et:', err.message);
    process.exit(1);
  }
  startWebServer(client);
  client.login(token).catch(err => {
    console.error('Discord girişi başarısız. Token\'ı ve bot ayarlarını kontrol et:', err.message);
    process.exitCode = 1;
  });
})();

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { require('./utils/giveaways').flush(); } catch { /* yok say */ } db.close().finally(() => process.exit(0)); });
