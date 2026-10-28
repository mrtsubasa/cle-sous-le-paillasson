const {
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  RoleSelectMenuBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder
} = require('discord.js');
const { buildNoticePayload } = require('../utils/components');
const { CONFIGURABLE_COMMANDS, COMMAND_DESCRIPTIONS } = require('../constants/commands');
const { getActualAccessState, getAssignableCommandsForMember } = require('../utils/access');

const PANEL_TTL_MS = 10 * 60 * 1000;
const PANEL_COMMAND_PAGE_SIZE = 25;

const CLEAR_MAX_OPTIONS = [5, 10, 15, 20, 25, 50, 100];
const BAN_RATE_OPTIONS = [1, 2, 3, 5, 10, 15, 20, 30];

async function runPanelCommand(message, context) {
  const session = context.sessionStore.createAdminPanelSession({
    ownerId: message.author.id,
    guildId: message.guild.id,
    channelId: message.channel.id,
    messageId: 'pending'
  });

  session.view = 'main';
  session.selectedPerm = null;
  session.commandPage = 0;
  session.assignedCommandPage = 0;

  const actorState = refreshPanelActorState(session, message.guild.id, message.member, message.author.id, context.accessStore);

  const payload = buildAdminPanelPayload({
    sessionId: session.id,
    guildId: message.guild.id,
    accessStore: context.accessStore,
    isSys: actorState.actualIsSys,
    disabled: false,
    view: session.view,
    selectedPerm: session.selectedPerm,
    commandPage: session.commandPage,
    assignedCommandPage: session.assignedCommandPage,
    assignableCommands: getSessionAssignableCommands(session)
  });

  const sent = await message.channel.send(payload);
  session.messageId = sent.id;

  scheduleAdminPanelExpiration(context, session.id);
}

