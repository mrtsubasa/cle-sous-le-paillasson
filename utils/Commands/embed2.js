const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ActionRowBuilder,
  ModalBuilder,
  LabelBuilder,
  FileUploadBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  SeparatorBuilder,
  ContainerBuilder
} = require('discord.js');

exports.help = {
  name: 'embed2',
  aliases: ['c&embed2', 'emb'],
  type: 'wl',
  description: 'Créer un embed en EmbedBuilder',
};

exports.run = async (bot, message) => {
  if (!bot.functions.checkPerm(bot, message, 'wl')) return;

  let embedChannels = [];
  const createDefaultEmbedData = () => ({
    title: '',
    url: '',
    description: '',
    color: '',
    timestamp: false,
    footer: { text: '', iconURL: '' },
    author: { name: '', iconURL: '', url: '' },
    thumbnail: '',
    image: ''
  });
  let embedData = createDefaultEmbedData();
  let isRunning = false;

  const resetPanelState = () => {
    embedChannels = [];
    embedData = createDefaultEmbedData();
    isRunning = false;
  };

  const buildPanel = () => {
    const container = new ContainerBuilder()
      .addTextDisplayComponents(t => t.setContent('# Panel Configuration'))
      .addSeparatorComponents(s => s)

      .addTextDisplayComponents(t =>
        t.setContent(
          `# Salons\n${embedChannels.length
            ? embedChannels.map(id => `> <#${id}>`).join('\n')
            : '> Aucun salon sélectionné'}`
        )
      )
      .addActionRowComponents(row =>
        row.setComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('embedChannels')
            .addChannelTypes(ChannelType.GuildText)
            .setMinValues(1)
            .setMaxValues(10)
        )
      )
      .addSeparatorComponents(s => s)

      .addTextDisplayComponents(t =>
        t.setContent(
          `# Texte & Couleur\n` +
          `> Titre: ${embedData.title || 'Non défini'}\n` +
          `> URL: ${embedData.url || 'Non défini'}\n` +
          `> Description: ${embedData.description || 'Non défini'}\n` +
          `> Couleur: ${embedData.color || 'Par défaut'}\n` +
          `> Timestamp: ${embedData.timestamp ? 'Oui' : 'Non'}`
        )
      )
      .addActionRowComponents(row =>
        row.setComponents(
          new ButtonBuilder().setCustomId('editText').setLabel('Modifier Texte').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('editColor').setLabel('Modifier Couleur').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('toggleTimestamp').setLabel('Toggle Timestamp').setStyle(ButtonStyle.Secondary)
        )
      )
      .addSeparatorComponents(s => s)

      .addTextDisplayComponents(t =>
        t.setContent(
          `# Auteur\n` +
          `> Nom: ${embedData.author.name || 'Non défini'}\n` +
          `> URL: ${embedData.author.url || 'Non défini'}\n` +
          `> Icon: ${embedData.author.iconURL || 'Non défini'}`
        )
      )
      .addActionRowComponents(row =>
        row.setComponents(
          new ButtonBuilder().setCustomId('editAuthor').setLabel('Modifier Auteur').setStyle(ButtonStyle.Secondary)
        )
      )
      .addSeparatorComponents(s => s)

      .addTextDisplayComponents(t =>
        t.setContent(
          `# Footer\n` +
          `> Texte: ${embedData.footer.text || 'Non défini'}\n` +
          `> Icon: ${embedData.footer.iconURL || 'Non défini'}`
        )
      )
      .addActionRowComponents(row =>
        row.setComponents(
          new ButtonBuilder().setCustomId('editFooter').setLabel('Modifier Footer').setStyle(ButtonStyle.Secondary)
        )
      )
      .addSeparatorComponents(s => s)

      .addTextDisplayComponents(t =>
        t.setContent(
          `# Images\n` +
          `> Thumbnail: ${embedData.thumbnail || 'Non défini'}\n` +
          `> Image principale: ${embedData.image || 'Non défini'}`
        )
      )
      .addActionRowComponents(row =>
        row.setComponents(
          new ButtonBuilder().setCustomId('editImages').setLabel('Modifier Images').setStyle(ButtonStyle.Secondary)
        )
      )
      .addSeparatorComponents(s => s)
      .addActionRowComponents(row =>
        row.setComponents(
          new ButtonBuilder().setCustomId('send').setLabel('Envoyer').setStyle(ButtonStyle.Secondary).setDisabled(isRunning),
          new ButtonBuilder().setCustomId('reset').setLabel('Reset').setStyle(ButtonStyle.Secondary)
        )
      )
      .addSeparatorComponents(s => s);

    return container;
  };

  const msg = await message.reply({
    components: [buildPanel()],
    flags: MessageFlags.IsComponentsV2
  });

  const collector = msg.createMessageComponentCollector({ time: 600000 });

  const ackModal = async (modal) => {
    try {
      await modal.deferReply({ flags: MessageFlags.Ephemeral });
      return true;
    } catch {
      return false;
    }
  };

  const openModal = async (interaction, customId, title, fields) => {
    const modal = new ModalBuilder().setCustomId(customId).setTitle(title)
      .addComponents(
        ...fields.map(f => new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(f.id)
            .setLabel(f.label)
            .setStyle(f.style)
            .setRequired(false)
        ))
      );
    await interaction.showModal(modal);

    const submitted = await interaction.awaitModalSubmit({
      filter: m => m.user.id === message.author.id && m.customId === customId,
      time: 300000
    }).catch(() => null);

    return submitted;
  };

  const openUploadModal = async (interaction, { customId, title, label, description, fieldId }) => {
    const modal = new ModalBuilder()
      .setCustomId(customId)
      .setTitle(title)
      .addLabelComponents(
        new LabelBuilder()
          .setLabel(label)
          .setDescription(description)
          .setFileUploadComponent(
            new FileUploadBuilder()
              .setCustomId(fieldId)
              .setMinValues(1)
              .setMaxValues(1)
              .setRequired(true)
          )
      );

    await interaction.showModal(modal);

    const submitted = await interaction.awaitModalSubmit({
      filter: m => m.user.id === message.author.id && m.customId === customId,
      time: 300000
    }).catch(() => null);

    return submitted;
  };

  collector.on('collect', async interaction => {
    if (interaction.user.id !== message.author.id) return;

    if (interaction.customId === 'embedChannels') {
      embedChannels = interaction.values;
      return interaction.update({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });
    }

    if (interaction.customId === 'editText') {
      const submitted = await openModal(interaction, 'modalText', 'Modifier Texte & URL', [
        { id: 'title', label: 'Titre', style: TextInputStyle.Short },
        { id: 'url', label: 'URL du titre', style: TextInputStyle.Short },
        { id: 'description', label: 'Description', style: TextInputStyle.Paragraph }
      ]);
      if (!submitted) return;
      const canReply = await ackModal(submitted);
      embedData.title = submitted.fields.getTextInputValue('title');
      embedData.url = submitted.fields.getTextInputValue('url');
      embedData.description = submitted.fields.getTextInputValue('description');
      if (canReply) await submitted.editReply({ content: `> Texte mis à jour !` });
    }

    if (interaction.customId === 'editColor') {
      const submitted = await openModal(interaction, 'modalColor', 'Modifier Couleur', [
        { id: 'color', label: 'Couleur hex (ex: #3498db)', style: TextInputStyle.Short }
      ]);
      if (!submitted) return;
      const canReply = await ackModal(submitted);
      embedData.color = submitted.fields.getTextInputValue('color');
      if (canReply) await submitted.editReply({ content: `> Couleur mise à jour !` });
    }

    if (interaction.customId === 'toggleTimestamp') {
      embedData.timestamp = !embedData.timestamp;
      await interaction.update({ components: [buildPanel()] });
      return;
    }

    if (interaction.customId === 'editAuthor') {
      const modal = new ModalBuilder()
        .setCustomId('modalAuthor')
        .setTitle('Modifier Auteur')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('name')
              .setLabel('Nom')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('url')
              .setLabel('URL')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          )
        )
        .addLabelComponents(
          new LabelBuilder()
            .setLabel('Icon')
            .setDescription('Upload un fichier image pour remplacer l icone de l auteur.')
            .setFileUploadComponent(
              new FileUploadBuilder()
                .setCustomId('author_icon_upload')
                .setMinValues(1)
                .setMaxValues(1)
                .setRequired(true)
            )
        );

      await interaction.showModal(modal);

      const submitted = await interaction.awaitModalSubmit({
        filter: m => m.user.id === message.author.id && m.customId === 'modalAuthor',
        time: 300000
      }).catch(() => null);

      if (!submitted) return;
      const canReply = await ackModal(submitted);
      embedData.author.name = submitted.fields.getTextInputValue('name');
      embedData.author.url = submitted.fields.getTextInputValue('url');

      const uploadedFiles = submitted.fields.getUploadedFiles('author_icon_upload', true);
      const iconFile = uploadedFiles?.first?.() ?? uploadedFiles?.values?.().next?.().value ?? null;

      if (!iconFile?.url) {
        if (canReply) await submitted.editReply({ content: '> Aucun fichier image valide reçu.' });
        return;
      }

      embedData.author.iconURL = iconFile.url;
      await msg.edit({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });
      if (canReply) await submitted.editReply({ content: '> Auteur mis à jour !' });
    }

    if (interaction.customId === 'editFooter') {
      const modal = new ModalBuilder()
        .setCustomId('modalFooter')
        .setTitle('Modifier Footer')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('text')
              .setLabel('Texte')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          )
        )
        .addLabelComponents(
          new LabelBuilder()
            .setLabel('Icon')
            .setDescription('Upload un fichier image pour remplacer l icone du footer.')
            .setFileUploadComponent(
              new FileUploadBuilder()
                .setCustomId('footer_icon_upload')
                .setMinValues(1)
                .setMaxValues(1)
                .setRequired(true)
            )
        );

      await interaction.showModal(modal);

      const submitted = await interaction.awaitModalSubmit({
        filter: m => m.user.id === message.author.id && m.customId === 'modalFooter',
        time: 300000
      }).catch(() => null);

      if (!submitted) return;
      const canReply = await ackModal(submitted);
      embedData.footer.text = submitted.fields.getTextInputValue('text');

      const uploadedFiles = submitted.fields.getUploadedFiles('footer_icon_upload', true);
      const iconFile = uploadedFiles?.first?.() ?? uploadedFiles?.values?.().next?.().value ?? null;

      if (!iconFile?.url) {
        if (canReply) await submitted.editReply({ content: '> Aucun fichier image valide reçu.' });
        return;
      }

      embedData.footer.iconURL = iconFile.url;
      await msg.edit({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });
      if (canReply) await submitted.editReply({ content: '> Footer mis à jour !' });
    }

    if (interaction.customId === 'editImages') {
      const modal = new ModalBuilder()
        .setCustomId('modalImages')
        .setTitle('Modifier Images')
        .addLabelComponents(
          new LabelBuilder()
            .setLabel('Thumbnail')
            .setDescription('Upload un fichier image pour remplacer la miniature de l embed.')
            .setFileUploadComponent(
              new FileUploadBuilder()
                .setCustomId('thumbnail_upload')
                .setMinValues(1)
                .setMaxValues(1)
                .setRequired(false)
            )
        )
        .addLabelComponents(
          new LabelBuilder()
            .setLabel('Image principale')
            .setDescription('Upload un fichier image pour remplacer l image principale de l embed.')
            .setFileUploadComponent(
              new FileUploadBuilder()
                .setCustomId('image_upload')
                .setMinValues(1)
                .setMaxValues(1)
                .setRequired(false)
            )
        );

      await interaction.showModal(modal);

      const submitted = await interaction.awaitModalSubmit({
        filter: m => m.user.id === message.author.id && m.customId === 'modalImages',
        time: 300000
      }).catch(() => null);

      if (!submitted) return;

      const canReply = await ackModal(submitted);
      const uploadedThumbnailFiles = submitted.fields.getUploadedFiles('thumbnail_upload', true);
      const uploadedFiles = submitted.fields.getUploadedFiles('image_upload', true);
      const thumbnailFile = uploadedThumbnailFiles?.first?.() ?? uploadedThumbnailFiles?.values?.().next?.().value ?? null;
      const imageFile = uploadedFiles?.first?.() ?? uploadedFiles?.values?.().next?.().value ?? null;

      if (!thumbnailFile?.url && !imageFile?.url) {
        if (canReply) await submitted.editReply({ content: '> Aucun fichier image valide reçu.' });
        return;
      }

      if (thumbnailFile?.url) embedData.thumbnail = thumbnailFile.url;
      if (imageFile?.url) embedData.image = imageFile.url;
      await msg.edit({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });
      if (canReply) await submitted.editReply({ content: '> Images mises à jour !' });
    }

    if (interaction.customId === 'send') {
      if (!embedChannels.length) return interaction.reply({ content: '> Sélectionne au moins un salon', flags: MessageFlags.Ephemeral });
      isRunning = true;
      await interaction.update({ components: [buildPanel()] });

      const embed = new EmbedBuilder()
        .setTitle(embedData.title || null)
        .setURL(embedData.url || null)
        .setDescription(embedData.description || null)
        .setColor(embedData.color ? parseInt(embedData.color.replace(/^#/, ''), 16) : null)
        .setThumbnail(embedData.thumbnail || null)
        .setImage(embedData.image || null)
        .setTimestamp(embedData.timestamp ? new Date() : null);

      if (embedData.author.name || embedData.author.iconURL || embedData.author.url) {
        embed.setAuthor({
          name: embedData.author.name || ' ',
          iconURL: embedData.author.iconURL || undefined,
          url: embedData.author.url || undefined
        });
      }

      if (embedData.footer.text || embedData.footer.iconURL) {
        embed.setFooter({
          text: embedData.footer.text || ' ',
          iconURL: embedData.footer.iconURL || undefined
        });
      }

      for (const id of embedChannels) {
        const channel = message.guild.channels.cache.get(id);
        if (channel?.isTextBased()) await channel.send({ embeds: [embed] });
      }

      resetPanelState();
      await msg.edit({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });
      await interaction.followUp({ content: '> Embed envoyé !', flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId === 'reset') {
      resetPanelState();
      await msg.edit({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });
      await interaction.reply({ content: '> Embed réinitialisé !', flags: MessageFlags.Ephemeral });
    }

    if (interaction.customId !== 'send' && interaction.customId !== 'reset') {
      await msg.edit({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });
    }
  });
};
