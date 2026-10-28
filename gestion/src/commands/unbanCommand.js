const { ContainerBuilder, MessageFlags } = require('discord.js');
const { buildExecutionFailedPayload } = require('../utils/components');

async function runUnbanCommand(message, args, context) {
  if (!message.guild || message.author.bot) return;

  const canManageCommands = context.accessStore.canUseAdminCommands(message.guild.id, message.author.id);
  const isSys = context.accessStore.isSys(message.author.id);

  if (!canManageCommands && !isSys) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/buyers/sys.'));
    return;
  }

  const rawTarget = args[0];
  if (!rawTarget) {
    await message.channel.send(buildExecutionFailedPayload("Veuillez mentionner ou donner l'ID de l'utilisateur a debannir."));
    return;
  }

  const targetId = String(rawTarget).replace(/[<@!>]/g, '');
  if (!/^\d{15,20}$/.test(targetId)) {
    await message.channel.send(buildExecutionFailedPayload('ID invalide.'));
    return;
  }

  try {
    await context.client.users.fetch(targetId);
  } catch {
    await message.channel.send(buildExecutionFailedPayload('Impossible de recuperer cet utilisateur.'));
    return;
  }

  try {
    const banInfo = await message.guild.bans.fetch(targetId).catch(() => null);
    if (!banInfo) {
      await message.channel.send(buildExecutionFailedPayload("Cet utilisateur n'est pas banni du serveur."));
      return;
    }

    await message.guild.members.unban(targetId);

    const container = new ContainerBuilder().addTextDisplayComponents((text) =>
      text.setContent(`<:oui:1519424733618110504> <@${targetId}> a ete debanni.`)
    );

    await message.channel.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [], repliedUser: false }
    });

    await context.logger.log(
      message.guild,
      '# Moderation',
      `> Action: unban\n> Cible: <@${targetId}>\n> Auteur: <@${message.author.id}>`
    );
  } catch (error) {
    console.error('Unban error:', error);
    await message.channel.send(buildExecutionFailedPayload('Impossible de debannir cet utilisateur. Verifiez mes permissions.'));
  }
}

module.exports = { runUnbanCommand };
