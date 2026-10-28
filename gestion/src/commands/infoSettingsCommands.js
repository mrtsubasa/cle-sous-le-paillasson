const { randomUUID } = require('node:crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  RoleSelectMenuBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { buildExecutionFailedPayload, buildNoticePayload } = require('../utils/components');
const { createImageComponent, hasAdministrator, resolveMember, resolveRole, splitLines } = require('../utils/discordTools');
const { syncSupportRoleForGuild } = require('../services/automationService');

const ROLE_MEMBERS_PAGE_SIZE = 30;
const ROLE_MEMBERS_TTL_MS = 5 * 60 * 1000;
const SUPPORT_PANEL_TTL_MS = 10 * 60 * 1000;
const roleMembersSessions = new Map();
const supportSessions = new Map();

async function runJoinSettingsCommand(message, args, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const action = String(args[0] || '').trim().toLowerCase();
  if (!action) {
    await message.channel.send(buildJoinSettingsPayload(context.accessStore.getGuildJoinSettings(message.guild.id)));
    return;
  }

  if (action === 'on' || action === 'off') {
    const settings = context.accessStore.setGuildJoinSettings(message.guild.id, { enabled: action === 'on' });
    await message.channel.send(buildJoinSettingsPayload(settings));
    await context.logger.log(
      message.guild,
      '# JoinSettings',
      `> Action: ${action}\n> Auteur: <@${message.author.id}>`
    );
    return;
  }

  if (action === 'channel') {
    const channelId = String(args[1] || '').match(/\d{15,20}/)?.[0] || '';
    const channel = channelId
      ? message.guild.channels.cache.get(channelId) || (await message.guild.channels.fetch(channelId).catch(() => null))
      : null;

    if (!channel || !channel.isTextBased()) {
      await message.channel.send(buildExecutionFailedPayload('Salon invalide. Utilisez une mention ou un ID de salon texte.'));
      return;
    }

    const settings = context.accessStore.setGuildJoinSettings(message.guild.id, { channelId: channel.id });
    await message.channel.send(buildJoinSettingsPayload(settings));
    await context.logger.log(
      message.guild,
      '# JoinSettings',
      `> Action: channel\n> Salon: <#${channel.id}>\n> Auteur: <@${message.author.id}>`
    );
    return;
  }

  if (action === 'message') {
    const content = args.slice(1).join(' ').trim();
    if (!content) {
      await message.channel.send(buildExecutionFailedPayload('Format: +joinsettings message <texte>.'));
      return;
    }

    const settings = context.accessStore.setGuildJoinSettings(message.guild.id, { message: content });
    await message.channel.send(buildJoinSettingsPayload(settings));
    await context.logger.log(
      message.guild,
      '# JoinSettings',
      `> Action: message\n> Auteur: <@${message.author.id}>`
    );
    return;
  }

  await message.channel.send(buildExecutionFailedPayload('Options: `on`, `off`, `channel <#salon>`, `message <texte>`.'));
}

async function runBadWordsCommand(message, args, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const action = String(args[0] || '').trim().toLowerCase();
  if (!action) {
    await message.channel.send(buildBadWordsPayload(context.accessStore.getGuildBadWordsSettings(message.guild.id)));
    return;
  }

  if (action === 'on' || action === 'off') {
    const settings = context.accessStore.setGuildBadWordsSettings(message.guild.id, { enabled: action === 'on' });
    await message.channel.send(buildBadWordsPayload(settings));
    await context.logger.log(
      message.guild,
      '# BadWords',
      `> Action: ${action}\n> Auteur: <@${message.author.id}>`
    );
    return;
  }

  if (action === 'add') {
    const word = args.slice(1).join(' ').trim();
    if (!word) {
      await message.channel.send(buildExecutionFailedPayload('Format: +badwords add <mot>.'));
      return;
    }

    const settings = context.accessStore.addGuildBadWord(message.guild.id, word);
    await message.channel.send(buildBadWordsPayload(settings));
    await context.logger.log(
      message.guild,
      '# BadWords',
      `> Action: add\n> Mot: \`${word}\`\n> Auteur: <@${message.author.id}>`
    );
    return;
  }

  if (action === 'del' || action === 'delete' || action === 'remove') {
    const word = args.slice(1).join(' ').trim();
    if (!word) {
      await message.channel.send(buildExecutionFailedPayload('Format: +badwords del <mot>.'));
      return;
    }

    const settings = context.accessStore.deleteGuildBadWord(message.guild.id, word);
    await message.channel.send(buildBadWordsPayload(settings));
    await context.logger.log(
      message.guild,
      '# BadWords',
      `> Action: del\n> Mot: \`${word}\`\n> Auteur: <@${message.author.id}>`
    );
    return;
  }

  if (action === 'list') {
    const settings = context.accessStore.getGuildBadWordsSettings(message.guild.id);
    const lines = settings.words.map((word) => `> \`${word}\``);
    await sendListPayload(
      message.channel,
      '# BadWords',
      `> Statut: \`${settings.enabled ? 'on' : 'off'}\`\n> Total: \`${settings.words.length}\``,
      lines,
      '> Aucun mot interdit configure.'
    );
    return;
  }

  if (action === 'clear') {
    const settings = context.accessStore.clearGuildBadWords(message.guild.id);
    await message.channel.send(buildBadWordsPayload(settings));
    await context.logger.log(
      message.guild,
      '# BadWords',
      `> Action: clear\n> Auteur: <@${message.author.id}>`
    );
    return;
  }

  await message.channel.send(buildExecutionFailedPayload('Options: `on`, `off`, `add`, `del`, `list`, `clear`.'));
}

async function runPicCommand(message, args, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const rawTarget = args.join(' ').trim();
  if (isServerAlias(rawTarget)) {
    const url = message.guild.iconURL({ size: 1024, extension: 'png' });
    if (!url) {
      await message.channel.send(buildExecutionFailedPayload('Ce serveur n a pas de photo de profil.'));
      return;
    }

    await message.channel.send(
      buildImagePayload({
        title: '# Pic Serveur',
        body: `> Serveur: **${message.guild.name}**\n> ID: \`${message.guild.id}\``,
        imageUrl: url
      })
    );
    return;
  }

  const targetMember = rawTarget ? await resolveMember(message.guild, rawTarget) : message.member;
  if (!targetMember) {
    await message.channel.send(buildExecutionFailedPayload('Membre introuvable.'));
    return;
  }

  const url = targetMember.user.displayAvatarURL({ size: 1024, extension: 'png' });
  await message.channel.send(
    buildImagePayload({
      title: '# Pic',
      body: `> Membre: <@${targetMember.id}>\n> ID: \`${targetMember.id}\``,
      imageUrl: url
    })
  );
}

async function runBannerCommand(message, args, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const rawTarget = args.join(' ').trim();
  if (isServerAlias(rawTarget)) {
    const url = message.guild.bannerURL({ size: 1024, extension: 'png' });
    if (!url) {
      await message.channel.send(buildExecutionFailedPayload('Ce serveur n a pas de banniere.'));
      return;
    }

    await message.channel.send(
      buildImagePayload({
        title: '# Banner Serveur',
        body: `> Serveur: **${message.guild.name}**\n> ID: \`${message.guild.id}\``,
        imageUrl: url
      })
    );
    return;
  }

  const targetMember = rawTarget ? await resolveMember(message.guild, rawTarget) : message.member;
  if (!targetMember) {
    await message.channel.send(buildExecutionFailedPayload('Membre introuvable.'));
    return;
  }

  const user = await context.client.users.fetch(targetMember.id, { force: true }).catch(() => null);
  const url = user?.bannerURL({ size: 1024, extension: 'png' }) || '';
  if (!url) {
    await message.channel.send(buildExecutionFailedPayload('Ce membre n a pas de banniere.'));
    return;
  }

  await message.channel.send(
    buildImagePayload({
      title: '# Banner',
      body: `> Membre: <@${targetMember.id}>\n> ID: \`${targetMember.id}\``,
      imageUrl: url
    })
  );
}

async function runSoutienCommand(message, args, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const action = String(args[0] || '').trim().toLowerCase();
  if (!action) {
    const settings = context.accessStore.getGuildSupportSettings(message.guild.id);
    const sessionId = randomUUID();
    const session = {
      id: sessionId,
      ownerId: String(message.author.id),
      guildId: String(message.guild.id),
      channelId: String(message.channel.id),
      messageId: 'pending',
      expiresAt: Date.now() + SUPPORT_PANEL_TTL_MS
    };

    supportSessions.set(sessionId, session);

    const sent = await message.channel.send(
      buildSupportPanelPayload({
        sessionId,
        settings,
        disabled: false
      })
    );

    session.messageId = sent.id;
    scheduleSupportPanelExpiration(context, sessionId);
    return;
  }

  if (action === 'on' || action === 'off') {
    const settings = context.accessStore.setGuildSupportSettings(message.guild.id, { enabled: action === 'on' });
    await syncSupportRoleForGuild(message.guild, context).catch(() => null);
    await message.channel.send(buildSupportPayload(settings));
    return;
  }

  if (action === 'role') {
    const role = resolveRole(message.guild, args.slice(1).join(' '));
    if (!role) {
      await message.channel.send(buildExecutionFailedPayload('Role introuvable.'));
      return;
    }

    const settings = context.accessStore.setGuildSupportSettings(message.guild.id, { roleId: role.id });
    await syncSupportRoleForGuild(message.guild, context).catch(() => null);
    await message.channel.send(buildSupportPayload(settings));
    return;
  }

  if (action === 'text') {
    const matchText = args.slice(1).join(' ').trim();
    if (!matchText) {
      await message.channel.send(buildExecutionFailedPayload('Format: +soutien text <texte>.'));
      return;
    }

    const settings = context.accessStore.setGuildSupportSettings(message.guild.id, { matchText });
    await syncSupportRoleForGuild(message.guild, context).catch(() => null);
    await message.channel.send(buildSupportPayload(settings));
    return;
  }

  if (action === 'source') {
    const source = String(args[1] || '').trim().toLowerCase();
    const normalized = source === 'guild' ? 'activity' : source;
    if (!['status', 'activity', 'both'].includes(normalized)) {
      await message.channel.send(buildExecutionFailedPayload('Source invalide. Utilisez `status`, `activity` ou `both`. `guild` fonctionne aussi comme alias.'));
      return;
    }

    const settings = context.accessStore.setGuildSupportSettings(message.guild.id, { source: normalized });
    await syncSupportRoleForGuild(message.guild, context).catch(() => null);
    await message.channel.send(buildSupportPayload(settings));
    return;
  }

  if (action === 'sync') {
    await syncSupportRoleForGuild(message.guild, context).catch(() => null);
    await message.channel.send(buildSupportPayload(context.accessStore.getGuildSupportSettings(message.guild.id)));
    return;
  }

  await message.channel.send(buildExecutionFailedPayload('Options: `on`, `off`, `role <role>`, `text <texte>`, `source <status|activity|both>`, `sync`.'));
}

async function runAllBotsCommand(message, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  await message.guild.members.fetch().catch(() => null);
  const bots = message.guild.members.cache
    .filter((member) => member.user.bot)
    .sort((a, b) => a.user.username.localeCompare(b.user.username));

  const lines = bots.map((member) => `> <@${member.id}> - \`${member.user.tag || member.user.username}\``);
  await sendListPayload(
    message.channel,
    '# AllBots',
    `> Bots detectes: \`${bots.size}\``,
    lines,
    '> Aucun bot sur ce serveur.'
  );
}

async function runAllAdminsCommand(message, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  await message.guild.members.fetch().catch(() => null);
  const admins = message.guild.members.cache
    .filter((member) => !member.user.bot && hasAdministrator(member))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const lines = admins.map((member) => `> <@${member.id}> - \`${member.displayName}\``);
  await sendListPayload(
    message.channel,
    '# AllAdmins',
    `> Admins humains detectes: \`${admins.size}\``,
    lines,
    '> Aucun admin humain detecte.'
  );
}

async function runBotAdminsCommand(message, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  await message.guild.members.fetch().catch(() => null);
  const bots = message.guild.members.cache
    .filter((member) => member.user.bot && hasAdministrator(member))
    .sort((a, b) => a.user.username.localeCompare(b.user.username));

  const lines = bots.map((member) => `> <@${member.id}> - \`${member.user.tag || member.user.username}\``);
  await sendListPayload(
    message.channel,
    '# BotAdmins',
    `> Bots admins detectes: \`${bots.size}\``,
    lines,
    '> Aucun bot admin detecte.'
  );
}

async function runRoleMembersCommand(message, args, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  const role = resolveRole(message.guild, args.join(' '));
  if (!role) {
    await message.channel.send(buildExecutionFailedPayload('Format: +rolemembers <role>.'));
    return;
  }

  await message.guild.members.fetch().catch(() => null);
  const members = role.members.sort((a, b) => a.displayName.localeCompare(b.displayName));
  const lines = members.map((member) => `> <@${member.id}> - \`${member.displayName}\`${member.user.bot ? ' [BOT]' : ''}`);

  if (members.size <= ROLE_MEMBERS_PAGE_SIZE) {
    await sendListPayload(
      message.channel,
      '# RoleMembers',
      `> Role: <@&${role.id}>\n> Membres: \`${members.size}\``,
      lines,
      '> Aucun membre avec ce role.'
    );
    return;
  }

  const sessionId = randomUUID();
  const session = {
    id: sessionId,
    ownerId: String(message.author.id),
    guildId: String(message.guild.id),
    channelId: String(message.channel.id),
    messageId: 'pending',
    roleId: String(role.id),
    roleName: role.name,
    page: 0,
    pages: chunkRoleMemberLines(lines),
    totalMembers: members.size,
    expiresAt: Date.now() + ROLE_MEMBERS_TTL_MS
  };

  roleMembersSessions.set(sessionId, session);

  const sent = await message.channel.send(buildRoleMembersPagePayload(session, false));
  session.messageId = sent.id;

  scheduleRoleMembersExpiration(context, sessionId);
}

async function runServerInfoCommand(message, context) {
  if (!canUseOwnerTools(message, context)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys ou aux acces configures.'));
    return;
  }

  await message.guild.members.fetch().catch(() => null);
  await message.guild.channels.fetch().catch(() => null);

  const owner = await message.guild.fetchOwner().catch(() => null);
  const humans = message.guild.members.cache.filter((member) => !member.user.bot).size;
  const bots = message.guild.members.cache.filter((member) => member.user.bot).size;
  const textChannels = message.guild.channels.cache.filter((channel) =>
    [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum].includes(channel.type)
  ).size;
  const voiceChannels = message.guild.channels.cache.filter((channel) =>
    [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)
  ).size;
  const categories = message.guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildCategory).size;

  const container = new ContainerBuilder()
    .addTextDisplayComponents((text) => text.setContent('## ServerInfo'))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent(
        `> Nom: **${message.guild.name}**\n` +
          `> ID: \`${message.guild.id}\`\n` +
          `> Owner: ${owner ? `<@${owner.id}>` : '`inconnu`'}\n` +
          `> Cree le: \`${formatDate(message.guild.createdAt)}\``
      )
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent(
        `> Membres: \`${message.guild.memberCount}\`\n` +
          `> Humains: \`${humans}\`\n` +
          `> Bots: \`${bots}\`\n` +
          `> Roles: \`${message.guild.roles.cache.size}\``
      )
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent(
        `> Salons texte: \`${textChannels}\`\n` +
          `> Salons vocaux: \`${voiceChannels}\`\n` +
          `> Categories: \`${categories}\`\n` +
          `> Niveau boost: \`${message.guild.premiumTier}\`\n` +
          `> Boosts: \`${message.guild.premiumSubscriptionCount || 0}\``
      )
    );

  const bannerUrl = message.guild.bannerURL({ size: 1024, extension: 'png' });
  if (bannerUrl) {
    container.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
    container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(bannerUrl)));
  }

  await message.channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false }
  });
}

