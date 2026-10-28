const {
  ChannelType,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorSpacingSize
} = require('discord.js');
const { buildExecutionFailedPayload, buildNoticePayload } = require('../utils/components');
const {
  canActorManageMember,
  canBotManageMember,
  extractSnowflake,
  parseDurationToMs,
  resolveMember,
  resolveRole,
  splitLines
} = require('../utils/discordTools');
const { getChannelSnipe } = require('../services/automationService');

const WARN_WINDOW_MS = 60 * 60 * 1000;
const MAX_WARNS_PER_WINDOW = 5;
const warnWindows = new Map();

async function runWarnCommand(message, args, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const { members, reason } = await resolveWarnTargets(message, args);
  if (members.length === 0) {
    await message.channel.send(buildExecutionFailedPayload('Format: +warn <@membre/ID ...> [raison].'));
    return;
  }

  const validTargets = [];
  const lines = [];

  for (const member of members) {
    const protectedError = validateProtectedTarget(message, context, member);
    if (protectedError) {
      lines.push(`> <@${member.id}> - ${protectedError}`);
      continue;
    }

    if (!canActorManageMember(message.member, member)) {
      lines.push(`> <@${member.id}> - vous ne pouvez gerer qu un membre plus bas dans la hierarchie.`);
      continue;
    }

    if (!canBotManageMember(message.guild, member)) {
      lines.push(`> <@${member.id}> - je ne peux pas gerer ce membre avec la hierarchie actuelle.`);
      continue;
    }

    validTargets.push(member);
  }

  if (validTargets.length === 0) {
    await sendListPayload(
      message.channel,
      '# Warn',
      '> Aucun warn applique.',
      lines,
      '> Aucun membre valide.'
    );
    return;
  }

  const quotaError = reserveWarnQuota(message, validTargets.length);
  if (quotaError) {
    await message.channel.send(buildExecutionFailedPayload(quotaError));
    return;
  }

  for (const member of validTargets) {
    context.accessStore.addMemberSanction(message.guild.id, member.id, {
      moderatorId: message.author.id,
      reason,
      createdAt: Date.now()
    });
    lines.unshift(`> <@${member.id}> - warn ajoute (${reason})`);
  }

  await sendListPayload(
    message.channel,
    '# Warn',
    `> Warns ajoutes: \`${validTargets.length}\`\n> Raison: ${reason}`,
    lines,
    '> Aucun warn applique.'
  );

  await context.logger.log(
    message.guild,
    '# Moderation',
    `> Action: warn\n> Cibles: ${validTargets.map((member) => `<@${member.id}>`).join(', ')}\n> Raison: ${reason}\n> Auteur: <@${message.author.id}>`
  );
}

async function runSanctionsCommand(message, args, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const targetInput = args.join(' ').trim();
  if (!targetInput) {
    await message.channel.send(buildExecutionFailedPayload('Format: +sanctions <membre>.'));
    return;
  }

  const targetMember = await resolveMember(message.guild, targetInput);
  if (!targetMember) {
    await message.channel.send(buildExecutionFailedPayload('Membre introuvable.'));
    return;
  }

  const sanctions = context.accessStore.getMemberSanctions(message.guild.id, targetMember.id);
  const lines = sanctions.map((sanction, index) => {
    const author = sanction.moderatorId ? `<@${sanction.moderatorId}>` : '`inconnu`';
    return `> ${index + 1}. \`${formatDate(sanction.createdAt)}\` | auteur: ${author} | raison: ${truncate(sanction.reason, 100)}`;
  });

  await sendListPayload(
    message.channel,
    '# Sanctions',
    `> Cible: <@${targetMember.id}>\n> Total: \`${sanctions.length}\``,
    lines,
    '> Aucune sanction pour ce membre.'
  );
}

