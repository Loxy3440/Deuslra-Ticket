const path = require('path');
const { readJson } = require('./json');
const db = require('./db');
const { MESSAGE_DEFS, SITE_DEFS, normalizeTexts } = require('./messages');
const { ACTIONS, PERMISSIONS, DEFAULT_COMMANDS } = require('./commandDefs');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'ticket-config.json');
const EXAMPLE_PATH = path.join(ROOT, 'config', 'ticket-config.example.json');
const DATA_DIR = path.join(ROOT, 'data');
const PANEL_STATE_PATH = path.join(DATA_DIR, 'panel-message.json');

class ConfigError extends Error {}

const BUTTON_COLORS = ['primary', 'secondary', 'success', 'danger'];
const PANEL_STYLES = ['buttons', 'dropdown', 'both'];

function defaultConfig() {
  return {
    version: 1,
    brandName: 'Deuslra Destek',
    guildId: '',
    panel: {
      channelId: '',
      style: 'buttons',
      placeholder: 'Bir kategori seç…',
      title: 'Nasıl yardımcı olabiliriz?',
      content: '',
      description: 'Destek talebin ekibimize özel bir kanalda oluşturulur. En kısa sürede dönüş yapacağız.',
      footer: 'Deuslra Destek',
      color: '#8B5CF6',
      imageUrl: '',
      thumbnailUrl: '',
    },
    ticketCategoryId: '',
    logChannelId: '',
    supportRoleIds: [],
    buttons: [
      {
        id: 'genel-destek', label: 'Genel destek', emoji: '✉️', color: 'primary', categoryId: '', formEnabled: true,
        formFields: [{ label: 'Konu', placeholder: 'Sana nasıl yardımcı olabiliriz?', required: true }],
      },
    ],
    colors: { main: '#8B5CF6', success: '#22C55E', warning: '#F59E0B', danger: '#EF4444' },
    messages: {},
    site: {},
    commands: { enabled: true, prefix: '.', deleteInvocation: false, replyDeleteSeconds: 0, list: DEFAULT_COMMANDS },
    ticketEmbed: { title: 'Ticket #{number} · {category}', color: '#8B5CF6', footer: '', imageUrl: '', thumbnailUrl: '', showDetails: true },
    actions: {
      close: { label: 'Talebi kapat', emoji: '🔒', color: 'danger', cooldownSeconds: 0 },
      claim: { label: 'Üzerime al', emoji: '🙋', color: 'success', cooldownSeconds: 0 },
      callStaff: { label: 'Ekibi çağır', emoji: '📣', color: 'secondary', cooldownSeconds: 0 },
    },
    settings: {
      maxOpenPerUser: 1,
      deleteDelaySeconds: 5,
      pingSupportOnOpen: true,
      transcript: true,
      dmOnClose: true,
      dmTranscript: true,
      transcriptAdminIds: ['1400335230220505089'],
      askCloseReason: 'staff',
      closeReasonRequired: true,
      channelNameFormat: 'ticket-{number}-{user}',
      closedPrefix: 'closed-',
      welcomeMessage: '{user} hoş geldin! Destek ekibi kısa süre içinde burada olacak. Sorununu ayrıntılı yazabilirsin.',
    },
  };
}