async function handlePanelInteraction(interaction, context) {
  if (!interaction.customId.startsWith('admin:panel:')) return false;

  const parts = interaction.customId.split(':');
  const sessionId = parts[2];
  const action = parts[3];

  const session = context.sessionStore.getAdminPanelSession(sessionId);
  if (!session) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({
        ...buildNoticePayload({
          title: '# Session expiree',
          body: '> Ce panel a expire. Relancez `+panel`.'
        }),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      }).catch(() => null);
    }
    return true;
  }

  const canAdmin = context.accessStore && typeof context.accessStore.canUseAdminCommands === 'function'
    ? context.accessStore.canUseAdminCommands(session.guildId || interaction.guild.id, interaction.user.id)
    : false;

  if (String(interaction.user.id) !== String(session.ownerId) && !canAdmin) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({
        ...buildNoticePayload({
          title: '# Action refusee',
          body: "> Seul l'auteur de `+panel` ou un owner/buyer autorise peut interagir avec ce panneau."
        }),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      }).catch(() => null);
    }
    return true;
  }

  context.sessionStore.touchAdminPanelSession(sessionId);
  const actorState = refreshPanelActorState(session, interaction.guild.id, interaction.member, interaction.user.id, context.accessStore);
  const isSys = actorState.actualIsSys;

  if (action === 'logs' && interaction.isChannelSelectMenu()) {
    const selected = interaction.values[0] || null;
    context.accessStore.setGuildLogChannel(interaction.guild.id, selected);
    await context.logger.log(interaction.guild, '# Panel', `> Salon logs defini sur ${selected ? `<#${selected}>` : 'aucun'}.`);
    return updatePanelMessage(interaction, context, session, isSys);
  }

  if (action === 'clearmax' && interaction.isStringSelectMenu()) {
    const clearMax = Number.parseInt(interaction.values[0], 10);
    const limits = context.accessStore.setGuildModerationLimits(interaction.guild.id, { clearMax });
    await context.logger.log(interaction.guild, '# Panel', `> Limite clear definie sur ${limits.clearMax}.`);
    return updatePanelMessage(interaction, context, session, isSys);
  }

  if (action === 'banrate' && interaction.isStringSelectMenu()) {
    const banPerMinute = Number.parseInt(interaction.values[0], 10);
    const limits = context.accessStore.setGuildModerationLimits(interaction.guild.id, { banPerMinute });
    await context.logger.log(interaction.guild, '# Panel', `> Limite ban definie sur ${limits.banPerMinute}/minute.`);
    return updatePanelMessage(interaction, context, session, isSys);
  }

  if (action === 'muterole' && interaction.isRoleSelectMenu()) {
    const selectedRoleId = interaction.values[0] || null;
    context.accessStore.setGuildMuteSettings(interaction.guild.id, { roleId: selectedRoleId });
    await context.logger.log(interaction.guild, '# Panel', `> Role mute defini sur ${selectedRoleId ? `<@&${selectedRoleId}>` : 'aucun'}.`);
    return updatePanelMessage(interaction, context, session, isSys);
  }

  if (action === 'permselect' && interaction.isStringSelectMenu()) {
    const selectedPerm = String(interaction.values[0] || '').trim().toLowerCase();

    if (selectedPerm === 'owner' && !isSys) {
      await interaction.reply({
        ...buildNoticePayload({
          title: '# Action refusee',
          body: '> Seul le sys peut modifier la section owner.'
        }),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      }).catch(() => null);
      return true;
    }

    session.view = 'perm';
    session.selectedPerm = selectedPerm;
    session.commandPage = 0;
    session.assignedCommandPage = 0;
    return updatePanelMessage(interaction, context, session, isSys);
  }

  if (action === 'back') {
    session.view = 'main';
    session.selectedPerm = null;
    session.commandPage = 0;
    session.assignedCommandPage = 0;
    return updatePanelMessage(interaction, context, session, isSys);
  }

  if (action === 'roleset' && interaction.isRoleSelectMenu()) {
    const selectedPerm = String(session.selectedPerm || '');
    if (!selectedPerm || selectedPerm === 'owner' || selectedPerm === 'publique') {
      await interaction.deferUpdate().catch(() => null);
      return true;
    }

    const assignableCommandSet = new Set(getSessionAssignableCommands(session));
    const inaccessiblePermCommands = context.accessStore
      .getPermCommands(interaction.guild.id, selectedPerm)
      .filter((commandName) => !assignableCommandSet.has(commandName));
    if (inaccessiblePermCommands.length) {
      await interaction.reply({
        ...buildNoticePayload({
          title: '# Action refusee',
          body: '> Vous ne pouvez modifier que les permissions contenant des commandes auxquelles vous avez acces.'
        }),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      }).catch(() => null);
      return true;
    }

    context.accessStore.setPermRoles(interaction.guild.id, selectedPerm, interaction.values);
    await context.logger.log(interaction.guild, '# Panel', `> Roles de permission ${selectedPerm} mis a jour.`);
    return updatePanelMessage(interaction, context, session, isSys);
  }

  if (action === 'cmdset' && interaction.isStringSelectMenu()) {
    const selectedPerm = String(session.selectedPerm || '');
    if (!selectedPerm || selectedPerm === 'owner') {
      await interaction.deferUpdate().catch(() => null);
      return true;
    }

    const assignableCommands = getSessionAssignableCommands(session);
    const assignableCommandSet = new Set(assignableCommands);
    const commandPages = chunkCommands(assignableCommands, PANEL_COMMAND_PAGE_SIZE);
    const currentPage = clampPageIndex(session.commandPage || 0, commandPages.length);
    const currentChunk = commandPages[currentPage] || [];
    const selectedCommands = normalizeCommandValues(interaction.values);
    const invalidSelections = selectedCommands.filter((commandName) => !assignableCommandSet.has(commandName) || !currentChunk.includes(commandName));
    if (invalidSelections.length) {
      await interaction.reply({
        ...buildNoticePayload({
          title: '# Action refusee',
          body: '> Vous ne pouvez attribuer que les commandes auxquelles vous avez acces.'
        }),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      }).catch(() => null);
      return true;
    }

    const currentPermCommands = context.accessStore.getPermCommands(interaction.guild.id, selectedPerm);
    const nextCommands = [
      ...currentPermCommands.filter((commandName) => !currentChunk.includes(commandName)),
      ...selectedCommands
    ];

    context.accessStore.setPermCommands(interaction.guild.id, selectedPerm, nextCommands);
    await context.logger.log(interaction.guild, '# Panel', `> Commandes de permission ${selectedPerm} mises a jour (page ${currentPage + 1}).`);
    return updatePanelMessage(interaction, context, session, isSys);
  }

  if (action === 'cmdprev') {
    session.commandPage = Math.max(0, (session.commandPage || 0) - 1);
    return updatePanelMessage(interaction, context, session, isSys);
  }

  if (action === 'cmdnext') {
    const maxPage = chunkCommands(getSessionAssignableCommands(session), PANEL_COMMAND_PAGE_SIZE).length - 1;
    session.commandPage = Math.min(maxPage, (session.commandPage || 0) + 1);
    return updatePanelMessage(interaction, context, session, isSys);
  }

  if (action === 'cmdremove' && interaction.isStringSelectMenu()) {
    const selectedPerm = String(session.selectedPerm || '');
    if (!selectedPerm || selectedPerm === 'owner') {
      await interaction.deferUpdate().catch(() => null);
      return true;
    }

    const currentPermCommands = context.accessStore.getPermCommands(interaction.guild.id, selectedPerm);
    const removableCommands = new Set(currentPermCommands);
    const selectedCommands = normalizeCommandValues(interaction.values);
    const invalidSelections = selectedCommands.filter((commandName) => !removableCommands.has(commandName));
    if (invalidSelections.length) {
      await interaction.reply({
        ...buildNoticePayload({
          title: '# Action refusee',
          body: '> Une ou plusieurs commandes a retirer ne sont plus attribuees.'
        }),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      }).catch(() => null);
      return true;
    }

    const selectedCommandSet = new Set(selectedCommands);
    const nextCommands = currentPermCommands.filter((commandName) => !selectedCommandSet.has(commandName));
    context.accessStore.setPermCommands(interaction.guild.id, selectedPerm, nextCommands);
    session.assignedCommandPage = clampPageIndex(session.assignedCommandPage || 0, chunkCommands(nextCommands, PANEL_COMMAND_PAGE_SIZE).length);
    await context.logger.log(interaction.guild, '# Panel', `> Commandes retirees de la permission ${selectedPerm}.`);
    return updatePanelMessage(interaction, context, session, isSys);
  }

  if (action === 'cmdrmprev') {
    session.assignedCommandPage = Math.max(0, (session.assignedCommandPage || 0) - 1);
    return updatePanelMessage(interaction, context, session, isSys);
  }

  if (action === 'cmdrmnext') {
    const selectedPerm = String(session.selectedPerm || '');
    const maxPage = chunkCommands(context.accessStore.getPermCommands(interaction.guild.id, selectedPerm), PANEL_COMMAND_PAGE_SIZE).length - 1;
    session.assignedCommandPage = Math.min(maxPage, (session.assignedCommandPage || 0) + 1);
    return updatePanelMessage(interaction, context, session, isSys);
  }

  if (action === 'ownerset' && interaction.isUserSelectMenu()) {
    if (!isSys) {
      await interaction.reply({
        ...buildNoticePayload({
          title: '# Action refusee',
          body: '> Seul le sys peut modifier les owners.'
        }),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      }).catch(() => null);
      return true;
    }

    context.accessStore.setOwnerUserIds(interaction.guild.id, interaction.values);
    await context.logger.log(interaction.guild, '# Panel', '> Liste des owners mise a jour.');
    return updatePanelMessage(interaction, context, session, isSys);
  }

  await interaction.deferUpdate().catch(() => null);
  return true;
}

