/* Deuslra · Destek > Açılış mesajları: ticket açıldıktan sonra botun gönderdiği ek mesajlar (genel + kategoriye özel) */

const OM_TYPES = { embed: '🧾 Embed', line: '➖ Line (çizgi resmi)', text: '💬 Yazı' };
const OM_SAMPLE = { user: '@kullanıcı', username: 'kullanici', displayname: 'Kullanıcı', userid: '123456789012345678', category: 'Genel destek', number: '0042', server: 'Sunucum', staff: '@Destek Ekibi', brand: 'Marka', opened: 'şimdi', channel: '#ticket-0042', ticket: '#ticket-0042' };
const omFill = t => String(t ?? '').replace(/\{(\w+)\}/g, (m, k) => (OM_SAMPLE[k.toLowerCase()] ?? m));
const omUrl = v => (/^https?:\/\/\S+$/i.test(String(v || '').trim()) ? String(v).trim() : '');

function omNew(type) {
  const base = { id: `m${Date.now().toString(36)}`, enabled: true, name: '', type, content: '', lineUrl: '', lineMode: 'plain', pingOwner: false, pingStaff: false, pin: false, delaySeconds: 0, buttons: [],
    embed: { title: '', description: '', color: '', authorName: '', authorIcon: '', thumbnailUrl: '', imageUrl: '', footer: '', timestamp: false, fields: [] } };
  if (type === 'embed') Object.assign(base.embed, { title: '📌 {category} talebin açıldı', description: 'Merhaba {user}! Talebin ekibimize ulaştı. Lütfen sorununu mümkün olduğunca ayrıntılı yaz; yetkililer en kısa sürede burada olacak.', footer: '{brand}' });
  return base;
}

