// Yazıyla (prefix) kullanılan komutların tanımları: hangi eylem ne yapar, varsayılan komutlar.
// Panelde "Komutlar" sekmesinden her komutun adı, kimin kullanabileceği vb. değiştirilir.

// perm: ownerOrStaff = ticket sahibi veya destek ekibi, staff = sadece destek ekibi, owner = sadece ticket sahibi, everyone = herkes
const ACTIONS = {
  close: {
    label: 'Ticket\'ı kapat', usage: '[sebep]', needsTicket: true, perm: 'ownerOrStaff',
    desc: 'Ticket\'ı kapatır: kanal ticket sahibinden gizlenir, sahibine DM ve transcript gider, log kanalına kayıt düşer. Komuttan sonra yazdığın kısım kapatma sebebi olur.',
    links: 'Aynı işi /close komutu ve ticket içindeki "Kapat" butonu da yapar. Sebep sorma kuralı Ayarlar > Kapatma bölümündendir.',
  },
  reopen: {
    label: 'Ticket\'ı yeniden aç', usage: '', needsTicket: true, perm: 'staff',
    desc: 'Kapatılmış ticket\'ı tekrar açar; ticket sahibi kanalı yeniden görür.',
    links: 'Aynı işi /reopen komutu ve kapalı ticketta görünen "Yeniden aç" butonu da yapar.',
  },
  delete: {
    label: 'Ticket\'ı sil', usage: '', needsTicket: true, perm: 'staff',
    desc: 'Ticket kanalını kalıcı siler (onay sormaz). Silmeden önce transcript log kanalına kaydedilir.',
    links: 'Aynı işi /delete komutu ve kapalı ticketta görünen "Sil" butonu da yapar (butonda onay sorulur).',
  },
  claim: {
    label: 'Ticket\'ı üstlen', usage: '', needsTicket: true, perm: 'staff',
    desc: 'Ticket\'ı yazan kişi üstlenir; kanala "şu kişi üstlendi" mesajı düşer.',
    links: 'Aynı işi /claim komutu ve "Üstlen" butonu da yapar.',
  },
  callstaff: {
    label: 'Destek ekibini çağır', usage: '', needsTicket: true, perm: 'ownerOrStaff',
    desc: 'Ayarlardaki destek rollerini kanalda etiketler.',
    links: 'Aynı işi /call-staff komutu ve "Ekibi çağır" butonu da yapar.',
  },
  useradd: {
    label: 'Ticket\'a kişi ekle', usage: '@kişi', needsTicket: true, perm: 'staff',
    desc: 'Etiketlenen veya ID\'si yazılan kişiyi ticket kanalına ekler (kanalı görür ve yazabilir).',
    links: 'Aynı işi /add komutu yapar.',
  },
  userremove: {
    label: 'Ticket\'tan kişi çıkar', usage: '@kişi', needsTicket: true, perm: 'staff',
    desc: 'Etiketlenen veya ID\'si yazılan kişinin ticket erişimini kaldırır (ticket sahibi çıkarılamaz).',
    links: 'Aynı işi /remove komutu yapar.',
  },
  rename: {
    label: 'Ticket kanalını yeniden adlandır', usage: '<yeni-ad>', needsTicket: true, perm: 'staff',
    desc: 'Kanalın adını değiştirir. Küçük harf, rakam ve - kullanılır. Discord kanal adı değişimini 10 dakikada 2 ile sınırlar.',
    links: 'Sadece yazıyla kullanılır, slash karşılığı yok.',
  },
  ticketinfo: {
    label: 'Ticket bilgisini göster', usage: '', needsTicket: true, perm: 'staff',
    desc: 'Ticket sahibi, kategori, durum ve üstlenen kişiyi gösterir.',
    links: 'Sadece yazıyla kullanılır.',
  },
  priority: {
    label: 'Ticket önceliğini değiştir', usage: '<düşük|normal|yüksek|acil>', needsTicket: true, perm: 'staff',
    desc: 'Ticket önceliğini ayarlar; kanal adının başına renkli bir işaret eklenir (🟢 düşük, 🟠 yüksek, 🔴 acil; normalde işaret yok). Öncelik adları "Bot mesajları > Öncelik" bölümünden değişir.',
    links: 'Butona bağlarsan basınca öncelik listesi açılır. Discord kanal adı değişimini 10 dakikada 2 ile sınırlar.',
  },
  block: {
    label: 'Kişiyi kara listeye ekle', usage: '@kişi [sebep]', needsTicket: false, perm: 'staff',
    desc: 'Etiketlenen veya ID\'si yazılan kişi artık talep açamaz. Kişi yazmazsan (veya butonla kullanırsan) talebin sahibi kara listeye alınır. Komuttan sonra yazdığın kısım sebep olarak kaydedilir ve kişiye gösterilir.',
    links: 'Ayarlar sekmesindeki "Kara liste"den de ekleyip çıkarabilirsin.',
  },
  unblock: {
    label: 'Kişiyi kara listeden çıkar', usage: '@kişi', needsTicket: false, perm: 'staff',
    desc: 'Kara listedeki kişinin tekrar talep açmasına izin verir. Kişi yazmazsan (veya butonla kullanırsan) kara listedekilerin listesi açılır, oradan seçersin.',
    links: 'Ayarlar sekmesindeki "Kara liste"den de yapılabilir.',
  },
  transfer: {
    label: 'Talebi başka yetkiliye devret', usage: '@yetkili', needsTicket: true, perm: 'staff',
    desc: 'Talebin sorumlusunu etiketlenen kişi yapar (üstlenen o olur), kişi kanalı göremiyorsa görmesini sağlar ve kanalda duyurur.',
    links: 'Butona bağlarsan kişi seçtirir.',
  },
  move: {
    label: 'Talebi başka kategoriye taşı', usage: '<kategori>', needsTicket: true, perm: 'staff',
    desc: 'Talebin kategorisini değiştirir: kanal o kategorinin Discord kategorisine taşınır ve kategoriye özel roller kanalı görmeye başlar. Kategori adı ya da kısa adı (id) yazılır.',
    links: 'Butona bağlarsan kategori listesi açılır.',
  },
  canned: {
    label: 'Hazır cevap gönder', usage: '<ad>', needsTicket: false, perm: 'staff',
    desc: 'Panelde "Hazır cevaplar" sekmesinde yazdığın bir cevabı kanala gönderir. Ad yazılmazsa mevcut cevaplar listelenir. Cevap içinde {user} {category} {number} gibi değişkenler kullanılabilir.',
    links: 'Butona bağlarsan "Özel cevap" kutusuna hazır cevabın adını yaz.',
  },
  note: {
    label: 'İç not ekle (sadece yetkililer)', usage: '<not metni>', needsTicket: true, perm: 'staff',
    desc: 'Talebe kullanıcının görmediği bir not ekler: kayda, panele ve log kanalına yazılır, kanalda görünmez (komut mesajın silinir).',
    links: 'Notları panelde Ticketlar listesinden de görebilirsin.',
  },
  notes: {
    label: 'İç notları listele (DM)', usage: '', needsTicket: true, perm: 'staff',
    desc: 'Bu talepteki iç notları kanalda göstermek yerine sana DM olarak gönderir.',
    links: '',
  },
  noreminder: {
    label: 'Hatırlatıcıyı kapat / aç', usage: '', needsTicket: true, perm: 'staff',
    desc: 'Bu talep için "hareketsiz talep" uyarısını ve otomatik kapatmayı kapatır; aynı komutu tekrar yazarsan tekrar açılır. Uzun sürecek (örn. beklenen) talepler için kullan.',
    links: 'Genel ayar: Ayarlar > "Hareketsiz talepleri otomatik uyar ve kapat". Butona da bağlanabilir.',
  },
  emojiall: {
    label: 'Tüm uygulama emojilerini sunucuya aktar', usage: '[onizle]', needsTicket: false, perm: 'staff',
    desc: 'Developer Portal > Uygulaman > Emojis bölümündeki tüm emojileri bu sunucuya yükler. Aynı adlı emoji sunucuda varsa atlanır; statik ve hareketli emoji yerleri dolunca durur. "onizle" yazarsan sadece ne olacağını gösterir. Komutu yazan kişide "Emoji ve Çıkartmaları Yönet" (ya da Yönetici) izni, botta da "Emoji ve Çıkartmaları Yönet" izni olmalı.',
    links: 'Slash karşılığı /emojiall (onizleme seçeneği var).',
  },
  gstart: {
    label: 'Çekiliş başlat', usage: '<süre> <kazanan> <ödül>', needsTicket: false, perm: 'staff',
    desc: 'Yazdığın kanalda çekiliş başlatır. Örn: ".gstart 1h 3 1M OwO Cash" = 1 saat sürer, 3 kazanan, ödül "1M OwO Cash". Süre: 30m, 2h, 1d, 1h30m. Kazananlar sonuç mesajındaki "Ödülünü Al" butonuyla ödül talebi (ticket) açar. Şart eklemek için ödülün sonuna | koyup yaz: ".gstart 1d 2 Nitro | invite=2 mesaj=50 ses=30 tag rol=@rol durum=.gg/deuslra" (invite = davet sayısı, mesaj = mesaj sayısı, ses = dakika, tag = sunucu etiketi, rol = rol etiketi veya ID, durum = özel durumda geçmesi gereken yazı, boşluksuz). Düzenleyen olarak başka birini göstermek için duzenleyen=KULLANICI_ID ekle. Mesaj / ses / invite çekiliş başladıktan sonrasını sayar. Şartı yapmayan kazanan ödülü alamaz, tekrar çekilir.',
    links: 'Panelde Çekilişler sekmesinden de başlatılır; slash karşılığı /cekilis baslat (şartlar: rol, tag, durum, ses, mesaj, invite seçenekleri).',
  },
  gend: {
    label: 'Çekilişi şimdi bitir', usage: '[çekiliş ID]', needsTicket: false, perm: 'staff',
    desc: 'Çalışan çekilişi hemen bitirir ve kazananları seçer. ID yazmazsan bu kanaldaki en son çekiliş bitirilir.',
    links: '',
  },
  greroll: {
    label: 'Çekilişi tekrar çek', usage: '[çekiliş ID] [adet]', needsTicket: false, perm: 'staff',
    desc: 'Bitmiş çekilişte daha önce çekilmemiş katılımcılardan yeni kazanan seçer. Adet yazmazsan şartı yapmadığı için düşen kazanan sayısı kadar (en az 1) çeker. Önceki geçerli kazananlar kendi sonuç mesajındaki "Ödülünü Al" butonunu kullanmaya devam eder. Sonuç mesajındaki "Tekrar Çek" butonuyla aynı iş.',
    links: '',
  },
  gcancel: {
    label: 'Çekilişi iptal et', usage: '[çekiliş ID]', needsTicket: false, perm: 'staff',
    desc: 'Çalışan çekilişi kazanan seçmeden iptal eder.',
    links: '',
  },
  glist: {
    label: 'Çalışan çekilişleri listele', usage: '', needsTicket: false, perm: 'staff',
    desc: 'Şu an çalışan çekilişleri ID, ödül ve bitiş süresiyle listeler.',
    links: '',
  },
  help: {
    label: 'Komut listesi', usage: '', needsTicket: false, perm: 'everyone',
    desc: 'Yazan kişinin kullanabildiği komutları ve açıklamalarını listeler.',
    links: 'Sadece yazıyla kullanılır.',
  },
  reply: {
    label: 'Özel cevap', usage: '', needsTicket: false, perm: 'everyone',
    desc: 'Önceden yazdığın bir metni cevap olarak gönderir (örn. kurallar, sık sorulan soru). {user} {username} {server} {channel} {number} {prefix} yazabilirsin.',
    links: 'Sadece yazıyla kullanılır. Cevap metnini komut kartında yazarsın.',
  },
};

