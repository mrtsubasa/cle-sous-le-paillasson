const {
  ActionRowBuilder,
  ButtonBuilder,
  ChannelSelectMenuBuilder,
  ContainerBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
} = require('discord.js');
const { BUTTONS, GIVEAWAY_CHANNEL_TYPES, GIVEAWAY_MODE_OPTIONS } = require('../config/constants');
const { formatDuration } = require('../utils/duration');
const { formatGiveawayMode, formatRequiredCustomStatus, formatUserList } = require('../utils/formatters');
const { buildView, createContainer, createSeparator, createText } = require('./shared');

function buildDraftCustomIds(sessionId) {
  return {
    edit: `gcfg:edit:${sessionId}`,
    channel: `gcfg:channel:${sessionId}`,
    mode: `gcfg:mode:${sessionId}`,
    forced: `gcfg:forced:${sessionId}`,
  };
}

function buildDraftBody(session, guildConfig) {
  return [
    `Prix : ${session.prize || 'Non defini'}`,
    `Salon cible : <#${session.channelId}>`,
    `Nombre Gagnants : ${session.winnerCount}`,
    `Duree : ${formatDuration(session.durationMs)}`,
    `Mode : ${formatGiveawayMode(session.mode)}`,
    `Texte de participation : ${session.mode === 'TEXT' ? `\`${session.joinText}\`` : 'Non utilise'}`,
    `Gagnants imposes : ${formatUserList(session.forcedWinnerIds)}`,
    `Statut requis actuel : ${formatRequiredCustomStatus(guildConfig.requiredCustomStatus)}`,
    'Utilise les menus ci dessous pour modifier, publier ou annuler.',
  ].join('\n');
}

function buildGiveawayDraftView(session, guildConfig) {
  const ids = buildDraftCustomIds(session.id);
  const container = createContainer('Giveaway', buildDraftBody(session, guildConfig));
  const editMenu = new StringSelectMenuBuilder()
    .setCustomId(ids.edit)
    .setPlaceholder('Selectionner ce que tu veux modifier')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Modifier le prix')
        .setValue('prize')
        .setDescription('Ouvrir la saisie du prix'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Modifier les gagnants')
        .setValue('winners')
        .setDescription('Ouvrir la saisie du nombre de gagnants'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Modifier la duree')
        .setValue('duration')
        .setDescription('Ouvrir la saisie de la duree'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Modifier le texte')
        .setValue('text')
        .setDescription('Ouvrir la saisie du texte de participation'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Publier le giveaway')
        .setValue('publish')
        .setDescription('Publier immediatement le giveaway'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Annuler la creation')
        .setValue('cancel')
        .setDescription('Fermer et supprimer le brouillon'),
    );

  const modeMenu = new StringSelectMenuBuilder()
    .setCustomId(ids.mode)
    .setPlaceholder('Choisir le mode de participation')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      GIVEAWAY_MODE_OPTIONS.map((option) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(option.label)
          .setValue(option.value)
          .setDescription(option.description)
          .setDefault(option.value === session.mode),
      ),
    );

  const channelMenu = new ChannelSelectMenuBuilder()
    .setCustomId(ids.channel)
    .setPlaceholder('Choisir le salon d envoi')
    .setMinValues(1)
    .setMaxValues(1)
    .setChannelTypes(...GIVEAWAY_CHANNEL_TYPES)
    .setDefaultChannels(session.channelId);

  const forcedMenu = new UserSelectMenuBuilder()
    .setCustomId(ids.forced)
    .setPlaceholder('Choisir les gagnants imposes')
    .setMinValues(0)
    .setMaxValues(10);

  if (session.forcedWinnerIds.length) {
    forcedMenu.setDefaultUsers(...session.forcedWinnerIds);
  }

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(editMenu),
    new ActionRowBuilder().addComponents(channelMenu),
    new ActionRowBuilder().addComponents(modeMenu),
    new ActionRowBuilder().addComponents(forcedMenu),
  );

  return buildView(container);
}

function buildPublishedBody(giveaway, guildConfig) {
  const winners = Math.max(giveaway.winnerCount, giveaway.forcedWinnerIds.length);
  const buttonVisual = giveaway.buttonEmoji || '\uD83C\uDF89';
  const participationLine =
    giveaway.mode === 'BUTTON'
      ? `Cliquez sur le bouton ${buttonVisual} pour participer`
      : giveaway.mode === 'TEXT'
        ? `Envoyez \`${giveaway.joinText}\` pour participer`
        : `Reagissez avec ${giveaway.reactionSymbol} pour participer`;

  const lines = [
    `> ${participationLine}`,
    `> **Nombre de gagnants** : ${winners}`,
    '',
    '> Fin du giveaway :',
    `> <t:${Math.floor(giveaway.endAt / 1000)}:R>`,
  ];

  return lines.join('\n');
}

function buildEndedBody(giveaway) {
  const winnersText = giveaway.winnerIds.length ? formatUserList(giveaway.winnerIds) : 'Aucun gagnant';

  return [
    `> Gagnants : ${winnersText}`,
    `> Termine : <t:${Math.floor((giveaway.endedAt || Date.now()) / 1000)}:F>`,
    `> Participations : ${giveaway.participantIds.length}`,
  ].join('\n');
}

function buildPublishedGiveawayView(giveaway, guildConfig) {
  const body = giveaway.ended ? buildEndedBody(giveaway) : buildPublishedBody(giveaway, guildConfig);
  const title = giveaway.ended ? `# Giveaway termine: ${giveaway.prize}` : `# Giveaway: ${giveaway.prize}`;
  const container = new ContainerBuilder()
    .addTextDisplayComponents(createText(title))
    .addTextDisplayComponents(createText(body));

  if (!giveaway.ended && giveaway.mode === 'BUTTON') {
    container.addSeparatorComponents(createSeparator());
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`giveaway:join:${giveaway.id}`)
          .setLabel(`Participer (${giveaway.participantIds.length})`)
          .setEmoji(giveaway.buttonEmoji || '\uD83C\uDF89')
          .setStyle(BUTTONS.SECONDARY),
      ),
    );
  }

  if (giveaway.ended) {
    container.addSeparatorComponents(createSeparator());
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`giveaway:reroll:${giveaway.id}`)
          .setLabel('Reroll')
          .setStyle(BUTTONS.SECONDARY)
          .setDisabled(giveaway.participantIds.length === 0 && giveaway.forcedWinnerIds.length === 0),
      ),
    );
  }

  return buildView(container);
}

module.exports = {
  buildDraftCustomIds,
  buildGiveawayDraftView,
  buildPublishedGiveawayView,
};
