const { AttachmentBuilder } = require('discord.js');
const { ConfigError } = require('./config');

// Discord'un embed görseli olarak gösterebilmesi için DOĞRUDAN dosya adresi gerekir.
// Discord'dan "bağlantıyı kopyala" dediğin GIF genelde Tenor/Giphy sayfa linkidir; burada gerçek dosyaya çevrilir.
const IMG_RE = /\.(gif|png|jpe?g|webp)(\?|$)/i;

const UA = 'Mozilla/5.0 (compatible; DeuslraBot/1.0)';
const MAX_BYTES = 8 * 1024 * 1024;
const imgCache = new Map(); // url -> { buffer, ext } (az sayıda, bellek şişmesin)

// Görseli sunucuya indirir. Discord'a dosya olarak yüklenince bağlantı süresi dolsa bile görsel mesajda kalır.
async function downloadImage(url) {
  if (imgCache.has(url)) return imgCache.get(url);
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!type.startsWith('image/')) throw new Error(`adres bir görsel/GIF değil (${type || 'bilinmeyen tür'})`);
  if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('dosya 8 MB\'tan büyük');
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_BYTES) throw new Error('dosya 8 MB\'tan büyük');
  const ext = { 'image/gif': 'gif', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[type] || 'png';
  const out = { buffer, ext };
  imgCache.set(url, out);
  if (imgCache.size > 8) imgCache.delete(imgCache.keys().next().value);
  return out;
}

// Mesaja dosya olarak eklenecek görsel. İndirilemezse null döner (o zaman adres olduğu gibi kullanılır).
async function attachmentFor(url, base) {
  if (!url) return null;
  try {
    const { buffer, ext } = await downloadImage(url);
    const name = `${base}.${ext}`;
    return { name, file: new AttachmentBuilder(Buffer.from(buffer), { name }) };
  } catch (err) {
    console.error('[MEDIA] görsel indirilemedi, adres olduğu gibi kullanılacak:', String(url).slice(0, 90), err.message);
    return null;
  }
}

async function fetchText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DeuslraBot/1.0)', Accept: 'text/html' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function pickFromTenorHtml(html) {
  const found = [];
  for (const re of [
    /itemprop=["']contentUrl["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*itemprop=["']contentUrl["']/i,
    /property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
  ]) { const m = html.match(re); if (m) found.push(m[1].replace(/&amp;/g, '&')); }
  return found.find(u => /\.gif(\?|$)/i.test(u)) || found.find(u => IMG_RE.test(u)) || '';
}

async function resolveMediaUrl(input, label = 'Görsel') {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  let u;
  try { u = new URL(raw); } catch { return raw; } // geçersizse config doğrulaması anlaşılır hata verir
  const host = u.hostname.toLowerCase();

  if (host === 'giphy.com' || host === 'www.giphy.com') {
    const m = u.pathname.match(/\/(?:gifs|stickers|embed|clips)\/(?:.*-)?([A-Za-z0-9]+)\/?$/);
    if (m) return `https://media.giphy.com/media/${m[1]}/giphy.gif`;
    throw new ConfigError(`${label}: Giphy linkinden GIF bulunamadı. GIF'e sağ tık > "Görsel adresini kopyala" ile doğrudan adresi dene.`);
  }
  if (host === 'tenor.com' || host === 'www.tenor.com') {
    try {
      const direct = pickFromTenorHtml(await fetchText(raw));
      if (direct) return direct;
    } catch (err) { console.error('[MEDIA] Tenor çözülemedi:', err.message); }
    throw new ConfigError(`${label}: Tenor sayfasından GIF adresi alınamadı. GIF'e sağ tık > "Görsel adresini kopyala" (media.tenor.com ile başlayan, .gif ile biten adres) yapıp onu yapıştır.`);
  }
  // Discord'a yüklenmiş dosyaların bağlantıları süreli (ex=...) gelir; süresi dolmuşsa baştan söyle.
  if (host === 'cdn.discordapp.com' || host === 'media.discordapp.net') {
    const ex = u.searchParams.get('ex');
    if (ex && /^[0-9a-f]+$/i.test(ex) && parseInt(ex, 16) * 1000 < Date.now()) {
      throw new ConfigError(`${label}: bu Discord bağlantısının süresi dolmuş. Dosyayı Discord'da tekrar aç ve yeni bağlantıyı kopyala.`);
    }
    try { await downloadImage(raw); }
    catch (err) { throw new ConfigError(`${label}: adres açılamadı (${err.message}). Bağlantıyı Discord'dan yeniden kopyala.`); }
  }
  return raw;
}

module.exports = { resolveMediaUrl, pickFromTenorHtml, downloadImage, attachmentFor };
