const Discord = require('discord.js');

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} = Discord;

const normalizeBaseName = (value) =>
  (value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');

const buildFinalName = (state) => {
  let name = state.baseName || state.channel.name;
  return name.toLowerCase();
};

exports.help = {
  name: 'rename',
  aliases: ["re"],
  type: 'wl',
  description: 'Renommer un salon',
};

exports.run = async (bot, message, args) => {
  if (!bot.functions.checkPerm(bot, message, 'wl')) return;
  if (!message.guild) return;

  const channelArg = args[0];
  const channel = channelArg
    ? (message.mentions.channels.first() || message.guild.channels.cache.get(channelArg))
    : message.channel;

  if (!channel || !channel.isTextBased()) return message.reply('> Salon introuvable ou non textuel');

  const state = {
    channel,
    baseName: normalizeBaseName(channel.name),
  };

  const sendEphemeral = async (interaction, content) => {
    const payload = {
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      components: [
        new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(content),
        ),
      ],
    };

    if (interaction.replied || interaction.deferred) {
      return interaction.followUp(payload);
    }

    return interaction.reply(payload);
  };

  const buildPanel = () => {
    const finalName = buildFinalName(state);

    return new ContainerBuilder()
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Panel de gestion du salon'))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '> Modifie le nom du salon.\n> Tu peux mettre un emoji normal directement dans le nom du salon.',
        ),
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Nom du salon'))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`> Actuel : \`${state.baseName || channel.name}\``))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`> Apercu final : \`${finalName}\``))
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('rename:name')
            .setLabel('Modifier le nom')
            .setStyle(ButtonStyle.Secondary),
        ),
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Mode -18'))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `> Statut actuel : ${channel.nsfw ? 'Activé' : 'Désactivé'}\n> Ce bouton active le vrai flag NSFW du salon.`,
        ),
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('rename:nsfw')
            .setLabel(channel.nsfw ? 'Désactiver -18' : 'Activer -18')
            .setStyle(channel.nsfw ? ButtonStyle.Danger : ButtonStyle.Success),
        ),
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  };

  const msg = await message.reply({
    components: [buildPanel()],
    flags: MessageFlags.IsComponentsV2,
  });

  const collector = msg.createMessageComponentCollector({ time: 300000 });

  collector.on('collect', async (interaction) => {
    try {
      if (interaction.user.id !== message.author.id) return;

      if (interaction.isButton() && interaction.customId === 'rename:name') {
        const modal = new ModalBuilder()
          .setCustomId(`rename:name:${channel.id}`)
          .setTitle('Modifier le nom du salon')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('rename_name_input')
                .setLabel('Nouveau nom')
                .setStyle(TextInputStyle.Short)
                .setValue(state.baseName || channel.name)
                .setRequired(true),
            ),
          );

        await interaction.showModal(modal);

        const submitted = await interaction.awaitModalSubmit({
          filter: (m) => m.user.id === message.author.id && m.customId === `rename:name:${channel.id}`,
          time: 60000,
        }).catch(() => null);

        if (!submitted) return;

        const newBaseName = normalizeBaseName(submitted.fields.getTextInputValue('rename_name_input'));
        if (!newBaseName) {
          return sendEphemeral(submitted, '> Le nom du salon ne peut pas etre vide.');
        }

        state.baseName = newBaseName;

        const finalName = buildFinalName(state);
        try {
          await channel.setName(finalName, `Renommé par ${submitted.user.tag}`);
          await msg.edit({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });
          return sendEphemeral(submitted, `> Salon renommé en \`${finalName}\``);
        } catch (err) {
          console.error(err);
          return sendEphemeral(submitted, '> Impossible de renommer le salon (permissions ou nom invalide).');
        }
      }

      if (interaction.isButton() && interaction.customId === 'rename:nsfw') {
        if (typeof channel.setNSFW !== 'function') {
          return sendEphemeral(interaction, '> Ce salon ne supporte pas le mode NSFW.');
        }

        const nextState = !channel.nsfw;

        try {
          await channel.setNSFW(nextState, `Mode -18 modifié par ${interaction.user.tag}`);
          await msg.edit({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });
          return sendEphemeral(interaction, `> Mode -18 ${nextState ? 'activé' : 'désactivé'}.`);
        } catch (err) {
          console.error(err);
          return sendEphemeral(interaction, '> Impossible de modifier le mode -18.');
        }
      }
    } catch (error) {
      console.log(error);
    }
  });
};
