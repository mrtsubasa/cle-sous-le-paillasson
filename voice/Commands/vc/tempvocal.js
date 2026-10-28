const Discord = require('discord.js');
const {
  getGuildTempVocal,
  setGuildTempVocal,
} = require('../../Utils/bot.js');

function resolveChannelName(template, member) {
  const raw = typeof template === 'string' && template.trim() ? template.trim() : 'Temp vocal {displayName}';
  return raw
    .replaceAll('{username}', member.user.username)
    .replaceAll('{displayName}', member.displayName)
    .replaceAll('{globalName}', member.user.globalName || member.user.username)
    .replaceAll('{id}', member.id)
    .slice(0, 100);
}

function resolveLimit(input) {
  const parsed = Number.parseInt(String(input).trim(), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(99, parsed));
}

function resolveChannelId(input) {
  if (!input) return null;
  return (
    input.match(/<#!?(\d+)>/)?.[1] ||
    input.match(/\d{15,25}/)?.[0] ||
    null
  );
}

async function promptChannel(message, title, description) {
  const prompt = await message.reply({
    flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
    components: [
      new Discord.ContainerBuilder().addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(`### ${title}\n> ${description}`),
      ),
    ],
    allowedMentions: { parse: [] },
  });

  const collected = await message.channel.awaitMessages({
    filter: (m) => m.author.id === message.author.id,
    max: 1,
    time: 60000,
  }).catch(() => null);

  if (!collected || !collected.first()) return null;

  const response = collected.first();
  const id = resolveChannelId(response.content) || response.mentions.channels.first()?.id || null;
  await response.delete().catch(() => {});

  if (!id) return null;
  return id;
}

exports.help = {
  name: 'tempvocal',
  aliases: ['tv'],
  type: 'sys',
  description: 'Configurer un salon declencheur pour les vocaux temporaires',
};

