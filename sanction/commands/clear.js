const { data } = require('../utils/state');
const { yesCard, noCard, permissionCard } = require('../utils/cards');
const { hasPermissionForCommand, isSystem, isBotOwner } = require('../utils/permissions');
const { resolveMember } = require('../utils/resolvers');

const CLEAR_DELAY_MS = 5000;
let clearQueue = Promise.resolve();

function enqueueClear(task) {
  clearQueue = clearQueue
    .then(task)
    .catch(() => {})
    .then(() => new Promise((resolve) => setTimeout(resolve, CLEAR_DELAY_MS)));
  return clearQueue;
}

function getClearLimit(guildId) {
  const cfg = data.otherConfig[String(guildId)] || {};
  return Number.isInteger(cfg.clearLimit) ? cfg.clearLimit : 100;
}

function getOtherConfig(guildId) {
  if (!data.otherConfig[guildId]) {
    data.otherConfig[guildId] = {
      banRoles: {},
      clearCategories: [],
      clearChannels: [],
      clearProtected: []
    };
  }

  const cfg = data.otherConfig[guildId];
  if (!Array.isArray(cfg.clearCategories)) cfg.clearCategories = [];
  if (!Array.isArray(cfg.clearChannels)) cfg.clearChannels = [];
  if (!Array.isArray(cfg.clearProtected)) cfg.clearProtected = [];
  return cfg;
}

async function collectMessagesToDelete(channel, amount, targetId) {
  const collected = [];
  let lastId = null;
  const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);

  while (collected.length < amount) {
    const batch = await channel.messages.fetch({
      limit: 100,
      before: lastId || undefined
    }).catch(() => null);

    if (!batch || !batch.size) break;

    for (const msg of batch.values()) {
      if (msg.createdTimestamp < cutoff) continue;
      if (msg.pinned) continue;
      if (targetId && msg.author.id !== targetId) continue;

      collected.push(msg);
      if (collected.length >= amount) break;
    }

    lastId = batch.last().id;
    if (batch.last().createdTimestamp < cutoff) {
      break;
    }
  }

  return collected;
}

async function bulkDeleteFast(channel, amount) {
  let remaining = amount;
  let deletedCount = 0;

  while (remaining > 0) {
    const chunkSize = Math.min(100, remaining);
    const deleted = await channel.bulkDelete(chunkSize, true).catch(() => null);
    if (!deleted || !deleted.size) break;

    deletedCount += deleted.size;
    remaining -= deleted.size;

    if (deleted.size < chunkSize) break;
  }

  return deletedCount;
}

module.exports = {
  name: 'clear',
  async executePrefix(message, args) {
    if (!hasPermissionForCommand(message.member, 'clear')) {
      return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    const guildId = String(message.guild.id);
    const limit = getClearLimit(guildId);
    const cfg = getOtherConfig(guildId);
    const isSysMember = isSystem(guildId, message.author.id, message.member);
    const isBuyer = isBotOwner(message.author.id);

    let target = null;
    let amountArg = args[0];
    const resolved = await resolveMember(message, args[0]);
    if (resolved) {
      target = resolved;
      amountArg = args[1];
    }

    let amount = limit;
    if (amountArg) {
      const parsed = parseInt(amountArg, 10);
      if (!parsed || Number.isNaN(parsed)) {
        return message.reply({ ...noCard('Nombre invalide'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
      }
      amount = parsed;
    }

    if (amount <= 0) {
      return message.reply({ ...noCard('Le nombre doit \u00eatre sup\u00e9rieur \u00e0 0'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    if (amount > limit) {
      return message.reply({ ...noCard(`La limite maximale est de **\`${limit}\`**`), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    if (!isSysMember && !isBuyer) {
      const channel = message.channel;

      if (cfg.clearProtected.includes(channel.id)) {
        return message.reply({ ...noCard('Ce salon est prot\u00e9g\u00e9, vous ne pouvez pas clear ici'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
      }

      const hasCategoryRules = cfg.clearCategories.length > 0;
      const hasChannelRules = cfg.clearChannels.length > 0;
      if (hasCategoryRules || hasChannelRules) {
        const parentId = channel.parentId || null;
        const allowedByCategory = parentId && cfg.clearCategories.includes(parentId);
        const allowedByChannel = cfg.clearChannels.includes(channel.id);
        if (!allowedByCategory && !allowedByChannel) {
          return message.reply({ ...noCard("Ce salon n'est pas autoris\u00e9 pour le clear"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }
      }
    }

    await message.delete().catch(() => {});

    return enqueueClear(async () => {
      let deletedCount = 0;

      if (!target) {
        deletedCount = await bulkDeleteFast(message.channel, amount);
      } else {
        const toDelete = await collectMessagesToDelete(message.channel, amount, String(target.id));
        if (!toDelete.length) {
          return message.channel.send({ ...noCard('Aucun message \u00e0 supprimer'), allowedMentions: { parse: [] } });
        }

        for (let i = 0; i < toDelete.length; i += 100) {
          const chunk = toDelete.slice(i, i + 100);
          const deleted = await message.channel.bulkDelete(chunk, true).catch(() => null);
          if (deleted) deletedCount += deleted.size;
        }
      }

      if (!deletedCount) {
        return message.channel.send({ ...noCard('Aucun message \u00e0 supprimer'), allowedMentions: { parse: [] } });
      }

      const label = target
        ? `**${deletedCount}** messages supprim\u00e9s (${target.user.tag || target.displayName})`
        : `**${deletedCount}** messages supprim\u00e9s`;

      const confirmation = await message.channel.send({ ...yesCard(label), allowedMentions: { parse: [] } });
      setTimeout(() => confirmation.delete().catch(() => {}), 5000);
      return;
    });
  }
};