async function runDelSanctionCommand(message, args, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const countInput = String(args[args.length - 1] || '').trim();
  const sanctionIndex = Number.parseInt(countInput, 10);
  const targetInput = args.slice(0, -1).join(' ').trim();

  if (!targetInput || !Number.isInteger(sanctionIndex) || sanctionIndex <= 0) {
    await message.channel.send(buildExecutionFailedPayload('Format: +del sanction <membre> <nombre>.'));
    return;
  }

  const targetMember = await resolveMember(message.guild, targetInput);
  if (!targetMember) {
    await message.channel.send(buildExecutionFailedPayload('Membre introuvable.'));
    return;
  }

  const sanctions = context.accessStore.getMemberSanctions(message.guild.id, targetMember.id);
  if (sanctionIndex > sanctions.length) {
    await message.channel.send(buildExecutionFailedPayload('Numero de sanction invalide.'));
    return;
  }

  const removed = sanctions[sanctionIndex - 1];
  const next = sanctions.filter((_, index) => index !== sanctionIndex - 1);
  if (next.length === 0) {
    context.accessStore.clearMemberSanctions(message.guild.id, targetMember.id);
  } else {
    context.accessStore.setMemberSanctions(message.guild.id, targetMember.id, next);
  }

  await message.channel.send(
    buildNoticePayload({
      title: '# Del Sanction',
      body: `> Cible: <@${targetMember.id}>\n> Sanction retiree: \`${sanctionIndex}\`\n> Raison: ${truncate(removed.reason, 120)}`
    })
  );

  await context.logger.log(
    message.guild,
    '# Moderation',
    `> Action: del sanction\n> Cible: <@${targetMember.id}>\n> Index: ${sanctionIndex}\n> Auteur: <@${message.author.id}>`
  );
}

async function runClearSanctionsCommand(message, args, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const targetInput = args.join(' ').trim();
  if (!targetInput) {
    await message.channel.send(buildExecutionFailedPayload('Format: +clear sanctions <membre>.'));
    return;
  }

  const targetMember = await resolveMember(message.guild, targetInput);
  if (!targetMember) {
    await message.channel.send(buildExecutionFailedPayload('Membre introuvable.'));
    return;
  }

  const removedCount = context.accessStore.clearMemberSanctions(message.guild.id, targetMember.id);
  await message.channel.send(
    buildNoticePayload({
      title: '# Clear Sanctions',
      body: `> Cible: <@${targetMember.id}>\n> Sanctions supprimees: \`${removedCount}\``
    })
  );

  await context.logger.log(
    message.guild,
    '# Moderation',
    `> Action: clear sanctions\n> Cible: <@${targetMember.id}>\n> Nombre: ${removedCount}\n> Auteur: <@${message.author.id}>`
  );
}

async function runClearAllSanctionsCommand(message, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const removedCount = context.accessStore.clearAllGuildSanctions(message.guild.id);
  await message.channel.send(
    buildNoticePayload({
      title: '# Clear All Sanctions',
      body: `> Toutes les sanctions du serveur ont ete supprimees.\n> Total: \`${removedCount}\``
    })
  );

  await context.logger.log(
    message.guild,
    '# Moderation',
    `> Action: clear all sanctions\n> Nombre: ${removedCount}\n> Auteur: <@${message.author.id}>`
  );
}

async function runPicOnlyCommand(message, args, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const action = String(args[0] || '').trim().toLowerCase();
  if (!action) {
    const channels = context.accessStore.getGuildPicOnlyChannelIds(message.guild.id);
    const lines = channels.map((channelId) => `> <#${channelId}>`);
    await sendListPayload(
      message.channel,
      '# PicOnly',
      `> Salons selfie: \`${channels.length}\``,
      lines,
      '> Aucun salon selfie configure.'
    );
    return;
  }

  const targetChannel = await resolveTextChannel(message, args.slice(1));
  if (!targetChannel) {
    await message.channel.send(buildExecutionFailedPayload('Salon introuvable. Utilisez une mention, un ID, un nom ou laissez vide pour le salon actuel.'));
    return;
  }

  if (action === 'add') {
    const channels = context.accessStore.addGuildPicOnlyChannel(message.guild.id, targetChannel.id);
    await message.channel.send(
      buildNoticePayload({
        title: '# PicOnly',
        body: `> Salon ajoute: <#${targetChannel.id}>\n> Total: \`${channels.length}\``
      })
    );
    return;
  }

  if (action === 'del' || action === 'remove' || action === 'delete') {
    const channels = context.accessStore.deleteGuildPicOnlyChannel(message.guild.id, targetChannel.id);
    await message.channel.send(
      buildNoticePayload({
        title: '# PicOnly',
        body: `> Salon retire: <#${targetChannel.id}>\n> Total: \`${channels.length}\``
      })
    );
    return;
  }

  await message.channel.send(buildExecutionFailedPayload('Options: +piconly <add/del> [salon].'));
}

