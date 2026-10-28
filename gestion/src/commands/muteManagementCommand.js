const { buildExecutionFailedPayload, buildNoticePayload } = require('../utils/components');
const {
  canActorManageMember,
  canBotManageMember,
  extractSnowflake,
  formatDuration,
  resolveMember,
  splitLines
} = require('../utils/discordTools');
const { getDerivedPermissionLevel } = require('../utils/access');
const { unmuteMember } = require('../services/automationService');

const UNMUTE_WINDOW_MS = 60 * 60 * 1000;
const MAX_UNMUTES_PER_WINDOW = 5;
const unmuteWindows = new Map();

async function runUnmuteCommand(message, args, context) {
  if (!canUseMuteTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const targetInput = args.join(' ').trim();
  if (!targetInput) {
    await message.channel.send(buildExecutionFailedPayload('Format: +unmute <user>.'));
    return;
  }

  const targetMember = await resolveMember(message.guild, targetInput);
  if (!targetMember) {
    await message.channel.send(buildExecutionFailedPayload('Membre introuvable.'));
    return;
  }

  const outcome = await executeManualUnmute(message, [targetMember], context, { commandName: 'unmute', applyRateLimit: true });
  await sendUnmuteOutcome(message, outcome, '# Unmute');
}

async function runUncmuteCommand(message, args, context) {
  if (!canUseMuteTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const targets = await resolveBulkMembers(message.guild, args);
  if (targets.length === 0) {
    await message.channel.send(buildExecutionFailedPayload('Format: +uncmute <@membre/ID ...>.'));
    return;
  }

  const outcome = await executeManualUnmute(message, targets, context, { commandName: 'uncmute', applyRateLimit: true });
  await sendUnmuteOutcome(message, outcome, '# Uncmute');
}

async function runMuteListCommand(message, context) {
  if (!canUseMuteTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const activeMutes = context.accessStore.getGuildActiveMutes(message.guild.id);
  const entries = Object.entries(activeMutes)
    .sort((a, b) => Number(a[1]?.expiresAt || 0) - Number(b[1]?.expiresAt || 0))
    .map(([userId, muteData], index) => {
      const remainingMs = Math.max(0, Number(muteData.expiresAt || 0) - Date.now());
      const moderator = muteData.moderatorId ? `<@${muteData.moderatorId}>` : '`inconnu`';
      return `> ${index + 1}. <@${userId}> | reste: \`${formatDuration(remainingMs)}\` | auteur: ${moderator} | raison: ${truncate(muteData.reason, 80)}`;
    });

  await sendListPayload(
    message.channel,
    '# MuteList',
    `> Mutes actifs: \`${entries.length}\``,
    entries,
    '> Aucun mute en cours sur le serveur.'
  );
}

async function runUnmuteAllCommand(message, context) {
  if (!canUseMuteTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const userIds = await collectAllMutedUserIds(message.guild, context);
  if (userIds.length === 0) {
    await message.channel.send(buildExecutionFailedPayload('Aucun mute actif a retirer.'));
    return;
  }

  const lines = [];
  let successCount = 0;

  for (const userId of userIds) {
    const member = await message.guild.members.fetch(userId).catch(() => null);
    if (member) {
      const protectedError = validateProtectedTarget(message, context, member);
      if (protectedError) {
        lines.push(`> <@${userId}> - ${protectedError}`);
        continue;
      }

      if (!canActorManageMember(message.member, member)) {
        lines.push('> <@' + userId + '> - hierarchie insuffisante.');
        continue;
      }

      if (!canBotManageMember(message.guild, member)) {
        lines.push('> <@' + userId + '> - hierarchie du bot insuffisante.');
        continue;
      }
    }

    const result = await unmuteMember(message.guild, userId, context, {
      moderatorId: message.author.id,
      automatic: false,
      skipLog: true
    });

    if (!result.ok) {
      lines.push(`> <@${userId}> - ${result.reason || 'echec'}`);
      continue;
    }

    successCount += 1;
    lines.push(`> <@${userId}> - unmute`);
  }

  await sendListPayload(
    message.channel,
    '# UnmuteAll',
    `> Total traite: \`${userIds.length}\`\n> Unmutes reussis: \`${successCount}\``,
    lines,
    '> Aucun membre traite.'
  );

  await context.logger.log(
    message.guild,
    '# Moderation',
    `> Action: unmuteall\n> Total: ${userIds.length}\n> Reussis: ${successCount}\n> Auteur: <@${message.author.id}>`
  );
}

async function executeManualUnmute(message, targetMembers, context, options = {}) {
  const activeMutes = context.accessStore.getGuildActiveMutes(message.guild.id);
  const candidates = [];
  const failures = [];

  for (const targetMember of targetMembers) {
    const safeTargetId = String(targetMember.id);
    const protectedError = validateProtectedTarget(message, context, targetMember);
    if (protectedError) {
      failures.push(`> <@${safeTargetId}> - ${protectedError}`);
      continue;
    }

    if (!canActorManageMember(message.member, targetMember)) {
      failures.push(`> <@${safeTargetId}> - vous ne pouvez gerer qu un membre plus bas dans la hierarchie.`);
      continue;
    }

    if (!canBotManageMember(message.guild, targetMember)) {
      failures.push(`> <@${safeTargetId}> - je ne peux pas gerer ce membre avec la hierarchie actuelle.`);
      continue;
    }

    const activeEntry = activeMutes[safeTargetId] || null;
    const restrictionError = validateManualUnmuteRights(message, context, targetMember, activeEntry);
    if (restrictionError) {
      failures.push(`> <@${safeTargetId}> - ${restrictionError}`);
      continue;
    }

    candidates.push({ targetMember, activeEntry });
  }

  if (candidates.length === 0) {
    return { successCount: 0, successLines: [], failureLines: failures };
  }

  const quotaError = reserveUnmuteQuota(message, candidates.length, options.commandName || 'unmute');
  if (quotaError) {
    failures.unshift(`> Limite atteinte: ${quotaError}`);
    return { successCount: 0, successLines: [], failureLines: failures };
  }

  const successLines = [];
  let successCount = 0;

  for (const candidate of candidates) {
    const result = await unmuteMember(message.guild, candidate.targetMember.id, context, {
      moderatorId: message.author.id,
      automatic: false,
      skipLog: true
    });

    if (!result.ok) {
      failures.push(`> <@${candidate.targetMember.id}> - ${result.reason || 'echec'}`);
      continue;
    }

    successCount += 1;
    successLines.push(`> <@${candidate.targetMember.id}> - unmute`);
  }

  if (successCount > 0) {
    await context.logger.log(
      message.guild,
      '# Moderation',
      `> Action: ${options.commandName || 'unmute'}\n> Total: ${targetMembers.length}\n> Reussis: ${successCount}\n> Auteur: <@${message.author.id}>`
    );
  }

  return { successCount, successLines, failureLines: failures };
}

async function sendUnmuteOutcome(message, outcome, title) {
  if (!outcome || (outcome.successCount === 0 && outcome.failureLines.length === 1 && outcome.failureLines[0].startsWith('> Limite atteinte'))) {
    await message.channel.send(buildExecutionFailedPayload(outcome?.failureLines?.[0]?.replace(/^>\s*/, '') || 'Aucun membre traite.'));
    return;
  }

  const introLines = [`> Unmutes reussis: \`${outcome.successCount}\``];
  if (outcome.failureLines.length) introLines.push(`> Echecs: \`${outcome.failureLines.length}\``);

  const lines = [...outcome.successLines, ...outcome.failureLines];
  await sendListPayload(message.channel, title, introLines.join('\n'), lines, '> Aucun membre traite.');
}

function canUseMuteTools(message, context) {
  return context.accessStore.canUseAdminCommands(message.guild.id, message.author.id);
}

function validateProtectedTarget(message, context, targetMember) {
  const authorIsActualSys = String(context.accessStore.getSysUserId()) === String(message.author.id);

  if (context.accessStore.getSysUserId() === String(targetMember.id) && !authorIsActualSys) {
    return 'vous ne pouvez pas gerer le sys.';
  }

  if (context.accessStore.getOwnerUserIds(message.guild.id).includes(String(targetMember.id)) && !authorIsActualSys) {
    return 'vous ne pouvez pas gerer un owner sans etre sys.';
  }

  return '';
}

function validateManualUnmuteRights(message, context, targetMember, activeEntry) {
  const actualAuthorId = String(message.author.id);
  const actualSysUserId = String(context.accessStore.getSysUserId() || '');
  const actualOwnerIds = context.accessStore.getOwnerUserIds(message.guild.id);
  const actualPermLevel = getDerivedPermissionLevel(message.guild.id, message.member, context.accessStore);

  const isActuallyPrivileged = actualAuthorId === actualSysUserId || actualOwnerIds.includes(actualAuthorId);
  const canUnmuteOthers = isActuallyPrivileged || (Number.isInteger(actualPermLevel) && actualPermLevel >= 7);
  if (canUnmuteOthers) return '';

  if (!activeEntry) {
    return 'vous pouvez seulement retirer un mute que vous avez pose avant la perm 7.';
  }

  if (String(activeEntry.moderatorId || '') !== actualAuthorId) {
    return 'vous pouvez seulement retirer un mute que vous avez pose avant la perm 7.';
  }

  return '';
}

async function collectAllMutedUserIds(guild, context) {
  const activeMutes = context.accessStore.getGuildActiveMutes(guild.id);
  const userIds = new Set(Object.keys(activeMutes));
  const muteSettings = context.accessStore.getGuildMuteSettings(guild.id);

  if (muteSettings.roleId) {
    const muteRole = guild.roles.cache.get(muteSettings.roleId) || (await guild.roles.fetch(muteSettings.roleId).catch(() => null));
    if (muteRole) {
      await guild.members.fetch().catch(() => null);
      for (const member of muteRole.members.values()) {
        userIds.add(String(member.id));
      }
    }
  }

  return [...userIds];
}

async function resolveBulkMembers(guild, args) {
  const ids = [];
  for (const rawArg of Array.isArray(args) ? args : []) {
    const id = extractSnowflake(rawArg);
    if (id) ids.push(id);
  }

  if (ids.length > 0) {
    const members = [];
    for (const id of [...new Set(ids)]) {
      const member = await guild.members.fetch(id).catch(() => null);
      if (member) members.push(member);
    }
    return members;
  }

  const fallback = await resolveMember(guild, (Array.isArray(args) ? args.join(' ') : '').trim());
  return fallback ? [fallback] : [];
}

function reserveUnmuteQuota(message, count, actionName) {
  cleanUnmuteWindows();
  const windowKey = `${message.guild.id}:${message.author.id}`;
  const timestamps = unmuteWindows.get(windowKey) || [];

  if (timestamps.length + count > MAX_UNMUTES_PER_WINDOW) {
    return `${MAX_UNMUTES_PER_WINDOW} ${actionName}(s) maximum par heure.`;
  }

  const now = Date.now();
  for (let index = 0; index < count; index += 1) {
    timestamps.push(now);
  }
  unmuteWindows.set(windowKey, timestamps);
  return '';
}

function cleanUnmuteWindows() {
  const threshold = Date.now() - UNMUTE_WINDOW_MS;
  for (const [key, timestamps] of unmuteWindows.entries()) {
    const filtered = timestamps.filter((timestamp) => timestamp > threshold);
    if (filtered.length === 0) {
      unmuteWindows.delete(key);
    } else {
      unmuteWindows.set(key, filtered);
    }
  }
}

async function sendListPayload(channel, title, intro, lines, emptyLine) {
  const chunks = splitLines(lines);
  if (chunks.length === 0) {
    await channel.send(
      buildNoticePayload({
        title,
        body: `${intro}\n${emptyLine}`
      })
    );
    return;
  }

  for (let index = 0; index < chunks.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await channel.send(
      buildNoticePayload({
        title,
        body: `${index === 0 ? intro : `> Suite ${index + 1}/${chunks.length}`}\n${chunks[index].join('\n')}`
      })
    );
  }
}

function truncate(value, maxLength) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text || 'Aucune raison';
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

module.exports = {
  runUnmuteCommand,
  runUncmuteCommand,
  runMuteListCommand,
  runUnmuteAllCommand
};
