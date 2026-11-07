const db = require('./db');

// Ticket kayıtları (istatistik ve panel listesi için). Kanal konusu (topic) asıl kaynak,
// bu dosya sadece geçmişi ve sayaçları tutar; silinse bile ticketlar çalışmaya devam eder.
const MAX_RECORDS = 1000;

// Veri ilk kullanımda (veritabanı bağlandıktan sonra) okunur.
let state = null;
function data() {
  if (!state) { state = db.get('tickets', null) || { counter: 0, tickets: {} }; if (!state.tickets) state.tickets = {}; }
  return state;
}

function save() {
  const ids = Object.keys(data().tickets);
  if (ids.length > MAX_RECORDS) {
    ids.sort((a, b) => (state.tickets[a].createdAt || 0) - (state.tickets[b].createdAt || 0));
    for (const id of ids.slice(0, ids.length - MAX_RECORDS)) delete state.tickets[id];
  }
  db.set('tickets', state);
}

function nextNumber() {
  data().counter += 1;
  save();
  return state.counter;
}

function upsert(channelId, patch) {
  const t = data().tickets;
  t[channelId] = { ...(t[channelId] || { channelId, createdAt: Date.now() }), ...patch };
  save();
  return t[channelId];
}

const get = channelId => data().tickets[channelId] || null;

function list() {
  return Object.values(data().tickets).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function stats() {
  const all = Object.values(data().tickets);
  return {
    total: data().counter,
    open: all.filter(t => t.status === 'open').length,
    closed: all.filter(t => t.status === 'closed').length,
    deleted: all.filter(t => t.status === 'deleted').length,
  };
}

module.exports = { nextNumber, upsert, get, list, stats };
