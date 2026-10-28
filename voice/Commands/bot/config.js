const {
  ContainerBuilder, ButtonStyle, MessageFlags,
  ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  LabelBuilder, FileUploadBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder,
  SeparatorBuilder, SeparatorSpacingSize
} = require('discord.js');

const fetch = globalThis.fetch || require("node-fetch").default;

exports.help = {
  name: 'config',
  aliases: [],
  type: 'sys',
  description: 'Configuration complète du profil serveur du bot',
};

exports.run = async (bot, message) => {

  if (!bot.functions.checkPerm(bot, message, 'sys')) return;

  let currentNick = message.guild.members.me?.nickname || bot.user.username;
  let currentBio = 'Non defini';
  let currentAvatarUrl = null;
  let currentBannerUrl = null;

  const updateGuildProfile = async (data) => {
    await bot.rest.patch(
      `/guilds/${message.guild.id}/members/@me`,
      { body: data }
    );
  };

  const uploadedImageToDataUri = async (attachment) => {
    if (!attachment?.url) {
      throw new Error('Aucune image fournie');
    }

    const response = await fetch(attachment.url);
    if (!response.ok) {
      throw new Error('Impossible de télécharger l’image');
    }

    const contentType = attachment.contentType || response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error('Le fichier envoyé doit être une image');
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
    const gallery = new MediaGalleryBuilder();

    if (currentAvatarUrl) gallery.addItems(new MediaGalleryItemBuilder().setURL(currentAvatarUrl));
    if (currentBannerUrl) gallery.addItems(new MediaGalleryItemBuilder().setURL(currentBannerUrl));

    return gallery;
  };

  const buildPanel = () => {
    const hasMedia = Boolean(currentAvatarUrl || currentBannerUrl);
    const container = new ContainerBuilder()
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(t => t.setContent('# Configuration Profil Serveur Bot'))
      .addTextDisplayComponents(t => t.setContent('> Ajuste le profil du bot sur ce serveur en temps reel'))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(t => t.setContent('# Apercu actuel'))
      .addTextDisplayComponents(t => t.setContent(`> **Nickname :** \`${currentNick}\`\n> **Bio :** ${currentBio}`));

    if (hasMedia) {
      const gallery = buildMediaGallery();
      container
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(t => t.setContent('# Media'))
        .addTextDisplayComponents(t => t.setContent(`> **PP par serveur :** ${currentAvatarUrl ? 'Disponible' : 'Aucune'}\n> **Banner par serveur :** ${currentBannerUrl ? 'Disponible' : 'Aucune'}`))
        .addMediaGalleryComponents(gallery);
    }

    return container
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))

      .addSectionComponents(section =>
        section.addTextDisplayComponents(t => t.setContent('### Modifier le Nickname\n> Change le surnom du bot sur ce serveur'))
          .setButtonAccessory(btn =>
            btn.setCustomId('config:nick')
              .setLabel('Modifier Nickname')
              .setStyle(ButtonStyle.Secondary)
          )
      )
      .addSeparatorComponents(s => s)

      .addSectionComponents(section =>
        section.addTextDisplayComponents(t => t.setContent('### Modifier la Bio Serveur\n> Définis une bio spécifique pour ce serveur'))
          .setButtonAccessory(btn =>
            btn.setCustomId('config:bio')
              .setLabel('Modifier Bio')
              .setStyle(ButtonStyle.Secondary)
          )
      )
      .addSeparatorComponents(s => s)

      .addSectionComponents(section =>
        section.addTextDisplayComponents(t => t.setContent("### Modifier Avatar par Serveur\n> Upload une image pour mettre l'avatar"))
          .setButtonAccessory(btn =>
            btn.setCustomId('config:avatar')
              .setLabel('Modifier Avatar')
              .setStyle(ButtonStyle.Secondary)
          )
      )
      .addSeparatorComponents(s => s)

      .addSectionComponents(section =>
        section.addTextDisplayComponents(t => t.setContent("### Modifier Banner par Serveur\n> Upload une image pour mettre la banniere"))
          .setButtonAccessory(btn =>
            btn.setCustomId('config:banner')
              .setLabel('Modifier Banner')
              .setStyle(ButtonStyle.Secondary)
          )
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  };

  await syncMemberProfile();

  const panelId = `config:${message.id}`;

  const msg = await message.reply({
    components: [buildPanel()],
    flags: MessageFlags.IsComponentsV2
  });

  const refreshPanel = async () => {
    await syncMemberProfile();
    await msg.edit({
      components: [buildPanel()],
      flags: MessageFlags.IsComponentsV2
    });
  };

  const collector = msg.createMessageComponentCollector({ time: 300000 });

  collector.on("collect", async interaction => {

    if (interaction.user.id !== message.author.id) return;

    if (interaction.customId === "config:nick") {
      const modal = new ModalBuilder()
        .setCustomId(`${panelId}:nick`)
        .setTitle("Modifier Nickname")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("nickInput")
              .setLabel("Nouveau Nickname")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          )
        );
      return interaction.showModal(modal);
    }

    if (interaction.customId === "config:bio") {
      const modal = new ModalBuilder()
        .setCustomId(`${panelId}:bio`)
        .setTitle("Modifier Bio Serveur")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("bioInput")
              .setLabel("Nouvelle Bio")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
          )
        );
      return interaction.showModal(modal);
    }

    if (interaction.customId === "config:avatar") {
      const modal = new ModalBuilder()
        .setCustomId(`${panelId}:avatar`)
        .setTitle("Modifier Avatar Serveur")
        .addLabelComponents(
          new LabelBuilder()
            .setLabel("Upload de l'avatar")
            .setDescription("Envoie une image au format PNG, JPG, GIF, WEBP, etc.")
            .setFileUploadComponent(
              new FileUploadBuilder()
                .setCustomId("avatar_upload")
                .setMinValues(1)
                .setMaxValues(1)
                .setRequired(true)
            )
        );
      return interaction.showModal(modal);
    }

    if (interaction.customId === "config:banner") {
      const modal = new ModalBuilder()
        .setCustomId(`${panelId}:banner`)
        .setTitle("Modifier Banner Serveur")
        .addLabelComponents(
          new LabelBuilder()
            .setLabel("Upload de la banniere")
            .setDescription("Envoie une image au format PNG, JPG, GIF, WEBP, etc.")
            .setFileUploadComponent(
              new FileUploadBuilder()
                .setCustomId("banner_upload")
                .setMinValues(1)
                .setMaxValues(1)
                .setRequired(true)
            )
        );
      return interaction.showModal(modal);
    }

  });

  bot.on("interactionCreate", async modal => {

    if (!modal.isModalSubmit()) return;
    if (modal.user.id !== message.author.id) return;

    if (modal.customId === `${panelId}:nick`) {
      await modal.deferReply({ flags: MessageFlags.Ephemeral });
      const nick = modal.fields.getTextInputValue("nickInput") || null;
      await updateGuildProfile({ nick });
      await refreshPanel();
      return modal.editReply({ content: "> Nickname mis à jour !" });
    }

    if (modal.customId === `${panelId}:bio`) {
      await modal.deferReply({ flags: MessageFlags.Ephemeral });
      const bio = modal.fields.getTextInputValue("bioInput") || null;
      await updateGuildProfile({ bio });
      currentBio = bio || 'Non defini';
      await refreshPanel();
      return modal.editReply({ content: "> Bio serveur mise à jour !" });
    }

    if (modal.customId === `${panelId}:avatar`) {
      await modal.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const uploadedFiles = modal.fields.getUploadedFiles("avatar_upload", true);
        const image = uploadedFiles?.first();
        if (!image) throw new Error("Aucune image fournie");
        const dataUri = await uploadedImageToDataUri(image);
        await updateGuildProfile({ avatar: dataUri });
        await refreshPanel();
        return modal.editReply({ content: "> Avatar serveur mis à jour !" });
      } catch (e) {
        console.log("Erreur avatar:", e);
        return modal.editReply({ content: `> Impossible de récupérer l'image : ${e.message}` });
      }
    }

    if (modal.customId === `${panelId}:banner`) {
      await modal.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const uploadedFiles = modal.fields.getUploadedFiles("banner_upload", true);
        const image = uploadedFiles?.first();
        if (!image) throw new Error("Aucune image fournie");
        const dataUri = await uploadedImageToDataUri(image);
        await updateGuildProfile({ banner: dataUri });
        await refreshPanel();
        return modal.editReply({ content: "> Banner serveur mise à jour !" });
      } catch (e) {
        console.log("Erreur banner:", e);
        return modal.editReply({ content: `> Impossible de récupérer l'image : ${e.message}` });
      }
    }

  });

};