async function runDelPermCommand(message, args, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const roles = resolveRolesFromArgs(message.guild, args);
  if (roles.length === 0) {
    await message.channel.send(buildExecutionFailedPayload('Format: +del perm <role>.'));
    return;
  }

  const summary = context.accessStore.removeRolesFromAllPermissions(
    message.guild.id,
    roles.map((role) => role.id)
  );

  await message.channel.send(
    buildNoticePayload({
      title: '# Del Perm',
      body:
        `> Roles retires: ${roles.map((role) => `<@&${role.id}>`).join(', ')}\n` +
        `> Liens perm retires: \`${summary.permissionLinksRemoved}\`\n` +
        `> Liens config retires: \`${summary.commandLinksRemoved}\``
    })
  );
}

async function runClearPermsCommand(message, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const summary = context.accessStore.clearAllRolePermissions(message.guild.id);
  await message.channel.send(
    buildNoticePayload({
      title: '# Clear Perms',
      body:
        `> Toutes les permissions par role ont ete supprimees.\n` +
        `> Liens perm retires: \`${summary.clearedPermissionLinks}\`\n` +
        `> Liens config retires: \`${summary.clearedCommandLinks}\``
    })
  );
}

async function runSlowmodeCommand(message, args, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const durationInput = String(args[0] || '').trim().toLowerCase();
  if (!durationInput) {
    await message.channel.send(buildExecutionFailedPayload('Format: +slowmode <duree> [salon].'));
    return;
  }

  const targetChannel = await resolveTextChannel(message, args.slice(1));
  if (!targetChannel || typeof targetChannel.setRateLimitPerUser !== 'function') {
    await message.channel.send(buildExecutionFailedPayload('Salon texte invalide.'));
    return;
  }

  const seconds = parseSlowmodeSeconds(durationInput);
  if (seconds === null || seconds < 0) {
    await message.channel.send(buildExecutionFailedPayload('Duree invalide. Exemple: 10s, 5m, 1h, off.'));
    return;
  }

  if (seconds > 6 * 60 * 60) {
    await message.channel.send(buildExecutionFailedPayload('Le slowmode est limite a 6 heures maximum.'));
    return;
  }

  const updated = await targetChannel.setRateLimitPerUser(seconds, `Slowmode change par ${message.author.tag}`).then(() => true).catch(async () => {
    await message.channel.send(buildExecutionFailedPayload('Impossible de modifier le slowmode de ce salon.'));
    return false;
  });
  if (!updated) return;

  await message.channel.send(
    buildNoticePayload({
      title: '# Slowmode',
      body: `> Salon: <#${targetChannel.id}>\n> Duree: \`${seconds === 0 ? 'off' : formatSeconds(seconds)}\``
    })
  );
}

async function runBringAllCommand(message, args, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const destinationChannel = await resolveVoiceChannel(message, args);
  if (!destinationChannel) {
    await message.channel.send(buildExecutionFailedPayload('Choisissez un salon vocal valide ou connectez-vous dans un vocal.'));
    return;
  }

  const voiceMembers = [...message.guild.voiceStates.cache.values()]
    .map((voiceState) => voiceState.member)
    .filter((member) => member && !member.user.bot && member.voice?.channelId && member.voice.channelId !== destinationChannel.id);

  const moved = await moveMembersToChannel(voiceMembers.values(), destinationChannel, `BringAll par ${message.author.tag}`);
  await message.channel.send(
    buildNoticePayload({
      title: '# BringAll',
      body: `> Destination: <#${destinationChannel.id}>\n> Membres deplaces: \`${moved.success}\`\n> Echecs: \`${moved.failed}\``
    })
  );
}

async function runVoiceMoveCommand(message, args, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const resolved = await resolveVoiceMoveChannels(message, args);
  if (!resolved) {
    await message.channel.send(buildExecutionFailedPayload('Format: +voicemove <salon depart> <salon arrivee> ou +voicemove <salon arrivee> en etant dans le salon depart.'));
    return;
  }

  if (resolved.source.id === resolved.target.id) {
    await message.channel.send(buildExecutionFailedPayload('Le salon de depart et d arrivee doivent etre differents.'));
    return;
  }

  const members = resolved.source.members.filter((member) => !member.user.bot);
  const moved = await moveMembersToChannel(members.values(), resolved.target, `VoiceMove par ${message.author.tag}`);

  await message.channel.send(
    buildNoticePayload({
      title: '# VoiceMove',
      body:
        `> Depart: <#${resolved.source.id}>\n` +
        `> Arrivee: <#${resolved.target.id}>\n` +
        `> Membres deplaces: \`${moved.success}\`\n` +
        `> Echecs: \`${moved.failed}\``
    })
  );
}

