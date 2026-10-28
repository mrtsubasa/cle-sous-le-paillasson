const {
  ContainerBuilder,
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
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize
} = require('discord.js');

exports.help = {
  name: 'embed',
  aliases: ['c&embed', "embb"],
  type: 'wl',
  description: 'Créer un embed en Components v2',
};

exports.run = async (bot, message) => {
  if (!bot.functions.checkPerm(bot, message, 'wl')) return;

  let embedChannels = [];
  let embedData = {
    title: '',
    description: '',
    footer: '',
    thumbnail: '',
    image: '',
    color: '',
    layout: ['title', 'separator', 'thumbnail', 'description', 'image', 'buttons', 'footer', 'separator'],
    buttons: []
  };
  let isRunning = false;

  const DEFAULT_LAYOUT = ['title', 'separator', 'thumbnail', 'description', 'image', 'buttons', 'footer', 'separator'];

  const normalizeButtonUrl = (value) => {
    const url = (value || '').trim();
    if (!url) return '';

    try {
      return new URL(url).toString();
    } catch {
      return '';
    }
  };

  const chunkButtons = (buttons, size = 5) => {
    const chunks = [];
    for (let i = 0; i < buttons.length; i += size) {
      chunks.push(buttons.slice(i, i + size));
    }
    return chunks;
  };

  const SEPARATOR_TOKEN = '(separator)';

  const isImageUrl = (value) => {
    const input = String(value || '').trim();
    if (!input) return false;

    try {
      const url = new URL(input);
      const pathname = url.pathname.toLowerCase();
      const knownImageHosts = new Set([
        'cdn.discordapp.com',
        'media.discordapp.net',
        'images-ext-1.discordapp.net',
        'images-ext-2.discordapp.net'
      ]);
      return /\.(png|jpg|jpeg|gif|webp|bmp|avif)$/.test(pathname) || knownImageHosts.has(url.hostname);
    } catch {
      return false;
    }
  };

  const addTextWithSeparators = (container, text) => {
    const parts = String(text || '')
      .split(SEPARATOR_TOKEN)
      .map(part => part.replace(/\\n/g, '\n'));

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const lines = part.split('\n');
      let buffer = [];

      const flushBuffer = () => {
        if (!buffer.length) return;
        const content = buffer.join('\n');
        if (content.trim()) {
          container.addTextDisplayComponents(t => t.setContent(content));
        }
        buffer = [];
      };

      for (const line of lines) {
        if (isImageUrl(line)) {
          flushBuffer();
          container.addMediaGalleryComponents(g => g.addItems(i => i.setURL(line.trim())));
        } else {
          buffer.push(line);
        }
      }
      flushBuffer();

      const hasMoreContent = parts.slice(i + 1).some(next => next.trim());
      if (hasMoreContent) {
        container.addSeparatorComponents(
          new SeparatorBuilder()
            .setSpacing(SeparatorSpacingSize.Small)
            .setDivider(true)
        );
      }
    }
  };

  const ackModal = async (modal) => {
    try {
      await modal.deferReply({ flags: MessageFlags.Ephemeral });
      return true;
    } catch {
      return false;
    }
  };

  const getLayout = () => {
    return Array.isArray(embedData.layout) && embedData.layout.length ? embedData.layout : DEFAULT_LAYOUT;
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
          `# Texte de l'embed\n` +
          `> Titre: ${embedData.title || 'Non défini'}\n` +
          `> Description: ${embedData.description || 'Non défini'}\n` +
          `> Thumbnail: ${embedData.thumbnail || 'Non défini'}\n` +
          `> Footer: ${embedData.footer || 'Non défini'}\n` +
          `> Couleur: ${embedData.color || 'Par défaut'}`
        )
      )
      .addActionRowComponents(row =>
        row.setComponents(
          new ButtonBuilder()
            .setCustomId('editText')
            .setLabel('Modifier Texte')
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId('editThumbnail')
            .setLabel('Modifier Thumbnail')
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId('editImages')
            .setLabel('Modifier Image')
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId('editColor')
            .setLabel('Modifier Couleur')
            .setStyle(ButtonStyle.Secondary)
        )
      )
      .addSeparatorComponents(s => s)

      .addTextDisplayComponents(t =>
        t.setContent(
          `# Boutons & Liens\n` +
          `${embedData.buttons.length
            ? embedData.buttons.map((btn, index) => `> ${index + 1}. [${btn.label}](${btn.url})`).join('\n')
            : '> Aucun bouton ajouté'}\n` +
          `> Les boutons lien Discord n'ont pas de couleur personnalisée`
        )
      )
      .addActionRowComponents(row =>
        row.setComponents(
          new ButtonBuilder()
            .setCustomId('editButtons')
            .setLabel('Ajouter Bouton')
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId('clearButtons')
            .setLabel('Vider Boutons')
            .setStyle(ButtonStyle.Secondary)
        )
      )
      .addTextDisplayComponents(t =>
      t.setContent(
        `# Ordre de l embed\n` +
        `> title\n` +
        `> separator\n` +
        `> thumbnail\n` +
        `> description\n` +
        `> image\n` +
        `> buttons\n` +
        `> footer\n` +
        `> separator\n\n` +
        `> C'est utile quand tu veux placer les séparateurs sans les écrire directement dans la description.\n` +
        `> Utilise les mots: title, thumbnail, description, image, buttons, footer, separator`
      )
    )
      .addActionRowComponents(row =>
        row.setComponents(
          new ButtonBuilder()
            .setCustomId('editLayout')
            .setLabel('Modifier Ordre')
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId('resetLayout')
            .setLabel('Reset Ordre')
            .setStyle(ButtonStyle.Secondary)
        )
      )
      .addSeparatorComponents(s => s)
      .addTextDisplayComponents(t =>
        t.setContent(
          `# Explication\n` +
          `> Clique sur ce bouton si tu veux voir comment utiliser \`\\n\`, \`(separator)\` et les liens d'image dans ton embed.\n` +
          `> C'est fait pour éviter de remplir le panel avec un long texte d'aide.`
        )
      )
      .addActionRowComponents(row =>
        row.setComponents(
          new ButtonBuilder()
            .setCustomId('helpEmbed')
            .setLabel('Explication')
            .setStyle(ButtonStyle.Secondary)
        )
      )
      .addSeparatorComponents(s => s)

      .addActionRowComponents(row =>
        row.setComponents(
          new ButtonBuilder()
            .setCustomId('send')
            .setLabel('Envoyer')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(isRunning),

          new ButtonBuilder()
            .setCustomId('reset')
            .setLabel('Reset')
            .setStyle(ButtonStyle.Secondary)
        )
      );

    return container;
  };

  const msg = await message.reply({
    components: [buildPanel()],
    flags: MessageFlags.IsComponentsV2
  });

  const collector = msg.createMessageComponentCollector({ time: 300000 });

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
      const modal = new ModalBuilder()
        .setCustomId('modalText')
        .setTitle('Modifier Texte')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('title')
              .setLabel('Titre (Markdown autorisé)')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('description')
              .setLabel('Description (Markdown autorisé)')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('footer')
              .setLabel('Footer (Markdown autorisé)')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          )
        );

      await interaction.showModal(modal);

      const submitted = await interaction.awaitModalSubmit({
        filter: m => m.user.id === message.author.id && m.customId === 'modalText',
        time: 300000
      }).catch(() => null);

      if (submitted) {
        const canReply = await ackModal(submitted);
        embedData.title = submitted.fields.getTextInputValue('title');
        embedData.description = submitted.fields.getTextInputValue('description');
        embedData.footer = submitted.fields.getTextInputValue('footer');

        await msg.edit({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });
        if (canReply) await submitted.editReply({ content: '> Texte mis à jour' });
      }
    }

    if (interaction.customId === 'editThumbnail') {
      const submitted = await openUploadModal(interaction, {
        customId: 'modalThumbnail',
        title: 'Modifier Thumbnail',
        label: 'Thumbnail de l embed',
        description: 'Upload un fichier image pour remplacer la miniature de l embed.',
        fieldId: 'thumbnail_upload'
      });

      if (submitted) {
        const canReply = await ackModal(submitted);
        const uploadedFiles = submitted.fields.getUploadedFiles('thumbnail_upload', true);
        const thumbnailFile = uploadedFiles?.first?.() ?? uploadedFiles?.values?.().next?.().value ?? null;

        if (!thumbnailFile?.url) {
          if (canReply) await submitted.editReply({ content: '> Aucun fichier image valide reçu.' });
          return;
        }

        embedData.thumbnail = thumbnailFile.url;
        await msg.edit({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });
        if (canReply) await submitted.editReply({ content: '> Thumbnail mise à jour' });
      }
    }

    if (interaction.customId === 'editImages') {
      const submitted = await openUploadModal(interaction, {
        customId: 'modalImage',
        title: 'Modifier Image',
        label: 'Image principale',
        description: 'Upload un fichier image pour remplacer l image principale de l embed.',
        fieldId: 'image_upload'
      });

      if (submitted) {
        const canReply = await ackModal(submitted);
        const uploadedFiles = submitted.fields.getUploadedFiles('image_upload', true);
        const imageFile = uploadedFiles?.first?.() ?? uploadedFiles?.values?.().next?.().value ?? null;

        if (!imageFile?.url) {
          if (canReply) await submitted.editReply({ content: '> Aucun fichier image valide reçu.' });
          return;
        }

        embedData.image = imageFile.url;
        await msg.edit({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });
        if (canReply) await submitted.editReply({ content: '> Image mise à jour' });
      }
    }

    if (interaction.customId === 'editColor') {
      const modal = new ModalBuilder()
        .setCustomId('modalColor')
        .setTitle('Modifier Couleur')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('color')
              .setLabel('Couleur (hex, ex: #3498db)')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          )
        );

      await interaction.showModal(modal);

      const submitted = await interaction.awaitModalSubmit({
        filter: m => m.user.id === message.author.id && m.customId === 'modalColor',
        time: 300000
      }).catch(() => null);

      if (submitted) {
        const canReply = await ackModal(submitted);
        embedData.color = submitted.fields.getTextInputValue('color');
        await msg.edit({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });
        if (canReply) await submitted.editReply({ content: `> Couleur mise à jour : ${embedData.color}` });
      }
    }

    if (interaction.customId === 'editButtons') {
      const modal = new ModalBuilder()
        .setCustomId('modalButton')
        .setTitle('Ajouter un bouton lien')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('label')
              .setLabel('Texte du bouton')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('url')
              .setLabel('Lien du bouton (https://...)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

      await interaction.showModal(modal);

      const submitted = await interaction.awaitModalSubmit({
        filter: m => m.user.id === message.author.id && m.customId === 'modalButton',
        time: 300000
      }).catch(() => null);

      if (submitted) {
        const canReply = await ackModal(submitted);
        const label = submitted.fields.getTextInputValue('label').trim();
        const url = normalizeButtonUrl(submitted.fields.getTextInputValue('url'));

        if (!label || !url) {
          if (canReply) await submitted.editReply({ content: '> Le texte ou le lien du bouton est invalide.' });
          return;
        }

        embedData.buttons.push({ label, url });
        await msg.edit({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });
        if (canReply) await submitted.editReply({ content: '> Bouton ajouté' });
      }
    }

    if (interaction.customId === 'clearButtons') {
      embedData.buttons = [];
      return interaction.update({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });
    }

    if (interaction.customId === 'editLayout') {
      const modal = new ModalBuilder()
        .setCustomId('modalLayout')
        .setTitle('Modifier ordre de l embed')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('layout')
              .setLabel('Ordre des blocs')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setValue('title\nseparator\nthumbnail\ndescription\nimage\nbuttons\nfooter\nseparator')
          )
        );

      await interaction.showModal(modal);

      const submitted = await interaction.awaitModalSubmit({
        filter: m => m.user.id === message.author.id && m.customId === 'modalLayout',
        time: 300000
      }).catch(() => null);

      if (submitted) {
        const canReply = await ackModal(submitted);
        const raw = submitted.fields.getTextInputValue('layout');
        const layout = String(raw || '')
          .split(/\n+/)
          .map(item => item.trim().toLowerCase())
          .filter(Boolean);

        const allowed = new Set(['title', 'thumbnail', 'description', 'image', 'buttons', 'footer', 'separator']);
        const valid = layout.filter(item => allowed.has(item));

        if (!valid.length) {
          if (canReply) await submitted.editReply({ content: '> Ordre invalide. Utilise title, thumbnail, description, image, buttons, footer, separator.' });
          return;
        }

        embedData.layout = valid;
        await msg.edit({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });
        if (canReply) await submitted.editReply({ content: '> Ordre mis à jour' });
      }
    }

    if (interaction.customId === 'resetLayout') {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: '> Ordre réinitialisé : title, separator, thumbnail, description, image, buttons, footer, separator'
      });
    }

    if (interaction.customId === 'helpEmbed') {
      return interaction.reply({
        flags: MessageFlags.Ephemeral,
        content:
          `**Comment utiliser l'embed**\n` +
          `> \`\\n\` = retour à la ligne\n` +
          `> \`(separator)\` = coupe le texte en plusieurs blocs avec un séparateur entre eux\n` +
          `> Colle un lien d'image direct dans le texte pour l'afficher comme image\n\n` +
          `> Utilise le bouton Thumbnail pour ajouter une miniature au rendu\n\n` +
          `**Exemple de log**\n` +
          '```txt\n' +
          '## LOG DU SERVEUR\n' +
          '> Un membre a rejoint le serveur.\n' +
          '> Pseudo : @exemple\n' +
          '> ID : 123456789012345678\n' +
          '> Heure : 18:42\n' +
          '(separator)\n' +
          '## INFO\n' +
          '> Utilise \\n pour aller à la ligne.\n' +
          '> Utilise (separator) pour faire un vrai séparateur.\n' +
          '> Colle un lien image pour l afficher dans l embed.\n' +
          '```'
      });
    }

    if (interaction.customId === 'send') {
      if (!embedChannels.length)
        return interaction.reply({ content: '> Sélectionne au moins un salon', flags: MessageFlags.Ephemeral });

      isRunning = true;
      await interaction.update({ components: [buildPanel()] });

      const buildFinal = () => {
        const container = new ContainerBuilder();

        const validButtons = embedData.buttons
          .map(btn => ({
            label: String(btn.label || '').trim(),
            url: normalizeButtonUrl(btn.url)
          }))
          .filter(btn => btn.label && btn.url);

        const layout = getLayout();
        let buttonsRendered = false;
        let thumbnailRendered = false;
        let imageRendered = false;

        for (const item of layout) {
          if (item === 'title' && embedData.title) {
            addTextWithSeparators(container, embedData.title);
            continue;
          }

          if (item === 'thumbnail' && embedData.thumbnail && !thumbnailRendered) {
            container.addSectionComponents(section =>
              section
                .setThumbnailAccessory(
                  new ThumbnailBuilder({
                    media: { url: embedData.thumbnail }
                  })
                )
                .addTextDisplayComponents(t => t.setContent('\u200b'))
            );
            thumbnailRendered = true;
            continue;
          }

          if (item === 'description' && embedData.description) {
            addTextWithSeparators(container, embedData.description);
            continue;
          }

          if (item === 'image' && embedData.image && !imageRendered) {
            container.addMediaGalleryComponents(g => g.addItems(i => i.setURL(embedData.image)));
            imageRendered = true;
            continue;
          }

          if (item === 'buttons' && validButtons.length && !buttonsRendered) {
            const buttonRows = chunkButtons(validButtons);
            for (const rowButtons of buttonRows) {
              container.addActionRowComponents(row =>
                row.setComponents(
                  ...rowButtons.map(btn =>
                    new ButtonBuilder()
                      .setStyle(ButtonStyle.Link)
                      .setLabel(btn.label)
                      .setURL(btn.url)
                  )
                )
              );
            }
            buttonsRendered = true;
            continue;
          }

          if (item === 'footer' && embedData.footer) {
            addTextWithSeparators(container, embedData.footer);
            continue;
          }

          if (item === 'separator') {
            container.addSeparatorComponents(
              new SeparatorBuilder()
                .setSpacing(SeparatorSpacingSize.Small)
                .setDivider(true)
            );
          }
        }

        if (embedData.color) {
          const hex = embedData.color.replace(/^#/, '');
          const colorNumber = parseInt(hex, 16);
          container.setAccentColor(colorNumber);
        }

        return container;
      };

      for (const id of embedChannels) {
        const channel = message.guild.channels.cache.get(id);
        if (channel?.isTextBased()) {
          await channel.send({ components: [buildFinal()], flags: MessageFlags.IsComponentsV2 });
        }
      }

      embedChannels = [];
      embedData = { title: '', description: '', footer: '', thumbnail: '', image: '', color: '', layout: [...DEFAULT_LAYOUT], buttons: [] };
      isRunning = false;
      await msg.edit({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });
    }

    if (interaction.customId === 'reset') {
      embedData = { title: '', description: '', footer: '', thumbnail: '', image: '', color: '', layout: [...DEFAULT_LAYOUT], buttons: [] };
      return interaction.update({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });
    }
  });
};
