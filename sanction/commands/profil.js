const {
  ActivityType,
  ActionRowBuilder,
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
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const fetch = globalThis.fetch || require('node-fetch').default;
const { permissionCard } = require('../utils/cards');
const { hasPermissionForCommand } = require('../utils/permissions');
const {
  readProfile,
  saveProfile,
  readCurrentPresence,
  buildPresencePayload,
  formatActivity,
  formatStatus,
  normalizeActivityType,
  normalizeStreamingUrl,
} = require('../utils/botProfile');

const PROFILE_TIMEOUT = 300000;

function buildPanel(client, profile) {
  const currentUser = client.user;
  const avatarUrl = currentUser.displayAvatarURL({ size: 1024 });
  const bannerUrl = currentUser.bannerURL({ size: 1024 }) || null;
  const hasMedia = Boolean(avatarUrl || bannerUrl);

  const container = new ContainerBuilder()
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Panel de gestion du bot'))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('> Modifie le nom, la pp, la banner, le status et l activite en temps reel'))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Infos actuelles'))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`> **Nom :** \`${currentUser.username}\`\n> **Status :** \`${formatStatus(profile)}\`\n${formatActivity(profile)}`));

  if (hasMedia) {
    const gallery = new MediaGalleryBuilder();
    if (avatarUrl) gallery.addItems(new MediaGalleryItemBuilder().setURL(avatarUrl));
    if (bannerUrl) gallery.addItems(new MediaGalleryItemBuilder().setURL(bannerUrl));

    container
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Apercu visuel'))
      .addMediaGalleryComponents(gallery);
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('profil:name').setLabel('Modifier nom').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('profil:avatar').setLabel('Modifier pp').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('profil:banner').setLabel('Modifier banner').setStyle(ButtonStyle.Secondary),
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('profil:activity').setLabel('Modifier activite').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('profil:status').setLabel('Modifier status').setStyle(ButtonStyle.Secondary),
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

  return container;
}

function buildDisabledPanel(client, profile) {
  const panel = buildPanel(client, profile).toJSON();
  for (const component of panel.components || []) {
    if (component.type !== 1 || !Array.isArray(component.components)) continue;
    component.components = component.components.map((button) => ({
      ...button,
      disabled: true
    }));
  }
  return panel;
}

function buildNameModal(panelId) {
  return new ModalBuilder()
    .setCustomId(`${panelId}:name`)
    .setTitle('Modifier le nom')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('nameInput')
          .setLabel('Nouveau nom')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(32)
      )
    );
}

function buildStatusModal(panelId, currentStatus) {
  return new ModalBuilder()
    .setCustomId(`${panelId}:status`)
    .setTitle('Modifier le status')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('statusInput')
          .setLabel('Status (online, idle, dnd, invisible)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(currentStatus === 'invisible' ? 'offline' : currentStatus)
      )
    );
}

function buildActivityModal(panelId, profile) {
  return new ModalBuilder()
    .setCustomId(`${panelId}:activity`)
    .setTitle('Modifier l activite')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('activityTypeInput')
          .setLabel('Type activite')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(profile.activityType ?? ActivityType.Custom))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('activityTextInput')
          .setLabel('Texte activite')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(profile.activityName || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('activityUrlInput')
          .setLabel('URL stream')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(profile.activityUrl || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('activityEmojiInput')
          .setLabel('Emoji custom')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(profile.activityEmoji || '')
      )
    );
}

function buildUploadModal(panelId, kind, label, description) {
  return new ModalBuilder()
    .setCustomId(`${panelId}:${kind}`)
    .setTitle(label)
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(label)
        .setDescription(description)
        .setFileUploadComponent(
          new FileUploadBuilder()
            .setCustomId(`${kind}_upload`)
            .setMinValues(1)
            .setMaxValues(1)
            .setRequired(true)
        )
    );
}

function buildAvatarModal(panelId) {
  return buildUploadModal(
    panelId,
    'avatar',
    'Modifier la PP',
    "Envoie une image pour remplacer la photo de profil du bot."
  );
}

function buildBannerModal(panelId) {
  return buildUploadModal(
    panelId,
    'banner',
    'Modifier la banner',
    "Envoie une image pour remplacer la banner du bot."
  );
}

async function uploadedImageToBuffer(attachment) {
  if (!attachment?.url) {
    throw new Error('Aucune image fournie');
  }

  const response = await fetch(attachment.url);
  if (!response.ok) {
    throw new Error('Impossible de telecharger le fichier');
  }

  const contentType = attachment.contentType || response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error('Le fichier doit etre une image');
  }

  return Buffer.from(await response.arrayBuffer());
}

