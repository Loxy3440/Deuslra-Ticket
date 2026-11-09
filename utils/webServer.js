const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ApiError, handlers, publicStats } = require('./adminApi');
const { readConfig } = require('./config');
const store = require('./store');
const db = require('./db');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const COOKIE = 'dd_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.webp': 'image/webp',
};

const attempts = new Map(); // ip -> { count, reset }

function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 200_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new ApiError(413, 'İstek çok büyük.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new ApiError(400, 'Geçersiz JSON.')); }
    });
    req.on('error', reject);
  });
}

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Oturum çerezi imzalıdır (sunucu yeniden başlasa da giriş düşmez; şifre değişirse tüm oturumlar geçersiz olur).
const secret = () => crypto.createHash('sha256').update(`dd-session:${process.env.PANEL_PASSWORD || ''}`).digest();
const sign = exp => crypto.createHmac('sha256', secret()).update(String(exp)).digest('hex');
function makeToken() { const exp = Date.now() + SESSION_MS; return `${exp}.${sign(exp)}`; }

function isAuthed(req) {
  if (!process.env.PANEL_PASSWORD) return false;
  const token = cookies(req)[COOKIE] || '';
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Render gibi proxy arkasında gerçek IP X-Forwarded-For içindedir.
const onRender = () => Boolean(process.env.RENDER);
function clientIp(req) {
  if (onRender()) return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'x';
  return req.socket.remoteAddress || 'x';
}
const secureFlag = req => (req.headers['x-forwarded-proto'] === 'https' || onRender() ? '; Secure' : '');

function passwordOk(input) {
  const expected = process.env.PANEL_PASSWORD || '';
  if (!expected) return false;
  const a = crypto.createHash('sha256').update(String(input)).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function tooManyAttempts(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || rec.reset < now) { attempts.set(ip, { count: 0, reset: now + 60_000 }); return false; }
  return rec.count >= 5;
}

async function handleApi(req, res, url, client) {
  const method = req.method;
  const route = url.pathname.slice('/api/'.length);

  if (method === 'GET' && route === 'stats') return sendJson(res, 200, publicStats(client));
  if (method === 'GET' && route === 'session') {
    return sendJson(res, 200, { authed: isAuthed(req), enabled: Boolean(process.env.PANEL_PASSWORD) });
  }

  if (method === 'POST') {
    // CSRF'e karşı: farklı bir siteden gelen istekleri reddet
    const origin = req.headers.origin;
    if (origin) {
      let host = '';
      try { host = new URL(origin).host; } catch { /* geçersiz */ }
      if (host !== req.headers.host) throw new ApiError(403, 'İstek reddedildi.');
    }
  }

  if (method === 'POST' && route === 'login') {
    if (!process.env.PANEL_PASSWORD) throw new ApiError(503, '.env dosyasında PANEL_PASSWORD tanımlı değil; panel kapalı.');
    const ip = clientIp(req);
    if (tooManyAttempts(ip)) throw new ApiError(429, 'Çok fazla deneme. Bir dakika bekle.');
    const body = await readBody(req, 5_000);
    if (!passwordOk(body.password ?? '')) {
      attempts.get(ip).count++;
      throw new ApiError(401, 'Şifre yanlış.');
    }
    return sendJson(res, 200, { ok: true }, {
      'Set-Cookie': `${COOKIE}=${makeToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secureFlag(req)}`,
    });
  }

  if (method === 'POST' && route === 'logout') {
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureFlag(req)}` });
  }

  // Transcript'i panelden indir (ayardan kapatılabilir)
  if (method === 'GET' && route === 'admin/transcript') {
    if (!isAuthed(req)) throw new ApiError(401, 'Giriş yapmalısın.');
    if (!readConfig().settings.panelTranscriptDownload) throw new ApiError(403, 'Panelden transcript indirme kapalı (Ayarlar).');
    const rec = store.get(url.searchParams.get('channelId') || '');
    const doc = rec?.transcriptKey ? await db.getBlob(rec.transcriptKey).catch(() => null) : null;
    if (!doc) throw new ApiError(404, 'Bu ticket için kayıtlı transcript yok.');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="${String(doc.name || 'transcript.html').replace(/[^\w.\-]/g, '_')}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.end(doc.html);
  }

  if (route.startsWith('admin/')) {
    if (!isAuthed(req)) throw new ApiError(401, 'Giriş yapmalısın.');
    const handler = handlers[`${method} ${route.slice('admin/'.length)}`];
    if (!handler) throw new ApiError(404, 'Bulunamadı.');
    const body = method === 'POST' ? await readBody(req) : {};
    return sendJson(res, 200, await handler(client, body));
  }

  throw new ApiError(404, 'Bulunamadı.');
}

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  if (rel === '/panel') rel = '/panel.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Bulunamadı'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

function startWebServer(client) {
  const port = Number(process.env.PORT) || 3000;
  // Render'da dışarıdan erişim için 0.0.0.0 şart; .env'den kopyalanan HOST=127.0.0.1 bile yok sayılır.
  const host = onRender() ? '0.0.0.0' : (process.env.HOST || '127.0.0.1');
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url, client);
      return serveStatic(req, res, url);
    } catch (err) {
      if (err instanceof ApiError) return sendJson(res, err.status, { error: err.message });
      console.error('[WEB]', err);
      return sendJson(res, 500, { error: 'Sunucu hatası: ' + err.message });
    }
  });
  server.on('error', err => {
    if (err.code === 'EADDRINUSE') console.error(`[WEB] ${port} portu kullanımda. .env içinde PORT değerini değiştir.`);
    else console.error('[WEB]', err);
  });
  server.listen(port, host, () => {
    const base = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
    console.info(`[WEB] Yayında (port ${port}) · Site: ${base} · Yönetim paneli: ${base}/panel`);
    if (!process.env.PANEL_PASSWORD) console.warn('[WEB] PANEL_PASSWORD tanımlı değil: yönetim paneli kapalı.');
    if (onRender() && process.env.PANEL_PASSWORD && process.env.PANEL_PASSWORD.length < 12) console.warn('[WEB] Panel internete açık: en az 12 karakterlik bir PANEL_PASSWORD kullan.');
  });
  return server;
}

module.exports = { startWebServer };
