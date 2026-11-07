const { ConfigError } = require('./config');

// Discord'un embed görseli olarak gösterebilmesi için DOĞRUDAN dosya adresi gerekir.
// Discord'dan "bağlantıyı kopyala" dediğin GIF genelde Tenor/Giphy sayfa linkidir; burada gerçek dosyaya çevrilir.
const IMG_RE = /\.(gif|png|jpe?g|webp)(\?|$)/i;

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
  return raw;
}

module.exports = { resolveMediaUrl, pickFromTenorHtml };
