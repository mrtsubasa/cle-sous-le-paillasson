const { buildNoticePayload, buildExecutionFailedPayload } = require('../utils/components');
const { COMMAND_DESCRIPTIONS } = require('../constants/commands');
const { getAssignableCommandsForMember } = require('../utils/access');

async function runSetPermCommand(message, args, context) {
  if (!message.guild || message.author.bot) return;

  const isSys = context.accessStore.isSys(message.author.id);
  const isOwner = context.accessStore.isOwner(message.guild.id, message.author.id);
  if (!isSys && !isOwner) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys.'));
    return;
  }

  const userMention = String(args[args.length - 1] || '').trim();
  const cmdName = args.slice(0, -1).join(' ').trim().toLowerCase();
  if (!cmdName || !userMention) {
    await message.channel.send(buildExecutionFailedPayload('Format: +setperm <commande> <@user>'));
    return;
  }

  const userId = userMention.replace(/[^0-9]/g, '');
  if (!/^\d{15,20}$/.test(userId)) {
    await message.channel.send(buildExecutionFailedPayload('Mention utilisateur invalide.'));
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(COMMAND_DESCRIPTIONS, cmdName)) {
    await message.channel.send(buildExecutionFailedPayload('Commande inconnue. Utilisez le nom exact affiche dans `+help`.'));
    return;
  }

  const assignableCommands = new Set(
    getAssignableCommandsForMember({
      guildId: message.guild.id,
      member: message.member,
      userId: message.author.id,
      accessStore: context.accessStore,
      commandNames: Object.keys(COMMAND_DESCRIPTIONS)
    })
  );
  if (!assignableCommands.has(cmdName)) {
    await message.channel.send(buildExecutionFailedPayload('Vous ne pouvez attribuer qu une commande a laquelle vous avez acces.'));
    return;
  }

  context.accessStore.addUserPermCommand(message.guild.id, userId, cmdName);

  await message.channel.send(
    buildNoticePayload({
      title: '# Permission attribuee',
      body: `> La commande \`+${cmdName}\` a ete attribuee a <@${userId}>.`
    })
  );
}

module.exports = { runSetPermCommand };
