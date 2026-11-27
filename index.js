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

// Normal intent'ler (portalda açmak gerekmez): çekiliş mesaj sayısı, ses aktifliği ve davet takibi için.
const BASE_INTENTS = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildInvites];

// "Ayrıcalıklı" intent'ler Developer Portal > Bot bölümünden açılmadan istenirse Discord girişi tamamen reddeder (bot çevrimdışı kalır, hiçbir buton çalışmaz).
// Bu yüzden .env'de açık olsa bile önce portalda gerçekten açık mı diye bakılır; kapalıysa o özellik devre dışı kalır, bot açılır.
async function resolveIntents() {
  const intents = [...BASE_INTENTS];
  const wants = { content: process.env.MESSAGE_CONTENT_INTENT === 'true', presence: process.env.USE_PRESENCE === 'true', members: process.env.GUILD_MEMBERS_INTENT === 'true' };
  if (!wants.content && !wants.presence && !wants.members) return intents;
  let flags = null;
  try {
    const res = await fetch('https://discord.com/api/v10/applications/@me', { headers: { Authorization: `Bot ${token}` } });
    if (res.ok) flags = Number((await res.json()).flags) || 0;
  } catch { /* ağ yoksa aşağıda temkinli davranılır */ }
  const on = bit => (flags === null ? null : Boolean(flags & bit));
  const portal = { content: on((1 << 18) | (1 << 19)), presence: on((1 << 12) | (1 << 13)), members: on((1 << 14) | (1 << 15)) };
  const pick = (key, intent, envName, what, portalName) => {
    if (!wants[key]) return;
    // Portal bilgisi alınamadıysa: eskiden çalışan MESSAGE_CONTENT_INTENT aynen denenir, yeni özellikler (durum / davet) açılmaz.
    const ok = portal[key] === null ? key === 'content' : portal[key];
    if (ok) { intents.push(intent); return; }
    process.env[envName] = 'false';
    console.warn(`[INTENT] ${envName}=true ama Developer Portal > Bot > ${portalName} ${portal[key] === null ? 'doğrulanamadı' : 'kapalı'}: ${what} devre dışı bırakıldı, bot bunsuz açılıyor. Özelliği istiyorsan portalda ${portalName}'i aç ve botu yeniden başlat.`);
  };
  pick('content', GatewayIntentBits.MessageContent, 'MESSAGE_CONTENT_INTENT', 'yazıyla komutlar ve transcript mesaj metni', 'Message Content Intent');
  pick('presence', GatewayIntentBits.GuildPresences, 'USE_PRESENCE', 'çekiliş "durum" şartı', 'Presence Intent');
  pick('members', GatewayIntentBits.GuildMembers, 'GUILD_MEMBERS_INTENT', 'çekiliş "davet sayısı" şartı', 'Server Members Intent');
  return intents;
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
  const client = new Client({ intents: await resolveIntents() });
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

  startWebServer(client);
  client.login(token).catch(err => {
    console.error('Discord girişi başarısız. Token\'ı ve bot ayarlarını kontrol et:', err.message);
    if (/disallowed intents/i.test(err.message)) console.error('→ Developer Portal > Bot > Privileged Gateway Intents altındaki (Presence / Server Members / Message Content) intent\'leri aç ya da .env\'deki USE_PRESENCE, GUILD_MEMBERS_INTENT, MESSAGE_CONTENT_INTENT satırlarını false yap.');
    process.exitCode = 1;
  });
})();

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { require('./utils/giveaways').flush(); } catch { /* yok say */ } db.close().finally(() => process.exit(0)); });