function buildJoinSettingsPayload(settings) {
  return buildNoticePayload({
    title: '# JoinSettings',
    body:
      `> Statut: \`${settings.enabled ? 'on' : 'off'}\`\n` +
      `> Salon: ${settings.channelId ? `<#${settings.channelId}>` : '`aucun`'}\n` +
      `> Message:\n${settings.message}\n` +
      '> Variables: utilisez `+helpmessage` pour voir toutes les variables.'
  });
}

function buildBadWordsPayload(settings) {
  const previewWords = settings.words.slice(0, 10);
  const words = previewWords.length ? previewWords.map((word) => `\`${word}\``).join(', ') : '`aucun mot`';
  const moreLine = settings.words.length > previewWords.length ? `\n> Et plus: \`${settings.words.length - previewWords.length}\` autre(s)` : '';
  return buildNoticePayload({
    title: '# BadWords',
    body: `> Statut: \`${settings.enabled ? 'on' : 'off'}\`\n> Total: \`${settings.words.length}\`\n> Apercu: ${words}${moreLine}`
  });
}

function buildSupportPayload(settings) {
  const sourceLabel = settings.source === 'activity' ? 'activity/guild' : settings.source;
  return buildNoticePayload({
    title: '# Soutien',
    body:
      `> Statut: \`${settings.enabled ? 'on' : 'off'}\`\n` +
      `> Role: ${settings.roleId ? `<@&${settings.roleId}>` : '`aucun`'}\n` +
      `> Texte recherche: ${settings.matchText ? `\`${settings.matchText}\`` : '`aucun`'}\n` +
      `> Source: \`${sourceLabel}\``
  });
}

