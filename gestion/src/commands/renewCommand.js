const { ChannelType } = require('discord.js');
const { buildExecutionFailedPayload } = require('../utils/components');

async function runRenewCommand(message, context) {
  if (!message.guild || !message.channel) return;

  const sourceChannel = message.channel;
  let newChannel = null;

  try {
    const userId = String(message.author.id);
    const isTrustedSys = context.accessStore.getSysUserId() === userId;
    const isPrivileged = context.accessStore.isOwner(message.guild.id, userId) || context.accessStore.isSys(userId);
    if (!isPrivileged) {
      await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys.'));
      return;
    }

    const channel = sourceChannel;
    if (!channel) return;

    if (!channel.isTextBased() || channel.type !== ChannelType.GuildText) {
      await message.channel.send(buildExecutionFailedPayload('Cette commande fonctionne seulement dans un salon textuel.'));
      return;
    }

    const isBlocked = context.accessStore.isActionBlockedForChannel(
      message.guild.id,
      'renew',
      channel.id,
      channel.parentId
    );
    if (isBlocked && !isTrustedSys) {
      await message.channel.send(buildExecutionFailedPayload('Renew refuse sur ce salon/categorie par la config secure.'));
      return;
    }

    newChannel = await channel.clone({
      name: channel.name,
      reason: `Salon recree par ${message.author.tag} (${message.author.id})`
    });

    await channel.delete();

    await newChannel.send({
      content: `Salon recree par <@${message.author.id}>`,
      allowedMentions: { parse: ['users'], repliedUser: false }
    });
  } catch (error) {
    console.error('Erreur lors du renew:', error);
    const fallbackChannel = newChannel && newChannel.isTextBased() ? newChannel : sourceChannel && sourceChannel.isTextBased() ? sourceChannel : null;

    if (fallbackChannel) {
      await fallbackChannel.send(buildExecutionFailedPayload('Une erreur est survenue lors de la recreation du salon.')).catch(() => {});
    }
  }
}

module.exports = { runRenewCommand };
