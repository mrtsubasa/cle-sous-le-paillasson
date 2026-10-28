const { yesCard, noCard, permissionCard } = require('../utils/cards');
const { hasPermissionForCommand } = require('../utils/permissions');

function parseCategoryId(input) {
  const match = String(input || '').match(/\d{16,21}/);
  return match ? match[0] : null;
}

async function resolveCategory(guild, input) {
  const id = parseCategoryId(input);
  if (!id) return null;
  const channel = guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
  if (!channel || channel.type !== 4) return null;
  return channel;
}

async function syncCategoryChannels(guild, categoryId) {
  const targets = guild.channels.cache.filter((ch) => ch.parentId === categoryId && ch.type !== 4);
  let synced = 0;

  for (const channel of targets.values()) {
    if (typeof channel.lockPermissions !== 'function') continue;
    try {
      await channel.lockPermissions();
      synced += 1;
    } catch {
    }
  }

  return synced;
}

module.exports = {
  name: 'sync',
  async executePrefix(message, args) {
    if (!hasPermissionForCommand(message.member, 'sync')) {
      return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    const input = args && args[0] ? String(args[0]) : '';

    if (input) {
      const category = await resolveCategory(message.guild, input);
      if (!category) {
        return message.reply({ ...noCard('Cat\u00e9gorie introuvable'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
      }

      await syncCategoryChannels(message.guild, category.id);
      return message.reply({
        ...yesCard(`Tous les salons de la cat\u00e9gorie <#${category.id}> ont \u00e9t\u00e9 synchronis\u00e9s`),
        allowedMentions: { parse: [] },
        mentionRepliedUser: false
      });
    }

    const parentId = message.channel.parentId;
    if (!parentId) {
      return message.reply({
        ...noCard('Ce salon ne se trouve dans aucune cat\u00e9gorie'),
        allowedMentions: { parse: [] },
        mentionRepliedUser: false
      });
    }

    const category = message.guild.channels.cache.get(parentId) || await message.guild.channels.fetch(parentId).catch(() => null);
    if (!category || category.type !== 4) {
      return message.reply({ ...noCard('Cat\u00e9gorie introuvable'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    if (typeof message.channel.lockPermissions !== 'function') {
      return message.reply({
        ...noCard('Ce salon ne peut pas \u00eatre synchronis\u00e9'),
        allowedMentions: { parse: [] },
        mentionRepliedUser: false
      });
    }

    try {
      await message.channel.lockPermissions();
    } catch {
      return message.reply({
        ...noCard('Je ne peux pas synchroniser ce salon'),
        allowedMentions: { parse: [] },
        mentionRepliedUser: false
      });
    }

    return message.reply({
      ...yesCard(`Le salon <#${message.channel.id}> a \u00e9t\u00e9 synchronis\u00e9 avec la cat\u00e9gorie <#${category.id}>`),
      allowedMentions: { parse: [] },
      mentionRepliedUser: false
    });
  }
};