function buildImagePayload({ title, body, imageUrl }) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents((text) => text.setContent(title))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(body));

  const media = createImageComponent(imageUrl);
  if (media) {
    container.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
    container.addMediaGalleryComponents(media);
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false }
  };
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
    const container = new ContainerBuilder()
      .addTextDisplayComponents((text) => text.setContent(title))
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) =>
        text.setContent(index === 0 ? intro : `> Suite ${index + 1}/${chunks.length}`)
      )
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) => text.setContent(chunks[index].join('\n')));

    // eslint-disable-next-line no-await-in-loop
    await channel.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [], repliedUser: false }
    });
  }
}

async function handleInfoSettingsInteraction(interaction, context) {
  if (interaction.isButton() && interaction.customId.startsWith('rolemembers:page:')) {
    const [, , sessionId, direction] = interaction.customId.split(':');
    const session = getRoleMembersSession(sessionId);

    if (!session) {
      await interaction.reply({
        ...buildNoticePayload({
          title: '# Session expiree',
          body: '> Le panneau `+rolemembers` a expire. Relancez la commande.'
        }),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      }).catch(() => null);
      return true;
    }

    if (String(session.ownerId) !== String(interaction.user.id)) {
      await interaction.reply({
        ...buildNoticePayload({
          title: '# Action refusee',
          body: '> Seul l\'auteur de `+rolemembers` peut changer de page.'
        }),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      }).catch(() => null);
      return true;
    }

    session.expiresAt = Date.now() + ROLE_MEMBERS_TTL_MS;
    if (direction === 'left') session.page = Math.max(0, session.page - 1);
    if (direction === 'right') session.page = Math.min(session.pages.length - 1, session.page + 1);

    await interaction.update(stripUpdateFlags(buildRoleMembersPagePayload(session, false))).catch(() => null);
    return true;
  }

  if (
    (interaction.isStringSelectMenu() || interaction.isRoleSelectMenu() || interaction.isButton()) &&
    interaction.customId.startsWith('soutien:panel:')
  ) {
    const [, , sessionId, action] = interaction.customId.split(':');
    const session = getSupportSession(sessionId);

    if (!session) {
      await interaction.reply({
        ...buildNoticePayload({
          title: '# Session expiree',
          body: '> Le panneau `+soutien` a expire. Relancez la commande.'
        }),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      }).catch(() => null);
      return true;
    }

    if (String(session.ownerId) !== String(interaction.user.id)) {
      await interaction.reply({
        ...buildNoticePayload({
          title: '# Action refusee',
          body: '> Seul l\'auteur de `+soutien` peut modifier ce panneau.'
        }),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      }).catch(() => null);
      return true;
    }

    session.expiresAt = Date.now() + SUPPORT_PANEL_TTL_MS;

    if (action === 'toggle' && interaction.isStringSelectMenu()) {
      const selected = String(interaction.values[0] || '').trim().toLowerCase();
      if (selected === 'sync') {
        await syncSupportRoleForGuild(interaction.guild, context).catch(() => null);
      } else {
        context.accessStore.setGuildSupportSettings(interaction.guild.id, { enabled: selected === 'on' });
        await syncSupportRoleForGuild(interaction.guild, context).catch(() => null);
      }

      const settings = context.accessStore.getGuildSupportSettings(interaction.guild.id);
      await interaction.update(stripUpdateFlags(buildSupportPanelPayload({ sessionId, settings, disabled: false }))).catch(() => null);
      return true;
    }

    if (action === 'role' && interaction.isRoleSelectMenu()) {
      const roleId = interaction.values[0] || null;
      context.accessStore.setGuildSupportSettings(interaction.guild.id, { roleId });
      await syncSupportRoleForGuild(interaction.guild, context).catch(() => null);
      const settings = context.accessStore.getGuildSupportSettings(interaction.guild.id);
      await interaction.update(stripUpdateFlags(buildSupportPanelPayload({ sessionId, settings, disabled: false }))).catch(() => null);
      return true;
    }

    if (action === 'source' && interaction.isStringSelectMenu()) {
      const source = String(interaction.values[0] || 'status').trim().toLowerCase();
      context.accessStore.setGuildSupportSettings(interaction.guild.id, { source });
      await syncSupportRoleForGuild(interaction.guild, context).catch(() => null);
      const settings = context.accessStore.getGuildSupportSettings(interaction.guild.id);
      await interaction.update(stripUpdateFlags(buildSupportPanelPayload({ sessionId, settings, disabled: false }))).catch(() => null);
      return true;
    }

    if (action === 'text' && interaction.isButton()) {
      const settings = context.accessStore.getGuildSupportSettings(interaction.guild.id);
      await interaction.showModal(buildSupportTextModal(sessionId, settings.matchText || ''));
      return true;
    }

    if (action === 'refresh' && interaction.isButton()) {
      const settings = context.accessStore.getGuildSupportSettings(interaction.guild.id);
      await interaction.update(stripUpdateFlags(buildSupportPanelPayload({ sessionId, settings, disabled: false }))).catch(() => null);
      return true;
    }
  }

  return false;
}

