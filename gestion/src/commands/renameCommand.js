const { ChannelType } = require('discord.js');
const { buildExecutionFailedPayload, buildNoticePayload } = require('../utils/components');

async function runRenameCommand(message, args, context) {
  if (!message.guild) return;

  const isOwner = context.accessStore.isOwner(message.guild.id, message.author.id);
  const isSys = context.accessStore.isSys(message.author.id);

  if (!isOwner && !isSys) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys.'));
    return;
  }

  if (!message.channel || message.channel.type !== ChannelType.GuildText) {
    await message.channel.send(buildExecutionFailedPayload('Commande disponible uniquement dans un salon textuel.'));
    return;
  }

  const nextName = args.join(' ').trim();
  if (!nextName) {
    await message.channel.send(buildExecutionFailedPayload('Format: +rename <nouveau nom>.'));
    return;
  }

  try {
    await message.channel.setName(nextName, `Rename par ${message.author.tag} (${message.author.id})`);

    await message.channel.send(
      buildNoticePayload({
        title: '# Rename',
        body: `> Salon renomme en **${nextName}**.`
      })
    );

    await context.logger.log(
      message.guild,
      '# Moderation',
      `> Action: rename\n> Nouveau nom: ${nextName}\n> Auteur: <@${message.author.id}>`
    );
  } catch {
    await message.channel.send(buildExecutionFailedPayload('Impossible de renommer ce salon.'));
  }
}

module.exports = { runRenameCommand };
