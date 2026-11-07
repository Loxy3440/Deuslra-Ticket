// Etkileşime duruma göre (ilk yanıt / ertelenmiş / yanıtlanmış) sadece kullanıcının görebileceği cevap verir.
async function replyPrivate(interaction, content) {
  if (interaction.deferred) return interaction.editReply({ content, components: [], embeds: [] });
  if (interaction.replied) return interaction.followUp({ content, ephemeral: true });
  return interaction.reply({ content, ephemeral: true });
}

module.exports = { replyPrivate };