async function handleInfoSettingsModal(interaction, context) {
  if (!interaction.customId.startsWith('soutien:modal:')) return false;

  const [, , sessionId, action] = interaction.customId.split(':');
  if (action !== 'text') return false;

  const session = getSupportSession(sessionId);
  if (!session) {
    await interaction.reply({
      ...buildNoticePayload({
        title: '# Session expiree',
        body: '> Le panneau `+soutien` a expire. Relancez la commande.'
      }),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    }).catch(() => null);
    return true;
  }

  if (String(session.ownerId) !== String(interaction.user.id)) {
    await interaction.reply({
      ...buildNoticePayload({
        title: '# Action refusee',
        body: '> Seul l\'auteur de `+soutien` peut modifier ce panneau.'
      }),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    }).catch(() => null);
    return true;
  }

  const matchText = interaction.fields.getTextInputValue('matchText').trim();
  context.accessStore.setGuildSupportSettings(interaction.guild.id, { matchText });
  await syncSupportRoleForGuild(interaction.guild, context).catch(() => null);
  session.expiresAt = Date.now() + SUPPORT_PANEL_TTL_MS;

  await interaction.reply({
    ...buildNoticePayload({
      title: '# Soutien',
      body: `> Texte de recherche mis a jour sur \`${matchText || 'aucun'}\`.`
    }),
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
  }).catch(() => null);

  try {
    const settings = context.accessStore.getGuildSupportSettings(interaction.guild.id);
    const channel = await context.client.channels.fetch(session.channelId);
    if (channel?.isTextBased()) {
      const panelMessage = await channel.messages.fetch(session.messageId);
      await panelMessage.edit(stripUpdateFlags(buildSupportPanelPayload({ sessionId, settings, disabled: false })));
    }
  } catch {
    // Ignore edit failure if panel is gone.
  }

  return true;
}

