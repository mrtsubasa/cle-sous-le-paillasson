const {
  ActivityType,
  ButtonStyle,
  ButtonBuilder,
  ContainerBuilder,
  FileUploadBuilder,
  LabelBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ActionRowBuilder,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const fs = require('fs');
const { ensurePresenceDir, getPresenceFile } = require('../../Utils/presencePath');

const fetch = globalThis.fetch || require('node-fetch').default;

exports.help = {
  name: 'profil',
  aliases: ['botstatus', 'presence', 'profil'],
  type: 'sys',
  description: 'Panel de gestion du bot: pseudo, pp, banner, presence et status',
};

exports.run = async (bot, message) => {
  if (!bot.functions.checkPerm(bot, message, 'sys')) return;

  const presenceFile = getPresenceFile(bot);
  let currentAvatarUrl = null;
  let currentBannerUrl = null;

  const readPresence = () => {
    const presence = bot.user.presence;
    const activity = presence?.activities?.[0] ?? null;

    return {
      status: presence?.status || 'online',
      activityType: activity?.type ?? ActivityType.Playing,
      activityName:
        activity?.type === ActivityType.Custom
          ? (activity?.state || activity?.name || '')
          : (activity?.name || ''),
      activityUrl: activity?.url || '',
      activityEmoji: activity?.type === ActivityType.Custom ? (activity?.emoji?.name || '') : '',
    };
  };

  const loadSavedPresenceState = () => {
    try {
      if (!fs.existsSync(presenceFile)) return null;
      const raw = fs.readFileSync(presenceFile, 'utf8');
      const saved = JSON.parse(raw);

      return {
        status: ['online', 'idle', 'dnd', 'invisible'].includes(saved.status) ? saved.status : 'online',
        activityType: Number.isInteger(saved.activityType) ? saved.activityType : ActivityType.Playing,
        activityName: typeof saved.activityName === 'string' ? saved.activityName : '',
        activityUrl: typeof saved.activityUrl === 'string' ? saved.activityUrl : '',
        activityEmoji: typeof saved.activityEmoji === 'string' ? saved.activityEmoji : '',
      };
    } catch (err) {
      console.error('Erreur lecture presence sauvegardee:', err);
      return null;
    }
  };

  let presenceState = loadSavedPresenceState() || readPresence();

  const buildCdnImageUrl = (type, id, hash) => {
    if (!hash) return null;
    const ext = hash.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/${type}/${id}/${hash}.${ext}?size=1024`;
  };

  const panelId = `botprofile:${message.id}`;

  const syncBotProfile = async () => {
    try {
      const userData = await bot.rest.get('/users/@me');
      currentAvatarUrl = buildCdnImageUrl('avatars', bot.user.id, userData.avatar) || bot.user.displayAvatarURL({ size: 1024 });
      currentBannerUrl = buildCdnImageUrl('banners', bot.user.id, userData.banner);
    } catch (err) {
      console.error('Erreur sync profil bot:', err);
      currentAvatarUrl = bot.user.displayAvatarURL({ size: 1024 });
      currentBannerUrl = bot.user.bannerURL({ size: 1024 });
    }
  };

  const savePresenceState = () => {
    const payload = {
      status: presenceState.status || 'online',
      activityType: presenceState.activityType,
      activityName: presenceState.activityName || '',
      activityUrl: presenceState.activityUrl || '',
      activityEmoji: presenceState.activityEmoji || '',
    };

    try {
      if (!ensurePresenceDir(presenceFile)) return;
      fs.writeFileSync(presenceFile, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
      console.error('Erreur sauvegarde presence:', err);
    }
  };

  const applyPresenceState = async () => {
    const activities = presenceState.activityName
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
      : [];

    await bot.user.setPresence({
      status: presenceState.status === 'invisible' ? 'invisible' : presenceState.status,
      activities,
    });
  };

  const formatActivity = () => {
    if (!presenceState.activityName) return '> Aucune activite definie';

    const typeLabel = {
      [ActivityType.Playing]: 'Playing',
      [ActivityType.Streaming]: 'Streaming',
      [ActivityType.Listening]: 'Listening',
      [ActivityType.Watching]: 'Watching',
      [ActivityType.Custom]: 'Custom',
      [ActivityType.Competing]: 'Competing',
    }[presenceState.activityType] || `Type ${presenceState.activityType}`;

    const urlPart = presenceState.activityType === ActivityType.Streaming && presenceState.activityUrl
      ? `\n> URL: ${presenceState.activityUrl}`
      : '';

    const emojiPart = presenceState.activityType === ActivityType.Custom && presenceState.activityEmoji
      ? `${presenceState.activityEmoji} `
      : '';

    return `> **Type :** ${typeLabel}\n> **Texte :** ${emojiPart}${presenceState.activityName}${urlPart}`;
  };

  const formatStatus = () => {
    if (presenceState.status === 'invisible') return 'offline (invisible)';
    return presenceState.status || 'online';
  };

  const getStatusInputValue = () => (presenceState.status === 'invisible' ? 'offline' : (presenceState.status || 'online'));

  const normalizeStreamingUrl = (value) => {
    const url = (value || '').trim();
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return `https://${url}`;
  };

  const parseActivityType = (value) => {
    const raw = (value || '').trim().toLowerCase();
    const aliasMap = {
      playing: ActivityType.Playing,
      stream: ActivityType.Streaming,
      streaming: ActivityType.Streaming,
      listen: ActivityType.Listening,
      listening: ActivityType.Listening,
      watch: ActivityType.Watching,
      watching: ActivityType.Watching,
      custom: ActivityType.Custom,
      status: ActivityType.Custom,
      competing: ActivityType.Competing,
    };

    if (raw in aliasMap) return aliasMap[raw];

    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) ? parsed : NaN;
  };

  const uploadedImageToBuffer = async (attachment) => {
    if (!attachment?.url) throw new Error('Aucun fichier fourni');

    const response = await fetch(attachment.url);
    if (!response.ok) throw new Error('Impossible de telecharger le fichier');

    const contentType = attachment.contentType || response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      throw new Error('Le fichier doit etre une image');
    }

    return Buffer.from(await response.arrayBuffer());
  };

  const buildPanel = () => {
    const container = new ContainerBuilder()
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents((text) => text.setContent('# Panel de gestion du bot'))
      .addTextDisplayComponents((text) => text.setContent('> Modifie le nom, la pp, la banner, le statut et l activite en temps reel'))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents((text) => text.setContent('# Infos actuelles'))
      .addTextDisplayComponents((text) => text.setContent(`> **Nom :** \`${bot.user.username}\`\n> **Status :** \`${formatStatus()}\`\n${formatActivity()}`));

    if (currentAvatarUrl || currentBannerUrl) {
      const gallery = new MediaGalleryBuilder();
      if (currentAvatarUrl) {
        gallery.addItems(new MediaGalleryItemBuilder().setURL(currentAvatarUrl));
      }
      if (currentBannerUrl) {
        gallery.addItems(new MediaGalleryItemBuilder().setURL(currentBannerUrl));
      }
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
      container.addTextDisplayComponents((text) => text.setContent('# Apercu visuel'));
      container.addMediaGalleryComponents(gallery);
    }

    if (currentBannerUrl) {
      container
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents((text) => text.setContent('# Banner'))
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(currentBannerUrl),
          ),
        );
    }

    return container
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addActionRowComponents((row) =>
        row.setComponents(
          new ButtonBuilder()
            .setCustomId('botprofile:name')
            .setLabel('Modifier nom')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('botprofile:avatar')
            .setLabel('Modifier pp')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('botprofile:banner')
            .setLabel('Modifier banner')
            .setStyle(ButtonStyle.Secondary),
        ),
      )
      .addActionRowComponents((row) =>
        row.setComponents(
          new ButtonBuilder()
            .setCustomId('botprofile:activity')
            .setLabel('Modifier activite')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('botprofile:status')
            .setLabel('Modifier status')
            .setStyle(ButtonStyle.Secondary),
        ),
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  };

  await syncBotProfile();

  const msg = await message.reply({
    components: [buildPanel()],
    flags: MessageFlags.IsComponentsV2,
  });

  const refreshPanel = async () => {
    await syncBotProfile();
    await msg.edit({
      components: [buildPanel()],
      flags: MessageFlags.IsComponentsV2,
    });
  };

  const collector = msg.createMessageComponentCollector({ time: 300000 });

  const handleModal = async (modal) => {
    if (!modal.isModalSubmit()) return;
    if (modal.user.id !== message.author.id) return;

    if (modal.customId === `${panelId}:nameModal`) {
      await modal.deferReply({ flags: MessageFlags.Ephemeral });
      const newName = modal.fields.getTextInputValue('botNameInput').trim();
      try {
        await bot.user.setUsername(newName);
        await refreshPanel();
        return modal.editReply({ content: `> Nom du bot mis a jour en \`${bot.user.username}\`` });
      } catch (err) {
        console.error('Erreur nom bot:', err);
        return modal.editReply({ content: `> Impossible de modifier le nom du bot : ${err.message}` });
      }
    }

    if (modal.customId === `${panelId}:activityModal`) {
      await modal.deferReply({ flags: MessageFlags.Ephemeral });

      const rawType = modal.fields.getTextInputValue('activityTypeInput').trim();
      const activityText = modal.fields.getTextInputValue('activityTextInput').trim();
      const activityUrl = normalizeStreamingUrl(modal.fields.getTextInputValue('activityUrlInput'));
      const activityEmoji = modal.fields.getTextInputValue('activityEmojiInput').trim();

      const type = parseActivityType(rawType);
      if (!Number.isInteger(type) || type < 0 || type > 5) {
        return modal.editReply({ content: '> Type invalide. Utilise 0-5 ou un mot comme playing, streaming, watching, custom.' });
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

      const activityPayload = {
        type,
        name: type === ActivityType.Custom ? 'Custom Status' : activityText,
      };

      if (type === ActivityType.Streaming) {
        activityPayload.url = activityUrl;
      }

      if (type === ActivityType.Custom) {
        activityPayload.state = customState;
      }

      try {
        presenceState = {
          ...presenceState,
          activityType: type,
          activityName: activityText,
          activityUrl: type === ActivityType.Streaming ? activityUrl : '',
          activityEmoji: type === ActivityType.Custom ? activityEmoji : '',
        };
        await applyPresenceState();
        savePresenceState();
        await refreshPanel();
        return modal.editReply({ content: '> Activite du bot mise a jour.' });
      } catch (err) {
        console.error('Erreur activite bot:', err);
        return modal.editReply({ content: `> Impossible de modifier l activite : ${err.message}` });
      }
    }

    if (modal.customId === `${panelId}:statusModal`) {
      await modal.deferReply({ flags: MessageFlags.Ephemeral });

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
        presenceState = {
          ...presenceState,
          status,
        };
        await applyPresenceState();
        savePresenceState();
        await refreshPanel();
        return modal.editReply({ content: `> Status mis a jour : \`${status === 'invisible' ? 'offline (invisible)' : status}\`` });
      } catch (err) {
        console.error('Erreur status bot:', err);
        return modal.editReply({ content: `> Impossible de modifier le status : ${err.message}` });
      }
    }

    if (modal.customId === `${panelId}:avatarModal`) {
      await modal.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const uploadedFiles = modal.fields.getUploadedFiles('avatar_upload', true);
        const file = uploadedFiles?.first();
        if (!file) throw new Error('Aucune image fournie');

        const buffer = await uploadedImageToBuffer(file);
        await bot.user.setAvatar(buffer);
        await refreshPanel();
        return modal.editReply({ content: '> Photo de profil du bot mise a jour.' });
      } catch (err) {
        console.error('Erreur avatar bot:', err);
        return modal.editReply({ content: `> Impossible de modifier la pp : ${err.message}` });
      }
    }

    if (modal.customId === `${panelId}:bannerModal`) {
      await modal.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const uploadedFiles = modal.fields.getUploadedFiles('banner_upload', true);
        const file = uploadedFiles?.first();
        if (!file) throw new Error('Aucune image fournie');

        const buffer = await uploadedImageToBuffer(file);
        await bot.user.setBanner(buffer);
        await refreshPanel();
        return modal.editReply({ content: '> Banner du bot mise a jour.' });
      } catch (err) {
        console.error('Erreur banner bot:', err);
        return modal.editReply({ content: `> Impossible de modifier la banner : ${err.message}` });
      }
    }
  };

  bot.on('interactionCreate', handleModal);

  collector.on('collect', async (interaction) => {
    if (interaction.user.id !== message.author.id) return;

    if (interaction.customId === 'botprofile:name') {
      const modal = new ModalBuilder()
        .setCustomId(`${panelId}:nameModal`)
        .setTitle('Modifier le nom du bot')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('botNameInput')
              .setLabel('Nouveau nom')
              .setStyle(TextInputStyle.Short)
              .setValue(bot.user.username)
              .setRequired(true),
          ),
        );

      return interaction.showModal(modal);
    }

    if (interaction.customId === 'botprofile:activity') {
      const modal = new ModalBuilder()
        .setCustomId(`${panelId}:activityModal`)
        .setTitle('Modifier l activite')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('activityTypeInput')
              .setLabel('Type 0-5 ou nom')
              .setStyle(TextInputStyle.Short)
              .setValue(String(presenceState.activityType))
              .setPlaceholder('Ex: 0, streaming, watching')
              .setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('activityTextInput')
              .setLabel('Texte / nom de l activite')
              .setStyle(TextInputStyle.Paragraph)
              .setValue(presenceState.activityName || '')
              .setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('activityUrlInput')
              .setLabel('URL streaming (n importe quel lien)')
              .setStyle(TextInputStyle.Short)
              .setValue(presenceState.activityUrl || '')
              .setPlaceholder('Ex: https://youtube.com ou google.com')
              .setRequired(false),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('activityEmojiInput')
              .setLabel('Emoji custom (type 4 seulement)')
              .setStyle(TextInputStyle.Short)
              .setValue(presenceState.activityEmoji || '')
              .setRequired(false),
          ),
        );

      return interaction.showModal(modal);
    }

    if (interaction.customId === 'botprofile:status') {
      const modal = new ModalBuilder()
        .setCustomId(`${panelId}:statusModal`)
        .setTitle('Modifier le status')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('statusInput')
              .setLabel('online / idle / dnd / invisible / offline')
              .setStyle(TextInputStyle.Short)
              .setValue(getStatusInputValue())
              .setRequired(true),
          ),
        );

      return interaction.showModal(modal);
    }

    if (interaction.customId === 'botprofile:avatar') {
      const modal = new ModalBuilder()
        .setCustomId(`${panelId}:avatarModal`)
        .setTitle('Modifier la photo de profil')
        .addComponents(
          new LabelBuilder()
            .setLabel('Upload de la photo de profil')
            .setDescription('Envoie une image pour remplacer la photo de profil du bot.')
            .setFileUploadComponent(
              new FileUploadBuilder()
                .setCustomId('avatar_upload')
                .setMinValues(1)
                .setMaxValues(1)
                .setRequired(true),
            ),
        );

      return interaction.showModal(modal);
    }

    if (interaction.customId === 'botprofile:banner') {
      const modal = new ModalBuilder()
        .setCustomId(`${panelId}:bannerModal`)
        .setTitle('Modifier la banner')
        .addComponents(
          new LabelBuilder()
            .setLabel('Upload de la banner')
            .setDescription('Envoie une image pour remplacer la banner du bot.')
            .setFileUploadComponent(
              new FileUploadBuilder()
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