exports.run = async (bot, message) => {
  if (!message.guild) return;
  if (!bot.functions.checkPerm(bot, message, 'sys')) return;

  const authorId = message.author.id;
  const panelId = `tempvocalcfg:${message.id}`;
  let data = getGuildTempVocal(bot, message.guild.id);

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

  const sendModalResult = async (interaction, title, content) => {
    const payload = {
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      components: [
        new Discord.ContainerBuilder()
          .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent(`# ${title}`),
          )
          .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent(content),
          )
          .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true)),
      ],
      allowedMentions: { parse: [] },
    };

    if (interaction.replied || interaction.deferred) {
      return interaction.followUp(payload);
    }

    try {
      return await interaction.reply(payload);
    } catch (error) {
      if (error?.code === 40060) {
        return interaction.followUp(payload);
      }
      throw error;
    }
  };

  const replyAction = async (interaction, content) => {
    const payload = {
      content,
      flags: Discord.MessageFlags.Ephemeral,
    };

    if (interaction.deferred || interaction.replied) {
      return interaction.followUp(payload);
    }

    try {
      return await interaction.reply(payload);
    } catch (error) {
      if (error?.code === 10062 || error?.code === 40060) {
        return interaction.followUp(payload).catch(() => null);
      }
      throw error;
    }
  };

  const ackComponent = async (interaction, content) => {
    const payload = {
      content,
      flags: Discord.MessageFlags.Ephemeral,
    };

    if (interaction.replied || interaction.deferred) {
      return interaction.followUp(payload).catch(() => null);
    }

    try {
      await interaction.deferUpdate();
    } catch (error) {
      if (error?.code !== 40060 && error?.code !== 10062) {
        throw error;
      }
    }

    return interaction.followUp(payload).catch(() => null);
  };

  const refreshData = () => {
    data = getGuildTempVocal(bot, message.guild.id);
    return data;
  };

  const buildPanel = () => {
    const current = refreshData();
    const trigger = current.triggerId ? `<#${current.triggerId}>` : '`Aucun`';
    const category = current.categoryId ? `<#${current.categoryId}>` : '`Aucune`';
    const limit = Number.isFinite(Number(current.limit)) ? Number(current.limit) : 0;
    const template = current.nameTemplate || 'Temp vocal {displayName}';
    const tempCount = Object.keys(current.channels || {}).length;
    const enabledText = current.enabled ? 'Activé' : 'Désactivé';
    const serverIcon = message.guild.iconURL({ size: 1024, forceStatic: false }) || 'https://i.imgur.com/839VA94.png';

    return new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('# Panel de Contrôle Vocal Temporaire'),
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          '> Configure le salon déclencheur, le dossier de création, la limite par défaut et le nom de tes vocaux temporaires. Le panneau part directement dans le chat intégré du vocal temporaire.',
        ),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addSectionComponents(
        new Discord.SectionBuilder()
          .addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent(
              `### État actuel\n> **Statut :** \`${enabledText}\`\n> **Déclencheur :** ${trigger}\n> **Catégorie :** ${category}\n> **Limite :** \`${limit || 'Aucune'}\`\n> **Nom :** \`${template}\`\n> **Salons actifs :** \`${tempCount}\``,
            ),
          )
          .setThumbnailAccessory(
            new Discord.ThumbnailBuilder({
              media: {
                url: serverIcon,
              },
            }),
          ),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('### Configuration rapide'),
      )
      .addActionRowComponents(
        new Discord.ActionRowBuilder().addComponents(
          new Discord.ChannelSelectMenuBuilder()
            .setCustomId(`${panelId}:trigger`)
            .setPlaceholder('Définir le salon déclencheur')
            .setMinValues(1)
            .setMaxValues(1)
            .setChannelTypes([Discord.ChannelType.GuildVoice, Discord.ChannelType.GuildStageVoice]),
        ),
      )
      .addActionRowComponents(
        new Discord.ActionRowBuilder().addComponents(
          new Discord.ChannelSelectMenuBuilder()
            .setCustomId(`${panelId}:category`)
            .setPlaceholder('Définir la catégorie de création')
            .setMinValues(1)
            .setMaxValues(1)
            .setChannelTypes([Discord.ChannelType.GuildCategory]),
        ),
      )
      .addActionRowComponents(
        new Discord.ActionRowBuilder().addComponents(
          new Discord.ButtonBuilder()
            .setCustomId(`${panelId}:limit`)
            .setLabel('Limite')
            .setStyle(Discord.ButtonStyle.Secondary),
          new Discord.ButtonBuilder()
            .setCustomId(`${panelId}:name`)
            .setLabel('Nom')
            .setStyle(Discord.ButtonStyle.Secondary),
        ),
      )
      .addActionRowComponents(
        new Discord.ActionRowBuilder().addComponents(
          new Discord.ButtonBuilder()
            .setCustomId(`${panelId}:enable`)
            .setLabel('Activer')
            .setStyle(Discord.ButtonStyle.Success),
          new Discord.ButtonBuilder()
            .setCustomId(`${panelId}:disable`)
            .setLabel('Désactiver')
            .setStyle(Discord.ButtonStyle.Danger),
        ),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true));
  };

  const msg = await message.reply({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildPanel()],
    allowedMentions: { parse: [] },
  });

  const collector = msg.createMessageComponentCollector({ time: 300000 });

  collector.on('collect', async (interaction) => {
    try {
      if (interaction.user.id !== authorId) {
        return sendEphemeral(interaction, '> Ce panneau ne t appartient pas.');
      }

      if (interaction.isChannelSelectMenu()) {
        const channelId = interaction.values[0] || null;

        if (interaction.customId === `${panelId}:trigger`) {
          data.triggerId = channelId;
          data.enabled = Boolean(data.enabled && data.triggerId);
          setGuildTempVocal(bot, message.guild.id, data);
          await ackComponent(interaction, channelId ? `> Salon déclencheur défini sur <#${channelId}>` : '> Salon déclencheur retiré');
          return msg.edit({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [buildPanel()],
            allowedMentions: { parse: [] },
          });
        }

        if (interaction.customId === `${panelId}:category`) {
          data.categoryId = channelId;
          setGuildTempVocal(bot, message.guild.id, data);
          await ackComponent(interaction, channelId ? `> Catégorie définie sur <#${channelId}>` : '> Catégorie retirée');
          return msg.edit({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [buildPanel()],
            allowedMentions: { parse: [] },
          });
        }

      }

      if (!interaction.isButton()) return;

        if (interaction.customId === `${panelId}:enable`) {
          if (!data.triggerId) {
          return ackComponent(interaction, '> Choisis d’abord un salon déclencheur.');
          }

        data.enabled = true;
        setGuildTempVocal(bot, message.guild.id, data);
        await ackComponent(interaction, '> Temp vocal activé.');
        return msg.edit({
          flags: Discord.MessageFlags.IsComponentsV2,
          components: [buildPanel()],
          allowedMentions: { parse: [] },
        });
      }

      if (interaction.customId === `${panelId}:disable`) {
        data.enabled = false;
        setGuildTempVocal(bot, message.guild.id, data);
        await ackComponent(interaction, '> Temp vocal désactivé.');
        return msg.edit({
          flags: Discord.MessageFlags.IsComponentsV2,
          components: [buildPanel()],
          allowedMentions: { parse: [] },
        });
      }

      if (interaction.customId === `${panelId}:limit`) {
        const modal = new Discord.ModalBuilder()
          .setCustomId(`${panelId}:limitModal`)
          .setTitle('Modifier la limite par défaut')
          .addLabelComponents(
            new Discord.LabelBuilder()
              .setLabel('Nouvelle limite')
              .setDescription('Met 0 pour aucun limite. Maximum 99.')
              .setTextInputComponent(
                new Discord.TextInputBuilder()
                  .setCustomId('limitInput')
                  .setStyle(Discord.TextInputStyle.Short)
                  .setRequired(true)
                  .setValue(String(Number.isFinite(Number(data.limit)) ? data.limit : 0)),
              ),
          );

        await interaction.showModal(modal);
        const submitted = await interaction.awaitModalSubmit({
          filter: (modalInteraction) =>
            modalInteraction.user.id === authorId &&
            modalInteraction.customId === `${panelId}:limitModal`,
          time: 60000,
        }).catch(() => null);

        if (!submitted) return;

        const limit = resolveLimit(submitted.fields.getTextInputValue('limitInput'));
        if (limit === null) {
          return sendModalResult(submitted, 'Modifier la limite', '> Limite invalide.');
        }

        data.limit = limit;
        setGuildTempVocal(bot, message.guild.id, data);

        await sendModalResult(
          submitted,
          'Modifier la limite',
          `> Limite par défaut définie sur \`${limit}\``,
        );
        return msg.edit({
          flags: Discord.MessageFlags.IsComponentsV2,
          components: [buildPanel()],
          allowedMentions: { parse: [] },
        });
      }

      if (interaction.customId === `${panelId}:name`) {
        const modal = new Discord.ModalBuilder()
          .setCustomId(`${panelId}:nameModal`)
          .setTitle('Modifier le nom par défaut')
          .addLabelComponents(
            new Discord.LabelBuilder()
              .setLabel('Template du nom')
              .setDescription('Ex: Temp vocal {displayName} ou {username} | {id}')
              .setTextInputComponent(
                new Discord.TextInputBuilder()
                  .setCustomId('nameInput')
                  .setStyle(Discord.TextInputStyle.Paragraph)
                  .setRequired(true)
                  .setValue(String(data.nameTemplate || 'Temp vocal {displayName}')),
              ),
          );

        await interaction.showModal(modal);
        const submitted = await interaction.awaitModalSubmit({
          filter: (modalInteraction) =>
            modalInteraction.user.id === authorId &&
            modalInteraction.customId === `${panelId}:nameModal`,
          time: 60000,
        }).catch(() => null);

        if (!submitted) return;

        const nameTemplate = submitted.fields.getTextInputValue('nameInput').trim();
        if (!nameTemplate) {
          return sendModalResult(submitted, 'Modifier le nom', '> Nom invalide.');
        }

        data.nameTemplate = nameTemplate.slice(0, 100);
        setGuildTempVocal(bot, message.guild.id, data);

        await sendModalResult(
          submitted,
          'Modifier le nom',
          `> Nouveau nom par défaut : \`${data.nameTemplate}\``,
        );
        return msg.edit({
          flags: Discord.MessageFlags.IsComponentsV2,
          components: [buildPanel()],
          allowedMentions: { parse: [] },
        });
      }
    } catch (error) {
      console.log(error);
    }
  });
};
