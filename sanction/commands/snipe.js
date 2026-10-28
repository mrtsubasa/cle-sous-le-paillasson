const { time } = require('discord.js');
const { noCard } = require('../utils/cards');
const { hasPermissionForCommand } = require('../utils/permissions');
const { getSnipe } = require('../utils/snipeStore');

function quoteBlock(text) {
  return String(text)
  .split(/\r\n/)
  .map((line) => `> ${line}`)
  .join('\n');
}

module.exports = {
  name: 'snipe',
  async executePrefix(message) {
  if (!hasPermissionForCommand(message.member, 'snipe')) {
  return message.reply({ ...noCard("Vous n'avez pas la permission d'utiliser cette commande"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const data = getSnipe(message.channel.id);
  if (!data) {
  return message.reply({ ...noCard('Aucun message supprim\u00e9'), allowedMentions: { parse: [] }, mentionRepliedUser: false }); } const createdAt = typeof data.createdAt === 'number' ? data.createdAt : Date.now(); const timestamp = time(new Date(createdAt), 'F'); const attachmentUrls = Array.isArray(data.attachments) ? data.attachments : [];
  const imageRegex = /\.(png|jpeg|gif|webp)(\.*)$/i;
  const imageUrls = attachmentUrls.filter((url) => imageRegex.test(String(url)));
  const otherUrls = attachmentUrls.filter((url) => !imageRegex.test(String(url)));

  const contentParts = [];
  if (typeof data.content === 'string' && data.content.trim().length > 0) {
  contentParts.push(data.content);
  }

  if (Array.isArray(data.stickers) && data.stickers.length > 0) {
  contentParts.push(data.stickers.join(', ')); } if (Array.isArray(data.embeds) && data.embeds.length > 0) { data.embeds.forEach((embed, index) => { const parts = []; if (embed && embed.title) parts.push(embed.title); if (embed && embed.url) parts.push(embed.url); if (embed && embed.description) parts.push(embed.description); const line = parts.length > 0 ? parts.join(' - ') : `Embed ${index + 1}`; contentParts.push(line); }); } if (otherUrls.length > 0) { contentParts.push(otherUrls.join('\n')); } const contentText = contentParts.length > 0 ? quoteBlock(contentParts.join('\n')) : 'Aucun contenu';

  const cardComponents = [
  { type: 10, content: `# ${data.authorTag}` },
  { type: 14 }
  ];

  if (contentText) {
  cardComponents.push({ type: 10, content: contentText });
  }

  if (imageUrls.length > 0) {
  cardComponents.push({ type: 12, items: imageUrls.map((url) => ({ media: { url } })) });
  }

  cardComponents.push(
  { type: 14 },
  { type: 10, content: timestamp }
  );

  const card = {
  flags: 32768,
  components: [
  {
  type: 17,
  components: cardComponents
  }
  ]
  };

  return message.reply({ ...card, allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }
};