function buildRoleMembersPagePayload(session, disabled) {
  const currentPage = Math.max(0, Math.min(session.page || 0, session.pages.length - 1));
  const totalPages = session.pages.length;

  const container = new ContainerBuilder()
    .addTextDisplayComponents((text) => text.setContent('## RoleMembers'))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent(
        `> Role: <@&${session.roleId}>\n> Membres: \`${session.totalMembers}\`\n> Page: \`${currentPage + 1}/${totalPages}\``
      )
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(session.pages[currentPage].join('\n')))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents((row) =>
      row.setComponents(
        new ButtonBuilder()
          .setCustomId(`rolemembers:page:${session.id}:left`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel('Precedent')
          .setDisabled(disabled || currentPage === 0),
        new ButtonBuilder()
          .setCustomId(`rolemembers:page:${session.id}:right`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel('Suivant')
          .setDisabled(disabled || currentPage >= totalPages - 1)
      )
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false }
  };
}

function chunkRoleMemberLines(lines) {
  const source = Array.isArray(lines) ? lines : [];
  const pages = [];
  for (let index = 0; index < source.length; index += ROLE_MEMBERS_PAGE_SIZE) {
    pages.push(source.slice(index, index + ROLE_MEMBERS_PAGE_SIZE));
  }
  return pages.length ? pages : [['> Aucun membre avec ce role.']];
}

