const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  RoleSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { applyV2Flags, buildSimpleSectionView, buildView, createContainer } = require('../giveaway/ui/shared');
const { buildGiveawayDraftView } = require('../giveaway/ui/giveawayViews');
const { formatRequiredCustomStatus, formatRoleList, getMemberCustomStatus } = require('../giveaway/utils/formatters');
const { buildExecutionFailedPayload } = require('../utils/components');

const GW_PANEL_IDS = {
  roles: 'gwpanel:roles',
  statusEdit: 'gwpanel:status_edit',
  statusClear: 'gwpanel:status_clear',
  rolesClear: 'gwpanel:roles_clear',
  refresh: 'gwpanel:refresh',
  statusModalPrefix: 'gwpanel:modal:status'
};

async function runGiveawayCommand(message, context) {
  if (!message.guild || message.author.bot) return;
  const guildConfig = await context.giveaway.storage.getGuildConfig(message.guild.id);
  if (
    !context.giveaway?.hasCommandAccess(message.member, message.author.id, 'giveaway') &&
    !context.giveaway.permissions.canUseGiveawayAdmin(message.member, guildConfig)
  ) {
    await message.channel.send(buildExecutionFailedPayload('Tu peux pas faire cette commande'));
    return;
  }

  const session = context.giveaway.giveawayCreationManager.createSession(message.guild.id, message.author.id, message.channel.id);
  await message.channel.send(applyV2Flags(buildGiveawayDraftView(session, guildConfig)));
}

async function runPanelGwCommand(message, context) {
  if (!message.guild || message.author.bot) return;
  const guildConfig = await context.giveaway.storage.getGuildConfig(message.guild.id);
  if (
    !context.giveaway?.hasCommandAccess(message.member, message.author.id, 'panelgw') &&
    !context.giveaway.permissions.canUsePanel(message.member, guildConfig)
  ) {
    await message.channel.send(buildExecutionFailedPayload('Tu peux pas faire cette commande'));
    return;
  }

  await message.channel.send(buildPanelGwPayload(guildConfig));
}

async function runCheckGiveawayCommand(message, args, context) {
  if (!message.guild || message.author.bot) return;
  const guildConfig = await context.giveaway.storage.getGuildConfig(message.guild.id);
  if (
    !context.giveaway?.hasCommandAccess(message.member, message.author.id, 'check') &&
    !context.giveaway.permissions.canUseGiveawayAdmin(message.member, guildConfig)
  ) {
    await message.channel.send(buildExecutionFailedPayload('Tu peux pas faire cette commande'));
    return;
  }

  const targetId = extractTargetUserId(args[0]);
  if (!targetId) {
    await message.channel.send(buildExecutionFailedPayload('Format: +check <user>'));
    return;
  }

  const member = await message.guild.members.fetch(targetId).catch(() => null);
  if (!member) {
    await message.channel.send(buildExecutionFailedPayload('Utilisateur introuvable'));
    return;
  }

  const voiceEntry = context.giveaway.voiceTracker.getEntry(message.guild.id, member.id);
  const inVoice = Boolean(member.voice?.channelId);
  const customStatus = getMemberCustomStatus(member);
  const formattedStatus = `\`${customStatus || 'Aucun'}\``;
  const joinedAt = voiceEntry?.joinedAt ? `<t:${Math.floor(voiceEntry.joinedAt / 1000)}:R>` : null;
  const text = inVoice
    ? `> <@${member.id}> est dans <#${member.voice.channelId}>${joinedAt ? `, il a join ${joinedAt}` : ''}, il a ${formattedStatus} en statut`
    : `> <@${member.id}> n est pas dans un salon vocal, il a ${formattedStatus} en statut`;

  await message.channel.send(applyV2Flags(buildSimpleSectionView(text)));
}

async function runBlGwCommand(message, args, context) {
  if (!message.guild || message.author.bot) return;
  const guildConfig = await context.giveaway.storage.getGuildConfig(message.guild.id);
  if (
    !context.giveaway?.hasCommandAccess(message.member, message.author.id, 'blgw') &&
    !context.giveaway.permissions.canUseGiveawayAdmin(message.member, guildConfig)
  ) {
    await message.channel.send(buildExecutionFailedPayload('Tu peux pas faire cette commande'));
    return;
  }

  const targetId = extractTargetUserId(args[0]);
  if (!targetId) {
    await message.channel.send(buildExecutionFailedPayload('Format: +blgw <user>'));
    return;
  }

  const created = await context.giveaway.storage.addBlacklistUser(message.guild.id, targetId);
  const text = created
    ? `> Vous avez bien **BL** <@${targetId}> des giveaways`
    : '> Cet utilisateur est deja blacklist giveaway';

  await message.channel.send(applyV2Flags(buildSimpleSectionView(text)));
}

