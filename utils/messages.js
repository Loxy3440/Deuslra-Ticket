// Botun yazdığı tüm metinler ve sitenin yazıları burada tanımlı. Panelde "Mesajlar" ve "Site yazıları"
// sekmelerinden değiştirilir; kutu boş bırakılırsa buradaki varsayılan kullanılır.
// vars: yazıda kullanılabilecek {değişkenler}

const { globalVars } = require('./variables');

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

  // ---- Çekiliş ----
  D('gwRunningTitle', 'Çekiliş', 'Çalışan çekiliş: başlık', '🎉 Çekiliş!', [], { max: 100 }),
  D('gwRunningText', 'Çekiliş', 'Çalışan çekiliş: açıklama', 'Katılmak için aşağıdaki **Katıl** butonuna bas. Tekrar basarsan çekilişten ayrılırsın.', [], { multi: true }),
  D('gwFieldPrize', 'Çekiliş', 'Alan adı: ödül', 'Ödül', [], { max: 60 }),
  D('gwFieldWinners', 'Çekiliş', 'Alan adı: kazanan sayısı', 'Kazanan sayısı', [], { max: 60 }),
  D('gwFieldEnds', 'Çekiliş', 'Alan adı: bitiş', 'Bitiş', [], { max: 60 }),
  D('gwFieldHost', 'Çekiliş', 'Alan adı: düzenleyen', 'Düzenleyen', [], { max: 60 }),
  D('gwFieldEntries', 'Çekiliş', 'Alan adı: katılımcı sayısı', 'Katılımcı', [], { max: 60 }),
  D('gwFieldRole', 'Çekiliş', 'Alan adı: gereken rol', 'Gereken rol', [], { max: 60 }),
  D('gwJoinBtn', 'Çekiliş', 'Katıl butonu yazısı', 'Katıl', [], { max: 80 }),
  D('gwClaimBtn', 'Çekiliş', '"Ödülünü Al" butonu yazısı', 'Ödülünü Al', [], { max: 80 }),
  D('gwRerollBtn', 'Çekiliş', '"Tekrar Çek" butonu yazısı', 'Tekrar Çek', [], { max: 80 }),
  D('gwJoined', 'Çekiliş', 'Katılınca cevap', '🎉 Çekilişe katıldın! Bol şans.'),
  D('gwLeft', 'Çekiliş', 'Ayrılınca cevap', 'Çekilişten ayrıldın.'),
  D('gwNeedRole', 'Çekiliş', 'Gereken rol yoksa', 'Bu çekilişe katılmak için {role} rolüne sahip olmalısın.', ['role']),
  D('gwNotRunning', 'Çekiliş', 'Çekiliş bitmişse / bulunamazsa', 'Bu çekiliş bitti ya da artık yok.'),
  D('gwEndedTitle', 'Çekiliş', 'Biten çekilişin (ilk mesajın) başlığı', '🎉 Çekiliş Bitti', [], { max: 100 }),
  D('gwCancelledTitle', 'Çekiliş', 'İptal edilen çekiliş başlığı', '🚫 Çekiliş İptal Edildi', [], { max: 100 }),
  D('gwResultTitle', 'Çekiliş', 'Sonuç mesajı: başlık', '🎁 Çekiliş Sonuçlandı!', [], { max: 100 }),
  D('gwResultPrize', 'Çekiliş', 'Sonuç mesajı: ödül satırı', '🎁 Ödül:', [], { max: 60 }),
  D('gwResultWinners', 'Çekiliş', 'Sonuç mesajı: kazananlar satırı', '🏆 Kazanan(lar):', [], { max: 60 }),
  D('gwResultText', 'Çekiliş', 'Sonuç mesajı: açıklama', '🎉 **Tebrikler!** Kazananlar aşağıdaki **{claimbtn}** butonuna basarak ödül teslim talebini oluşturabilir!', ['claimbtn', 'prize'], { multi: true }),
  D('gwResultFooter', 'Çekiliş', 'Sonuç mesajı: alt yazı (ID • marka • bu yazı)', 'Ödül Teslim', [], { max: 80 }),
  D('gwNoEntries', 'Çekiliş', 'Kimse katılmadıysa', 'Kimse katılmadığı için kazanan seçilemedi.'),
  D('gwNotWinner', 'Çekiliş', '"Ödülünü Al"a kazanan olmayan basarsa', 'Bu çekilişin kazananı değilsin.'),
  D('gwClaimOpened', 'Çekiliş', 'Ödül talebi açılınca', '🎁 Ödül talebin açıldı: {channel}', ['channel']),
  D('gwClaimExists', 'Çekiliş', 'Zaten ödül talebi varsa', 'Bu çekiliş için zaten bir ödül talebin var: {channel}', ['channel']),
  D('gwClaimExpired', 'Çekiliş', 'Ödül alma süresi dolduysa', 'Ödül alma süresi ({hours} saat) doldu. Yetkililere ulaşabilirsin.', ['hours']),
  D('gwStaffOnly', 'Çekiliş', 'Yetkili olmayan yönetim işlemi yaparsa', 'Bu işlemi sadece yetkililer yapabilir.'),
  D('gwRerolled', 'Çekiliş', 'Tekrar çekilince (sonuç mesajının üstündeki yazı)', '🔔 Tekrar çekiliş yapıldı: {winners} yeni kazanan!', ['winners']),
  D('gwNoCandidates', 'Çekiliş', 'Tekrar çekecek kimse kalmadıysa', 'Tekrar çekilecek katılımcı kalmadı.'),
  D('gwDisabled', 'Çekiliş', 'Çekiliş sistemi kapalıyken', 'Çekiliş sistemi kapalı (Panel > Çekilişler).'),
  D('gwStarted', 'Çekiliş', 'Çekiliş başlatılınca cevap', '✅ Çekiliş başlatıldı: {url}', ['url']),
  D('gwCancelled', 'Çekiliş', 'Çekiliş iptal edilince cevap', '🚫 Çekiliş iptal edildi.'),
  D('gwUsage', 'Çekiliş', 'Çekiliş komutu yanlış yazılınca', 'Kullanım: {usage}\nSüre örnekleri: 30m, 2h, 1d, 1h30m', ['usage']),
  D('gwBadDuration', 'Çekiliş', 'Süre anlaşılamazsa', 'Süreyi anlayamadım. Örnek: 30m, 2h, 1d, 1h30m (en fazla 30 gün).'),
  D('gwListEmpty', 'Çekiliş', 'Çalışan çekiliş yoksa', 'Şu an çalışan çekiliş yok.'),
  D('gwTicketTitle', 'Çekiliş', 'Ödül talebi kanalındaki başlık', '🎁 Çekiliş Ödülün', [], { max: 100 }),
  D('gwTicketText', 'Çekiliş', 'Ödül talebi kanalındaki açıklama', '{user} bu çekilişi kazandı! Yetkililer ödülünü teslim edecek.', ['user', 'prize']),
  D('gwTicketGiveaway', 'Çekiliş', 'Ödül talebi: çekiliş alanı', 'Çekiliş', [], { max: 60 }),
  D('gwTicketWon', 'Çekiliş', 'Ödül talebi: kazanma zamanı alanı', 'Kazanma zamanı', [], { max: 60 }),

  // ---- Çekiliş şartları ----
  D('gwFieldReqs', 'Çekiliş', 'Alan adı: şartlar', 'Şartlar', [], { max: 60 }),
  D('gwStatusBtn', 'Çekiliş', '"Şartlarım" butonu yazısı', 'Şartlarım', [], { max: 80 }),
  D('gwStatusTitle', 'Çekiliş', '"Şartlarım" cevabı başlığı', '📋 Çekiliş şartların', [], { max: 100 }),
  D('gwStatusNone', 'Çekiliş', 'Çekilişte şart yoksa "Şartlarım" cevabı', 'Bu çekilişte ek şart yok, katılman yeterli.'),
  D('gwStatusWait', 'Çekiliş', '"Şartlarım"a çok sık basılırsa', 'Biraz yavaş: birkaç saniye sonra tekrar dene.'),
  D('gwReqRole', 'Çekiliş', 'Şart satırı: rol', '{roles} rolüne sahip ol', ['roles']),
  D('gwReqTag', 'Çekiliş', 'Şart satırı: sunucu etiketi', 'Sunucu etiketini (tag) profiline tak'),
  D('gwReqStatus', 'Çekiliş', 'Şart satırı: özel durum', 'Özel durumunda `{text}` yazsın', ['text']),
  D('gwReqVoice', 'Çekiliş', 'Şart satırı: ses aktifliği', 'Çekiliş boyunca seste en az {n} dakika kal', ['n']),
  D('gwReqMessages', 'Çekiliş', 'Şart satırı: mesaj sayısı', 'Çekiliş boyunca en az {n} mesaj yaz', ['n']),
  D('gwReqInvites', 'Çekiliş', 'Şart satırı: davet sayısı', 'Çekiliş boyunca en az {n} kişiyi sunucuya davet et', ['n']),
  D('gwResultReqNote', 'Çekiliş', 'Sonuç mesajı: şart notu', 'Şartı yerine getirmeyen kazananın hakkı düşer, yetkililer tekrar çekiliş yapar.', [], { multi: true }),
  D('gwReqFailed', 'Çekiliş', 'Kazanan şartları yapmadan "Ödülünü Al"a basarsa', '❌ Bu çekilişi **kazanmadın**: şartları yerine getirmediğin için hakkın düştü.\n{missing}', ['missing'], { multi: true }),
  D('gwNeedPresence', 'Çekiliş', 'Durum şartı seçildi ama bot durumu göremiyorsa', 'Durum şartı için botta Presence Intent açık olmalı (Developer Portal + .env USE_PRESENCE=true).'),
  D('gwNeedMembers', 'Çekiliş', 'Davet şartı seçildi ama bot üyeleri göremiyorsa', 'Davet şartı için botta Server Members Intent açık olmalı (Developer Portal + .env GUILD_MEMBERS_INTENT=true).'),
  D('gwNeedManageGuild', 'Çekiliş', 'Davet şartı seçildi ama botun izni yoksa', 'Davet şartı için botun "Sunucuyu Yönet" izni olmalı.'),

  // ---- Çalışma saatleri ----
  D('outsideHours', 'Çalışma saatleri', 'Saat dışında açılan talebe yazılan not', 'Şu an çalışma saatlerimizin dışındayız ({workhours}). Talebin kaydedildi; ekibimiz aktif olunca sana dönecek.', ['workhours'], { multi: true }),

  // ---- Kategori limiti ve SSS ----
  D('categoryLimit', 'Kategori limiti ve SSS', 'Bu kategoriden fazla talep açmaya çalışınca', 'Bu kategoride zaten açık talebin var: {channel}', ['channel']),
  D('faqTitle', 'Kategori limiti ve SSS', 'SSS penceresi başlığı (kategoride başlık boşsa)', 'Önce şuna bir göz at', [], { max: 100 }),
  D('faqContinue', 'Kategori limiti ve SSS', 'SSS penceresindeki devam butonu', 'Yine de talep aç', [], { max: 80 }),

  // ---- Devretme, taşıma, notlar, hazır cevaplar ----
  D('transferDone', 'Devretme, taşıma, notlar, hazır cevaplar', 'Talep devredilince', '{staff}, talebi {target} kişisine devretti.', ['staff', 'target', 'targetname']),
  D('movePrompt', 'Devretme, taşıma, notlar, hazır cevaplar', 'Taşıma: kategori listesi üstündeki yazı', 'Hangi kategoriye taşınsın?'),
  D('removePrompt', 'Devretme, taşıma, notlar, hazır cevaplar', 'Çıkarma: kişi listesi üstündeki yazı', 'Talepten kimi çıkaracaksın?'),
  D('removeNone', 'Devretme, taşıma, notlar, hazır cevaplar', 'Çıkarılacak kimse yoksa', 'Bu talebe sonradan eklenmiş (çıkarılabilir) kimse yok.'),
  D('unblockPrompt', 'Devretme, taşıma, notlar, hazır cevaplar', 'Kara listeden çıkarma: liste üstündeki yazı', 'Kimi kara listeden çıkaracaksın?'),
  D('blockListEmpty', 'Devretme, taşıma, notlar, hazır cevaplar', 'Kara liste boşsa', 'Kara listede kimse yok.'),
  D('reminderOff', 'Hatırlatıcı', 'Hatırlatıcı kapatılınca', '🔕 Bu talep için hareketsizlik hatırlatması ve otomatik kapatma kapatıldı.'),
  D('reminderOn', 'Hatırlatıcı', 'Hatırlatıcı tekrar açılınca', '🔔 Bu talep için hareketsizlik hatırlatması tekrar açıldı.'),
  D('fieldStaff', 'Devretme, taşıma, notlar, hazır cevaplar', 'Satır: yetkili', 'Yetkili'),
  D('transferUsage', 'Devretme, taşıma, notlar, hazır cevaplar', 'Devir için kişi yazılmadıysa', 'Talebi devredeceğin kişiyi etiketle.'),
  D('moveDone', 'Devretme, taşıma, notlar, hazır cevaplar', 'Talep başka kategoriye taşınınca', '{staff}, talebi **{newcategory}** kategorisine taşıdı.', ['staff', 'newcategory']),
  D('moveUsage', 'Devretme, taşıma, notlar, hazır cevaplar', 'Taşıma için kategori yazılmadıysa', 'Bir kategori yaz: {list}', ['list']),
  D('moveNotFound', 'Devretme, taşıma, notlar, hazır cevaplar', 'Kategori bulunamazsa', 'Böyle bir kategori yok. Seçenekler: {list}', ['list']),
  D('cannedList', 'Devretme, taşıma, notlar, hazır cevaplar', 'Hazır cevap adı yazılmadıysa / bulunamazsa', 'Hazır cevaplar: {list}', ['list']),
  D('cannedNone', 'Devretme, taşıma, notlar, hazır cevaplar', 'Hiç hazır cevap yoksa', 'Henüz hazır cevap eklenmemiş. Panel > Hazır cevaplar sekmesinden ekleyebilirsin.'),
  D('noteSaved', 'Devretme, taşıma, notlar, hazır cevaplar', 'İç not kaydedilince', '📝 Not kaydedildi (sadece yetkililer görür).'),
  D('noteUsage', 'Devretme, taşıma, notlar, hazır cevaplar', 'Not yazılmadıysa', 'Notu yaz: {usage}', ['usage']),
  D('noteLogTitle', 'Devretme, taşıma, notlar, hazır cevaplar', 'Log kanalındaki not başlığı', 'Talep #{number} notu', ['number']),
  D('notesDm', 'Devretme, taşıma, notlar, hazır cevaplar', 'Notlar DM ile gönderilince', 'Notlar DM kutuna gönderildi.'),
  D('notesDmFail', 'Devretme, taşıma, notlar, hazır cevaplar', 'DM gönderilemezse', 'DM gönderilemedi; DM\'lerini açıp tekrar dene.'),
  D('notesEmpty', 'Devretme, taşıma, notlar, hazır cevaplar', 'Talepte hiç not yoksa', 'Bu talepte henüz not yok.'),

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
  D('gwNav', 'Çekilişler', 'Menü: çekilişler', 'Çekilişler'),
  D('gwEyebrow', 'Çekilişler', 'Küçük başlık', 'Çekilişler'),
  D('gwTitle', 'Çekilişler', 'Başlık', 'Çekilişlere katıl, ödülünü destekten al'),
  D('gwLead', 'Çekilişler', 'Açıklama', 'Kazananlar sonuç mesajındaki "Ödülünü Al" butonuna basınca sana özel bir destek kanalı açılır; ödülün orada teslim edilir. Ödülünü {hours} saat içinde almayı unutma.', [], { multi: true }),
  D('gwRunningHead', 'Çekilişler', 'Çalışan çekilişler başlığı', 'Şu an devam edenler'),
  D('gwEndedHead', 'Çekilişler', 'Biten çekilişler başlığı', 'Son bitenler'),
  D('gwNone', 'Çekilişler', 'Çekiliş yokken', 'Şu an çalışan çekiliş yok.'),
  D('gwNoneEnded', 'Çekilişler', 'Biten çekiliş yokken', 'Henüz biten çekiliş yok.'),
  D('gwPrizeLabel', 'Çekilişler', 'Ödül etiketi', 'Ödül'),
  D('gwWinnersLabel', 'Çekilişler', 'Kazanan etiketi', 'Kazanan'),
  D('gwEntriesLabel', 'Çekilişler', 'Katılımcı etiketi', 'katılımcı'),
  D('gwEndsLabel', 'Çekilişler', 'Bitiş etiketi', 'Bitiş'),
  D('gwClaimedLabel', 'Çekilişler', 'Ödül alınmış etiketi', 'ödül talebi açıldı'),
  D('gwCatBadge', 'Çekilişler', 'Kategorilerde çekiliş rozeti', 'Çekiliş ödül kategorisi'),
  D('gwCatDesc', 'Çekilişler', 'Çekiliş kategorisi açıklaması (boşsa kategorinin kendi açıklaması)', 'Çekiliş kazandıysan ödülünü buradan teslim alırsın: sonuç mesajındaki "Ödülünü Al" butonuna bas.', [], { multi: true }),
  D('footerAdmin', 'Menü ve alt bilgi', 'Alt bilgi: destek paneli bağlantısı', 'Destek paneli'),
  D('footerGiveaway', 'Menü ve alt bilgi', 'Alt bilgi: çekiliş paneli bağlantısı', 'Çekiliş paneli'),
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
// Verilen şablonu hem genel değişkenlerle ({server}, {date}...) hem de gelen değişkenlerle doldurur.
function renderAll(config, template, vars = {}) {
  const tpl = String(template ?? '');
  return tpl.includes('{') ? render(tpl, { ...globalVars(config), ...vars }) : tpl;
}
const msg = (config, key, vars) => renderAll(config, config?.messages?.[key] ?? MESSAGE_DEFAULTS[key] ?? key, vars);

module.exports = { MESSAGE_DEFS, SITE_DEFS, MESSAGE_DEFAULTS, SITE_DEFAULTS, normalizeTexts, render, renderAll, msg };
