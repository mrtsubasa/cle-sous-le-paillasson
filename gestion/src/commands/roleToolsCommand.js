const { ChannelType, ContainerBuilder, MessageFlags, PermissionFlagsBits, RoleSelectMenuBuilder, SeparatorSpacingSize } = require('discord.js');
const { buildExecutionFailedPayload, buildNoticePayload, withV2 } = require('../utils/components');
const {
  canActorManageMember,
  canActorManageRole,
  canBotManageMember,
  canBotManageRole,
  formatDuration,
  parseDurationToMs,
  resolveMember,
  resolveRole,
  splitLines
} = require('../utils/discordTools');
const { muteMember, unmuteMember } = require('../services/automationService');

const MAX_MUTE_MS = 40 * 60 * 1000;
const MUTE_WINDOW_MS = 30 * 60 * 1000;
const MAX_MUTES_PER_WINDOW = 5;
const ROLE_TOOL_SESSION_TTL_MS = 15 * 60 * 1000;
const ROLE_TOOL_DANGEROUS_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.ViewAuditLog,
  PermissionFlagsBits.ManageWebhooks
];
const muteWindows = new Map();
const roleToolSessions = new Map();

async function runAddRoleCommand(message, args, context) {
  if (!canUseRoleTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const userInput = String(args[0] || '').trim();
  const roleInput = args.slice(1).join(' ').trim();
  if (!userInput) {
    await message.channel.send(buildExecutionFailedPayload('Format: +addrole <user>.'));
    return;
  }

  const targetMember = await resolveMember(message.guild, userInput);
  if (!targetMember) {
    await message.channel.send(buildExecutionFailedPayload('Membre introuvable.'));
    return;
  }

  if (!roleInput) {
    await openRoleToolPanel(message, context, { action: 'add', targetMember });
    return;
  }

  const role = resolveRole(message.guild, roleInput);
  if (!role) {
    await message.channel.send(buildExecutionFailedPayload('Role introuvable.'));
    return;
  }

  const result = await applyRolesToTarget({
    action: 'add',
    guild: message.guild,
    actorMember: message.member,
    actorId: message.author.id,
    actorTag: message.author.tag,
    context,
    targetMember,
    roles: [role]
  });

  if (result.successRoles.length === 0) {
    await message.channel.send(buildExecutionFailedPayload(normalizeRoleToolFailure(result.failedLines[0]) || 'Impossible d ajouter ce role.'));
    return;
  }

  await message.channel.send(buildRoleActionResultPayload({ action: 'add', targetMember, result }));
  await logRoleAction(message.guild, context, 'addrole', targetMember, result.successRoles, message.author.id);
}

async function runDelRoleCommand(message, args, context) {
  if (!canUseRoleTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const userInput = String(args[0] || '').trim();
  const roleInput = args.slice(1).join(' ').trim();
  if (!userInput) {
    await message.channel.send(buildExecutionFailedPayload('Format: +delrole <user>.'));
    return;
  }

  const targetMember = await resolveMember(message.guild, userInput);
  if (!targetMember) {
    await message.channel.send(buildExecutionFailedPayload('Membre introuvable.'));
    return;
  }

  if (!roleInput) {
    await openRoleToolPanel(message, context, { action: 'del', targetMember });
    return;
  }

  const role = resolveRole(message.guild, roleInput);
  if (!role) {
    await message.channel.send(buildExecutionFailedPayload('Role introuvable.'));
    return;
  }

  const result = await applyRolesToTarget({
    action: 'del',
    guild: message.guild,
    actorMember: message.member,
    actorId: message.author.id,
    actorTag: message.author.tag,
    context,
    targetMember,
    roles: [role]
  });

  if (result.successRoles.length === 0) {
    await message.channel.send(buildExecutionFailedPayload(normalizeRoleToolFailure(result.failedLines[0]) || 'Impossible de retirer ce role.'));
    return;
  }

  await message.channel.send(buildRoleActionResultPayload({ action: 'del', targetMember, result }));
  await logRoleAction(message.guild, context, 'delrole', targetMember, result.successRoles, message.author.id);
}

async function handleRoleToolsInteraction(interaction, context) {
  if (!interaction.isRoleSelectMenu()) return false;
  if (!interaction.customId.startsWith('roletools:')) return false;

  const [, action, sessionId] = interaction.customId.split(':');
  if (!['add', 'del'].includes(action) || !sessionId) return false;

  cleanRoleToolSessions();

  const session = roleToolSessions.get(sessionId);
  if (!session || session.guildId !== interaction.guild.id) {
    await interaction.reply({
      ...buildExecutionFailedPayload('Session expiree ou introuvable.'),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    }).catch(() => null);
    return true;
  }

  if (session.authorId !== interaction.user.id) {
    await interaction.reply({
      ...buildExecutionFailedPayload('Vous ne pouvez pas utiliser le menu de quelqu un d autre.'),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    }).catch(() => null);
    return true;
  }

  const targetMember = await interaction.guild.members.fetch(session.targetMemberId).catch(() => null);
  if (!targetMember) {
    roleToolSessions.delete(sessionId);
    await interaction.reply({
      ...buildExecutionFailedPayload('Membre introuvable ou session expiree.'),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    }).catch(() => null);
    return true;
  }

  const actorMember = interaction.member;
  const roles = interaction.values
    .map((roleId) => interaction.guild.roles.cache.get(roleId) || null)
    .filter(Boolean);

  const deferred = await interaction.deferUpdate().then(() => true).catch(() => false);

  const result = await applyRolesToTarget({
    action,
    guild: interaction.guild,
    actorMember,
    actorId: interaction.user.id,
    actorTag: interaction.user.tag,
    context,
    targetMember,
    roles
  });

  roleToolSessions.delete(sessionId);

  const resultPayload = buildRoleActionResultPayload({ action, targetMember, result });
  if (deferred) {
    await interaction.editReply(resultPayload).catch(() => null);
  } else {
    await interaction.update(resultPayload).catch(() => null);
  }

  if (result.successRoles.length > 0) {
    await logRoleAction(interaction.guild, context, action === 'add' ? 'addrole' : 'delrole', targetMember, result.successRoles, interaction.user.id);
  }

  return true;
}

async function runDerankCommand(message, args, context) {
  if (!canUseRoleTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const userInput = String(args[0] || '').trim();
  if (!userInput) {
    await message.channel.send(buildExecutionFailedPayload('Format: +derank <user>.'));
    return;
  }

  const targetMember = await resolveMember(message.guild, userInput);
  if (!targetMember) {
    await message.channel.send(buildExecutionFailedPayload('Membre introuvable.'));
    return;
  }

  const protectedError = validateProtectedTarget(message, context, targetMember);
  if (protectedError) {
    await message.channel.send(buildExecutionFailedPayload(protectedError));
    return;
  }

  if (!canActorManageMember(message.member, targetMember)) {
    await message.channel.send(buildExecutionFailedPayload('Vous ne pouvez derank qu un membre plus bas dans la hierarchie.'));
    return;
  }

  if (!canBotManageMember(message.guild, targetMember)) {
    await message.channel.send(buildExecutionFailedPayload('Je ne peux pas gerer ce membre avec la hierarchie actuelle.'));
    return;
  }

  const removableRoles = targetMember.roles.cache.filter((role) => {
    if (role.id === message.guild.roles.everyone.id) return false;
    return canActorManageRole(message.member, role) && canBotManageRole(message.guild, role);
  });

  const skippedRoles = targetMember.roles.cache.filter((role) => {
    if (role.id === message.guild.roles.everyone.id) return false;
    return !removableRoles.has(role.id);
  });

  if (removableRoles.size === 0) {
    await message.channel.send(buildExecutionFailedPayload('Aucun role retirable sur ce membre avec la hierarchie actuelle.'));
    return;
  }

  await targetMember.roles.remove([...removableRoles.values()], `Derank via +derank par ${message.author.tag}`);

  const skippedLine = skippedRoles.size
    ? `\n> Roles non retires: ${skippedRoles.map((role) => `<@&${role.id}>`).join(', ')}`
    : '';

  await message.channel.send(
    buildNoticePayload({
      title: '# Derank',
      body: `> Cible: <@${targetMember.id}>\n> Roles retires: ${removableRoles.map((role) => `<@&${role.id}>`).join(', ')}${skippedLine}`
    })
  );

  await context.logger.log(
    message.guild,
    '# Moderation',
    `> Action: derank\n> Cible: <@${targetMember.id}>\n> Roles retires: ${removableRoles.map((role) => role.id).join(', ')}\n> Auteur: <@${message.author.id}>`
  );
}

async function runMuteRoleCommand(message, args, context) {
  if (!canUseRoleTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const me = message.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await message.channel.send(buildExecutionFailedPayload('Il me faut la permission `ManageRoles` pour creer ou configurer le role mute.'));
    return;
  }

  const currentSettings = context.accessStore.getGuildMuteSettings(message.guild.id);
  let role = currentSettings.roleId ? message.guild.roles.cache.get(currentSettings.roleId) : null;
  const requestedName = args.join(' ').trim();
  const roleName = requestedName || currentSettings.roleName || 'Muet';

  if (!role) {
    role = await message.guild.roles.create({
      name: roleName,
      reason: `Creation du role mute par ${message.author.tag}`
    });
  } else if (role.name !== roleName && canBotManageRole(message.guild, role)) {
    role = await role.edit({ name: roleName, reason: `Maj du role mute par ${message.author.tag}` }).catch(() => role);
  }

  const permissionErrors = await applyMuteRoleOverwrites(message.guild, role);
  context.accessStore.setGuildMuteSettings(message.guild.id, {
    roleId: role.id,
    roleName: role.name
  });

  const bodyLines = [
    `> Role mute: <@&${role.id}>`,
    `> Nom: \`${role.name}\``,
    permissionErrors.length
      ? `> Salons en erreur: ${permissionErrors.join(', ')}`
      : '> Permissions salon configurees sans erreur.'
  ];

  await message.channel.send(
    buildNoticePayload({
      title: '# MuteRole',
      body: bodyLines.join('\n')
    })
  );

  await context.logger.log(
    message.guild,
    '# Moderation',
    `> Action: muterole\n> Role: <@&${role.id}>\n> Auteur: <@${message.author.id}>`
  );
}

async function runMuteCommand(message, args, context) {
  if (!canUseRoleTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const userInput = String(args[0] || '').trim();
  const durationInput = String(args[1] || '').trim();
  const reason = args.slice(2).join(' ').trim() || 'Aucune raison';

  if (!userInput || !durationInput) {
    await message.channel.send(buildExecutionFailedPayload('Format: +mute <user> <temps> [raison].'));
    return;
  }

  const targetMember = await resolveMember(message.guild, userInput);
  if (!targetMember) {
    await message.channel.send(buildExecutionFailedPayload('Membre introuvable.'));
    return;
  }

  const protectedError = validateProtectedTarget(message, context, targetMember);
  if (protectedError) {
    await message.channel.send(buildExecutionFailedPayload(protectedError));
    return;
  }

  if (!canActorManageMember(message.member, targetMember)) {
    await message.channel.send(buildExecutionFailedPayload('Vous ne pouvez mute qu un membre plus bas dans la hierarchie.'));
    return;
  }

  if (!canBotManageMember(message.guild, targetMember)) {
    await message.channel.send(buildExecutionFailedPayload('Je ne peux pas gerer ce membre avec la hierarchie actuelle.'));
    return;
  }

  const durationMs = parseDurationToMs(durationInput);
  if (!durationMs) {
    await message.channel.send(buildExecutionFailedPayload('Temps invalide. Exemple: `10m`, `30s`, `1h`.'));
    return;
  }

  if (durationMs > MAX_MUTE_MS) {
    await message.channel.send(buildExecutionFailedPayload('Le mute est limite a 40 minutes maximum.'));
    return;
  }

  const muteSettings = context.accessStore.getGuildMuteSettings(message.guild.id);
  if (!muteSettings.roleId) {
    await message.channel.send(buildExecutionFailedPayload('Aucun role mute configure. Utilisez `+muterole` ou le `+panel`.'));
    return;
  }

  const muteRole = message.guild.roles.cache.get(muteSettings.roleId) || (await message.guild.roles.fetch(muteSettings.roleId).catch(() => null));
  if (!muteRole) {
    await message.channel.send(buildExecutionFailedPayload('Le role mute configure est introuvable.'));
    return;
  }

  if (!canActorManageRole(message.member, muteRole)) {
    await message.channel.send(buildExecutionFailedPayload('Vous ne pouvez pas utiliser un role mute au-dessus de vous dans la hierarchie.'));
    return;
  }

  if (!canBotManageRole(message.guild, muteRole)) {
    await message.channel.send(buildExecutionFailedPayload('Je ne peux pas attribuer ce role mute avec ma hierarchie actuelle.'));
    return;
  }

  cleanMuteWindows();
  const windowKey = `${message.guild.id}:${message.author.id}`;
  const timestamps = muteWindows.get(windowKey) || [];
  if (timestamps.length >= MAX_MUTES_PER_WINDOW) {
    await message.channel.send(buildExecutionFailedPayload('Limite atteinte: 5 mutes maximum sur 30 minutes.'));
    return;
  }

  const result = await muteMember(targetMember, context, {
    durationMs,
    reason,
    moderatorId: message.author.id
  }).catch(() => ({ ok: false, reason: 'Impossible d attribuer le role mute.' }));

  if (!result.ok) {
    await message.channel.send(buildExecutionFailedPayload(result.reason || 'Impossible de mute ce membre.'));
    return;
  }

  timestamps.push(Date.now());
  muteWindows.set(windowKey, timestamps);

  await message.channel.send(
    buildNoticePayload({
      title: '# Mute',
      body: `> Cible: <@${targetMember.id}>\n> Duree: \`${formatDuration(durationMs)}\`\n> Role: <@&${result.role.id}>\n> Raison: ${reason}`
    })
  );

  await context.logger.log(
    message.guild,
    '# Moderation',
    `> Action: mute\n> Cible: <@${targetMember.id}>\n> Duree: ${formatDuration(durationMs)}\n> Role: <@&${result.role.id}>\n> Raison: ${reason}\n> Auteur: <@${message.author.id}>`
  );
}

async function runUnmuteCommand(message, args, context) {
  if (!canUseRoleTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const userInput = String(args[0] || '').trim();
  if (!userInput) {
    await message.channel.send(buildExecutionFailedPayload('Format: +unmute <user>.'));
    return;
  }

  const targetMember = await resolveMember(message.guild, userInput);
  if (!targetMember) {
    await message.channel.send(buildExecutionFailedPayload('Membre introuvable.'));
    return;
  }

  const protectedError = validateProtectedTarget(message, context, targetMember);
  if (protectedError) {
    await message.channel.send(buildExecutionFailedPayload(protectedError));
    return;
  }

  if (!canActorManageMember(message.member, targetMember)) {
    await message.channel.send(buildExecutionFailedPayload('Vous ne pouvez unmute qu un membre plus bas dans la hierarchie.'));
    return;
  }

  const settings = context.accessStore.getGuildMuteSettings(message.guild.id);
  const muteRoleId = settings.roleId;
  if (!muteRoleId) {
    await message.channel.send(buildExecutionFailedPayload('Aucun role mute configure.'));
    return;
  }

  const muteRole = message.guild.roles.cache.get(muteRoleId) || (await message.guild.roles.fetch(muteRoleId).catch(() => null));
  const activeMutes = context.accessStore.getGuildActiveMutes(message.guild.id);
  if (!muteRole || (!targetMember.roles.cache.has(muteRole.id) && !activeMutes[targetMember.id])) {
    await message.channel.send(buildExecutionFailedPayload('Ce membre n est pas mute actuellement.'));
    return;
  }

  const result = await unmuteMember(message.guild, targetMember.id, context, {
    moderatorId: message.author.id,
    automatic: false,
    skipLog: true
  });

  if (!result.ok) {
    await message.channel.send(buildExecutionFailedPayload(result.reason || 'Impossible d unmute ce membre.'));
    return;
  }

  await message.channel.send(
    buildNoticePayload({
      title: '# Unmute',
      body: `> Cible: <@${targetMember.id}>\n> Role retire: ${muteRole ? `<@&${muteRole.id}>` : '`inconnu`'}`
    })
  );

  await context.logger.log(
    message.guild,
    '# Moderation',
    `> Action: unmute\n> Cible: <@${targetMember.id}>\n> Auteur: <@${message.author.id}>`
  );
}

async function openRoleToolPanel(message, context, { action, targetMember }) {
  const targetError = validateRoleTargetAccess({
    guild: message.guild,
    actorMember: message.member,
    actorId: message.author.id,
    context,
    targetMember,
    allowSelf: action === 'add'
  });
  if (targetError) {
    await message.channel.send(buildExecutionFailedPayload(targetError));
    return;
  }

  cleanRoleToolSessions();

  const sessionId = message.id;
  roleToolSessions.set(sessionId, {
    id: sessionId,
    action,
    authorId: message.author.id,
    guildId: message.guild.id,
    targetMemberId: targetMember.id,
    createdAt: Date.now()
  });

  await message.channel.send(buildRoleToolPanelPayload({ action, sessionId, targetMember }));
}

async function applyRolesToTarget({ action, guild, actorMember, actorId, actorTag, context, targetMember, roles }) {
  const uniqueRoles = [];
  const seenRoleIds = new Set();

  for (const role of Array.isArray(roles) ? roles : []) {
    if (!role || seenRoleIds.has(role.id)) continue;
    seenRoleIds.add(role.id);
    uniqueRoles.push(role);
  }

  const result = {
    successRoles: [],
    failedLines: []
  };

  const targetError = validateRoleTargetAccess({ guild, actorMember, actorId, context, targetMember, allowSelf: action === 'add' });
  if (targetError) {
    result.failedLines.push(targetError);
    return result;
  }

  if (uniqueRoles.length === 0) {
    result.failedLines.push('Aucun role valide selectionne.');
    return result;
  }

  for (const role of uniqueRoles) {
    const accessError =
      action === 'add'
        ? validateRoleGrantAccess({ guild, actorMember, actorId, context, targetMember, role })
        : validateRoleActionAccess({ guild, actorMember, actorId, context, targetMember, role });

    if (accessError) {
      result.failedLines.push(`> <@&${role.id}> - ${accessError}`);
      continue;
    }

    if (String(role.id) === String(guild.roles.everyone.id)) {
      result.failedLines.push(`> <@&${role.id}> - le role everyone ne peut pas etre modifie avec cette commande.`);
      continue;
    }

    if (action === 'add' && targetMember.roles.cache.has(role.id)) {
      result.failedLines.push(`> <@&${role.id}> - ce membre possede deja ce role.`);
      continue;
    }

    if (action === 'del' && !targetMember.roles.cache.has(role.id)) {
      result.failedLines.push(`> <@&${role.id}> - ce membre ne possede pas ce role.`);
      continue;
    }

    const reason = action === 'add' ? `Ajout via +addrole par ${actorTag}` : `Retrait via +delrole par ${actorTag}`;
    const roleAction = action === 'add' ? targetMember.roles.add(role, reason) : targetMember.roles.remove(role, reason);
    // eslint-disable-next-line no-await-in-loop
    const updated = await roleAction.then(() => true).catch(() => false);
    if (!updated) {
      result.failedLines.push(
        `> <@&${role.id}> - impossible de ${action === 'add' ? 'l ajouter' : 'le retirer'} avec les permissions actuelles.`
      );
      continue;
    }

    result.successRoles.push(role);
  }

  return result;
}

function buildRoleToolPanelPayload({ action, sessionId, targetMember }) {
  const title = action === 'add' ? '# Ajout de role' : '# Retrait de role';
  const prompt =
    action === 'add'
      ? '> Veuillez choisir le ou les roles a ajouter ci-dessous'
      : '> Veuillez choisir le ou les roles a retirer ci-dessous';
  const warning =
    action === 'add'
      ? '> Vous ne pouvez pas ajouter un role qui est egal ou plus haut en hierarchie de votre role le plus haut ou avec des permissions dangereuses'
      : '> Vous ne pouvez pas retirer un role qui est egal ou plus haut en hierarchie de votre role le plus haut';

  const container = new ContainerBuilder()
    .addTextDisplayComponents((text) => text.setContent(title))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(prompt))
    .addTextDisplayComponents((text) => text.setContent(`> Cible : <@${targetMember.id}> (${targetMember.id})\n${warning}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents((row) =>
      row.addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(`roletools:${action}:${sessionId}`)
          .setPlaceholder(action === 'add' ? 'Choisissez le ou les roles a ajouter' : 'Choisissez le ou les roles a retirer')
          .setMinValues(1)
          .setMaxValues(25)
      )
    );

  return withV2({ components: [container] });
}

function buildRoleActionResultPayload({ action, targetMember, result }) {
  const title = action === 'add' ? '# Ajout de role' : '# Retrait de role';
  const successLabel = action === 'add' ? 'Roles ajoutes' : 'Roles retires';
  const successText = result.successRoles.length ? result.successRoles.map((role) => `<@&${role.id}>`).join(', ') : 'Aucun';
  const container = new ContainerBuilder()
    .addTextDisplayComponents((text) => text.setContent(title))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent(
        `> Cible : <@${targetMember.id}> (${targetMember.id})\n` +
          `> ${successLabel} : ${successText}\n` +
          `> Echecs : \`${result.failedLines.length}\``
      )
    );

  const failureChunks = splitLines(result.failedLines, 10, 3500);
  if (failureChunks.length > 0) {
    container.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
    for (const chunk of failureChunks) {
      container.addTextDisplayComponents((text) =>
        text.setContent(
          chunk
            .map((line) => (String(line).startsWith('>') ? line : `> ${line}`))
            .join('\n')
        )
      );
    }
  }

  return withV2({ components: [container] });
}

async function logRoleAction(guild, context, actionName, targetMember, roles, authorId) {
  if (!roles.length) return;

  await context.logger.log(
    guild,
    '# Moderation',
    `> Action: ${actionName}\n> Cible: <@${targetMember.id}>\n> Roles: ${roles.map((role) => `<@&${role.id}>`).join(', ')}\n> Auteur: <@${authorId}>`
  );
}

function normalizeRoleToolFailure(line) {
  return String(line || '').replace(/^>\s*/, '').trim();
}

function canUseRoleTools(message, context) {
  return context.accessStore.canUseAdminCommands(message.guild.id, message.author.id);
}

function validateProtectedTarget(message, context, targetMember) {
  return validateProtectedTargetForActor({
    guild: message.guild,
    actorId: message.author.id,
    targetMember,
    context,
    forbidSelfDerank: message.content.toLowerCase().startsWith(`${context.config.prefix}derank`)
  });
}

function validateProtectedTargetForActor({ guild, actorId, targetMember, context, forbidSelfDerank = false }) {
  const authorIsSys = context.accessStore.isSys(actorId);

  if (forbidSelfDerank && String(targetMember.id) === String(actorId)) {
    return 'Vous ne pouvez pas vous derank vous-meme.';
  }

  if (context.accessStore.isSys(targetMember.id) && !authorIsSys) {
    return 'Vous ne pouvez pas gerer le sys.';
  }

  if (context.accessStore.isOwner(guild.id, targetMember.id) && !authorIsSys) {
    return 'Vous ne pouvez pas gerer un owner sans etre sys.';
  }

  return '';
}

function validateRoleTargetAccess({ guild, actorMember, actorId, context, targetMember, allowSelf = false }) {
  if (allowSelf && String(targetMember.id) === String(actorId)) {
    return '';
  }

  const protectedError = validateProtectedTargetForActor({ guild, actorId, targetMember, context });
  if (protectedError) return protectedError;

  if (!canActorManageMember(actorMember, targetMember)) {
    return 'Vous ne pouvez gerer qu un membre plus bas dans la hierarchie.';
  }

  if (!canBotManageMember(guild, targetMember)) {
    return 'Je ne peux pas gerer ce membre avec la hierarchie actuelle.';
  }

  return '';
}

function validateRoleActionAccess({ guild, actorMember, actorId, context, targetMember, role }) {
  const targetError = validateRoleTargetAccess({ guild, actorMember, actorId, context, targetMember });
  if (targetError) return targetError;

  if (!canActorManageRole(actorMember, role)) {
    return 'Vous ne pouvez pas gerer ce role avec votre hierarchie.';
  }

  if (!canBotManageRole(guild, role)) {
    return 'Je ne peux pas gerer ce role avec ma hierarchie actuelle.';
  }

  return '';
}

function validateRoleGrantAccess({ guild, actorMember, actorId, context, targetMember, role }) {
  const targetError = validateRoleTargetAccess({ guild, actorMember, actorId, context, targetMember, allowSelf: true });
  if (targetError) return targetError;

  if (!canActorGrantRole(actorMember, role)) {
    return 'Vous ne pouvez pas ajouter un role egal ou plus haut que votre propre hierarchie.';
  }

  if (hasDangerousRolePermissions(role)) {
    return 'Vous ne pouvez pas ajouter un role avec des permissions dangereuses.';
  }

  if (!canBotManageRole(guild, role)) {
    return 'Je ne peux pas gerer ce role avec ma hierarchie actuelle.';
  }

  return '';
}

function hasDangerousRolePermissions(role) {
  if (!role?.permissions) return false;
  return ROLE_TOOL_DANGEROUS_PERMISSIONS.some((permission) => role.permissions.has(permission));
}

function cleanRoleToolSessions() {
  const threshold = Date.now() - ROLE_TOOL_SESSION_TTL_MS;
  for (const [key, session] of roleToolSessions.entries()) {
    if (!session?.createdAt || session.createdAt < threshold) {
      roleToolSessions.delete(key);
    }
  }
}

function canActorGrantRole(actorMember, role) {
  if (!actorMember || !role) return false;
  if (String(actorMember.id) === String(actorMember.guild.ownerId)) return true;
  return actorMember.roles.highest.comparePositionTo(role) > 0;
}

async function applyMuteRoleOverwrites(guild, role) {
  await guild.channels.fetch().catch(() => null);

  const errors = [];
  const denyText = {
    SendMessages: false,
    AddReactions: false,
    SendMessagesInThreads: false,
    CreatePublicThreads: false,
    CreatePrivateThreads: false,
    Speak: false
  };

  for (const channel of guild.channels.cache.values()) {
    if (!channel?.permissionOverwrites?.edit) continue;

    try {
      if (
        [
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.GuildForum,
          ChannelType.GuildVoice,
          ChannelType.GuildStageVoice
        ].includes(channel.type)
      ) {
        // eslint-disable-next-line no-await-in-loop
        await channel.permissionOverwrites.edit(role, denyText, { reason: 'Configuration role mute' });
      }
    } catch {
      errors.push(channel.type === ChannelType.GuildCategory ? `\`${channel.name}\`` : `<#${channel.id}>`);
    }
  }

  return errors.slice(0, 20);
}

function cleanMuteWindows() {
  const threshold = Date.now() - MUTE_WINDOW_MS;
  for (const [key, timestamps] of muteWindows.entries()) {
    const filtered = timestamps.filter((timestamp) => timestamp > threshold);
    if (filtered.length === 0) {
      muteWindows.delete(key);
    } else {
      muteWindows.set(key, filtered);
    }
  }
}

module.exports = {
  runAddRoleCommand,
  runDelRoleCommand,
  handleRoleToolsInteraction,
  runDerankCommand,
  runMuteRoleCommand,
  runMuteCommand,
  runUnmuteCommand
};