async function handlePanelModalSubmission() {
  return false;
}

function buildAdminPanelPayload({
  sessionId,
  guildId,
  accessStore,
  isSys,
  disabled,
  view = 'main',
  selectedPerm = null,
  commandPage = 0,
  assignedCommandPage = 0,
  assignableCommands = CONFIGURABLE_COMMANDS
}) {
  const logsChannelId = accessStore.getGuildLogChannel(guildId);
  const limits = accessStore.getGuildModerationLimits(guildId);
  const muteSettings = accessStore.getGuildMuteSettings(guildId);
  const container = new ContainerBuilder();

  if (view === 'main') {
    const permOptions = [
      ...Array.from({ length: 9 }, (_, index) => ({ label: `Permission ${index + 1}`, value: String(index + 1) })),
      { label: 'Publique', value: 'publique' }
    ];
    if (isSys) permOptions.push({ label: 'Owner', value: 'owner' });

    container
      .addTextDisplayComponents((text) => text.setContent('## Panel configuration'))
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) => text.setContent(`**Salon logs:** ${logsChannelId ? `<#${logsChannelId}>` : 'Aucun'}`))
      .addTextDisplayComponents((text) => text.setContent(`**Clear max:** ${limits.clearMax}`))
      .addTextDisplayComponents((text) => text.setContent(`**Ban par minute:** ${limits.banPerMinute}`))
      .addTextDisplayComponents((text) => text.setContent(`**Role mute:** ${muteSettings.roleId ? `<@&${muteSettings.roleId}>` : 'Aucun'}`))
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) => text.setContent('### Logs'))
      .addActionRowComponents((row) =>
        row.setComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId(`admin:panel:${sessionId}:logs`)
            .setPlaceholder('Choisir le salon logs')
            .setChannelTypes(ChannelType.GuildText)
            .setMinValues(0)
            .setMaxValues(1)
            .setDisabled(disabled)
        )
      )
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) => text.setContent('### Moderation'))
      .addActionRowComponents((row) =>
        row.setComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`admin:panel:${sessionId}:clearmax`)
            .setPlaceholder('Choisir la limite clear max')
            .setMinValues(1)
            .setMaxValues(1)
            .setDisabled(disabled)
            .addOptions(
              ...CLEAR_MAX_OPTIONS.map((value) => ({
                label: `${value} messages`,
                value: String(value),
                default: Number(limits.clearMax) === value
              }))
            )
        )
      )
      .addActionRowComponents((row) =>
        row.setComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`admin:panel:${sessionId}:banrate`)
            .setPlaceholder('Choisir la limite ban/minute')
            .setMinValues(1)
            .setMaxValues(1)
            .setDisabled(disabled)
            .addOptions(
              ...BAN_RATE_OPTIONS.map((value) => ({
                label: `${value} ban/min`,
                value: String(value),
                default: Number(limits.banPerMinute) === value
              }))
            )
        )
      )
      .addActionRowComponents((row) =>
        row.setComponents(
          new RoleSelectMenuBuilder()
            .setCustomId(`admin:panel:${sessionId}:muterole`)
            .setPlaceholder('Choisir le role mute configure')
            .setMinValues(0)
            .setMaxValues(1)
            .setDefaultRoles(...(muteSettings.roleId ? [muteSettings.roleId] : []))
            .setDisabled(disabled)
        )
      )
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) => text.setContent('### Permissions'))
      .addActionRowComponents((row) =>
        row.setComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`admin:panel:${sessionId}:permselect`)
            .setPlaceholder(isSys ? 'Choisir perm 1-9, publique ou owner' : 'Choisir perm 1-9 ou publique')
            .setMinValues(1)
            .setMaxValues(1)
            .setDisabled(disabled)
            .addOptions(...permOptions)
        )
      );

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [], repliedUser: false }
    };
  }

  if (view === 'perm' && selectedPerm === 'owner') {
    const owners = accessStore.getOwnerUserIds(guildId);
    const ownerLines = owners.length ? owners.map((id) => `> <@${id}> (${id})`).join('\n') : '> Aucun owner configure.';

    container
      .addTextDisplayComponents((text) => text.setContent('## Configuration Owner'))
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) => text.setContent('> Gestion des owners du serveur'))
      .addTextDisplayComponents((text) => text.setContent(ownerLines))
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));

    if (isSys) {
      container.addActionRowComponents((row) =>
        row.setComponents(
          new UserSelectMenuBuilder()
            .setCustomId(`admin:panel:${sessionId}:ownerset`)
            .setPlaceholder('Selectionner les owners')
            .setMinValues(0)
            .setMaxValues(25)
            .setDefaultUsers(...owners.slice(0, 25))
            .setDisabled(disabled)
        )
      );
    }

    container
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents((row) =>
        row.setComponents(
          new ButtonBuilder()
            .setCustomId(`admin:panel:${sessionId}:back`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel('Retour')
            .setDisabled(disabled)
        )
      );

    return {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [], repliedUser: false }
    };
  }

  const selected = String(selectedPerm || '1');
  const isPublicPerm = selected === 'publique';
  const permRoles = accessStore.getPermRoles(guildId, selected);
  const permCommands = accessStore.getPermCommands(guildId, selected);
  const availableCommands = normalizeCommandValues(assignableCommands);
  const commandPages = chunkCommands(availableCommands, PANEL_COMMAND_PAGE_SIZE);
  const safeCommandPage = clampPageIndex(commandPage || 0, commandPages.length);
  const currentCommandPage = commandPages[safeCommandPage] || [];
  const assignedCommandPages = chunkCommands(permCommands, PANEL_COMMAND_PAGE_SIZE);
  const safeAssignedCommandPage = clampPageIndex(assignedCommandPage || 0, assignedCommandPages.length);
  const currentAssignedCommandPage = assignedCommandPages[safeAssignedCommandPage] || [];

  container
    .addTextDisplayComponents((text) => text.setContent(isPublicPerm ? '## Publique' : `## Permission ${selected}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));

  if (isPublicPerm) {
    container.addTextDisplayComponents((text) => text.setContent('> Les commandes de cette categorie sont utilisables par everyone.'));
  } else {
    container
      .addTextDisplayComponents((text) => text.setContent('> Selectionnez les roles de cette permission'))
      .addActionRowComponents((row) =>
        row.setComponents(
          new RoleSelectMenuBuilder()
            .setCustomId(`admin:panel:${sessionId}:roleset`)
            .setPlaceholder('Choisir les roles')
            .setMinValues(0)
            .setMaxValues(25)
            .setDefaultRoles(...permRoles.slice(0, 25))
            .setDisabled(disabled)
        )
      );
  }

  container
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent(
        `${isPublicPerm ? '> Selectionnez les commandes publiques que vous pouvez attribuer' : '> Selectionnez les commandes de cette permission que vous pouvez attribuer'}\n> Page: \`${safeCommandPage + 1}/${Math.max(1, commandPages.length)}\`\n> Seules les commandes auxquelles vous avez acces sont proposees.`
      )
    );

  if (currentCommandPage.length) {
    container.addActionRowComponents((row) =>
      row.setComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`admin:panel:${sessionId}:cmdset`)
          .setPlaceholder('Choisir les commandes')
          .setMinValues(0)
          .setMaxValues(currentCommandPage.length)
          .setDisabled(disabled)
          .addOptions(
            ...currentCommandPage.map((cmd) => ({
              label: `+${cmd}`.slice(0, 100),
              value: cmd,
              description: String(COMMAND_DESCRIPTIONS[cmd] || 'Aucune description').slice(0, 100),
              default: permCommands.includes(cmd)
            }))
          )
      )
    );
  } else {
    container.addTextDisplayComponents((text) => text.setContent('> Aucune commande attribuable avec votre acces actuel.'));
  }

  if (commandPages.length > 1) {
    container
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents((row) =>
        row.setComponents(
          new ButtonBuilder()
            .setCustomId(`admin:panel:${sessionId}:cmdprev`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel('Precedent')
            .setDisabled(disabled || safeCommandPage === 0),
          new ButtonBuilder()
            .setCustomId(`admin:panel:${sessionId}:cmdnext`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel('Suivant')
            .setDisabled(disabled || safeCommandPage >= commandPages.length - 1)
        )
      );
  }

  container
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(`> Total commandes attribuees: \`${permCommands.length}\``));

  if (currentAssignedCommandPage.length) {
    container
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) =>
        text.setContent(
          `> Cliquez sur les commandes deja attribuees pour les retirer\n> Page: \`${safeAssignedCommandPage + 1}/${Math.max(1, assignedCommandPages.length)}\``
        )
      )
      .addActionRowComponents((row) =>
        row.setComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`admin:panel:${sessionId}:cmdremove`)
            .setPlaceholder('Retirer des commandes attribuees')
            .setMinValues(1)
            .setMaxValues(currentAssignedCommandPage.length)
            .setDisabled(disabled)
            .addOptions(
              ...currentAssignedCommandPage.map((cmd) => ({
                label: `+${cmd}`.slice(0, 100),
                value: cmd,
                description: String(COMMAND_DESCRIPTIONS[cmd] || 'Aucune description').slice(0, 100)
              }))
            )
        )
      );

    if (assignedCommandPages.length > 1) {
      container
        .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents((row) =>
          row.setComponents(
            new ButtonBuilder()
              .setCustomId(`admin:panel:${sessionId}:cmdrmprev`)
              .setStyle(ButtonStyle.Secondary)
              .setLabel('Retrait precedent')
              .setDisabled(disabled || safeAssignedCommandPage === 0),
            new ButtonBuilder()
              .setCustomId(`admin:panel:${sessionId}:cmdrmnext`)
              .setStyle(ButtonStyle.Secondary)
              .setLabel('Retrait suivant')
              .setDisabled(disabled || safeAssignedCommandPage >= assignedCommandPages.length - 1)
          )
        );
    }
  } else {
    container
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) => text.setContent('> Aucune commande attribuee pour le moment.'));
  }

  container
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents((row) =>
      row.setComponents(
        new ButtonBuilder()
          .setCustomId(`admin:panel:${sessionId}:back`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel('Retour')
          .setDisabled(disabled)
      )
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false }
  };
}