const str = (v, max) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);
const cleanId = v => { const s = String(v ?? '').trim(); return /^\d{15,25}$/.test(s) ? s : ''; };
const cleanColor = v => (/^#[0-9a-f]{6}$/i.test(String(v ?? '').trim()) ? String(v).trim() : '#8B5CF6');
// Görsel adresi: boşsa boş kalır; doluysa geçerli bir http(s) adresi olmalı. Sessizce silmek yerine hata verir ki kullanıcı fark etsin.
const cleanUrl = (v, label = 'Görsel') => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (!/^https?:\/\/\S{1,2000}$/i.test(s)) throw new ConfigError(`${label} adresi geçersiz: http:// veya https:// ile başlamalı, boşluk içermemeli ve 2000 karakteri geçmemeli.`);
  return s;
};
const cleanColorOr = (v, def) => (/^#[0-9a-f]{6}$/i.test(String(v ?? '').trim()) ? String(v).trim() : def);
// Kanal adı kalıbı: küçük harf/rakam/-/_ ve {number} {user}; {number} zorunlu
const cleanChannelFormat = v => {
  const s = String(v ?? '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_{}-]/g, '').slice(0, 60);
  return s.includes('{number}') ? s : '';
};
// Yazıyla komutlar (.close vb.): adlar benzersiz olmalı, eylem listede olmalı
const cleanCmdName = (v, prefix) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, '').slice(prefix.length && String(v ?? '').trim().startsWith(prefix) ? prefix.length : 0, 40);
function normalizeCommands(input, d) {
  const k = input && typeof input === 'object' ? input : {};
  const rawPrefix = typeof k.prefix === 'string' ? k.prefix.trim() : '';
  if (rawPrefix && !/^\S{1,3}$/.test(rawPrefix)) throw new ConfigError('Komut öneki 1-3 karakter olmalı ve boşluk içermemeli (örn. . ! ?).');
  const prefix = rawPrefix || d.prefix;
  const seen = new Map();
  const nameRe = /^[a-z0-9çğıöşü_-]{1,20}$/;
  const checkName = (n, label) => {
    if (!nameRe.test(n)) throw new ConfigError(`Komut adı geçersiz: "${n}" (${label}). Küçük harf, rakam, - ve _ kullan, en fazla 20 karakter.`);
    if (seen.has(n)) throw new ConfigError(`"${n}" adı iki yerde kullanılmış. Her komut ve ek ad benzersiz olmalı.`);
    seen.set(n, true);
    return n;
  };
  const rawList = Array.isArray(k.list) ? k.list : d.list;
  if (rawList.length > 40) throw new ConfigError('En fazla 40 komut olabilir.');
  const list = rawList.map((cmd, i) => {
    const action = ACTIONS[cmd?.action] ? cmd.action : 'reply';
    const name = checkName(cleanCmdName(cmd?.name, prefix), `${i + 1}. komut`);
    const aliases = (Array.isArray(cmd?.aliases) ? cmd.aliases : String(cmd?.aliases ?? '').split(/[\s,]+/))
      .map(a => cleanCmdName(a, prefix)).filter(Boolean).slice(0, 5).map(a => checkName(a, `${name} için ek ad`));
    return {
      id: slug(cmd?.id || name) || `komut-${i + 1}`,
      name, aliases, action,
      enabled: bool(cmd?.enabled, true),
      permission: PERMISSIONS[cmd?.permission] ? cmd.permission : ACTIONS[action].perm,
      roleIds: [...new Set((Array.isArray(cmd?.roleIds) ? cmd.roleIds : []).map(cleanId).filter(Boolean))].slice(0, 10),
      ticketOnly: bool(cmd?.ticketOnly, ACTIONS[action].needsTicket),
      cooldownSeconds: clampInt(cmd?.cooldownSeconds, 0, 3600, 0),
      description: str(cmd?.description, 120),
      response: str(cmd?.response, 1500),
    };
  });
  if (list.some(c => c.action === 'reply' && !c.response)) {
    const bad = list.find(c => c.action === 'reply' && !c.response);
    throw new ConfigError(`"${bad.name}" komutu "Özel cevap" olarak ayarlı ama cevap metni boş.`);
  }
  return {
    enabled: bool(k.enabled, d.enabled),
    prefix,
    deleteInvocation: bool(k.deleteInvocation, d.deleteInvocation),
    replyDeleteSeconds: clampInt(k.replyDeleteSeconds, 0, 300, d.replyDeleteSeconds),
    list,
  };
}
const clampInt = (v, min, max, def) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const bool = (v, def) => (typeof v === 'boolean' ? v : def);

function slug(text) {
  return String(text || '').toLowerCase()
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

// Panelden veya dosyadan gelen her şeyi temizler ve doğrular. Hatalıysa ConfigError fırlatır.
function normalizeConfig(input) {
  const d = defaultConfig();
  const c = input && typeof input === 'object' ? input : {};
  const p = c.panel && typeof c.panel === 'object' ? c.panel : {};
  const s = c.settings && typeof c.settings === 'object' ? c.settings : {};
  const a = c.actions && typeof c.actions === 'object' ? c.actions : {};
  const te = c.ticketEmbed && typeof c.ticketEmbed === 'object' ? c.ticketEmbed : {};

  const action = key => ({
    label: str(a[key]?.label, 80) || d.actions[key].label,
    emoji: str(a[key]?.emoji ?? d.actions[key].emoji, 64),
    color: BUTTON_COLORS.includes(a[key]?.color) ? a[key].color : d.actions[key].color,
    cooldownSeconds: clampInt(a[key]?.cooldownSeconds, 0, 86400, 0),
  });

  const used = new Set();
  const rawButtons = Array.isArray(c.buttons) ? c.buttons : [];
  if (!rawButtons.length) throw new ConfigError('En az bir ticket butonu eklemelisin.');
  if (rawButtons.length > 25) throw new ConfigError('Bir panelde en fazla 25 buton olabilir.');
  const buttons = rawButtons.map((b, i) => {
    const label = str(b?.label, 80);
    if (!label) throw new ConfigError(`${i + 1}. butonun adı boş olamaz.`);
    let id = slug(b?.id) || slug(label) || `buton-${i + 1}`;
    for (let n = 2; used.has(id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`;
    used.add(id);
    const rawFields = Array.isArray(b?.formFields) ? b.formFields : [];
    if (rawFields.length > 5) throw new ConfigError(`"${label}" butonunda en fazla 5 form alanı olabilir.`);
    const formFields = rawFields.map((f, j) => {
      const fl = str(f?.label, 45);
      if (!fl) throw new ConfigError(`"${label}" butonunun ${j + 1}. form alanının adı boş.`);
      return { label: fl, placeholder: str(f?.placeholder, 100), required: bool(f?.required, true) };
    });
    return {
      id, label,
      description: str(b?.description, 100),
      emoji: str(b?.emoji, 64),
      color: BUTTON_COLORS.includes(b?.color) ? b.color : 'primary',
      categoryId: cleanId(b?.categoryId),
      cooldownSeconds: clampInt(b?.cooldownSeconds, 0, 604800, 0),
      formEnabled: bool(b?.formEnabled, false) && formFields.length > 0,
      formFields,
    };
  });

  const style = PANEL_STYLES.includes(p.style) ? p.style : 'buttons';
  // Discord bir mesajda en fazla 5 satır izin verir: açılır liste 1 satır tuttuğu için butonlara 4 satır (20 buton) kalır.
  if (style === 'both' && buttons.length > 20) throw new ConfigError('Buton + açılır liste modunda en fazla 20 kategori olabilir. Menü türünü "Açılır liste" yap veya kategori sayısını azalt.');

  return {
    version: 1,
    brandName: str(c.brandName, 40) || d.brandName,
    guildId: cleanId(c.guildId),
    panel: {
      channelId: cleanId(p.channelId),
      style,
      placeholder: str(p.placeholder, 100) || d.panel.placeholder,
      title: str(p.title, 256),
      content: str(p.content, 2000),
      description: str(p.description, 4000),
      footer: str(p.footer, 200),
      color: cleanColor(p.color),
      imageUrl: cleanUrl(p.imageUrl, 'Büyük görsel'),
      thumbnailUrl: cleanUrl(p.thumbnailUrl, 'Küçük görsel'),
    },
    ticketCategoryId: cleanId(c.ticketCategoryId),
    logChannelId: cleanId(c.logChannelId),
    supportRoleIds: [...new Set((Array.isArray(c.supportRoleIds) ? c.supportRoleIds : []).map(cleanId).filter(Boolean))].slice(0, 10),
    buttons,
    ticketEmbed: {
      title: str(te.title, 256) || d.ticketEmbed.title,
      color: cleanColor(te.color ?? d.ticketEmbed.color),
      footer: str(te.footer, 200),
      imageUrl: cleanUrl(te.imageUrl, 'Talep içi büyük görsel'),
      thumbnailUrl: cleanUrl(te.thumbnailUrl, 'Talep içi küçük görsel'),
      showDetails: bool(te.showDetails, true),
    },
    colors: Object.fromEntries(['main', 'success', 'warning', 'danger'].map(k => [k, cleanColorOr(c.colors?.[k], d.colors[k])])),
    commands: normalizeCommands(c.commands, d.commands),
    messages: normalizeTexts(c.messages, MESSAGE_DEFS),
    site: normalizeTexts(c.site, SITE_DEFS),
    actions: { close: action('close'), claim: action('claim'), callStaff: action('callStaff') },
    settings: {
      maxOpenPerUser: clampInt(s.maxOpenPerUser, 1, 5, d.settings.maxOpenPerUser),
      deleteDelaySeconds: clampInt(s.deleteDelaySeconds, 0, 60, d.settings.deleteDelaySeconds),
      pingSupportOnOpen: bool(s.pingSupportOnOpen, d.settings.pingSupportOnOpen),
      transcript: bool(s.transcript, d.settings.transcript),
      dmOnClose: bool(s.dmOnClose, d.settings.dmOnClose),
      dmTranscript: bool(s.dmTranscript, d.settings.dmTranscript),
      // Ticket sahibi dışında transcript indirebilen kullanıcılar (destek ekibi bile indiremez)
      transcriptAdminIds: Array.isArray(s.transcriptAdminIds) ? [...new Set(s.transcriptAdminIds.map(cleanId).filter(Boolean))].slice(0, 10) : d.settings.transcriptAdminIds,
      // Kapatırken sebep kime sorulsun: staff = sadece destek ekibine, everyone = herkese, nobody = kimseye
      askCloseReason: ['staff', 'everyone', 'nobody'].includes(s.askCloseReason) ? s.askCloseReason : d.settings.askCloseReason,
      closeReasonRequired: bool(s.closeReasonRequired, d.settings.closeReasonRequired),
      channelNameFormat: cleanChannelFormat(s.channelNameFormat) || d.settings.channelNameFormat,
      closedPrefix: typeof s.closedPrefix === 'string' ? s.closedPrefix.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20) : d.settings.closedPrefix,
      welcomeMessage: str(s.welcomeMessage, 500) || d.settings.welcomeMessage,
    },
  };
}

function readConfig() {
  let raw = db.get('config');
  if (!raw) raw = readJson(EXAMPLE_PATH) || defaultConfig();
  try { return normalizeConfig(raw); }
  catch (err) {
    console.error('[CONFIG] Ayar dosyası hatalı, varsayılan kullanılıyor:', err.message);
    return defaultConfig();
  }
}

function writeConfig(input) {
  const clean = normalizeConfig(input);
  db.set('config', clean);
  return clean;
}

function getGuildId(config) {
  return process.env.DISCORD_GUILD_ID || config.guildId || '';
}

// ---- ticket kanalı konusu (topic): ticket bilgisi kanalın kendisinde saklanır ----
function buildTicketTopic({ ownerId, buttonId, status = 'open', claimId = null, number = 0 }) {
  return [
    `ticket-owner:${ownerId}`,
    `ticket-button:${buttonId}`,
    `ticket-no:${number}`,
    `ticket-status:${status}`,
    ...(claimId ? [`ticket-claim:${claimId}`] : []),
  ].join(' | ');
}

function parseTicket(channel) {
  const topic = channel?.topic;
  if (!topic || !topic.includes('ticket-owner:')) return null;
  const get = re => topic.match(re)?.[1]?.trim() ?? null;
  return {
    ownerId: get(/ticket-owner:(\d+)/),
    buttonId: get(/ticket-button:([^|]+)/),
    number: Number(get(/ticket-no:(\d+)/) || 0),
    status: get(/ticket-status:(open|closed)/) || 'open',
    claimId: get(/ticket-claim:(\d+)/),
  };
}

function readPanelState() { return db.get('panel-message'); }
function writePanelState(state) { db.set('panel-message', state); }

module.exports = {
  ConfigError, PANEL_STYLES, ROOT, DATA_DIR, CONFIG_PATH, defaultConfig, normalizeConfig,
  readConfig, writeConfig, getGuildId, buildTicketTopic, parseTicket, readPanelState, writePanelState,
};
