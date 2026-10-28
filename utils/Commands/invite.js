const Discord = require('discord.js');
const {
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ThumbnailBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags
} = Discord;

exports.help = {
  name: 'invite',
  aliases: ["i"],
  type: 'wl',
  description: 'Affiche les invitations du serveur',
};

exports.run = async (bot, message) => {
  if (!bot.functions.checkPerm(bot, message, 'wl')) return;

  const guild = message.guild;

  try {

    const invitesCollection = await guild.invites.fetch();

    if (!invitesCollection.size)
      return message.reply("> Aucune invitation trouvée");

    const invites = [...invitesCollection.values()];
    const itemsPerPage = 5;
    let currentPage = 0;
    const totalPages = Math.ceil(invites.length / itemsPerPage);

    const generatePage = (page) => {

      const slice = invites.slice(
        page * itemsPerPage,
        (page + 1) * itemsPerPage
      );

      const container = new ContainerBuilder();

      container.addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(SeparatorSpacingSize.Small)
          .setDivider(true)
      );

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# Invitations du serveur`
        )
      );

      container.addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(SeparatorSpacingSize.Small)
          .setDivider(true)
      );

      slice.forEach(invite => {

        container.addSectionComponents(
          new SectionBuilder()
            .setThumbnailAccessory(
              new ThumbnailBuilder({
                media: {
                  url: invite.inviter?.displayAvatarURL({ size: 128 }) ||
                       guild.iconURL({ size: 128 })
                }
              })
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `> Code : **${invite.code}**\n` +
                `> Créateur : ${invite.inviter
                  ? `***${invite.inviter.username}*** | (\`${invite.inviter.id}\`)`
                  : "Inconnu"}\n` +
                `> Utilisations : **${invite.uses}**\n` +
                `> Max Uses : **${invite.maxUses || "∞"}**\n` +
                `> Expire : ${invite.expiresAt
                  ? `<t:${Math.floor(invite.expiresAt.getTime() / 1000)}:R>`
                  : "Jamais"}`
              )
            )
        );

        container.addSeparatorComponents(
          new SeparatorBuilder()
            .setSpacing(SeparatorSpacingSize.Small)
            .setDivider(true)
        );
      });

      const prev = new ButtonBuilder()
        .setCustomId('inv_prev')
        .setLabel('<')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0);

      const next = new ButtonBuilder()
        .setCustomId('inv_next')
        .setLabel('>')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1);

      container.addActionRowComponents(row =>
        row.setComponents(prev, next)
      );

      return container;
    };

    let msg = await message.reply({
      flags: MessageFlags.IsComponentsV2,
      components: [generatePage(currentPage)]
    });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 5 * 60 * 1000
    });

collector.on('collect', async interaction => {

  if (interaction.user.id !== message.author.id) {
    return interaction.reply({
      content: "> Tu ne peux pas utiliser ces boutons",
      flags: MessageFlags.Ephemeral
    });
  }

  if (interaction.customId === 'inv_prev')
    currentPage--;

  if (interaction.customId === 'inv_next')
    currentPage++;

  await interaction.update({
    components: [generatePage(currentPage)]
  });

});

  } catch (err) {
    console.error(err);
    message.reply("> Erreur lors de la récupération des invitations");
  }
};