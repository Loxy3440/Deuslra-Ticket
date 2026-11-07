const path = require('path');
const { readJson, writeJson } = require('./json');

// Depolama katmanı: MONGODB_URI varsa MongoDB Atlas, yoksa yerel JSON dosyaları (bilgisayarında test için).
// Render gibi sunucularda dosyalar yeniden başlatmada silindiği için orada MongoDB şart.
const ROOT = path.join(__dirname, '..');
const FILES = {
  config: path.join(ROOT, 'config', 'ticket-config.json'),
  'panel-message': path.join(ROOT, 'data', 'panel-message.json'),
  tickets: path.join(ROOT, 'data', 'tickets.json'),
};

let mode = 'file';
let lastError = '';
let client = null;
let coll = null;
const cache = new Map();
const chains = new Map(); // anahtar başına yazma sırası (eski veri yeniyi ezmesin)

async function init() {
  // MONGODB_URI, MONGO_URI ve MONGO_URL adlarından hangisi yazıldıysa kabul edilir (tırnak/boşluk da temizlenir).
  const uri = (process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL || '').trim().replace(/^['"]|['"]$/g, '');
  if (!uri) { mode = 'file'; return mode; }
  const { MongoClient } = require('mongodb');
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  coll = client.db(process.env.MONGODB_DB || 'deuslra-destek').collection('kv');
  for (const doc of await coll.find({}).toArray()) cache.set(doc._id, doc.data);
  // Yazma testi: kullanıcıya yazma izni yoksa ayarlar her deploy'da kaybolur; bunu başta yakalayalım.
  try { await coll.replaceOne({ _id: '_health' }, { _id: '_health', at: new Date() }, { upsert: true }); }
  catch (err) { throw new Error(`MongoDB'ye bağlanıldı ama YAZILAMIYOR (${err.message}). Atlas > Database Access'te kullanıcının "Read and write to any database" yetkisi olmalı.`); }
  mode = 'mongo';
  // İlk çalıştırmada projedeki yerel dosyalar veritabanına aktarılır (ayarların kaybolmasın).
  for (const [key, file] of Object.entries(FILES)) {
    if (cache.has(key)) continue;
    const data = readJson(file, null);
    if (data) { cache.set(key, data); await persist(key, data); }
  }
  return mode;
}

function persist(key, data) {
  const run = () => coll.replaceOne({ _id: key }, { _id: key, data, updatedAt: new Date() }, { upsert: true })
    .then(() => { lastError = ''; })
    .catch(err => { lastError = err.message; console.error(`[DB] "${key}" kaydedilemedi:`, err.message); });
  const next = (chains.get(key) || Promise.resolve()).then(run);
  chains.set(key, next);
  return next;
}

function get(key, fallback = null) {
  if (mode === 'mongo') return cache.has(key) ? cache.get(key) : fallback;
  return readJson(FILES[key], fallback);
}

function set(key, data) {
  if (mode === 'mongo') { cache.set(key, data); persist(key, data); return; }
  writeJson(FILES[key], data);
}

async function close() {
  await Promise.all([...chains.values()]);
  if (client) await client.close().catch(() => null);
}

const getMode = () => mode;
const getLastError = () => lastError;
module.exports = { init, get, set, close, getMode, getLastError };