function scheduleAdminPanelExpiration(context, sessionId) {
  setTimeout(async () => {
    const session = context.sessionStore.getAdminPanelSession(sessionId);
    if (!session) return;

    context.sessionStore.deleteAdminPanelSession(sessionId);

    try {
      const channel = await context.client.channels.fetch(session.channelId);
      if (!channel || !channel.isTextBased()) return;
      const message = await channel.messages.fetch(session.messageId);
      const payload = buildAdminPanelPayload({
        sessionId,
        guildId: session.guildId,
        accessStore: context.accessStore,
        isSys: getActualAccessState(session.guildId, session.ownerId, context.accessStore).actualIsSys,
        disabled: true,
        view: session.view || 'main',
        selectedPerm: session.selectedPerm || null,
        commandPage: session.commandPage || 0,
        assignedCommandPage: session.assignedCommandPage || 0,
        assignableCommands: getSessionAssignableCommands(session)
      });
      await message.edit(stripUpdateFlags(payload));
    } catch {
      // Ignore message/channel not found.
    }
  }, PANEL_TTL_MS).unref();
}

function stripUpdateFlags(payload) {
  return {
    components: payload.components,
    allowedMentions: payload.allowedMentions
  };
}

async function updatePanelMessage(interaction, context, session, isSys) {
  const payload = stripUpdateFlags(
    buildAdminPanelPayload({
      sessionId: session.id,
      guildId: interaction.guild.id,
      accessStore: context.accessStore,
      isSys,
      disabled: false,
      view: session.view || 'main',
      selectedPerm: session.selectedPerm || null,
      commandPage: session.commandPage || 0,
      assignedCommandPage: session.assignedCommandPage || 0,
      assignableCommands: getSessionAssignableCommands(session)
    })
  );

  if (!interaction.deferred && !interaction.replied) {
    await interaction.update(payload).catch(async () => {
      await interaction.message.edit(payload).catch(() => null);
    });
  } else {
    await interaction.message.edit(payload).catch(() => null);
  }

  return true;
}

