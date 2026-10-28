const { ContainerBuilder, MessageFlags, SeparatorSpacingSize } = require('discord.js');
const { buildExecutionFailedPayload } = require('../utils/components');

async function runBanInfoCommand(message, args, context) {
  if (!message.guild || message.author.bot) return;

  const isAdmin = context.accessStore.canUseAdminCommands(message.guild.id, message.author.id);
  const isSys = context.accessStore.isSys(message.author.id);

  if (!isAdmin && !isSys) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/buyers/sys.'));
    return;
  }

  const rawTarget = args[0];
  if (!rawTarget) {
    await message.channel.send(buildExecutionFailedPayload("Veuillez mentionner ou donner l'ID de l'utilisateur."));
    return;
  }

  const targetId = String(rawTarget).replace(/[<@!>]/g, '');
  if (!/^\d{15,20}$/.test(targetId)) {
    await message.channel.send(buildExecutionFailedPayload('ID invalide.'));
    return;
  }

  let banInfo;
  try {
    banInfo = await message.guild.bans.fetch(targetId);
  } catch {
    await message.channel.send(buildExecutionFailedPayload("Cet utilisateur n'est pas banni du serveur."));
    return;
  }

  const bannedUser = banInfo.user;
  const reason = banInfo.reason || 'Aucune raison specifiee';

  let staffName = 'Inconnu';
  let staffId = 'Inconnu';
  let banDateStr = '';

  try {
    const auditLogs = await message.guild.fetchAuditLogs({ type: 22, limit: 100 });
    const auditEntry = auditLogs.entries.find((entry) => entry.target && entry.target.id === targetId);

    if (auditEntry) {
      if (auditEntry.executor) {
        staffName = auditEntry.executor.username;
        staffId = auditEntry.executor.id;
      }
      if (auditEntry.createdAt) {
        const unixSec = Math.floor(auditEntry.createdAt.getTime() / 1000);
        banDateStr = `> <t:${unixSec}:R>`;
      }
    }
  } catch (error) {
    console.error("Impossible de recuperer l'audit log pour baninfo:", error);
  }

  const criminalName = bannedUser.username;
  const criminalId = bannedUser.id;

  let staffLabel = 'Staff';
  if (staffId !== 'Inconnu') {
    if (context.accessStore.isSys(staffId)) {
      staffLabel = 'Systeme';
    } else if (context.accessStore.isBuyer(staffId)) {
      staffLabel = 'Buyer';
    } else if (context.accessStore.isOwner(message.guild.id, staffId)) {
      staffLabel = 'Owner';
    }
  }

  const container = new ContainerBuilder()
    .addTextDisplayComponents((text) => text.setContent(`# \`🔍\` BAN INFO <@${criminalId}>`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent(
        `> <:icons8businessman50:1519429501346648104> **${staffLabel} :**\n\`\`\`yaml\nNom d'utilisateur // ${staffName}\nIdentifiant       // ${staffId}\n\`\`\``
      )
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent(
        `> <:icons8robber501:1519431356260548609> **Utilisateur banni :**\n\`\`\`yaml\nNom d'utilisateur // ${criminalName}\nIdentifiant       // ${criminalId}\n\`\`\``
      )
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(`> <:icons8note48:1491994150957092956> **Informations :**\n\`\`\`yaml\nRaison : ${reason}\n\`\`\``));

  if (banDateStr) {
    container
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) => text.setContent(banDateStr));
  }

  await message.channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false }
  });
}

module.exports = { runBanInfoCommand };