function getRoleMembersSession(sessionId) {
  const session = roleMembersSessions.get(String(sessionId)) || null;
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    roleMembersSessions.delete(String(sessionId));
    return null;
  }
  return session;
}

function scheduleRoleMembersExpiration(context, sessionId) {
  const session = roleMembersSessions.get(String(sessionId));
  if (!session) return;

  const delayMs = Math.max(5_000, session.expiresAt - Date.now() + 500);
  setTimeout(async () => {
    const current = roleMembersSessions.get(String(sessionId));
    if (!current) return;
    if (Date.now() < current.expiresAt) {
      scheduleRoleMembersExpiration(context, sessionId);
      return;
    }

    const session = getRoleMembersSession(sessionId);
    if (!session) return;

    roleMembersSessions.delete(String(sessionId));

    try {
      const channel = await context.client.channels.fetch(session.channelId);
      if (!channel || !channel.isTextBased()) return;
      const message = await channel.messages.fetch(session.messageId);
      await message.edit(stripUpdateFlags(buildRoleMembersPagePayload(session, true)));
    } catch {
      // Ignore if panel disappeared.
    }
  }, delayMs).unref();
}

function getSupportSession(sessionId) {
  const session = supportSessions.get(String(sessionId)) || null;
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    supportSessions.delete(String(sessionId));
    return null;
  }
  return session;
}