module.exports = {
  name: 'profil',
  aliases: ['botprofile', 'presence'],
  async executePrefix(message) {
    if (!hasPermissionForCommand(message.member, 'profil')) {
      return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    const client = message.client;
    const panelId = `profil:${message.id}`;
    let profile = readCurrentPresence(client.user);
    let active = true;
    const reply = await message.reply({
      components: [buildPanel(client, profile)],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
      mentionRepliedUser: false
    });

    const refreshPanel = async () => {
      profile = readCurrentPresence(client.user);
      await reply.edit({
        components: [buildPanel(client, profile)],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] }
      });
    };

    const disablePanel = async () => {
      try {
        await reply.edit({
          components: [buildDisabledPanel(client, profile)],
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { parse: [] }
        });
      } catch {}
    };

    const collector = reply.createMessageComponentCollector({ time: PROFILE_TIMEOUT });

    const modalHandler = async (interaction) => {
      if (!active || !interaction.isModalSubmit()) return;
      if (!interaction.customId.startsWith(`${panelId}:`)) return;
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({ content: "<:non:1519424807580733635> Vous n'etes pas l'auteur de cette commande", flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
      }

      if (interaction.customId === `${panelId}:name`) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const newName = interaction.fields.getTextInputValue('nameInput').trim();
        try {
          await client.user.setUsername(newName);
          await refreshPanel();
          return interaction.editReply({ content: '> Nom mis à jour !' });
        } catch (error) {
          return interaction.editReply({ content: `> Impossible de modifier le nom : ${error?.message || 'erreur inconnue'}` });
        }
      }

      if (interaction.customId === `${panelId}:status`) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const rawStatus = interaction.fields.getTextInputValue('statusInput').trim().toLowerCase();
        const nextStatus = rawStatus === 'offline' ? 'invisible' : rawStatus;
        if (!['online', 'idle', 'dnd', 'invisible'].includes(nextStatus)) {
          return interaction.editReply({ content: "> Status invalide. Utilise `online`, `idle`, `dnd` ou `offline`." });
        }

        profile = {
          ...profile,
          status: nextStatus
        };
        try {
          await client.user.setPresence(buildPresencePayload(profile));
          saveProfile(profile);
          await refreshPanel();
          return interaction.editReply({ content: '> Status mis à jour !' });
        } catch (error) {
          return interaction.editReply({ content: `> Impossible de modifier le status : ${error?.message || 'erreur inconnue'}` });
        }
      }

      if (interaction.customId === `${panelId}:activity`) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const rawType = interaction.fields.getTextInputValue('activityTypeInput').trim();
        const activityText = interaction.fields.getTextInputValue('activityTextInput').trim();
        const activityUrl = normalizeStreamingUrl(interaction.fields.getTextInputValue('activityUrlInput'));
        const activityEmoji = interaction.fields.getTextInputValue('activityEmojiInput').trim();
        const type = normalizeActivityType(rawType);

        if (!activityText) {
          return interaction.editReply({ content: '> Le texte de l activite est obligatoire.' });
        }

        const nextProfile = {
          ...profile,
          activityType: type,
          activityName: activityText,
          activityUrl: type === ActivityType.Streaming ? activityUrl : '',
          activityEmoji: type === ActivityType.Custom ? activityEmoji : '',
        };

        try {
          await client.user.setPresence(buildPresencePayload(nextProfile));
          profile = nextProfile;
          saveProfile(profile);
          await refreshPanel();
          return interaction.editReply({ content: '> Activite mise à jour !' });
        } catch (error) {
          return interaction.editReply({ content: `> Impossible de modifier l activite : ${error?.message || 'erreur inconnue'}` });
        }
      }

      if (interaction.customId === `${panelId}:avatar`) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const uploadedFiles = interaction.fields.getUploadedFiles('avatar_upload', true);
          const image = uploadedFiles?.first();
          if (!image) throw new Error('Aucune image fournie');
          const buffer = await uploadedImageToBuffer(image);
          await client.user.setAvatar(buffer);
          await refreshPanel();
          return interaction.editReply({ content: '> PP mise à jour !' });
        } catch (error) {
          return interaction.editReply({ content: `> Impossible de modifier la PP : ${error?.message || 'erreur inconnue'}` });
        }
      }

      if (interaction.customId === `${panelId}:banner`) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const uploadedFiles = interaction.fields.getUploadedFiles('banner_upload', true);
          const image = uploadedFiles?.first();
          if (!image) throw new Error('Aucune image fournie');
          const buffer = await uploadedImageToBuffer(image);
          await client.user.setBanner(buffer);
          await refreshPanel();
          return interaction.editReply({ content: '> Banner mise à jour !' });
        } catch (error) {
          return interaction.editReply({ content: `> Impossible de modifier la banner : ${error?.message || 'erreur inconnue'}` });
        }
      }
    };

    client.on('interactionCreate', modalHandler);

    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({ content: "<:non:1519424807580733635> Vous n'etes pas l'auteur de cette commande", flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
      }

      if (interaction.customId === 'profil:name') {
        return interaction.showModal(buildNameModal(panelId));
      }

      if (interaction.customId === 'profil:avatar') {
        return interaction.showModal(buildAvatarModal(panelId));
      }

      if (interaction.customId === 'profil:banner') {
        return interaction.showModal(buildBannerModal(panelId));
      }

      if (interaction.customId === 'profil:activity') {
        return interaction.showModal(buildActivityModal(panelId, profile));
      }

      if (interaction.customId === 'profil:status') {
        return interaction.showModal(buildStatusModal(panelId, profile.status));
      }
    });

    collector.on('end', async () => {
      active = false;
      client.off('interactionCreate', modalHandler);
      await disablePanel();
    });
  }
};