function chunkCommands(commands, size) {
  const pages = [];
  for (let index = 0; index < commands.length; index += size) {
    pages.push(commands.slice(index, index + size));
  }
  return pages.length ? pages : [[]];
}

function refreshPanelActorState(session, guildId, member, userId, accessStore) {
  const actorState = getActualAccessState(guildId, userId, accessStore);
  session.assignableCommands = getAssignableCommandsForMember({
    guildId,
    member,
    userId,
    accessStore,
    commandNames: CONFIGURABLE_COMMANDS
  });
  return actorState;
}

function getSessionAssignableCommands(session) {
  if (Array.isArray(session?.assignableCommands)) {
    return normalizeCommandValues(session.assignableCommands);
  }

  return normalizeCommandValues(CONFIGURABLE_COMMANDS);
}

function normalizeCommandValues(values) {
  if (!Array.isArray(values)) return [];

  return [
    ...new Set(
      values
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
    )
  ];
}

function clampPageIndex(page, pageCount) {
  const safePage = Number.isInteger(page) ? page : 0;
  const safeCount = Math.max(1, Number.isInteger(pageCount) ? pageCount : 1);
  return Math.max(0, Math.min(safePage, safeCount - 1));
}

module.exports = {
  runPanelCommand,
  handlePanelInteraction,
  handlePanelModalSubmission
};
