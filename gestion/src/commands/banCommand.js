const { MessageFlags, ContainerBuilder } = require('discord.js');
const { buildExecutionFailedPayload } = require('../utils/components');

// Rate limiter pour les bans (clé: guildId+userId, valeur: timestamps)
const banLimits = new Map();

function cleanOldBanLimits() {
  const oneMinuteAgo = Date.now() - 60 * 1000;
  for (const [key, timestamps] of banLimits) {
    const filtered = timestamps.filter(t => t > oneMinuteAgo);
    if (filtered.length === 0) {
      banLimits.delete(key);
    } else {
      banLimits.set(key, filtered);
    }
  }
}

async function runBanCommand(message, args, context) {
  if (!message.guild || message.author.bot) return;

  const canManageCommands = context.accessStore.canUseAdminCommands(message.guild.id, message.author.id);
  const isSys = context.accessStore.isSys(message.author.id);

  if (!canManageCommands && !isSys) {
    await message.channel.send(buildExecutionFailedPayload('Commande réservée aux owners/buyers/sys.'));
    return;
  }

  const rawTarget = args[0];
  if (!rawTarget) {
    await message.channel.send(buildExecutionFailedPayload('Veuillez mentionner ou donner l\'ID de l\'utilisateur à bannir.'));
    return;
  }

  const targetId = rawTarget.replace(/[<@!>]/g, '');
  if (!/^\d{15,20}$/.test(targetId)) {
    await message.channel.send(buildExecutionFailedPayload('ID invalide.'));
    return;
  }

  const reason = args.slice(1).join(' ').trim();
  if (!reason) {
    const container = new ContainerBuilder()
      .addTextDisplayComponents((text) => text.setContent('Raison obligatoire pour utiliser +ban.'));
    
    await message.channel.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [], repliedUser: false }
    });
    return;
  }

  // Rate limit check
  cleanOldBanLimits();
  const limitKey = `${message.guild.id}+${message.author.id}`;
  const timestamps = banLimits.get(limitKey) || [];
  const recentTimestamps = timestamps.filter(t => t > Date.now() - 60 * 1000);

  const limits = context.accessStore.getGuildModerationLimits(message.guild.id);
  const maxBans = limits.banPerMinute;
  if (recentTimestamps.length >= maxBans) {
    const limitMessage = `Limite atteinte: ${maxBans} ban(s) par minute.`;
    await message.channel.send(buildExecutionFailedPayload(limitMessage));
    return;
  }

  try {
    await context.client.users.fetch(targetId);
  } catch (error) {
    await message.channel.send(buildExecutionFailedPayload('Impossible de récupérer cet utilisateur.'));
    return;
  }

  try {
    await message.guild.members.ban(targetId, { reason });
    
    // Enregistrer le timestamp du ban
    recentTimestamps.push(Date.now());
    banLimits.set(limitKey, recentTimestamps);
    
    const container = new ContainerBuilder()
      .addTextDisplayComponents((text) => text.setContent(`<@${targetId}> a ete banni.`));
    
    await message.channel.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [], repliedUser: false }
    });

    await context.logger.log(
      message.guild,
      '# Modération',
      `> Action: ban\n> Cible: <@${targetId}>\n> Raison: ${reason}\n> Auteur: <@${message.author.id}>`
    );
  } catch (error) {
    console.error('Ban error:', error);
    await message.channel.send(buildExecutionFailedPayload('Impossible de bannir cet utilisateur. Vérifiez mes permissions.'));
  }
}

module.exports = { runBanCommand };