function openMessagesPane() {
  cfg.openMessages ||= [];
  cfg.buttons.forEach(b => { b.openMessages ||= []; });
  const st = { target: 'all', testChannel: '' };
  const listBox = h('div', {});
  const targetSel = h('select', {}, [h('option', { value: 'all' }, '🌐 Tüm kategoriler (her talepte gönderilir)'), ...cfg.buttons.map(b => h('option', { value: b.id }, `${b.emoji || '🎫'} ${b.label} (sadece bu kategori)`))]);
  targetSel.addEventListener('change', () => { st.target = targetSel.value; draw(); });
  const curList = () => { if (st.target === 'all') return cfg.openMessages; const b = cfg.buttons.find(x => x.id === st.target); if (!b) return cfg.openMessages; return (b.openMessages ||= []); };
  const rebuildTargets = () => { const v = st.target; targetSel.replaceChildren(h('option', { value: 'all' }, '🌐 Tüm kategoriler (her talepte gönderilir)'), ...cfg.buttons.map(b => h('option', { value: b.id || b.label }, `${b.emoji || '🎫'} ${b.label} (sadece bu kategori)`))); targetSel.value = [...targetSel.options].some(o => o.value === v) ? v : 'all'; st.target = targetSel.value; };
  targetSel.addEventListener('focus', rebuildTargets);
  const curBtn = () => cfg.buttons.find(b => b.id === st.target);

  const preview = m => {
    const e = m.embed || {};
    const box = h('div', { class: 'dc' });
    const pings = [m.pingOwner && '@kullanıcı', m.pingStaff && '@Destek Ekibi'].filter(Boolean).join(' ');
    let content = omFill(m.content).trim();
    if (m.type === 'line') {
      const url = omUrl(omFill(m.lineUrl));
      if (!url) return h('p', { class: 'hint' }, 'Önizleme: çizgi resmi linki henüz yok.');
      if (m.lineMode === 'embed') box.append(h('div', { class: 'dc-emb', style: `border-left-color:${/^#[0-9a-f]{6}$/i.test(e.color) ? e.color : '#5865f2'}` }, h('img', { src: url, class: 'om-img', alt: 'line' })));
      else { if (content || pings) box.append(h('div', {}, `${pings} ${content}`.trim())); box.append(h('img', { src: url, class: 'om-img line', alt: 'line' })); return box; }
    } else if (m.type === 'text') {
      if (!content && !pings) return h('p', { class: 'hint' }, 'Önizleme: yazı boş.');
      box.append(h('div', { style: 'white-space:pre-wrap' }, `${pings} ${content}`.trim()));
      return box;
    } else {
      if (content || pings) box.append(h('div', { style: 'white-space:pre-wrap;margin-bottom:4px' }, `${pings} ${content}`.trim()));
      const fields = (e.fields || []).filter(f => (f.name || f.value));
      const col = /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : '#5865f2';
      box.append(h('div', { class: 'dc-emb', style: `border-left-color:${col}` },
        e.authorName ? h('div', { class: 'dc-foot' }, omFill(e.authorName)) : null,
        e.title ? h('b', {}, omFill(e.title)) : null,
        e.description ? h('div', { class: 'dc-desc' }, omFill(e.description)) : null,
        fields.length ? h('div', { class: 'dc-fields' }, fields.map(f => h('div', { class: f.inline ? 'dc-inline' : '' }, h('b', { class: 'dc-fn' }, omFill(f.name)), h('div', {}, omFill(f.value))))) : null,
        omUrl(omFill(e.imageUrl)) ? h('img', { src: omUrl(omFill(e.imageUrl)), class: 'om-img', alt: '' }) : null,
        e.footer ? h('div', { class: 'dc-foot' }, `${omFill(e.footer)}${e.timestamp ? ' • bugün' : ''}`) : null));
    }
    const links = (m.buttons || []).filter(b => b.url && (b.label || b.emoji));
    if (links.length) box.append(h('div', { style: 'margin-top:6px' }, links.map(b => h('span', { class: 'dc-btn', style: 'margin-right:6px' }, `${b.emoji || ''} ${omFill(b.label)} ↗`.trim()))));
    return box;
  };

  const card = (list, i, m) => {
    m.embed ||= {}; m.embed.fields ||= []; m.buttons ||= [];
    const body = h('div', {});
    const prev = h('div', { class: 'om-prev' });
    const upd = () => prev.replaceChildren(preview(m));
    const move = d => { const k = i + d; if (k < 0 || k >= list.length) return; [list[i], list[k]] = [list[k], list[i]]; dirty(); draw(); };
    const typeSel = h('select', {}, Object.entries(OM_TYPES).map(([v, l]) => h('option', { value: v }, l)));
    typeSel.value = m.type; typeSel.addEventListener('change', () => { m.type = typeSel.value; if (m.type === 'embed' && !m.embed.title && !m.embed.description) Object.assign(m.embed, omNew('embed').embed); dirty(); drawBody(); });
    const colorRow = () => {
      const c = h('input', { type: 'color' }); c.value = /^#[0-9a-f]{6}$/i.test(m.embed.color) ? m.embed.color : '#8b5cf6';
      c.addEventListener('input', () => { m.embed.color = c.value; dirty(); upd(); });
      return h('div', { style: 'display:flex;gap:8px;align-items:center' }, c, h('button', { class: 'btn ghost sm', onclick: () => { m.embed.color = ''; dirty(); drawBody(); } }, 'Panel rengi'), h('span', { class: 'muted sm' }, m.embed.color || 'panel rengi'));
    };
    const fieldsBox = h('div', {});
    const drawFields = () => fieldsBox.replaceChildren(...m.embed.fields.map((f, j) => {
      const inl = h('input', { type: 'checkbox' }); inl.checked = f.inline; inl.addEventListener('change', () => { f.inline = inl.checked; dirty(); upd(); });
      return h('div', { class: 'frow' }, text(f, 'name', { ph: 'Alan adı', max: 256 }), text(f, 'value', { ph: 'Alan yazısı', max: 1024 }), h('label', { class: 'chk', style: 'margin:0' }, inl, 'Yan yana'),
        h('button', { class: 'btn ghost sm', onclick: () => { m.embed.fields.splice(j, 1); dirty(); drawFields(); upd(); } }, '✕'));
    }));
    const linksBox = h('div', {});
    const drawLinks = () => linksBox.replaceChildren(...m.buttons.map((b, j) => h('div', { class: 'frow' }, text(b, 'label', { ph: 'Buton yazısı', max: 80 }), text(b, 'emoji', { ph: '🔗', max: 64 }), text(b, 'url', { ph: 'https://…', max: 2000 }),
      h('button', { class: 'btn ghost sm', onclick: () => { m.buttons.splice(j, 1); dirty(); drawLinks(); upd(); } }, '✕'))));
    const drawBody = () => {
      const E = m.embed;
      const parts = [];
      if (m.type === 'text') parts.push(field('Yazı', text(m, 'content', { multi: true, rows: 4, max: 2000, ph: 'Merhaba {user}! …' }), '{user} {category} {number} {server} gibi değişkenler çalışır.'));
      if (m.type === 'line') {
        const mode = h('select', {}, [['plain', 'Düz resim (kutusuz, sadece çizgi görünür)'], ['embed', 'Renkli çizgili kutu içinde']].map(([v, l]) => h('option', { value: v }, l)));
        mode.value = m.lineMode; mode.addEventListener('change', () => { m.lineMode = mode.value; dirty(); drawBody(); });
        parts.push(h('div', { class: 'grid2' }, field('Çizgi resmi linki', text(m, 'lineUrl', { ph: 'https://…/line.gif', max: 2000 }), 'PNG / GIF / JPG linki. Sunucunda kullandığın çizgi resmini buraya yapıştır.'), field('Görünüm', mode)));
        if (m.lineMode === 'embed') parts.push(field('Kutu rengi', colorRow()));
        parts.push(field('Çizginin üstüne yazı (isteğe bağlı)', text(m, 'content', { multi: true, rows: 2, max: 2000, ph: 'Boş bırakırsan sadece çizgi gider' })));
      }
      if (m.type === 'embed') {
        parts.push(
          h('div', { class: 'grid2' }, field('Başlık', text(E, 'title', { max: 256 })), field('Renk', colorRow()),
            field('Üst yazı (başlığın üstü)', text(E, 'authorName', { max: 256 })), field('Üst yazı ikonu (resim linki)', text(E, 'authorIcon', { max: 2000, ph: 'https://…' })),
            field('Küçük resim linki (sağ üst)', text(E, 'thumbnailUrl', { max: 2000, ph: 'https://… veya {useravatar}' }), '{useravatar} yazarsan talep sahibinin profil resmi görünür.'), field('Büyük resim / line linki (en altta)', text(E, 'imageUrl', { max: 2000, ph: 'https://…' }), 'Embed\'in altına çizgi resmi koymak için buraya yapıştır.')),
          field('Açıklama', text(E, 'description', { multi: true, rows: 6, max: 4000 }), 'Markdown çalışır: **kalın**, *italik*, > alıntı, linkler. Değişkenler: {user} {username} {category} {number} {server} {staff} {opened} …'),
          h('div', { class: 'grid2' }, field('Alt yazı', text(E, 'footer', { max: 2048 })), h('div', {}, reqCheck(E, 'timestamp', 'Alt yazıda saat göster', () => { dirty(); upd(); }))),
          field('Ek alanlar (en fazla 10)', h('div', {}, fieldsBox, h('button', { class: 'btn ghost sm', onclick: () => { if (E.fields.length >= 10) return toast('En fazla 10 alan.', 'err'); E.fields.push({ name: '', value: '', inline: false }); dirty(); drawFields(); } }, '+ Alan ekle'))),
          field('Embed\'in üstündeki düz yazı (isteğe bağlı)', text(m, 'content', { multi: true, rows: 2, max: 2000 })));
        drawFields();
      }
      parts.push(field('Link butonları (en fazla 5)', h('div', {}, linksBox, h('button', { class: 'btn ghost sm', onclick: () => { if (m.buttons.length >= 5) return toast('En fazla 5 buton.', 'err'); m.buttons.push({ label: '', emoji: '', url: '' }); dirty(); drawLinks(); } }, '+ Link butonu ekle')), 'Mesajın altına tıklanınca link açan butonlar koyar (örn. Kurallar, Duyurular).'));
      drawLinks();
      const delay = h('input', { type: 'number', min: 0, max: 60 }); delay.value = m.delaySeconds || 0; delay.addEventListener('input', () => { m.delaySeconds = Math.max(0, Math.min(60, Number(delay.value) || 0)); dirty(); });
      parts.push(h('div', { class: 'grid2' }, field('Gönderilmeden önce bekle (saniye)', delay, '0 = hemen. Mesajlar yukarıdan aşağıya sırayla gider.'),
        h('div', {}, reqCheck(m, 'pingOwner', 'Talep sahibini etiketle', () => dirty()), reqCheck(m, 'pingStaff', 'Destek rollerini etiketle', () => dirty()), reqCheck(m, 'pin', 'Mesajı kanala sabitle', () => dirty()))));
      body.replaceChildren(...parts); upd();
    };
    drawBody();
    const test = h('button', { class: 'btn ghost sm', onclick: e => act(e.target, async () => {
      if (!st.testChannel) throw new Error('Önce yukarıdan bir deneme kanalı seç.');
      return api('admin/openmessages/test', { message: m, channelId: st.testChannel, buttonId: st.target === 'all' ? '' : st.target });
    }) }, '🧪 Dene');
    const on = h('input', { type: 'checkbox' }); on.checked = m.enabled; on.addEventListener('change', () => { m.enabled = on.checked; dirty(); });
    const nm = text(m, 'name', { ph: 'Panelde görünen ad (örn. Line, Kurallar)', max: 60 });
    const el = h('div', { class: 'bcard' },
      h('div', { class: 'bhead' }, h('div', { style: 'display:flex;gap:10px;align-items:center;flex:1;min-width:0' }, h('b', {}, `${i + 1}.`), h('label', { class: 'chk', style: 'margin:0' }, on, 'Açık'), typeSel, nm),
        h('div', { class: 'acts' }, test, h('button', { class: 'btn ghost sm', onclick: () => move(-1) }, '↑'), h('button', { class: 'btn ghost sm', onclick: () => move(1) }, '↓'),
          h('button', { class: 'btn ghost sm', title: 'Kopyala', onclick: () => { if (list.length >= 10) return toast('En fazla 10 mesaj.', 'err'); const c = JSON.parse(JSON.stringify(m)); c.id = omNew('text').id; list.splice(i + 1, 0, c); dirty(); draw(); } }, '⧉'),
          h('button', { class: 'btn danger sm', onclick: () => { if (!confirm('Bu mesaj silinsin mi?')) return; list.splice(i, 1); dirty(); draw(); } }, 'Sil'))),
      body, h('h3', { style: 'margin:12px 0 6px;font-size:14px' }, 'Önizleme (örnek değerlerle)'), prev);
    el.addEventListener('input', upd); el.addEventListener('click', () => setTimeout(upd));
    return el;
  };

  function draw() {
    const list = curList();
    const add = type => h('button', { class: 'btn sm', onclick: () => { if (list.length >= 10) return toast('Bir listede en fazla 10 mesaj olabilir.', 'err'); list.push(omNew(type)); dirty(); draw(); } }, `+ ${OM_TYPES[type]}`);
    listBox.replaceChildren(
      h('div', { class: 'card' },
        h('div', { class: 'bhead' }, h('div', {}, h('h2', {}, st.target === 'all' ? 'Tüm kategorilerde gönderilecek mesajlar' : `"${curBtn()?.label}" kategorisine özel mesajlar`),
          h('p', { class: 'hint' }, st.target === 'all' ? 'Her talepte, kategoriden bağımsız, ana karşılama mesajından hemen sonra gider. Kategoriye özel olanlardan ÖNCE gönderilir.' : 'Sadece bu kategoride talep açılınca gider; genel mesajlardan SONRA, aşağıdaki sırayla.')),
          h('div', { class: 'acts' }, add('line'), add('embed'), add('text')))),
      ...(list.length ? list.map((m, i) => card(list, i, m)) : [h('div', { class: 'card' }, h('div', { class: 'empty' }, 'Bu listede henüz mesaj yok. Yukarıdan "+ Line", "+ Embed" ya da "+ Yazı" ekle.'))]));
  }
  draw();

  const testChan = picker(st, 'testChannel', chanItems(), '— Deneme kanalı seç —');
  testChan.addEventListener('change', () => { st.testChannel = testChan.value; });
  return h('div', { class: 'pane', id: 'pane-openmsg' },
    h('div', { class: 'card' }, h('h2', {}, 'Ticket açılış mesajları'),
      h('p', { class: 'hint', style: 'margin-bottom:12px' }, 'Biri ticket açınca bot önce normal karşılama mesajını atar, ardından burada hazırladığın ek mesajları sırayla gönderir: bir line (çizgi resmi), yeni bir embed, düz yazı… Hepsini kategoriye özel ya da tüm kategoriler için ayarlayabilirsin. Değişiklikler alttaki "Ayarları kaydet" ile geçerli olur.'),
      h('div', { class: 'grid2' }, field('Hangi kategori için düzenliyorsun?', targetSel), field('🧪 Deneme kanalı', testChan, 'Her mesajdaki "Dene" butonu mesajı bu kanala örnek değerlerle gönderir. Önce kaydetmene gerek yok.'))),
    listBox);
}