async function runWhitelistCommand(message, args, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const userId = extractSnowflake(args[0]);
  if (!userId) {
    await message.channel.send(buildExecutionFailedPayload('Format: +wl <@membre/ID>.'));
    return;
  }

  const before = context.accessStore.getGuildWhitelistUserIds(message.guild.id);
  const after = context.accessStore.addGuildWhitelistUser(message.guild.id, userId);
  const alreadyWhitelisted = before.includes(String(userId));

  await message.channel.send(
    buildNoticePayload({
      title: '# Whitelist',
      body:
        `> ${alreadyWhitelisted ? 'Deja whitelist' : 'Ajoute a la whitelist'}: <@${userId}>\n` +
        `> Total: \`${after.length}\``
    })
  );
}

async function runSnipeCommand(message, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const snipe = getChannelSnipe(message.channel.id);
  if (!snipe || String(snipe.guildId) !== String(message.guild.id)) {
    await message.channel.send(buildExecutionFailedPayload('Aucun message supprime a afficher dans ce salon.'));
    return;
  }

  const attachmentLines = snipe.attachments.length
    ? snipe.attachments.map((attachment, index) => `> Fichier ${index + 1}: [${attachment.name || 'fichier'}](${attachment.url})`)
    : [];

  const container = new ContainerBuilder()
    .addTextDisplayComponents((text) => text.setContent('## Snipe'))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent(
        `> Auteur: ${snipe.authorId ? `<@${snipe.authorId}>` : '`inconnu`'}\n` +
          `> Supprime le: \`${formatDate(snipe.deletedAt)}\``
      )
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent(snipe.content ? `> Message:\n${truncate(snipe.content, 1500)}` : '> Message: `aucun texte`')
    );

  if (attachmentLines.length > 0) {
    container
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) => text.setContent(attachmentLines.join('\n')));
  }

  const firstImage = snipe.attachments.find((attachment) => String(attachment.contentType || '').startsWith('image/'));
  if (firstImage?.url) {
    container
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(firstImage.url))
      );
  }

  await message.channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false }
  });
}