async function runUnblGwCommand(message, args, context) {
  if (!message.guild || message.author.bot) return;
  const guildConfig = await context.giveaway.storage.getGuildConfig(message.guild.id);
  if (
    !context.giveaway?.hasCommandAccess(message.member, message.author.id, 'unblgw') &&
    !context.giveaway.permissions.canUseGiveawayAdmin(message.member, guildConfig)
  ) {
    await message.channel.send(buildExecutionFailedPayload('Tu peux pas faire cette commande'));
    return;
  }

  const targetId = extractTargetUserId(args[0]);
  if (!targetId) {
    await message.channel.send(buildExecutionFailedPayload('Format: +unblgw <user>'));
    return;
  }

  let removed = false;
  await context.giveaway.storage.updateGuildConfig(message.guild.id, (config) => {
    const beforeLength = config.blacklistUserIds.length;
    config.blacklistUserIds = config.blacklistUserIds.filter((userId) => String(userId) !== String(targetId));
    removed = config.blacklistUserIds.length !== beforeLength;
  });

  const text = removed
    ? `> Vous avez bien retire le **BL** giveaway de <@${targetId}>`
    : '> Cet utilisateur n est pas blacklist giveaway';

  await message.channel.send(applyV2Flags(buildSimpleSectionView(text)));
}

