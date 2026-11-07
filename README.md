# Deuslra Destek

Discord ticket botu + site + yönetim paneli. Bilgisayarında (localhost) veya Render'da (MongoDB Atlas ile) çalışır.

## Klasörler

```
index.js          botu ve siteyi başlatır
commands/         slash komutlar (yeni .js dosyası eklemek yeterli)
events/           Discord olayları (ready, interactionCreate)
utils/            ticket mantığı, ayarlar, web sunucusu, API
public/           site (index.html) ve yönetim paneli (panel.html)
config/           ticket-config.json (MongoDB yoksa panel buraya kaydeder)
data/             ticket kayıtları (MongoDB yoksa buraya yazılır)
render.yaml       Render blueprint dosyası
```

## Kurulum (localhost)

1. [Node.js 18+](https://nodejs.org) kurulu olmalı.
2. Bu klasörde terminal aç ve bağımlılıkları kur:
   ```sh
   npm install
   ```
3. `.env.example` dosyasını kopyalayıp adını `.env` yap ve doldur:
   - `DISCORD_BOT_TOKEN` : Developer Portal > Bot > Token
   - `DISCORD_GUILD_ID`  : sunucu ID'n
   - `PANEL_PASSWORD`    : yönetim paneli şifren (boşsa panel kapalı kalır)
4. Botu başlat:
   ```sh
   npm start
   ```
5. Tarayıcıdan aç:
   - Site: <http://localhost:3000>
   - Yönetim paneli: <http://localhost:3000/panel>

Port doluysa `.env` içinde `PORT=3001` gibi değiştir.

## İlk ayar (panelden)

1. **Ayarlar** sekmesi: panel kanalı, log kanalı, ticket kategorisi ve destek rollerini seç.
2. **Panel görünümü** ve **Butonlar & formlar** sekmeleri: mesajı ve ticket kategorilerini düzenle (Discord önizlemesi canlı görünür).
3. **Ayarları kaydet**'e bas, sonra **Genel bakış > Paneli Discord'a gönder**'e bas.

Daha önce gönderilmiş bir panel mesajı varsa yenisini atmaz, onu günceller.

## Panel Discord'a gitmiyorsa

Yönetim paneli > **Genel bakış > Kurulum durumu** kutusu her adımı kontrol eder ve neyin eksik olduğunu yazar. En sık sebep botun izinleri: bot **Rolleri Yönet** iznine de ihtiyaç duyar (kapanan ticketı kullanıcıdan gizlemek ve `/add` için). Kutudaki **Botu doğru izinlerle davet et** bağlantısı gerekli tüm izinleri tek seferde verir.

## Kategori seçimi: buton, açılır liste veya ikisi

**Panel görünümü > Kategori seçimi** bölümünden seç. Açılır listede her kategorinin altında "Kısa açıklama" görünür (Kategoriler & formlar sekmesinden yazılır). Buton + liste birlikte kullanılırsa en fazla 20 kategori olabilir.

## Bekleme süresi (timeout)

**Kategoriler & formlar** sekmesinde her kategorinin **Bekleme süresi (dakika)** alanı var. Kullanıcı o kategoriden talep açtıktan sonra bu süre dolmadan yenisini açamaz; hem buton hem liste için geçerlidir. Talep silinse bile süre atlatılamaz. Destek ekibi muaftır. 0 = sınırsız.

## Kapanan ticket

Ticket kapanınca kanal ticket sahibinden (ve `/add` ile eklenenlerden) gizlenir; sadece destek ekibi görür. Kullanıcıya kapanış sebebi ve transcript DM ile gider. Destek ekibi **Yeniden aç** derse sahibi kanalı tekrar görür.

## Render + MongoDB Atlas ile yayına alma

Render'ın diski kalıcı değildir: veritabanı olmazsa ayarlar ve ticket kayıtları her yeniden başlatmada silinir. Bu yüzden MongoDB Atlas kullanılır.

1. **MongoDB Atlas:** ücretsiz cluster aç > Database Access'ten kullanıcı oluştur > **Network Access > Add IP Address > Allow access from anywhere (0.0.0.0/0)** (Render'ın sabit IP'si yok) > Connect > Drivers'tan bağlantı adresini kopyala (`mongodb+srv://...`, içindeki `<password>` yerine şifreni yaz).
2. **GitHub:** bu klasörü bir repoya yükle (`.env` ve `node_modules` zaten yüklenmez). Repoyu **Private** yap.
3. **Render:** New > Blueprint (render.yaml'ı okur) veya New > Web Service seç; build `npm install`, start `npm start`. Environment'a şunları gir: `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `PANEL_PASSWORD` (en az 12 karakter), `MONGODB_URI`.
4. Deploy bitince `https://ADIN.onrender.com/panel` adresinden gir, **Genel bakış** kutusundaki maddeleri yeşile çevir, **Kaydet ve Discord'a gönder**'e bas.

Notlar:
- Ayarlar `config/ticket-config.json` dosyasından değil veritabanından okunur. Yerelde kullandığın ayarlar `.gitignore` yüzünden GitHub'a gitmez; ilk açılışta kanalları/rolleri panelden bir kez seç. MONGODB_URI'yi yerelde de yazarsan aynı ayarlar her yerde ortak olur.
- Ücretsiz Render servisi 15 dakika istek gelmezse uyur ve bot çevrimdışı olur. Uyumasın istiyorsan UptimeRobot ile 5 dakikada bir `https://ADIN.onrender.com/healthz` adresini pingle ya da ücretli planı seç.
- Panel internete açık olacağı için güçlü `PANEL_PASSWORD` şart; 5 yanlış denemeden sonra giriş geçici kilitlenir.

## Komutlar

| Komut | Ne yapar | Kim kullanır |
|---|---|---|
| `/setup` | Ticket panelini yayınlar / günceller | Sunucu yöneticisi |
| `/close sebep` | Ticket'ı kapatır, kullanıcıya DM atar | Sahibi veya destek ekibi |
| `/reopen` | Kapatılmış ticket'ı yeniden açar | Destek ekibi |
| `/delete [sebep]` | Ticket kanalını kalıcı siler (transcript log kanalına gider) | Destek ekibi |
| `/claim` | Ticket'ı üstlenir | Destek ekibi |
| `/call-staff` | Destek rollerini etiketler | Sahibi veya destek ekibi |
| `/add kullanıcı` · `/remove kullanıcı` | Ticket'a kişi ekler / çıkarır | Destek ekibi |

Kapatılan ticket'ın içinde **Yeniden aç** ve **Sil** butonları da çıkar. Sil butonu önce onay ister.

## Botun ihtiyaç duyduğu izinler

Davet ederken `bot` ve `applications.commands` kapsamları, izin olarak: Kanalları Yönet, **Rolleri Yönet**, Kanalları Gör, Mesaj Gönder, Mesaj Geçmişini Oku, Dosya Ekle, Bağlantı Göm, Mesajları Yönet (yönetim panelindeki davet bağlantısı bunların hepsini verir). Botun rolü, ticket kategorisini ve destek rollerini görebilmeli.

## Transcript'te mesaj metinleri

Kapatma ve silme sırasında oluşan HTML kayıtta mesaj metinlerinin görünmesi için:
1. Developer Portal > Bot > **Message Content Intent** anahtarını aç.
2. `.env` içinde `MESSAGE_CONTENT_INTENT=true` yap.

Kapalıysa kayıtta sadece yazar, zaman ve ek dosyalar görünür.

## Güvenlik

- Yerelde site varsayılan olarak sadece bu bilgisayardan (`127.0.0.1`) erişilebilir. Render'da otomatik herkese açılır; yönetim paneli şifreyle korunur.
- `.env` dosyasını kimseyle paylaşma ve GitHub'a yükleme (`.gitignore` bunu zaten engeller).
- Panelde 1 dakikada 5 yanlış şifreden sonra giriş geçici olarak kilitlenir.