const PERMISSIONS = {
  everyone: 'Herkes',
  staff: 'Sadece destek ekibi',
  owner: 'Sadece ticket sahibi',
  ownerOrStaff: 'Ticket sahibi veya destek ekibi',
};

const mk = (name, action, extra = {}) => ({
  id: name, name, aliases: [], action, enabled: true,
  permission: ACTIONS[action].perm, roleIds: [], ticketOnly: ACTIONS[action].needsTicket,
  cooldownSeconds: 0, description: '', response: '', ...extra,
});

const DEFAULT_COMMANDS = [
  mk('emojiall', 'emojiall', { description: 'Uygulama emojilerini sunucuya aktarır' }),
  mk('close', 'close', { description: 'Ticket\'ı kapatır' }),
  mk('reopen', 'reopen', { description: 'Kapalı ticket\'ı yeniden açar' }),
  mk('delete', 'delete', { description: 'Ticket\'ı kalıcı siler' }),
  mk('claim', 'claim', { description: 'Ticket\'ı üstlenir' }),
  mk('callstaff', 'callstaff', { description: 'Destek ekibini çağırır' }),
  mk('useradd', 'useradd', { description: 'Ticket\'a kişi ekler' }),
  mk('userremove', 'userremove', { description: 'Ticket\'tan kişi çıkarır' }),
  mk('rename', 'rename', { description: 'Kanalı yeniden adlandırır' }),
  mk('ticketinfo', 'ticketinfo', { description: 'Ticket bilgisini gösterir' }),
  mk('priority', 'priority', { description: 'Ticket önceliğini değiştirir' }),
  mk('block', 'block', { description: 'Kişiyi kara listeye ekler' }),
  mk('unblock', 'unblock', { description: 'Kişiyi kara listeden çıkarır' }),
  mk('transfer', 'transfer', { description: 'Talebi başka yetkiliye devreder' }),
  mk('move', 'move', { description: 'Talebi başka kategoriye taşır' }),
  mk('cevap', 'canned', { description: 'Hazır cevap gönderir' }),
  mk('not', 'note', { description: 'Talebe iç not ekler' }),
  mk('notlar', 'notes', { description: 'İç notları DM atar' }),
  mk('hatirlatici', 'noreminder', { description: 'Bu talebin hatırlatıcısını kapatır/açar' }),
  mk('gstart', 'gstart', { description: 'Çekiliş başlatır' }),
  mk('gend', 'gend', { description: 'Çekilişi bitirir' }),
  mk('greroll', 'greroll', { description: 'Çekilişi tekrar çeker' }),
  mk('gcancel', 'gcancel', { description: 'Çekilişi iptal eder' }),
  mk('glist', 'glist', { description: 'Çalışan çekilişleri listeler' }),
  mk('help', 'help', { description: 'Kullanabildiğin komutları listeler' }),
];

module.exports = { ACTIONS, PERMISSIONS, DEFAULT_COMMANDS };
