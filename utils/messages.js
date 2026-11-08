// Botun yazdığı tüm metinler ve sitenin yazıları burada tanımlı. Panelde "Mesajlar" ve "Site yazıları"
// sekmelerinden değiştirilir; kutu boş bırakılırsa buradaki varsayılan kullanılır.
// vars: yazıda kullanılabilecek {değişkenler}

const D = (key, group, label, def, vars = [], extra = {}) => ({ key, group, label, def, vars, ...extra });

const MESSAGE_DEFS = [
  // ---- Ticket açılırken ----
  D('openedReply', 'Ticket açılırken', 'Ticket açılınca kullanıcıya gizli yanıt', 'Ticket\'ın açıldı: {channel}', ['channel', 'category', 'number']),
  D('alreadyOpen', 'Ticket açılırken', 'Zaten açık ticket varsa', 'Zaten açık bir ticket\'ın var: {channel}', ['channel']),
  D('cooldownOpen', 'Ticket açılırken', 'Kategori bekleme süresi dolmadıysa', 'Bu kategoride yeni talep açmak için biraz beklemelisin. Tekrar deneyebileceğin zaman: {time}', ['time']),
  D('buttonGone', 'Ticket açılırken', 'Kategori silinmişse (buton)', 'Bu ticket butonu artık kullanılmıyor.'),
  D('formGone', 'Ticket açılırken', 'Kategori silinmişse (form)', 'Bu ticket formu artık kullanılmıyor.'),
  D('formTitle', 'Ticket açılırken', 'Form penceresi başlığı (en fazla 45)', 'Ticket: {category}', ['category'], { max: 45 }),
  D('formAnswersTitle', 'Ticket açılırken', 'Form yanıtları kutusunun başlığı', 'Form yanıtları'),
  D('fieldOwner', 'Ticket açılırken', 'Bilgi satırı: açan', 'Açan'),
  D('fieldCategory', 'Ticket açılırken', 'Bilgi satırı: kategori', 'Kategori'),
  D('fieldOpened', 'Ticket açılırken', 'Bilgi satırı: açılış', 'Açılış'),
  D('logOpenedTitle', 'Ticket açılırken', 'Log başlığı: ticket açıldı', 'Ticket açıldı · #{number}', ['number']),
  D('fieldChannel', 'Ticket açılırken', 'Log satırı: kanal', 'Kanal'),

  // ---- Kapatma ----
  D('closeModalTitle', 'Kapatma', 'Kapatma penceresi başlığı (en fazla 45)', 'Ticket\'ı kapat', [], { max: 45 }),
  D('closeModalLabel', 'Kapatma', 'Kapatma sebebi kutusu adı (en fazla 45)', 'Kapatma sebebi', [], { max: 45 }),
  D('closeModalPlaceholder', 'Kapatma', 'Kapatma sebebi ipucu (en fazla 100)', 'Kısa bir açıklama yaz', [], { max: 100 }),
  D('closeReasonOwner', 'Kapatma', 'Ticket sahibi kapatınca sebep olarak yazılan', 'Ticket sahibi tarafından kapatıldı'),
  D('closeReasonDefault', 'Kapatma', 'Sebep boş bırakılırsa', 'Sebep belirtilmedi'),
  D('closedTitle', 'Kapatma', 'Kanaldaki "kapatıldı" mesajı başlığı', 'Ticket #{number} kapatıldı', ['number']),
  D('closedDescription', 'Kapatma', 'Kanaldaki "kapatıldı" mesajı açıklaması', 'Destek ekibi bu ticket\'ı yeniden açabilir veya kalıcı olarak silebilir.', [], { multi: true }),
  D('fieldClosedBy', 'Kapatma', 'Satır: kapatan', 'Kapatan'),
  D('fieldReason', 'Kapatma', 'Satır: sebep', 'Sebep'),
  D('closeReplyDm', 'Kapatma', 'Kapatana gizli yanıt (DM gitti)', 'Ticket kapatıldı; sebep kullanıcıya DM olarak gönderildi.'),
  D('closeReplyNoDm', 'Kapatma', 'Kapatana gizli yanıt (DM gitmedi)', 'Ticket kapatıldı; kullanıcıya DM gönderilemedi.'),
  D('closeHideFailed', 'Kapatma', 'Kanal kullanıcıdan gizlenemezse uyarı', '⚠️ Kanal kullanıcıdan gizlenemedi: botun "Rolleri Yönet" izni yok.'),
  D('dmClosedTitle', 'Kapatma', 'Kullanıcıya giden DM başlığı', 'Ticket\'ın kapatıldı · #{number}', ['number']),
  D('dmClosedDescription', 'Kapatma', 'Kullanıcıya giden DM açıklaması', '**{server}** sunucusundaki destek talebin kapatıldı.', ['server'], { multi: true }),
  D('logClosedTitle', 'Kapatma', 'Log başlığı: ticket kapatıldı', 'Ticket kapatıldı · #{number}', ['number']),

  // ---- Transcript ----
  D('btnTranscript', 'Transcript', 'Log kanalındaki indirme butonu', '📄 Transcript indir', [], { max: 80 }),
  D('transcriptNote', 'Transcript', 'Log mesajındaki açıklama', 'Transcript yalnızca ticket sahibi tarafından indirilebilir.', [], { multi: true }),
  D('transcriptFile', 'Transcript', 'Dosya gönderilirken yazı', 'Ticket #{number} transcript\'i:', ['number']),
  D('transcriptMissing', 'Transcript', 'Transcript bulunamazsa', 'Bu transcript bulunamadı (çok eski bir kayıt olabilir).'),
  D('transcriptDenied', 'Transcript', 'Yetkisi olmayan basarsa', 'Bu transcript\'i yalnızca ticket sahibi indirebilir.'),

  // ---- Yeniden açma / silme ----
  D('btnReopen', 'Yeniden açma ve silme', 'Kapalı ticketta "yeniden aç" butonu', '🔓 Yeniden aç', [], { max: 80 }),
  D('btnDelete', 'Yeniden açma ve silme', 'Kapalı ticketta "sil" butonu', '🗑️ Sil', [], { max: 80 }),
  D('btnDeleteConfirm', 'Yeniden açma ve silme', 'Silme onay butonu', 'Evet, sil', [], { max: 80 }),
  D('deleteConfirm', 'Yeniden açma ve silme', 'Silme onay sorusu', 'Bu ticket kalıcı olarak silinecek. Emin misin?'),
  D('reopenedTitle', 'Yeniden açma ve silme', 'Yeniden açılınca kanal mesajı başlığı', 'Ticket #{number} yeniden açıldı', ['number']),
  D('reopenedDescription', 'Yeniden açma ve silme', 'Yeniden açılınca kanal mesajı açıklaması', '{staff} bu ticket\'ı yeniden açtı.', ['staff']),
  D('reopenReply', 'Yeniden açma ve silme', 'Açana gizli yanıt', 'Ticket yeniden açıldı.'),
  D('logReopenedTitle', 'Yeniden açma ve silme', 'Log başlığı: yeniden açıldı', 'Ticket yeniden açıldı · #{number}', ['number']),
  D('deletingTitle', 'Yeniden açma ve silme', 'Siliniyor mesajı başlığı', 'Ticket siliniyor'),
  D('deletingDelay', 'Yeniden açma ve silme', 'Siliniyor mesajı (bekleme varsa)', 'Bu kanal **{delay} saniye** içinde silinecek.', ['delay']),
  D('deletingNow', 'Yeniden açma ve silme', 'Siliniyor mesajı (bekleme yoksa)', 'Bu kanal siliniyor.'),
  D('deletingFooter', 'Yeniden açma ve silme', 'Siliniyor mesajı alt yazısı', '{staff} tarafından', ['staff']),
  D('deleteReply', 'Yeniden açma ve silme', 'Silene gizli yanıt', 'Ticket siliniyor, transcript log kanalına gönderilecek.'),
  D('logDeletedTitle', 'Yeniden açma ve silme', 'Log başlığı: silindi', 'Ticket silindi · #{number}', ['number']),
  D('fieldDeletedBy', 'Yeniden açma ve silme', 'Log satırı: silen', 'Silen'),
  D('fieldTicketOwner', 'Yeniden açma ve silme', 'Log satırı: ticket sahibi', 'Sahibi'),

  // ---- Üstlenme ve ekibi çağırma ----
  D('claimedMessage', 'Üstlenme ve çağırma', 'Üstlenilince kanal mesajı', '🙋 {staff} bu ticket\'ı üstlendi.', ['staff']),
  D('claimReply', 'Üstlenme ve çağırma', 'Üstlenene gizli yanıt', 'Ticket\'ı üstlendin.'),
  D('claimTaken', 'Üstlenme ve çağırma', 'Başkası üstlenmişse', 'Bu ticket zaten {claimer} tarafından üstlenilmiş.', ['claimer']),
  D('callStaffMessage', 'Üstlenme ve çağırma', 'Ekip çağrılınca kanal mesajı', '📣 Yetkili çağrısı: {roles}', ['roles']),
  D('callStaffReply', 'Üstlenme ve çağırma', 'Çağırana gizli yanıt', 'Destek ekibi çağrıldı.'),
  D('callStaffNoRole', 'Üstlenme ve çağırma', 'Destek rolü seçilmemişse', 'Panelde destek yetkili rolü ayarlanmamış.'),
  D('actionWait', 'Üstlenme ve çağırma', 'Buton bekleme süresi dolmadıysa', 'Bu butonu tekrar kullanmak için biraz beklemelisin: {time}', ['time']),

  // ---- Kişi ekleme / çıkarma ----
  D('userAddedChannel', 'Kişi ekleme ve çıkarma', '/add sonrası kanal mesajı', '{user} ticket\'a eklendi.', ['user']),
  D('userAddedReply', 'Kişi ekleme ve çıkarma', '/add sonrası gizli yanıt', '{username} ticket\'a eklendi.', ['username']),
  D('userRemovedChannel', 'Kişi ekleme ve çıkarma', '/remove sonrası kanal mesajı', '{username} ticket\'tan çıkarıldı.', ['username']),
  D('userRemovedReply', 'Kişi ekleme ve çıkarma', '/remove sonrası gizli yanıt', '{username} ticket\'tan çıkarıldı.', ['username']),
  D('cannotRemoveOwner', 'Kişi ekleme ve çıkarma', 'Sahibi çıkarılmaya çalışılırsa', 'Ticket sahibini ticket\'tan çıkaramazsın.'),

  // ---- Yazıyla komutlar (.close vb.) ----
  D('cmdNoPermission', 'Yazıyla komutlar', 'Yetkisi olmayan kullanırsa', 'Bu komutu kullanma yetkin yok.'),
  D('cmdOnlyTicket', 'Yazıyla komutlar', 'Ticket dışında kullanılırsa', 'Bu komut yalnızca bir ticket kanalında kullanılabilir.'),
  D('cmdWait', 'Yazıyla komutlar', 'Komut bekleme süresi dolmadıysa', 'Bu komutu tekrar kullanmak için biraz beklemelisin: {time}', ['time']),
  D('cmdUsage', 'Yazıyla komutlar', 'Eksik yazılırsa kullanım bilgisi', 'Kullanım: {usage}', ['usage']),
  D('cmdNeedReason', 'Yazıyla komutlar', 'Sebep zorunluyken yazılmazsa', 'Sebep yazmalısın. Kullanım: {usage}', ['usage']),
  D('cmdUserNotFound', 'Yazıyla komutlar', 'Kişi bulunamazsa', 'Kullanıcı bulunamadı. Birini etiketle veya ID\'sini yaz. Kullanım: {usage}', ['usage']),
  D('cmdRenamed', 'Yazıyla komutlar', 'Kanal adı değişince', 'Kanal adı değiştirildi: {name}', ['name']),
  D('cmdRenameFailed', 'Yazıyla komutlar', 'Kanal adı değişemezse', 'Kanal adı değiştirilemedi (Discord sınırı: 10 dakikada 2 kez).'),
  D('cmdFailed', 'Yazıyla komutlar', 'Beklenmeyen hata', 'Komut çalıştırılamadı. Botun izinlerini kontrol et.'),
  D('infoTitle', 'Yazıyla komutlar', 'Ticket bilgisi başlığı', 'Ticket #{number} bilgisi', ['number']),
  D('fieldStatus', 'Yazıyla komutlar', 'Bilgi satırı: durum', 'Durum'),
  D('fieldClaimedBy', 'Yazıyla komutlar', 'Bilgi satırı: üstlenen', 'Üstlenen'),
  D('statusOpen', 'Yazıyla komutlar', 'Durum: açık', 'Açık'),
  D('statusClosed', 'Yazıyla komutlar', 'Durum: kapalı', 'Kapalı'),
  D('fieldNone', 'Yazıyla komutlar', 'Boş değer', '—'),
  D('helpTitle', 'Yazıyla komutlar', 'Komut listesi başlığı', 'Kullanabildiğin komutlar'),
  D('helpEmpty', 'Yazıyla komutlar', 'Kullanabildiği komut yoksa', 'Şu an kullanabileceğin bir komut yok.'),

  // ---- Kara liste ve kapalı talep ----
  D('ticketsDisabled', 'Talep açmayı kapatma ve kara liste', 'Talep açma kapalıyken (bakım modu)', 'Şu an yeni talep alınmıyor. Lütfen daha sonra tekrar dene.'),
  D('blockedUser', 'Talep açmayı kapatma ve kara liste', 'Kara listedeki kişi talep açmaya çalışırsa', 'Talep açman engellenmiş. Sebep: {reason}', ['reason']),
  D('blockNoReason', 'Talep açmayı kapatma ve kara liste', 'Sebep yazılmadıysa kullanılan yazı', 'Sebep belirtilmedi'),
  D('blockAdded', 'Talep açmayı kapatma ve kara liste', 'Biri kara listeye eklenince cevap', '{username} kara listeye eklendi; artık talep açamaz.', ['username']),
  D('blockRemoved', 'Talep açmayı kapatma ve kara liste', 'Biri kara listeden çıkarılınca cevap', '{username} kara listeden çıkarıldı.', ['username']),
  D('blockNotFound', 'Talep açmayı kapatma ve kara liste', 'Kişi kara listede değilse', '{username} zaten kara listede değil.', ['username']),
  D('blockSelf', 'Talep açmayı kapatma ve kara liste', 'Kendini veya botu engellemeye çalışınca', 'Bu kişi kara listeye eklenemez.'),

  // ---- Puanlama ----
  D('ratingTitle', 'Puanlama', 'DM\'deki puanlama başlığı', 'Destekten memnun kaldın mı?'),
  D('ratingDescription', 'Puanlama', 'DM\'deki puanlama açıklaması', 'Aşağıdan 1 ile 5 arasında puan verebilirsin.', [], { multi: true }),
  D('ratingThanks', 'Puanlama', 'Puan verilince teşekkür yazısı', 'Teşekkürler! {stars} puanın kaydedildi.', ['stars', 'rating']),
  D('ratingAlready', 'Puanlama', 'Zaten puan verilmişse', 'Bu talep için zaten puan verdin.'),
  D('ratingLogTitle', 'Puanlama', 'Log kanalındaki puan başlığı', 'Talep #{number} puanlandı', ['number']),
  D('fieldRating', 'Puanlama', 'Puan alanı adı', 'Puan'),

  // ---- Hareketsiz talepler ----
  D('inactivityWarn', 'Hareketsiz talepler', 'Uyarı mesajı (kanala yazılır)', '{user} bu talepte uzun süredir yazışma yok. {hours} saat içinde cevap gelmezse talep otomatik kapatılacak.', ['user', 'hours']),
  D('inactivityReason', 'Hareketsiz talepler', 'Otomatik kapatma sebebi', 'Uzun süre hareketsiz kaldığı için otomatik kapatıldı.'),

  // ---- Öncelik ----
  D('priorityLow', 'Öncelik', 'Düşük öncelik adı', 'düşük', [], { max: 20 }),
  D('priorityNormal', 'Öncelik', 'Normal öncelik adı', 'normal', [], { max: 20 }),
  D('priorityHigh', 'Öncelik', 'Yüksek öncelik adı', 'yüksek', [], { max: 20 }),
  D('priorityUrgent', 'Öncelik', 'Acil öncelik adı', 'acil', [], { max: 20 }),
  D('priorityChanged', 'Öncelik', 'Öncelik değişince cevap', 'Talebin önceliği **{priority}** yapıldı.', ['priority']),
  D('priorityUsage', 'Öncelik', 'Öncelik yazılmadıysa', 'Bir öncelik yaz: {list}', ['list']),
  D('priorityPrompt', 'Öncelik', 'Butonla öncelik seçtirirken yazı', 'Öncelik seç:'),

  // ---- Ek butonlar ----
  D('renameModalTitle', 'Ek butonlar', 'Yeniden adlandırma penceresi başlığı (en fazla 45)', 'Kanalı yeniden adlandır', [], { max: 45 }),
  D('renameModalLabel', 'Ek butonlar', 'Yeni ad kutusu adı (en fazla 45)', 'Yeni kanal adı', [], { max: 45 }),
  D('renameModalPlaceholder', 'Ek butonlar', 'Yeni ad ipucu (en fazla 100)', 'örn. odeme-sorunu', [], { max: 100 }),
  D('customUserPrompt', 'Ek butonlar', 'Kişi seçtirirken yazı', 'Bir kişi seç:'),
  D('customUserPlaceholder', 'Ek butonlar', 'Kişi seçme kutusu ipucu (en fazla 100)', 'Kişi seç…', [], { max: 100 }),
  D('customWorking', 'Ek butonlar', 'İşlem sürerken yazı', '⏳ Yapılıyor…'),

  // ---- Uyarılar ----
  D('notTicket', 'Uyarılar', 'Komut ticket dışında kullanılırsa', 'Bu komut yalnızca bir ticket kanalında kullanılabilir.'),
  D('ticketClosed', 'Uyarılar', 'Ticket kapalıyken işlem denenirse', 'Bu ticket kapatılmış.'),
  D('ticketAlreadyOpen', 'Uyarılar', 'Ticket zaten açıkken', 'Bu ticket zaten açık.'),
  D('staffOnly', 'Uyarılar', 'Sadece ekip yapabilir', 'Bu işlem destek ekibi içindir.'),
  D('ownerOrStaffOnly', 'Uyarılar', 'Sadece sahip veya ekip yapabilir', 'Bu işlemi yalnızca ticket sahibi veya destek ekibi yapabilir.'),
  D('errNotTicketChannel', 'Uyarılar', 'Kanal ticket değilse', 'Bu kanal bir ticket değil.'),
  D('errAlreadyClosed', 'Uyarılar', 'Ticket zaten kapatılmışsa', 'Bu ticket zaten kapatılmış.'),
  D('errNeedOpen', 'Uyarılar', 'İşlem için açık ticket gerekiyorsa', 'Bu işlem açık bir ticket kanalında yapılabilir.'),
  D('interactionError', 'Uyarılar', 'Beklenmeyen hata', 'İşlem tamamlanamadı. Botun kanal izinlerini ve panel ayarlarını kontrol et.'),
];

