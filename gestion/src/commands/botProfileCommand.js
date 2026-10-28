const {
  ActionRowBuilder,
  ActivityType,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  FileUploadBuilder,
  LabelBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { buildExecutionFailedPayload } = require('../utils/components');
const {
  applyBotPresence,
  readBotPresence,
} = require('../services/botPresence');

const ACTIVITY_LABELS = {
  [ActivityType.Playing]: 'Joue',
  [ActivityType.Streaming]: 'Stream',
  [ActivityType.Listening]: 'Ecoute',
  [ActivityType.Watching]: 'Regarde',
  [ActivityType.Custom]: 'Custom',
  [ActivityType.Competing]: 'Competition',
};

function getCurrentPresence(client) {
  const activity = client.user?.presence?.activities?.[0] || null;
  return readBotPresence() || {
    status: client.user?.presence?.status || 'idle',
    activityType: activity?.type ?? ActivityType.Custom,
    activityName: activity?.type === ActivityType.Custom
      ? (activity?.state || activity?.name || '')
      : (activity?.name || ''),
    activityUrl: activity?.url || '',
    activityEmoji: activity?.emoji?.name || '',
  };
}

async function fetchImageBuffer(file) {
  if (!file?.url) throw new Error('Aucune image fournie.');
  const response = await fetch(file.url);
  if (!response.ok) throw new Error('Impossible de telecharger l image.');

  const contentType = file.contentType || response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) throw new Error('Le fichier doit etre une image.');
  return Buffer.from(await response.arrayBuffer());
}

async function refreshUser(client) {
  await client.user.fetch().catch(() => null);
  return {
    avatarUrl: client.user.displayAvatarURL({ size: 1024 }),
    bannerUrl: client.user.bannerURL({ size: 1024 }),
  };
}

async function buildPanel(client, presenceState) {
  const media = await refreshUser(client);
  const activityLabel = ACTIVITY_LABELS[presenceState.activityType] || `Type ${presenceState.activityType}`;
  const activityText = presenceState.activityName
    ? `> **Activite:** ${activityLabel} - ${presenceState.activityName}`
    : '> **Activite:** Aucune';

  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# Profil du bot'),
      new TextDisplayBuilder().setContent(
        `> **Nom:** \`${client.user.username}\`\n> **Statut:** \`${presenceState.status}\`\n${activityText}`
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  const gallery = new MediaGalleryBuilder();
  if (media.avatarUrl) gallery.addItems(new MediaGalleryItemBuilder().setURL(media.avatarUrl));
  if (media.bannerUrl) gallery.addItems(new MediaGalleryItemBuilder().setURL(media.bannerUrl));
  if (media.avatarUrl || media.bannerUrl) container.addMediaGalleryComponents(gallery);

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('gestion_profile_name').setLabel('Nom').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('gestion_profile_avatar').setLabel('PP').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('gestion_profile_banner').setLabel('Bannière').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('gestion_profile_activity').setLabel('Activité').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('gestion_profile_status').setLabel('Statut').setStyle(ButtonStyle.Primary),
      ),
    );

  return container;
}

function buildNameModal(panelId, username) {
  return new ModalBuilder()
    .setCustomId(`${panelId}:name`)
    .setTitle('Modifier le nom')
    .addLabelComponents(
      new LabelBuilder().setLabel('Nouveau nom').setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('profile_name')
          .setStyle(TextInputStyle.Short)
          .setValue(username)
          .setRequired(true),
      ),
    );
}

function buildImageModal(panelId, target) {
  const isAvatar = target === 'avatar';
  return new ModalBuilder()
    .setCustomId(`${panelId}:${target}`)
    .setTitle(isAvatar ? 'Modifier la PP' : 'Modifier la bannière')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(isAvatar ? 'Photo de profil' : 'Bannière')
        .setDescription('Envoie une image.')
        .setFileUploadComponent(
          new FileUploadBuilder()
            .setCustomId('profile_image')
            .setMinValues(1)
            .setMaxValues(1)
            .setRequired(true),
        ),
    );
}

function buildActivityModal(panelId, state) {
  return new ModalBuilder()
    .setCustomId(`${panelId}:activity`)
    .setTitle('Modifier l activité')
    .addLabelComponents(
      new LabelBuilder().setLabel('Type 0 à 5').setDescription('0 Joue, 1 Stream, 2 Ecoute, 3 Regarde, 4 Custom, 5 Competition').setTextInputComponent(
        new TextInputBuilder().setCustomId('activity_type').setStyle(TextInputStyle.Short).setValue(String(state.activityType)).setRequired(true),
      ),
      new LabelBuilder().setLabel('Texte').setTextInputComponent(
        new TextInputBuilder().setCustomId('activity_name').setStyle(TextInputStyle.Short).setValue(state.activityName || '').setRequired(true),
      ),
      new LabelBuilder().setLabel('URL stream').setDescription('Seulement pour le type 1.').setTextInputComponent(
        new TextInputBuilder().setCustomId('activity_url').setStyle(TextInputStyle.Short).setValue(state.activityUrl || '').setRequired(false),
      ),
      new LabelBuilder().setLabel('Emoji custom').setDescription('Seulement pour le type 4.').setTextInputComponent(
        new TextInputBuilder().setCustomId('activity_emoji').setStyle(TextInputStyle.Short).setValue(state.activityEmoji || '').setRequired(false),
      ),
    );
}

