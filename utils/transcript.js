// Ticket kanalının mesajlarını tek bir HTML dosyasına çevirir (log kanalına / DM'e eklenir).
// Not: mesaj METİNLERİ için Developer Portal'da "Message Content Intent" açık olmalı
// ve .env içinde MESSAGE_CONTENT_INTENT=true olmalı; yoksa sadece yazar/zaman/ek dosya görünür.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function collectMessages(channel, limit = 500) {
  const all = [];
  let before;
  while (all.length < limit) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch || !batch.size) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  return all.reverse().slice(-limit);
}

async function buildTranscript(channel, title = '') {
  const messages = await collectMessages(channel);
  const contentVisible = process.env.MESSAGE_CONTENT_INTENT === 'true';
  const rows = messages.map(m => {
    const time = new Date(m.createdTimestamp).toLocaleString('tr-TR');
    const files = [...m.attachments.values()].map(a => `<a href="${esc(a.url)}">${esc(a.name || 'ek')}</a>`).join(' · ');
    const embeds = m.embeds.map(e => esc([e.title, e.description].filter(Boolean).join(' — '))).filter(Boolean).join('<br>');
    return `<div class="m"><div class="h"><b>${esc(m.author?.tag || m.author?.username || 'bilinmiyor')}</b>${m.author?.bot ? ' <i>BOT</i>' : ''}<span>${esc(time)}</span></div>`
      + `${m.content ? `<p>${esc(m.content)}</p>` : ''}${embeds ? `<p class="e">${embeds}</p>` : ''}${files ? `<p class="f">${files}</p>` : ''}</div>`;
  }).join('\n');
  const note = contentVisible ? '' : '<p class="n">Mesaj metinleri kaydedilmedi (MESSAGE_CONTENT_INTENT kapalı).</p>';
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(title || channel.name)}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;background:#0f0a1a;color:#e9e4f5;max-width:820px;margin:24px auto;padding:0 16px}
h1{font-size:20px;color:#c4b5fd}.m{border-left:3px solid #7c3aed;background:#1a1229;padding:8px 12px;margin:8px 0;border-radius:6px}
.h span{color:#8b83a3;font-size:12px;margin-left:8px}.h i{background:#5b21b6;color:#fff;font-size:10px;padding:1px 5px;border-radius:4px;font-style:normal}
p{margin:4px 0;white-space:pre-wrap;word-break:break-word}.e{color:#a89fc4}.f a{color:#a78bfa}.n{color:#fbbf24}</style></head>
<body><h1>${esc(title || channel.name)}</h1><p>${messages.length} mesaj · ${esc(new Date().toLocaleString('tr-TR'))}</p>${note}${rows}</body></html>`;
  return { buffer: Buffer.from(html, 'utf8'), name: `${channel.name}.html`, count: messages.length };
}

module.exports = { buildTranscript };