async function handleGiveawayModalSubmission(interaction, context) {
  if (await context.giveaway.giveawayCreationManager.handleInteraction(interaction)) {
    return true;
  }

  if (!interaction.isModalSubmit() || !String(interaction.customId || '').startsWith(`${GW_PANEL_IDS.statusModalPrefix}:`)) {
    return false;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const guildConfig = await context.giveaway.storage.getGuildConfig(interaction.guild.id);
  const hasPanelAccess =
    Boolean(member) &&
    (context.giveaway.hasCommandAccess(member, interaction.user.id, 'panelgw') ||
      context.giveaway.permissions.canUsePanel(member, guildConfig));
  if (!hasPanelAccess) {
    await interaction.reply({
      ...buildExecutionFailedPayload('Tu peux pas faire cette commande'),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    }).catch(() => null);
    return true;
  }

  const status = interaction.fields.getTextInputValue('status').trim() || null;
  const updatedConfig = await context.giveaway.storage.updateGuildConfig(interaction.guild.id, (config) => {
    config.requiredCustomStatus = status;
  });

  const panelMessageId = String(interaction.customId || '').split(':')[4] || '';
  const payload = stripComponentFlags(buildPanelGwPayload(updatedConfig));
  if (panelMessageId) {
    const panelMessage = await interaction.channel?.messages.fetch(panelMessageId).catch(() => null);
    await panelMessage?.edit(payload).catch(() => null);
  }
  await interaction.reply({
    ...applyV2Flags(buildSimpleSectionView('> Panel gw mis a jour'), { ephemeral: true })
  }).catch(() => null);
  return true;
}

async function handleGiveawayInteraction(interaction, context) {
  if (await handlePanelGwInteraction(interaction, context)) {
    return true;
  }

  if (await context.giveaway.giveawayCreationManager.handleInteraction(interaction)) {
    return true;
  }

  if (await context.giveaway.giveawayManager.handleInteraction(interaction)) {
    return true;
  }

  return false;
}

async function handlePanelGwInteraction(interaction, context) {
  const customId = String(interaction.customId || '');
  if (!customId.startsWith('gwpanel:')) return false;

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const guildConfig = await context.giveaway.storage.getGuildConfig(interaction.guild.id);
  const hasPanelAccess =
    Boolean(member) &&
    (context.giveaway.hasCommandAccess(member, interaction.user.id, 'panelgw') ||
      context.giveaway.permissions.canUsePanel(member, guildConfig));
  if (!hasPanelAccess) {
    await interaction.reply({
      ...buildExecutionFailedPayload('Tu peux pas faire cette commande'),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    }).catch(() => null);
    return true;
  }

  if (customId === GW_PANEL_IDS.statusEdit && interaction.isButton()) {
    await interaction.showModal(buildPanelGwStatusModal(guildConfig, interaction.message?.id));
    return true;
  }

  let nextConfig = guildConfig;

  if (customId === GW_PANEL_IDS.roles && interaction.isRoleSelectMenu()) {
    nextConfig = await context.giveaway.storage.updateGuildConfig(interaction.guild.id, (config) => {
      config.allowedRoleIds = [...interaction.values];
    });
  } else if (customId === GW_PANEL_IDS.statusClear && interaction.isButton()) {
    nextConfig = await context.giveaway.storage.updateGuildConfig(interaction.guild.id, (config) => {
      config.requiredCustomStatus = null;
    });
  } else if (customId === GW_PANEL_IDS.rolesClear && interaction.isButton()) {
    nextConfig = await context.giveaway.storage.updateGuildConfig(interaction.guild.id, (config) => {
      config.allowedRoleIds = [];
    });
  } else if (customId === GW_PANEL_IDS.refresh && interaction.isButton()) {
    nextConfig = await context.giveaway.storage.getGuildConfig(interaction.guild.id);
  } else {
    await interaction.deferUpdate().catch(() => null);
    return true;
  }

  const payload = stripComponentFlags(buildPanelGwPayload(nextConfig));
  await interaction.update(payload).catch(async () => {
    await interaction.message.edit(payload).catch(() => null);
  });
  return true;
}

async function handleGiveawayMessage(message, context) {
  if (!context.giveaway?.giveawayManager) return false;
  return context.giveaway.giveawayManager.handleMessage(message);
}

function buildPanelGwPayload(config) {
  const body = [
    `Roles autorises giveaway : ${formatRoleList(config.allowedRoleIds || [])}`,
    `Statut requis : ${formatRequiredCustomStatus(config.requiredCustomStatus)}`,
    `Blacklist giveaway : ${(config.blacklistUserIds || []).length} utilisateur(s)`
  ].join('\n');

  const container = createContainer('Panel GW', body);
  const rolesMenu = new RoleSelectMenuBuilder()
    .setCustomId(GW_PANEL_IDS.roles)
    .setPlaceholder('Choisir les roles giveaway')
    .setMinValues(0)
    .setMaxValues(10);

  if (Array.isArray(config.allowedRoleIds) && config.allowedRoleIds.length) {
    rolesMenu.setDefaultRoles(...config.allowedRoleIds.slice(0, 10));
  }

  return applyV2Flags(
    buildView(container, [
      new ActionRowBuilder().addComponents(rolesMenu),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(GW_PANEL_IDS.statusEdit)
          .setLabel('Modifier le statut')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(GW_PANEL_IDS.statusClear)
          .setLabel('Retirer le statut')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(GW_PANEL_IDS.rolesClear)
          .setLabel('Vider les roles')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(GW_PANEL_IDS.refresh)
          .setLabel('Actualiser')
          .setStyle(ButtonStyle.Secondary)
      )
    ])
  );
}

function buildPanelGwStatusModal(config, messageId) {
  const modal = new ModalBuilder()
    .setCustomId(`${GW_PANEL_IDS.statusModalPrefix}:${messageId || 'pending'}`)
    .setTitle('Statut giveaway');

  const input = new TextInputBuilder()
    .setCustomId('status')
    .setLabel('Statut personnalise requis')
    .setPlaceholder('Exemple : en vocal giveaway')
    .setRequired(false)
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100);

  if (config.requiredCustomStatus) {
    input.setValue(config.requiredCustomStatus);
  }

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function extractTargetUserId(input) {
  const cleaned = String(input || '').replace(/[^0-9]/g, '');
  return /^\d{15,20}$/.test(cleaned) ? cleaned : '';
}

function stripComponentFlags(payload) {
  return {
    components: payload.components
  };
}

module.exports = {
  runGiveawayCommand,
  runPanelGwCommand,
  runCheckGiveawayCommand,
  runBlGwCommand,
  runUnblGwCommand,
  handleGiveawayInteraction,
  handleGiveawayModalSubmission,
  handleGiveawayMessage
};
