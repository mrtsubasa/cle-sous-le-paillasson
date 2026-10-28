const Discord = require('discord.js');
const { ActivityType } = Discord;
const { buildPresencePayload, readBotPresence, saveBotPresence } = require('../../Utils/botPresence');

const fetch = globalThis.fetch || require('node-fetch').default;

exports.help = {
  name: 'uhqprofil',
  aliases: ['profilbot', 'botstatus', 'presence'],
  type: 'sys',
  description: 'Panel de gestion du profil du bot',
};

exports.run = async (bot, message) => {
  if (!message.guild) return;
  if (!bot.functions.checkPerm(bot, message, 'sys')) return;

  const panelId = `botprofile:${message.id}`;
  let currentAvatarUrl = null;
  let currentBannerUrl = null;
  let presenceState = readBotPresence() || {
    status: bot.user.presence?.status || 'idle',
    activityType: bot.user.presence?.activities?.[0]?.type ?? ActivityType.Custom,
    activityName: bot.user.presence?.activities?.[0]?.type === ActivityType.Custom
      ? (bot.user.presence?.activities?.[0]?.state || bot.user.presence?.activities?.[0]?.name || '')
      : (bot.user.presence?.activities?.[0]?.name || ''),
    activityUrl: bot.user.presence?.activities?.[0]?.url || '',
    activityEmoji: bot.user.presence?.activities?.[0]?.type === ActivityType.Custom
      ? (bot.user.presence?.activities?.[0]?.emoji?.name || '')
      : '',
  };

  const syncBotProfile = async () => {
    try {
      await bot.user.fetch();
    } catch {}

    currentAvatarUrl = bot.user.displayAvatarURL({ size: 1024 });
    currentBannerUrl = bot.user.bannerURL({ size: 1024 });
  };

  const uploadToBuffer = async (attachment) => {
    if (!attachment?.url) throw new Error('Aucun fichier fourni');
    const response = await fetch(attachment.url);
    if (!response.ok) throw new Error('Impossible de telecharger le fichier');

    const contentType = attachment.contentType || response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) throw new Error('Le fichier doit etre une image');

    return Buffer.from(await response.arrayBuffer());
  };

  const formatStatus = () => {
    if (presenceState.status === 'invisible') return 'offline (invisible)';
    return presenceState.status || 'idle';
  };

  const formatActivity = () => {
    if (!presenceState.activityName) return '> Aucune activite definie';

    const labels = {
      [ActivityType.Playing]: 'Playing',
      [ActivityType.Streaming]: 'Streaming',
      [ActivityType.Listening]: 'Listening',
      [ActivityType.Watching]: 'Watching',
      [ActivityType.Custom]: 'Custom',
      [ActivityType.Competing]: 'Competing',
    };

    const emojiPart = presenceState.activityType === ActivityType.Custom && presenceState.activityEmoji
      ? `${presenceState.activityEmoji} `
      : '';

    const urlPart = presenceState.activityType === ActivityType.Streaming && presenceState.activityUrl
      ? `\n> URL: ${presenceState.activityUrl}`
      : '';

    return `> **Type :** ${labels[presenceState.activityType] || `Type ${presenceState.activityType}`}\n> **Texte :** ${emojiPart}${presenceState.activityName}${urlPart}`;
  };

  const buildPanel = () => {
    const container = new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('# Panel de gestion du bot'),
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('> Modifie le nom, la pp, la banner, le statut et l activite en temps reel'),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('# Infos actuelles'),
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(`> **Nom :** \`${bot.user.username}\`\n> **Status :** \`${formatStatus()}\`\n${formatActivity()}`),
      );

    if (currentAvatarUrl || currentBannerUrl) {
      const gallery = new Discord.MediaGalleryBuilder();
      if (currentAvatarUrl) gallery.addItems(new Discord.MediaGalleryItemBuilder().setURL(currentAvatarUrl));
      if (currentBannerUrl) gallery.addItems(new Discord.MediaGalleryItemBuilder().setURL(currentBannerUrl));

      container
        .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(
          new Discord.TextDisplayBuilder().setContent('# Apercu visuel'),
        )
        .addMediaGalleryComponents(gallery);
    }

    return container
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addActionRowComponents(
        new Discord.ActionRowBuilder().addComponents(
          new Discord.ButtonBuilder().setCustomId('botprofile:name').setLabel('Modifier nom').setStyle(Discord.ButtonStyle.Secondary),
          new Discord.ButtonBuilder().setCustomId('botprofile:avatar').setLabel('Modifier pp').setStyle(Discord.ButtonStyle.Secondary),
          new Discord.ButtonBuilder().setCustomId('botprofile:banner').setLabel('Modifier banner').setStyle(Discord.ButtonStyle.Secondary),
        ),
      )
      .addActionRowComponents(
        new Discord.ActionRowBuilder().addComponents(
          new Discord.ButtonBuilder().setCustomId('botprofile:activity').setLabel('Modifier activite').setStyle(Discord.ButtonStyle.Secondary),
          new Discord.ButtonBuilder().setCustomId('botprofile:status').setLabel('Modifier status').setStyle(Discord.ButtonStyle.Secondary),
        ),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true));
  };

  const sendEphemeral = async (interaction, content) => {
    const payload = {
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      components: [new Discord.ContainerBuilder().addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(content))],
    };

    if (interaction.replied || interaction.deferred) return interaction.followUp(payload);
    try {
      return await interaction.reply(payload);
    } catch (error) {
      if (error?.code === 40060) return interaction.followUp(payload);
      throw error;
    }
  };

  await syncBotProfile();

  const msg = await message.reply({
    components: [buildPanel()],
    flags: Discord.MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });

  const refreshPanel = async () => {
    await syncBotProfile();
    await msg.edit({
      components: [buildPanel()],
      flags: Discord.MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  };

  const collector = msg.createMessageComponentCollector({ time: 300000 });

  const handleModal = async (modal) => {
    if (!modal.isModalSubmit()) return;
    if (modal.user.id !== message.author.id) return;

    if (modal.customId === `${panelId}:nameModal`) {
      await modal.deferReply({ flags: Discord.MessageFlags.Ephemeral });
      const newName = modal.fields.getTextInputValue('botNameInput').trim();

      try {
        await bot.user.setUsername(newName);
        await refreshPanel();
        return modal.editReply({ content: `> Nom du bot mis a jour en \`${bot.user.username}\`` });
      } catch (error) {
        console.error('Erreur nom bot:', error);
        return modal.editReply({ content: `> Impossible de modifier le nom du bot : ${error.message}` });
      }
    }

    if (modal.customId === `${panelId}:activityModal`) {
      await modal.deferReply({ flags: Discord.MessageFlags.Ephemeral });

      const rawType = modal.fields.getTextInputValue('activityTypeInput').trim();
      const activityText = modal.fields.getTextInputValue('activityTextInput').trim();
      const activityUrl = modal.fields.getTextInputValue('activityUrlInput').trim();
      const activityEmoji = modal.fields.getTextInputValue('activityEmojiInput').trim();
      const type = Number.parseInt(rawType, 10);

      if (!Number.isInteger(type) || type < 0 || type > 5) {
        return modal.editReply({ content: '> Type invalide. Utilise un nombre entre 0 et 5.' });
      }

      if (!activityText) {
        return modal.editReply({ content: '> Le texte de l activite ne peut pas etre vide.' });
      }

      if (type === ActivityType.Streaming && !activityUrl) {
        return modal.editReply({ content: '> Le type Streaming demande une URL.' });
      }

      const customState = type === ActivityType.Custom
        ? `${activityEmoji ? `${activityEmoji} ` : ''}${activityText}`.trim()
        : activityText;

      try {
        presenceState = {
          ...presenceState,
          status: presenceState.status || 'idle',
          activityType: type,
          activityName: activityText,
          activityUrl: type === ActivityType.Streaming ? activityUrl : '',
          activityEmoji: type === ActivityType.Custom ? activityEmoji : '',
        };

        await bot.user.setPresence({
          status: presenceState.status === 'invisible' ? 'invisible' : presenceState.status,
          activities: [{
            type,
            name: type === ActivityType.Custom ? 'Custom Status' : activityText,
            ...(type === ActivityType.Custom ? { state: customState } : {}),
            ...(type === ActivityType.Streaming ? { url: activityUrl } : {}),
          }],
        });

        saveBotPresence(presenceState);
        await refreshPanel();
        return modal.editReply({ content: '> Activite du bot mise a jour.' });
      } catch (error) {
        console.error('Erreur activite bot:', error);
        return modal.editReply({ content: `> Impossible de modifier l activite : ${error.message}` });
      }
    }

    if (modal.customId === `${panelId}:statusModal`) {
      await modal.deferReply({ flags: Discord.MessageFlags.Ephemeral });
      const rawStatus = modal.fields.getTextInputValue('statusInput').trim().toLowerCase();
      const statusMap = {
        online: 'online',
        idle: 'idle',
        dnd: 'dnd',
        invisible: 'invisible',
        offline: 'invisible',
      };

      const status = statusMap[rawStatus];
      if (!status) {
        return modal.editReply({ content: '> Status invalide. Choisis online, idle, dnd, invisible ou offline.' });
      }

      try {
        presenceState = { ...presenceState, status };
        await bot.user.setPresence({
          status,
          activities: presenceState.activityName
            ? [{
                type: presenceState.activityType,
                name: presenceState.activityType === ActivityType.Custom ? 'Custom Status' : presenceState.activityName,
                ...(presenceState.activityType === ActivityType.Custom
                  ? { state: `${presenceState.activityEmoji ? `${presenceState.activityEmoji} ` : ''}${presenceState.activityName}`.trim() }
                  : {}),
                ...(presenceState.activityType === ActivityType.Streaming && presenceState.activityUrl
                  ? { url: presenceState.activityUrl }
                  : {}),
              }]
            : [],
        });
        saveBotPresence(presenceState);
        await refreshPanel();
        return modal.editReply({ content: `> Status mis a jour : \`${status === 'invisible' ? 'offline (invisible)' : status}\`` });
      } catch (error) {
        console.error('Erreur status bot:', error);
        return modal.editReply({ content: `> Impossible de modifier le status : ${error.message}` });
      }
    }

    if (modal.customId === `${panelId}:avatarModal`) {
      await modal.deferReply({ flags: Discord.MessageFlags.Ephemeral });
      try {
        const uploadedFiles = modal.fields.getUploadedFiles('avatar_upload', true);
        const file = uploadedFiles?.first();
        if (!file) throw new Error('Aucune image fournie');
        const buffer = await uploadToBuffer(file);
        await bot.user.setAvatar(buffer);
        await refreshPanel();
        return modal.editReply({ content: '> Photo de profil du bot mise a jour.' });
      } catch (error) {
        console.error('Erreur avatar bot:', error);
        return modal.editReply({ content: `> Impossible de modifier la pp : ${error.message}` });
      }
    }

    if (modal.customId === `${panelId}:bannerModal`) {
      await modal.deferReply({ flags: Discord.MessageFlags.Ephemeral });
      try {
        const uploadedFiles = modal.fields.getUploadedFiles('banner_upload', true);
        const file = uploadedFiles?.first();
        if (!file) throw new Error('Aucune image fournie');
        const buffer = await uploadToBuffer(file);
        await bot.user.setBanner(buffer);
        await refreshPanel();
        return modal.editReply({ content: '> Banner du bot mise a jour.' });
      } catch (error) {
        console.error('Erreur banner bot:', error);
        return modal.editReply({ content: `> Impossible de modifier la banner : ${error.message}` });
      }
    }
  };

  bot.on('interactionCreate', handleModal);

  collector.on('collect', async (interaction) => {
    if (interaction.user.id !== message.author.id) {
      return sendEphemeral(interaction, '> Ce panneau ne vous appartient pas.');
    }

    if (interaction.customId === 'botprofile:name') {
      const modal = new Discord.ModalBuilder()
        .setCustomId(`${panelId}:nameModal`)
        .setTitle('Modifier le nom du bot')
        .addComponents(
          new Discord.ActionRowBuilder().addComponents(
            new Discord.TextInputBuilder()
              .setCustomId('botNameInput')
              .setLabel('Nouveau nom')
              .setStyle(Discord.TextInputStyle.Short)
              .setValue(bot.user.username)
              .setRequired(true),
          ),
        );

      return interaction.showModal(modal);
    }

    if (interaction.customId === 'botprofile:activity') {
      const modal = new Discord.ModalBuilder()
        .setCustomId(`${panelId}:activityModal`)
        .setTitle('Modifier l activite')
        .addComponents(
          new Discord.ActionRowBuilder().addComponents(
            new Discord.TextInputBuilder()
              .setCustomId('activityTypeInput')
              .setLabel('Type 0-5')
              .setStyle(Discord.TextInputStyle.Short)
              .setValue(String(presenceState.activityType ?? ActivityType.Custom))
              .setRequired(true),
          ),
          new Discord.ActionRowBuilder().addComponents(
            new Discord.TextInputBuilder()
              .setCustomId('activityTextInput')
              .setLabel('Texte / nom de l activite')
              .setStyle(Discord.TextInputStyle.Paragraph)
              .setValue(presenceState.activityName || '')
              .setRequired(true),
          ),
          new Discord.ActionRowBuilder().addComponents(
            new Discord.TextInputBuilder()
              .setCustomId('activityUrlInput')
              .setLabel('URL streaming (type 1 seulement)')
              .setStyle(Discord.TextInputStyle.Short)
              .setValue(presenceState.activityUrl || '')
              .setRequired(false),
          ),
          new Discord.ActionRowBuilder().addComponents(
            new Discord.TextInputBuilder()
              .setCustomId('activityEmojiInput')
              .setLabel('Emoji custom (type 4 seulement)')
              .setStyle(Discord.TextInputStyle.Short)
              .setValue(presenceState.activityEmoji || '')
              .setRequired(false),
          ),
        );

      return interaction.showModal(modal);
    }

    if (interaction.customId === 'botprofile:status') {
      const modal = new Discord.ModalBuilder()
        .setCustomId(`${panelId}:statusModal`)
        .setTitle('Modifier le status')
        .addComponents(
          new Discord.ActionRowBuilder().addComponents(
            new Discord.TextInputBuilder()
              .setCustomId('statusInput')
              .setLabel('online / idle / dnd / invisible / offline')
              .setStyle(Discord.TextInputStyle.Short)
              .setValue(presenceState.status === 'invisible' ? 'offline' : (presenceState.status || 'idle'))
              .setRequired(true),
          ),
        );

      return interaction.showModal(modal);
    }

    if (interaction.customId === 'botprofile:avatar') {
      const modal = new Discord.ModalBuilder()
        .setCustomId(`${panelId}:avatarModal`)
        .setTitle('Modifier la photo de profil')
        .addLabelComponents(
          new Discord.LabelBuilder()
            .setLabel('Upload de la photo de profil')
            .setDescription('Envoie une image pour remplacer la photo de profil du bot.')
            .setFileUploadComponent(
              new Discord.FileUploadBuilder()
                .setCustomId('avatar_upload')
                .setMinValues(1)
                .setMaxValues(1)
                .setRequired(true),
            ),
        );

      return interaction.showModal(modal);
    }

    if (interaction.customId === 'botprofile:banner') {
      const modal = new Discord.ModalBuilder()
        .setCustomId(`${panelId}:bannerModal`)
        .setTitle('Modifier la banner')
        .addLabelComponents(
          new Discord.LabelBuilder()
            .setLabel('Upload de la banner')
            .setDescription('Envoie une image pour remplacer la banner du bot.')
            .setFileUploadComponent(
              new Discord.FileUploadBuilder()
                .setCustomId('banner_upload')
                .setMinValues(1)
                .setMaxValues(1)
                .setRequired(true),
            ),
        );

      return interaction.showModal(modal);
    }
  });

  collector.on('end', () => {
    bot.off('interactionCreate', handleModal);
  });
};