function canUseOwnerTools(message, context) {
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

async function resolveWarnTargets(message, args) {
  const ids = [];
  let firstReasonIndex = args.length;

  for (let index = 0; index < args.length; index += 1) {
    const id = extractSnowflake(args[index]);
    if (!id) {
      firstReasonIndex = index;
      break;
    }
    ids.push(id);
  }

  if (ids.length > 0) {
    const members = [];
    for (const id of [...new Set(ids)]) {
      const member = await message.guild.members.fetch(id).catch(() => null);
      if (member) members.push(member);
    }

    return {
      members,
      reason: args.slice(firstReasonIndex).join(' ').trim() || 'Aucune raison'
    };
  }

  const member = await resolveMember(message.guild, String(args[0] || '').trim());
  return {
    members: member ? [member] : [],
    reason: args.slice(1).join(' ').trim() || 'Aucune raison'
  };
}

function reserveWarnQuota(message, count) {
  cleanWarnWindows();
  const key = `${message.guild.id}:${message.author.id}`;
  const timestamps = warnWindows.get(key) || [];
  if (timestamps.length + count > MAX_WARNS_PER_WINDOW) {
    return 'Limite atteinte: 5 warn(s) maximum par heure.';
  }

  const now = Date.now();
  for (let index = 0; index < count; index += 1) {
    timestamps.push(now);
  }
  warnWindows.set(key, timestamps);
  return '';
}

function cleanWarnWindows() {
  const threshold = Date.now() - WARN_WINDOW_MS;
  for (const [key, timestamps] of warnWindows.entries()) {
    const filtered = timestamps.filter((timestamp) => timestamp > threshold);
    if (filtered.length === 0) {
      warnWindows.delete(key);
    } else {
      warnWindows.set(key, filtered);
    }
  }
}

async function resolveTextChannel(message, args) {
  const rawInput = (Array.isArray(args) ? args.join(' ') : '').trim();
  if (!rawInput) return message.channel;

  const channelId = extractSnowflake(rawInput);
  if (channelId) {
    const channel = message.guild.channels.cache.get(channelId) || (await message.guild.channels.fetch(channelId).catch(() => null));
    return channel && isTextLikeChannel(channel) ? channel : null;
  }

  const byName = message.guild.channels.cache.find(
    (channel) => isTextLikeChannel(channel) && String(channel.name || '').toLowerCase() === rawInput.replace(/^#/, '').toLowerCase()
  );
  return byName || null;
}

function resolveRolesFromArgs(guild, args) {
  const ids = [...new Set((Array.isArray(args) ? args : []).map((arg) => extractSnowflake(arg)).filter(Boolean))];
  if (ids.length > 0) {
    return ids
      .map((id) => guild.roles.cache.get(id) || null)
      .filter(Boolean);
  }

  const rawInput = (Array.isArray(args) ? args.join(' ') : '').trim();
  const fallback = rawInput ? resolveRole(guild, rawInput) : null;
  return fallback ? [fallback] : [];
}

function parseSlowmodeSeconds(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (raw === 'off' || raw === '0') return 0;

  const durationMs = parseDurationToMs(raw);
  if (!durationMs) return null;
  return Math.floor(durationMs / 1000);
}

async function resolveVoiceChannel(message, args) {
  const rawInput = (Array.isArray(args) ? args.join(' ') : '').trim();
  if (!rawInput) {
    return message.member?.voice?.channel || null;
  }

  return resolveVoiceChannelFromInput(message.guild, rawInput);
}

async function resolveVoiceMoveChannels(message, args) {
  const mentionedVoiceChannels = message.mentions.channels.filter((channel) => isVoiceChannel(channel));
  if (mentionedVoiceChannels.size >= 2) {
    const channels = [...mentionedVoiceChannels.values()];
    return { source: channels[0], target: channels[1] };
  }

  if (args.length === 1) {
    const source = message.member?.voice?.channel || null;
    const target = await resolveVoiceChannelFromInput(message.guild, args[0]);
    if (source && target) {
      return { source, target };
    }
  }

  const idTargets = [...new Set(args.map((arg) => extractSnowflake(arg)).filter(Boolean))];
  if (idTargets.length >= 2) {
    const source = await resolveVoiceChannelFromInput(message.guild, idTargets[0]);
    const target = await resolveVoiceChannelFromInput(message.guild, idTargets[1]);
    if (source && target) {
      return { source, target };
    }
  }

  return null;
}

async function resolveVoiceChannelFromInput(guild, rawInput) {
  const channelId = extractSnowflake(rawInput);
  if (channelId) {
    const channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
    return channel && isVoiceChannel(channel) ? channel : null;
  }

  const normalized = String(rawInput || '').trim().toLowerCase().replace(/^#/, '');
  return guild.channels.cache.find((channel) => isVoiceChannel(channel) && String(channel.name || '').toLowerCase() === normalized) || null;
}

async function moveMembersToChannel(members, destinationChannel, reason) {
  let success = 0;
  let failed = 0;

  for (const member of members) {
    // eslint-disable-next-line no-await-in-loop
    const moved = await member.voice.setChannel(destinationChannel, reason).then(() => true).catch(() => false);
    if (moved) {
      success += 1;
    } else {
      failed += 1;
    }
  }

  return { success, failed };
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

function isTextLikeChannel(channel) {
  return [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum
  ].includes(channel?.type);
}

function isVoiceChannel(channel) {
  return [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel?.type);
}

function truncate(value, maxLength) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text || 'Aucune raison';
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatDate(value) {
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatSeconds(seconds) {
  if (seconds === 0) return 'off';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (secs && !hours) parts.push(`${secs}s`);
  return parts.join(' ');
}

module.exports = {
  runWarnCommand,
  runSanctionsCommand,
  runDelSanctionCommand,
  runClearSanctionsCommand,
  runClearAllSanctionsCommand,
  runPicOnlyCommand,
  runDelPermCommand,
  runClearPermsCommand,
  runSlowmodeCommand,
  runBringAllCommand,
  runVoiceMoveCommand,
  runWhitelistCommand,
  runSnipeCommand
};
