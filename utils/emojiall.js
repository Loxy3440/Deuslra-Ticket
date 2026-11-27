const { PermissionFlagsBits } = require('discord.js');

// Developer Portal > Uygulama > Emojis bölümündeki ("uygulama emojileri") tüm emojileri sunucuya kopyalar.
// Sunucuda aynı adlı emoji varsa atlar; statik / hareketli emoji yerleri ayrı sayılır ve dolunca durur.
const SLOTS = { 0: 50, 1: 100, 2: 150, 3: 250 }; // sunucu boost seviyesine göre emoji limiti (statik ve hareketli ayrı)
const running = new Set();
const sleep = ms => new Promise(r => setTimeout(r, ms));

const canManageEmojis = member => Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator) || member?.permissions?.has(PermissionFlagsBits.ManageGuildExpressions));
const emojiUrl = e => `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'png'}?size=128&quality=lossless`;

async function copyAppEmojis({ client, guild, member, dryRun = false, onProgress }) {
  if (!canManageEmojis(member)) return { error: 'Bu komut için "Emoji ve Çıkartmaları Yönet" (ya da Yönetici) iznin olmalı.' };
  if (!client.application?.emojis?.fetch) return { error: 'Bu discord.js sürümü uygulama emojilerini desteklemiyor (en az 14.16 gerekir).' };
  if (running.has(guild.id)) return { error: 'Emoji aktarımı zaten çalışıyor, bitmesini bekle.' };
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!dryRun && !me?.permissions?.has(PermissionFlagsBits.ManageGuildExpressions) && !me?.permissions?.has(PermissionFlagsBits.CreateGuildExpressions)) {
    return { error: 'Botun sunucuda "Emoji ve Çıkartmaları Yönet" izni yok. Bota bu izni verip tekrar dene.' };
  }
  running.add(guild.id);
  try {
    const apps = [...(await client.application.emojis.fetch()).values()];
    if (!apps.length) return { error: 'Developer Portal > Uygulaman > Emojis bölümünde hiç emoji yok.' };
    const existing = [...(await guild.emojis.fetch()).values()];
    const names = new Set(existing.map(e => e.name.toLowerCase()));
    let limit = SLOTS[guild.premiumTier] ?? 50;
    if (guild.features?.includes('MORE_EMOJI')) limit = Math.max(limit, 200);
    const free = { static: limit - existing.filter(e => !e.animated).length, animated: limit - existing.filter(e => e.animated).length };
    const sum = { total: apps.length, added: [], existing: 0, noSlot: [], failed: [], limit, dryRun, free: { ...free } };

    for (const e of apps) {
      const kind = e.animated ? 'animated' : 'static';
      if (names.has(String(e.name).toLowerCase())) { sum.existing++; continue; }
      if (free[kind] <= 0) { sum.noSlot.push(e.name); continue; }
      if (dryRun) { sum.added.push({ name: e.name, text: `\`${e.name}\`` }); free[kind]--; continue; }
      try {
        const created = await guild.emojis.create({ attachment: emojiUrl(e), name: e.name, reason: 'emojiall: uygulama emojileri sunucuya aktarıldı' });
        sum.added.push({ name: e.name, text: created.toString() });
        names.add(String(e.name).toLowerCase()); free[kind]--;
        if (sum.added.length % 5 === 0) await onProgress?.(sum);
        await sleep(350); // Discord emoji oluşturma hız sınırına takılmamak için
      } catch (err) {
        if (/maximum number of emojis|emoji.*limit/i.test(err.message)) { free[kind] = 0; sum.noSlot.push(e.name); }
        else sum.failed.push({ name: e.name, err: String(err.message || err).slice(0, 120) });
      }
    }
    sum.left = free;
    return { summary: sum };
  } catch (err) {
    return { error: `Emojiler okunamadı: ${err.message}` };
  } finally { running.delete(guild.id); }
}

function progressText(s) { return `⏳ Emojiler aktarılıyor… ${s.added.length} eklendi (toplam ${s.total} emoji)`; }

function reportText(s) {
  const lines = [
    `${s.dryRun ? '🔍 **Önizleme** (hiçbir şey eklenmedi)' : '✅ **Emoji aktarımı bitti**'} · uygulamada ${s.total} emoji var`,
    `${s.dryRun ? '➕ Eklenecek' : '➕ Eklenen'}: **${s.added.length}** · ⏭️ Zaten vardı: **${s.existing}** · 📦 Yer yoktu: **${s.noSlot.length}** · ❌ Hata: **${s.failed.length}**`,
    `Kalan boş yer: statik **${Math.max(0, s.left?.static ?? s.free.static)}** · hareketli **${Math.max(0, s.left?.animated ?? s.free.animated)}** (sunucu limiti: her türden ${s.limit})`,
  ];
  if (s.added.length && !s.dryRun) lines.push(s.added.slice(0, 30).map(a => a.text).join(' ') + (s.added.length > 30 ? ` … +${s.added.length - 30}` : ''));
  if (s.noSlot.length) lines.push(`📦 Yer olmadığı için eklenemeyenler: ${s.noSlot.slice(0, 15).map(n => `\`${n}\``).join(', ')}${s.noSlot.length > 15 ? ` +${s.noSlot.length - 15}` : ''}\nSunucuyu boostlayarak ya da eski emojileri silerek yer açıp komutu tekrar çalıştırabilirsin.`);
  if (s.failed.length) lines.push(`❌ Hata alanlar:\n${s.failed.slice(0, 8).map(f => `• \`${f.name}\`: ${f.err}`).join('\n')}${s.failed.length > 8 ? `\n… +${s.failed.length - 8}` : ''}`);
  return lines.join('\n').slice(0, 1990);
}

module.exports = { copyAppEmojis, reportText, progressText, canManageEmojis };
