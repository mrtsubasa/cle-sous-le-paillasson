const { Collection } = require('discord.js');
const { buildExecutionFailedPayload } = require('../utils/components');

const DEFAULT_CLEAR_AMOUNT = 50;
const BULK_DELETE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MESSAGE_FETCH_BATCH_SIZE = 100;

async function runClearCommand(message, args, context) {
  if (!message.guild || !message.channel?.isTextBased()) return;

  const userId = String(message.author.id);
  const isTrustedSys = context.accessStore.getSysUserId() === userId;
  const isPrivileged = context.accessStore.isOwner(message.guild.id, userId) || context.accessStore.isSys(userId);

  if (!isPrivileged) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys.'));
    return;
  }

  const isBlocked = context.accessStore.isActionBlockedForChannel(
    message.guild.id,
    'clear',
    message.channel.id,
    message.channel.parentId
  );
  if (isBlocked && !isTrustedSys) {
    await message.channel.send(buildExecutionFailedPayload('Clear refuse sur ce salon/categorie par la config secure.'));
    return;
  }

  const configuredMax = isTrustedSys ? 100 : context.accessStore.getGuildModerationLimits(message.guild.id).clearMax;
  const targetUser = message.mentions.users.first() || null;
  const numericArg = args.find((arg) => /^\d+$/.test(String(arg || '').trim()));
  const parsed = Number.parseInt(numericArg, 10);
  const requested = Number.isInteger(parsed) ? parsed : DEFAULT_CLEAR_AMOUNT;
  const amount = Math.max(1, Math.min(configuredMax, requested));

  try {
    if (targetUser) {
      const targetMessages = await collectMessagesFromUser(message.channel, targetUser.id, amount);

      if (!targetMessages.size) {
        await message.channel.send(
          buildExecutionFailedPayload('Aucun message recent supprimable trouve pour ce membre dans ce salon.')
        );
        return;
      }

      const deleted = await message.channel.bulkDelete(targetMessages, true);

      await message.channel.send({
        content: `${deleted.size} message(s) de <@${targetUser.id}> supprime(s).`,
                                 allowedMentions: { parse: [], repliedUser: false }
      });

      await context.logger.log(
        message.guild,
        '# Moderation',
        `> Action: clear\n> Cible: <@${targetUser.id}>\n> Valeur demandee: ${requested}\n> Valeur appliquee: ${amount}\n> Messages supprimes: ${deleted.size}\n> Auteur: <@${message.author.id}>`
      );
      return;
    }

    const deleted = await message.channel.bulkDelete(amount, true);

    await message.channel.send({
      content: `${deleted.size} message(s) supprime(s).`,
                               allowedMentions: { parse: [], repliedUser: false }
    });

    await context.logger.log(
      message.guild,
      '# Moderation',
      `> Action: clear\n> Valeur demandee: ${requested}\n> Valeur appliquee: ${amount}\n> Messages supprimes: ${deleted.size}\n> Auteur: <@${message.author.id}>`
    );
  } catch (error) {
    await message.channel.send(buildExecutionFailedPayload('Impossible de supprimer les messages dans ce salon.'));
  }
}

module.exports = { runClearCommand };

async function collectMessagesFromUser(channel, targetUserId, limit) {
  const collectedMessages = new Collection();
  const cutoffTimestamp = Date.now() - BULK_DELETE_MAX_AGE_MS;
  let beforeMessageId;

  while (collectedMessages.size < limit) {
    const fetchedMessages = await channel.messages.fetch({
      limit: MESSAGE_FETCH_BATCH_SIZE,
      ...(beforeMessageId ? { before: beforeMessageId } : {})
    });

    if (!fetchedMessages.size) break;

    for (const fetchedMessage of fetchedMessages.values()) {
      if (fetchedMessage.createdTimestamp < cutoffTimestamp) {
        return collectedMessages;
      }

      if (String(fetchedMessage.author?.id) !== String(targetUserId)) {
        continue;
      }

      collectedMessages.set(fetchedMessage.id, fetchedMessage);
      if (collectedMessages.size >= limit) {
        return collectedMessages;
      }
    }

    const oldestFetchedMessage = fetchedMessages.last();
    if (!oldestFetchedMessage || fetchedMessages.size < MESSAGE_FETCH_BATCH_SIZE) {
      break;
    }

    beforeMessageId = oldestFetchedMessage.id;
  }

  return collectedMessages;
}
