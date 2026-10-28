const Discord = require('discord.js');
const { loadGuildProfile, saveGuildProfile } = require('../../Utils/guildProfile');

const fetch = globalThis.fetch || require('node-fetch').default;

exports.help = {
  name: 'profil',
  aliases: ['profilserveur', 'guildprofile', 'configprofile'],
  type: 'sys',
  description: 'Panel de gestion du profil du bot sur ce serveur',
};

exports.run = async (bot, message) => {
  if (!message.guild) return;
  if (!bot.functions.checkPerm(bot, message, 'sys')) return;

  const panelId = `serverprofile:${message.id}`;
  let guildProfile = loadGuildProfile(bot, message.guild.id);

  const syncGuildProfile = async () => {
    const me = await message.guild.members.fetchMe().catch(() => message.guild.members.me);
    return {
      nick: me?.nickname || bot.user.username,
      avatarUrl: me?.avatarURL({ size: 1024 }) || bot.user.displayAvatarURL({ size: 1024 }),
      bannerUrl: me?.bannerURL({ size: 1024 }) || me?.user?.bannerURL?.({ size: 1024 }) || null,
      bio: guildProfile.bio || '',
    };
  };

  const uploadToBuffer = async (attachment) => {
    if (!attachment?.url) throw new Error('Aucune image fournie');
    const response = await fetch(attachment.url);
    if (!response.ok) throw new Error('Impossible de telecharger le fichier');

    const contentType = attachment.contentType || response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) throw new Error('Le fichier doit etre une image');

    return Buffer.from(await response.arrayBuffer());
  };

  let state = await syncGuildProfile();

  const buildPanel = () => {
    const hasMedia = Boolean(state.avatarUrl || state.bannerUrl);
    const container = new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('# Configuration Profil Serveur Bot'),
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('> Ajuste le profil du bot sur ce serveur en temps reel'),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('# Apercu actuel'),
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(`> **Nickname :** \`${state.nick}\`\n> **Bio :** ${state.bio || 'Non defini'}`),
      );

    if (hasMedia) {
      const gallery = new Discord.MediaGalleryBuilder();
      if (state.avatarUrl) gallery.addItems(new Discord.MediaGalleryItemBuilder().setURL(state.avatarUrl));
      if (state.bannerUrl) gallery.addItems(new Discord.MediaGalleryItemBuilder().setURL(state.bannerUrl));

      container
        .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(
          new Discord.TextDisplayBuilder().setContent('# Media'),
        )
        .addTextDisplayComponents(
          new Discord.TextDisplayBuilder().setContent(`> **PP par serveur :** ${state.avatarUrl ? 'Disponible' : 'Aucune'}\n> **Banner par serveur :** ${state.bannerUrl ? 'Disponible' : 'Aucune'}`),
        )
        .addMediaGalleryComponents(gallery);
    }

    return container
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addActionRowComponents(
        new Discord.ActionRowBuilder().addComponents(
          new Discord.ButtonBuilder().setCustomId('serverprofile:nick').setLabel('Modifier Nickname').setStyle(Discord.ButtonStyle.Secondary),
          new Discord.ButtonBuilder().setCustomId('serverprofile:bio').setLabel('Modifier Bio').setStyle(Discord.ButtonStyle.Secondary),
        ),
      )
      .addActionRowComponents(
        new Discord.ActionRowBuilder().addComponents(
          new Discord.ButtonBuilder().setCustomId('serverprofile:avatar').setLabel('Modifier Avatar').setStyle(Discord.ButtonStyle.Secondary),
          new Discord.ButtonBuilder().setCustomId('serverprofile:banner').setLabel('Modifier Banner').setStyle(Discord.ButtonStyle.Secondary),
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

  const msg = await message.reply({
    components: [buildPanel()],
    flags: Discord.MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });

  const refreshPanel = async () => {
    state = await syncGuildProfile();
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

    if (modal.customId === `${panelId}:nick`) {
      await modal.deferReply({ flags: Discord.MessageFlags.Ephemeral });
      const nick = modal.fields.getTextInputValue('nickInput').trim();

      try {
        await message.guild.members.editMe({ nick: nick || null });
        await refreshPanel();
        return modal.editReply({ content: '> Nickname mis à jour !' });
      } catch (error) {
        console.error('Erreur nickname:', error);
        return modal.editReply({ content: `> Impossible de modifier le nickname : ${error.message}` });
      }
    }

    if (modal.customId === `${panelId}:bio`) {
      await modal.deferReply({ flags: Discord.MessageFlags.Ephemeral });
      const bio = modal.fields.getTextInputValue('bioInput').trim();

      try {
        await message.guild.members.editMe({ bio: bio || null });
        guildProfile = saveGuildProfile(bot, message.guild.id, { bio });
        state = { ...state, bio: guildProfile.bio || '' };
        await refreshPanel();
        return modal.editReply({ content: '> Bio serveur mise à jour !' });
      } catch (error) {
        console.error('Erreur bio:', error);
        return modal.editReply({ content: `> Impossible de modifier la bio : ${error.message}` });
      }
    }

    if (modal.customId === `${panelId}:avatar`) {
      await modal.deferReply({ flags: Discord.MessageFlags.Ephemeral });
      try {
        const uploadedFiles = modal.fields.getUploadedFiles('avatar_upload', true);
        const file = uploadedFiles?.first();
        if (!file) throw new Error('Aucune image fournie');
        const buffer = await uploadToBuffer(file);
        await message.guild.members.editMe({ avatar: buffer });
        await refreshPanel();
        return modal.editReply({ content: '> Avatar serveur mis à jour !' });
      } catch (error) {
        console.error('Erreur avatar:', error);
        return modal.editReply({ content: `> Impossible de récupérer l'image : ${error.message}` });
      }
    }

    if (modal.customId === `${panelId}:banner`) {
      await modal.deferReply({ flags: Discord.MessageFlags.Ephemeral });
      try {
        const uploadedFiles = modal.fields.getUploadedFiles('banner_upload', true);
        const file = uploadedFiles?.first();
        if (!file) throw new Error('Aucune image fournie');
        const buffer = await uploadToBuffer(file);
        await message.guild.members.editMe({ banner: buffer });
        await refreshPanel();
        return modal.editReply({ content: '> Banner serveur mise à jour !' });
      } catch (error) {
        console.error('Erreur banner:', error);
        return modal.editReply({ content: `> Impossible de récupérer l'image : ${error.message}` });
      }
    }
  };

  bot.on('interactionCreate', handleModal);

  collector.on('collect', async (interaction) => {
    if (interaction.user.id !== message.author.id) {
      return sendEphemeral(interaction, '> Ce panneau ne vous appartient pas.');
    }

    if (interaction.customId === 'serverprofile:nick') {
      const modal = new Discord.ModalBuilder()
        .setCustomId(`${panelId}:nick`)
        .setTitle('Modifier Nickname')
        .addComponents(
          new Discord.ActionRowBuilder().addComponents(
            new Discord.TextInputBuilder()
              .setCustomId('nickInput')
              .setLabel('Nouveau Nickname')
              .setStyle(Discord.TextInputStyle.Short)
              .setValue(state.nick || bot.user.username)
              .setRequired(false),
          ),
        );
      return interaction.showModal(modal);
    }

    if (interaction.customId === 'serverprofile:bio') {
      const modal = new Discord.ModalBuilder()
        .setCustomId(`${panelId}:bio`)
        .setTitle('Modifier Bio Serveur')
        .addComponents(
          new Discord.ActionRowBuilder().addComponents(
            new Discord.TextInputBuilder()
              .setCustomId('bioInput')
              .setLabel('Nouvelle Bio')
              .setStyle(Discord.TextInputStyle.Paragraph)
              .setValue(state.bio || '')
              .setRequired(false),
          ),
        );
      return interaction.showModal(modal);
    }

    if (interaction.customId === 'serverprofile:avatar') {
      const modal = new Discord.ModalBuilder()
        .setCustomId(`${panelId}:avatar`)
        .setTitle('Modifier Avatar Serveur')
        .addLabelComponents(
          new Discord.LabelBuilder()
            .setLabel("Upload de l'avatar")
            .setDescription("Envoie une image au format PNG, JPG, GIF, WEBP, etc.")
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

    if (interaction.customId === 'serverprofile:banner') {
      const modal = new Discord.ModalBuilder()
        .setCustomId(`${panelId}:banner`)
        .setTitle('Modifier Banner Serveur')
        .addLabelComponents(
          new Discord.LabelBuilder()
            .setLabel('Upload de la banniere')
            .setDescription("Envoie une image au format PNG, JPG, GIF, WEBP, etc.")
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
