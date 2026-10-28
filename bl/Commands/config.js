const Discord = require('discord.js');

const fetch = globalThis.fetch || require('node-fetch').default;

exports.help = {
  name: 'config',
  aliases: [],
  type: 'sys',
  description: 'Configuration complète du profil serveur du bot',
};

exports.run = async (bot, message) => {
  if (!message.guild) return;
  if (!bot.functions.checkPerm(bot, message, 'sys')) return;

  let currentNick = message.guild.members.me?.nickname || bot.user.username;
  let currentBio = 'Non defini';
  let currentAvatarUrl = null;
  let currentBannerUrl = null;

  const panelId = `config:${message.id}`;

  const updateGuildProfile = async (data) => {
    await bot.rest.patch(`/guilds/${message.guild.id}/members/@me`, {
      body: data,
    });
  };

  const uploadedImageToDataUri = async (attachment) => {
    if (!attachment?.url) {
      throw new Error('Aucune image fournie');
    }

    const response = await fetch(attachment.url);
    if (!response.ok) {
      throw new Error('Impossible de telecharger l image');
    }

    const contentType = attachment.contentType || response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error('Le fichier envoye doit etre une image');
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  };

  const syncMemberProfile = async () => {
    try {
      const me = await message.guild.members.fetchMe({ force: true });
      currentNick = me.nickname || bot.user.username;
      currentAvatarUrl = me.displayAvatarURL({ size: 1024 }) || null;
      currentBannerUrl = me.displayBannerURL({ size: 1024 }) || null;
    } catch (err) {
      console.error('Erreur sync profil serveur:', err);
      const me = message.guild.members.me;
      currentNick = me?.nickname || bot.user.username;
      currentAvatarUrl = me?.displayAvatarURL({ size: 1024 }) || null;
      currentBannerUrl = me?.displayBannerURL({ size: 1024 }) || null;
    }
  };

  const buildMediaGallery = () => {
    const gallery = new Discord.MediaGalleryBuilder();

    if (currentAvatarUrl) {
      gallery.addItems(new Discord.MediaGalleryItemBuilder().setURL(currentAvatarUrl));
    }

    if (currentBannerUrl) {
      gallery.addItems(new Discord.MediaGalleryItemBuilder().setURL(currentBannerUrl));
    }

    return gallery;
  };

  const buildPanel = () => {
    const hasMedia = Boolean(currentAvatarUrl || currentBannerUrl);
    const container = new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('# Configuration Profil Serveur Bot'))
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('> Ajuste le profil du bot sur ce serveur en temps reel'),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('# Apercu actuel'))
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          `> **Nickname :** \`${currentNick}\`\n> **Bio :** ${currentBio}`,
        ),
      );

    if (hasMedia) {
      container
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('# Media'))
        .addTextDisplayComponents(
          new Discord.TextDisplayBuilder().setContent(
            `> **PP par serveur :** ${currentAvatarUrl ? 'Disponible' : 'Aucune'}\n> **Banner par serveur :** ${currentBannerUrl ? 'Disponible' : 'Aucune'}`,
          ),
        )
        .addMediaGalleryComponents(buildMediaGallery());
    }

    return container
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
      .addSectionComponents(
        new Discord.SectionBuilder()
          .addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent('### Modifier le Nickname\n> Change le surnom du bot sur ce serveur'),
          )
          .setButtonAccessory(
            new Discord.ButtonBuilder()
              .setCustomId('config:nick')
              .setLabel('Modifier Nickname')
              .setStyle(Discord.ButtonStyle.Secondary),
          ),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
      .addSectionComponents(
        new Discord.SectionBuilder()
          .addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent('### Modifier la Bio Serveur\n> Definis une bio specifique pour ce serveur'),
          )
          .setButtonAccessory(
            new Discord.ButtonBuilder()
              .setCustomId('config:bio')
              .setLabel('Modifier Bio')
              .setStyle(Discord.ButtonStyle.Secondary),
          ),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
      .addSectionComponents(
        new Discord.SectionBuilder()
          .addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent("### Modifier Avatar par Serveur\n> Upload une image pour mettre l avatar"),
          )
          .setButtonAccessory(
            new Discord.ButtonBuilder()
              .setCustomId('config:avatar')
              .setLabel('Modifier Avatar')
              .setStyle(Discord.ButtonStyle.Secondary),
          ),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
      .addSectionComponents(
        new Discord.SectionBuilder()
          .addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent('### Modifier Banner par Serveur\n> Upload une image pour mettre la banniere'),
          )
          .setButtonAccessory(
            new Discord.ButtonBuilder()
              .setCustomId('config:banner')
              .setLabel('Modifier Banner')
              .setStyle(Discord.ButtonStyle.Secondary),
          ),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
  };

  const sendEphemeral = async (interaction, content) => {
    const payload = {
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      components: [
        new Discord.ContainerBuilder().addTextDisplayComponents(
          new Discord.TextDisplayBuilder().setContent(content),
        ),
      ],
      allowedMentions: { parse: [] },
    };

    if (interaction.replied || interaction.deferred) {
      return interaction.followUp(payload);
    }

    return interaction.reply(payload);
  };

  await syncMemberProfile();

  const msg = await message.reply({
    components: [buildPanel()],
    flags: Discord.MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });

  const refreshPanel = async () => {
    await syncMemberProfile();
    await msg.edit({
      components: [buildPanel()],
      flags: Discord.MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  };

  const collector = msg.createMessageComponentCollector({ time: 300000 });

  collector.on('collect', async (interaction) => {
    try {
      if (interaction.user.id !== message.author.id) {
        return sendEphemeral(interaction, '> Pas pour toi fdp de merde!!');
      }

      const modalId =
        interaction.customId === 'config:nick'
          ? `${panelId}:nick`
          : interaction.customId === 'config:bio'
            ? `${panelId}:bio`
            : interaction.customId === 'config:avatar'
              ? `${panelId}:avatar`
              : interaction.customId === 'config:banner'
                ? `${panelId}:banner`
                : null;

      if (!modalId) return;

      if (interaction.customId === 'config:nick') {
        const modal = new Discord.ModalBuilder()
          .setCustomId(modalId)
          .setTitle('Modifier Nickname')
          .addComponents(
            new Discord.ActionRowBuilder().addComponents(
              new Discord.TextInputBuilder()
                .setCustomId('nickInput')
                .setLabel('Nouveau Nickname')
                .setStyle(Discord.TextInputStyle.Short)
                .setRequired(false),
            ),
          );

        await interaction.showModal(modal);
      }

      if (interaction.customId === 'config:bio') {
        const modal = new Discord.ModalBuilder()
          .setCustomId(modalId)
          .setTitle('Modifier Bio Serveur')
          .addComponents(
            new Discord.ActionRowBuilder().addComponents(
              new Discord.TextInputBuilder()
                .setCustomId('bioInput')
                .setLabel('Nouvelle Bio')
                .setStyle(Discord.TextInputStyle.Paragraph)
                .setRequired(false),
            ),
          );

        await interaction.showModal(modal);
      }

      if (interaction.customId === 'config:avatar') {
        const modal = new Discord.ModalBuilder()
          .setCustomId(modalId)
          .setTitle('Modifier Avatar Serveur')
          .addLabelComponents(
            new Discord.LabelBuilder()
              .setLabel("Upload de l avatar")
              .setDescription('Envoie une image au format PNG, JPG, GIF, WEBP, etc.')
              .setFileUploadComponent(
                new Discord.FileUploadBuilder()
                  .setCustomId('avatar_upload')
                  .setMinValues(1)
                  .setMaxValues(1)
                  .setRequired(true),
              ),
          );

        await interaction.showModal(modal);
      }

      if (interaction.customId === 'config:banner') {
        const modal = new Discord.ModalBuilder()
          .setCustomId(modalId)
          .setTitle('Modifier Banner Serveur')
          .addLabelComponents(
            new Discord.LabelBuilder()
              .setLabel('Upload de la banniere')
              .setDescription('Envoie une image au format PNG, JPG, GIF, WEBP, etc.')
              .setFileUploadComponent(
                new Discord.FileUploadBuilder()
                  .setCustomId('banner_upload')
                  .setMinValues(1)
                  .setMaxValues(1)
                  .setRequired(true),
              ),
          );

        await interaction.showModal(modal);
      }

      const submitted = await interaction.awaitModalSubmit({
        time: 60000,
        filter: (modal) => modal.user.id === message.author.id && modal.customId === modalId,
      }).catch(() => null);

      if (!submitted) return;

      if (submitted.customId === `${panelId}:nick`) {
        await submitted.deferReply({ flags: Discord.MessageFlags.Ephemeral });
        const nick = submitted.fields.getTextInputValue('nickInput')?.trim() || null;
        await updateGuildProfile({ nick });
        await refreshPanel();
        return submitted.editReply({ content: '> Nickname mis a jour !' });
      }

      if (submitted.customId === `${panelId}:bio`) {
        await submitted.deferReply({ flags: Discord.MessageFlags.Ephemeral });
        const bio = submitted.fields.getTextInputValue('bioInput')?.trim() || null;
        await updateGuildProfile({ bio });
        currentBio = bio || 'Non defini';
        await refreshPanel();
        return submitted.editReply({ content: '> Bio serveur mise a jour !' });
      }

      if (submitted.customId === `${panelId}:avatar`) {
        await submitted.deferReply({ flags: Discord.MessageFlags.Ephemeral });
        try {
          const uploadedFiles = submitted.fields.getUploadedFiles('avatar_upload', true);
          const image = uploadedFiles?.first();
          if (!image) throw new Error('Aucune image fournie');

          const dataUri = await uploadedImageToDataUri(image);
          await updateGuildProfile({ avatar: dataUri });
          await refreshPanel();
          return submitted.editReply({ content: '> Avatar serveur mis a jour !' });
        } catch (error) {
          console.log('Erreur avatar:', error);
          return submitted.editReply({ content: `> Impossible de recuperer l image : ${error.message}` });
        }
      }

      if (submitted.customId === `${panelId}:banner`) {
        await submitted.deferReply({ flags: Discord.MessageFlags.Ephemeral });
        try {
          const uploadedFiles = submitted.fields.getUploadedFiles('banner_upload', true);
          const image = uploadedFiles?.first();
          if (!image) throw new Error('Aucune image fournie');

          const dataUri = await uploadedImageToDataUri(image);
          await updateGuildProfile({ banner: dataUri });
          await refreshPanel();
          return submitted.editReply({ content: '> Banner serveur mise a jour !' });
        } catch (error) {
          console.log('Erreur banner:', error);
          return submitted.editReply({ content: `> Impossible de recuperer l image : ${error.message}` });
        }
      }
    } catch (error) {
      console.error('Erreur commande config:', error);
      if (interaction.deferred || interaction.replied) {
        return interaction.followUp({
          flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
          components: [
            new Discord.ContainerBuilder().addTextDisplayComponents(
              new Discord.TextDisplayBuilder().setContent(`> Une erreur est survenue : ${error.message}`),
            ),
          ],
        });
      }

      return interaction.reply({
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
        components: [
          new Discord.ContainerBuilder().addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent(`> Une erreur est survenue : ${error.message}`),
          ),
        ],
      }).catch(() => null);
    }
  });
};