function buildSupportPanelPayload({ sessionId, settings, disabled }) {
  const sourceLabel = settings.source === 'activity' ? 'activity/guild' : settings.source;

  const container = new ContainerBuilder()
    .addTextDisplayComponents((text) => text.setContent('## Soutien'))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent('> Choisissez ce que vous voulez configurer pour le role soutien.'))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent(
        `> Statut: \`${settings.enabled ? 'on' : 'off'}\`\n` +
          `> Role: ${settings.roleId ? `<@&${settings.roleId}>` : '`aucun`'}\n` +
          `> Texte: ${settings.matchText ? `\`${settings.matchText}\`` : '`aucun`'}\n` +
          `> Source: \`${sourceLabel}\``
      )
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents((row) =>
      row.setComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`soutien:panel:${sessionId}:toggle`)
          .setPlaceholder('Choisir une action')
          .setMinValues(1)
          .setMaxValues(1)
          .setDisabled(disabled)
          .addOptions(
            { label: 'Activer', value: 'on', default: settings.enabled === true },
            { label: 'Desactiver', value: 'off', default: settings.enabled !== true },
            { label: 'Synchroniser maintenant', value: 'sync' }
          )
      )
    )
    .addActionRowComponents((row) =>
      row.setComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(`soutien:panel:${sessionId}:role`)
          .setPlaceholder('Choisir le role soutien')
          .setMinValues(0)
          .setMaxValues(1)
          .setDefaultRoles(...(settings.roleId ? [settings.roleId] : []))
          .setDisabled(disabled)
      )
    )
    .addActionRowComponents((row) =>
      row.setComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`soutien:panel:${sessionId}:source`)
          .setPlaceholder('Choisir la source du texte')
          .setMinValues(1)
          .setMaxValues(1)
          .setDisabled(disabled)
          .addOptions(
            { label: 'Status custom', value: 'status', default: settings.source === 'status' },
            { label: 'Activity / Guild', value: 'activity', default: settings.source === 'activity' },
            { label: 'Les deux', value: 'both', default: settings.source === 'both' }
          )
      )
    )
    .addActionRowComponents((row) =>
      row.setComponents(
        new ButtonBuilder()
          .setCustomId(`soutien:panel:${sessionId}:text`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel('Configurer le texte')
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`soutien:panel:${sessionId}:refresh`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel('Actualiser')
          .setDisabled(disabled)
      )
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false }
  };
}

