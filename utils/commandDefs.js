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
  mk('close', 'close', { description: 'Ticket\'ı kapatır' }),
  mk('reopen', 'reopen', { description: 'Kapalı ticket\'ı yeniden açar' }),
  mk('delete', 'delete', { description: 'Ticket\'ı kalıcı siler' }),
  mk('claim', 'claim', { description: 'Ticket\'ı üstlenir' }),
  mk('callstaff', 'callstaff', { description: 'Destek ekibini çağırır' }),
  mk('useradd', 'useradd', { description: 'Ticket\'a kişi ekler' }),
  mk('userremove', 'userremove', { description: 'Ticket\'tan kişi çıkarır' }),
  mk('rename', 'rename', { description: 'Kanalı yeniden adlandırır' }),
  mk('ticketinfo', 'ticketinfo', { description: 'Ticket bilgisini gösterir' }),
  mk('help', 'help', { description: 'Kullanabildiğin komutları listeler' }),
];

module.exports = { ACTIONS, PERMISSIONS, DEFAULT_COMMANDS };