function buildStatusModal(panelId, state) {
  return new ModalBuilder()
    .setCustomId(`${panelId}:status`)
    .setTitle('Modifier le statut')
    .addLabelComponents(
      new LabelBuilder().setLabel('online / idle / dnd / invisible').setTextInputComponent(
        new TextInputBuilder().setCustomId('profile_status').setStyle(TextInputStyle.Short).setValue(state.status || 'idle').setRequired(true),
      ),
    );
}

async function runBotProfileCommand(message, context) {
  if (!context.accessStore?.canUseAdminCommands?.(message.guild.id, message.author.id)) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee au sys, aux owners et aux buyers.'));
    return;
  }

  const client = context.client;
  const panelId = `gestion_profile:${message.id}`;
  let presenceState = getCurrentPresence(client);
  const reply = await message.reply({
    components: [await buildPanel(client, presenceState)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });

  const refreshPanel = async () => reply.edit({
    components: [await buildPanel(client, presenceState)],
    allowedMentions: { parse: [] },
  });

  const modalHandler = async (interaction) => {
    if (!interaction.isModalSubmit() || !interaction.customId.startsWith(`${panelId}:`)) return;
    if (interaction.user.id !== message.author.id) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const action = interaction.customId.split(':').pop();

    try {
      if (action === 'name') {
        const name = interaction.fields.getTextInputValue('profile_name').trim();
        await client.user.setUsername(name);
      } else if (action === 'avatar' || action === 'banner') {
        const file = interaction.fields.getUploadedFiles('profile_image', true)?.first();
        const buffer = await fetchImageBuffer(file);
        if (action === 'avatar') await client.user.setAvatar(buffer);
        else await client.user.setBanner(buffer);
      } else if (action === 'activity') {
        const activityType = Number.parseInt(interaction.fields.getTextInputValue('activity_type').trim(), 10);
        const activityName = interaction.fields.getTextInputValue('activity_name').trim();
        const activityUrl = interaction.fields.getTextInputValue('activity_url').trim();
        const activityEmoji = interaction.fields.getTextInputValue('activity_emoji').trim();
        if (!Number.isInteger(activityType) || activityType < 0 || activityType > 5) throw new Error('Type invalide: utilise 0 à 5.');
        if (activityType === ActivityType.Streaming && !activityUrl) throw new Error('Une URL est obligatoire pour le type Stream.');
        presenceState = await applyBotPresence(client, {
          ...presenceState,
          activityType,
          activityName,
          activityUrl,
          activityEmoji,
        });
      } else if (action === 'status') {
        const statusInput = interaction.fields.getTextInputValue('profile_status').trim().toLowerCase();
        const status = statusInput === 'offline' ? 'invisible' : statusInput;
        if (!['online', 'idle', 'dnd', 'invisible'].includes(status)) throw new Error('Statut invalide.');
        presenceState = await applyBotPresence(client, { ...presenceState, status });
      }

      await refreshPanel();
      await interaction.editReply({ content: '> Profil du bot mis à jour.' });
    } catch (error) {
      await interaction.editReply({ content: `> Modification impossible: ${error.message}` });
    }
  };

  client.on('interactionCreate', modalHandler);
  const collector = reply.createMessageComponentCollector({ time: 300000 });

  collector.on('collect', async (interaction) => {
    if (interaction.user.id !== message.author.id) {
      await interaction.reply({ content: '> Ce panneau ne vous appartient pas.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.customId === 'gestion_profile_name') return interaction.showModal(buildNameModal(panelId, client.user.username));
    if (interaction.customId === 'gestion_profile_avatar') return interaction.showModal(buildImageModal(panelId, 'avatar'));
    if (interaction.customId === 'gestion_profile_banner') return interaction.showModal(buildImageModal(panelId, 'banner'));
    if (interaction.customId === 'gestion_profile_activity') return interaction.showModal(buildActivityModal(panelId, presenceState));
    if (interaction.customId === 'gestion_profile_status') return interaction.showModal(buildStatusModal(panelId, presenceState));
  });

  collector.on('end', () => client.off('interactionCreate', modalHandler));
}

module.exports = { runBotProfileCommand };