// Sitenin (ana sayfa) yazıları. HTML'deki data-t="anahtar" alanlarına yerleşir.
const SITE_DEFS = [
  D('heroEyebrow', 'Ana bölüm', 'Küçük üst başlık', 'Destek merkezi'),
  D('heroTitleStart', 'Ana bölüm', 'Büyük başlık: başlangıç', 'Sorunun ne olursa olsun,'),
  D('heroTitleHighlight', 'Ana bölüm', 'Büyük başlık: vurgulu kısım', 'doğru ekibe'),
  D('heroTitleEnd', 'Ana bölüm', 'Büyük başlık: bitiş', 'tek seçimle ulaş.'),
  D('heroLead', 'Ana bölüm', 'Açıklama', 'Discord\'daki destek panelinden kategorini seç. Sana özel bir kanal açılır, yetkililer orada seninle ilgilenir.', [], { multi: true }),
  D('ctaText', 'Ana bölüm', 'Ana düğme (Discord linki varken)', 'Discord\'da talep aç'),
  D('ctaTextNoLink', 'Ana bölüm', 'Ana düğme (link yokken)', 'Destek talebi aç'),
  D('ctaSecondary', 'Ana bölüm', 'İkinci düğme', 'Nasıl çalışır?'),
  D('liveLine', 'Ana bölüm', 'Açık talep yazısı', 'açık talep şu an ekibimizin elinde'),
  D('navCategories', 'Menü ve alt bilgi', 'Menü: kategoriler', 'Kategoriler'),
  D('navHow', 'Menü ve alt bilgi', 'Menü: nasıl çalışır', 'Nasıl çalışır'),
  D('navStatus', 'Menü ve alt bilgi', 'Menü: canlı durum', 'Canlı durum'),
  D('statOpen', 'Sayılar', 'Açık talep etiketi', 'Açık talep'),
  D('statClosed', 'Sayılar', 'Çözülen talep etiketi', 'Çözülen talep'),
  D('statTotal', 'Sayılar', 'Toplam talep etiketi', 'Toplam talep'),
  D('statMembers', 'Sayılar', 'Üye etiketi', 'Sunucu üyesi'),
  D('catsEyebrow', 'Kategoriler', 'Küçük başlık', 'Kategoriler'),
  D('catsTitle', 'Kategoriler', 'Başlık', 'Ne konuda yardım istiyorsun?'),
  D('stepsEyebrow', 'Nasıl çalışır', 'Küçük başlık', 'Nasıl çalışır'),
  D('stepsTitle', 'Nasıl çalışır', 'Başlık', 'Destek almak üç adım'),
  D('step1Title', 'Nasıl çalışır', '1. adım başlığı', 'Kategoriyi seç'),
  D('step1Text', 'Nasıl çalışır', '1. adım yazısı', 'Discord\'daki destek panelinden sorununa uygun butona tıkla ya da açılır listeden seç.', [], { multi: true }),
  D('step2Title', 'Nasıl çalışır', '2. adım başlığı', 'Kısa formu doldur'),
  D('step2Text', 'Nasıl çalışır', '2. adım yazısı', 'Bazı kategorilerde birkaç soru çıkar. Konunu anlat ki ekip baştan ne olduğunu bilsin.', [], { multi: true }),
  D('step3Title', 'Nasıl çalışır', '3. adım başlığı', 'Özel kanalda çöz'),
  D('step3Text', 'Nasıl çalışır', '3. adım yazısı', 'Sana özel açılan kanalda yetkililerle yazış. İş bitince talep kapanır, kaydı sana DM\'den gelir.', [], { multi: true }),
  D('footerAdmin', 'Menü ve alt bilgi', 'Alt bilgi: yönetim bağlantısı', 'Yönetim paneli'),
];

const defaultsOf = defs => Object.fromEntries(defs.map(d => [d.key, d.def]));
const MESSAGE_DEFAULTS = defaultsOf(MESSAGE_DEFS);
const SITE_DEFAULTS = defaultsOf(SITE_DEFS);

// Panelde boş bırakılan yazı varsayılana döner; çok uzun yazılar kısaltılır.
function normalizeTexts(input, defs) {
  const src = input && typeof input === 'object' ? input : {};
  return Object.fromEntries(defs.map(d => {
    const v = typeof src[d.key] === 'string' ? src[d.key].trim() : '';
    return [d.key, (v || d.def).slice(0, d.max || (d.multi ? 1500 : 300))];
  }));
}

function render(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (m, k) => (k.toLowerCase() in vars ? String(vars[k.toLowerCase()]) : m));
}
const msg = (config, key, vars) => render(config?.messages?.[key] ?? MESSAGE_DEFAULTS[key] ?? key, vars);

module.exports = { MESSAGE_DEFS, SITE_DEFS, MESSAGE_DEFAULTS, SITE_DEFAULTS, normalizeTexts, render, msg };