function buildSupportTextModal(sessionId, currentValue) {
  const input = new TextInputBuilder()
    .setCustomId('matchText')
    .setLabel('Texte a detecter')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  if (String(currentValue || '').trim()) {
    input.setValue(String(currentValue));
  }

  return new ModalBuilder()
    .setCustomId(`soutien:modal:${sessionId}:text`)
    .setTitle('Texte soutien')
    .addComponents(
      new ActionRowBuilder().addComponents(
        input
      )
    );
}

function scheduleSupportPanelExpiration(context, sessionId) {
  const session = supportSessions.get(String(sessionId));
  if (!session) return;

  const delayMs = Math.max(5_000, session.expiresAt - Date.now() + 500);
  setTimeout(async () => {
    const current = supportSessions.get(String(sessionId));
    if (!current) return;
    if (Date.now() < current.expiresAt) {
      scheduleSupportPanelExpiration(context, sessionId);
      return;
    }

    const session = getSupportSession(sessionId);
    if (!session) return;

    supportSessions.delete(String(sessionId));

    try {
      const channel = await context.client.channels.fetch(session.channelId);
      if (!channel || !channel.isTextBased()) return;
      const message = await channel.messages.fetch(session.messageId);
      const settings = context.accessStore.getGuildSupportSettings(session.guildId);
      await message.edit(stripUpdateFlags(buildSupportPanelPayload({ sessionId, settings, disabled: true })));
    } catch {
      // Ignore if panel disappeared.
    }
  }, delayMs).unref();
}

function stripUpdateFlags(payload) {
  return {
    components: payload.components,
    allowedMentions: payload.allowedMentions
  };
}

function canUseOwnerTools(message, context) {
  return context.accessStore.canUseAdminCommands(message.guild.id, message.author.id);
}

function isServerAlias(value) {
  const safeValue = String(value || '').trim().toLowerCase();
  return safeValue === 'server' || safeValue === 'serv';
}

function formatDate(value) {
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

module.exports = {
  runJoinSettingsCommand,
  runBadWordsCommand,
  runPicCommand,
  runBannerCommand,
  runSoutienCommand,
  runAllBotsCommand,
  runAllAdminsCommand,
  runBotAdminsCommand,
  runRoleMembersCommand,
  runServerInfoCommand,
  handleInfoSettingsInteraction,
  handleInfoSettingsModal,
  canUseOwnerTools,
};
