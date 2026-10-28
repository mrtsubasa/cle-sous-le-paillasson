const Discord = require('discord.js');
const { getGuildVoiceStats, setGuildVoiceStats } = require('../../Utils/bot.js');
const { collectStats } = require('../../Utils/voiceStats.js');

function normalizeVoicePeak(value, step = 5) {
  const normalizedStep = Number.isFinite(Number(step)) && Number(step) > 0
    ? Math.max(1, Math.floor(Number(step)))
    : 5;
  const parsed = Number.isFinite(Number(value)) ? Number(value) : 0;
  return Math.max(0, Math.floor(parsed / normalizedStep) * normalizedStep);
}

exports.help = {
  name: 'autostats',
  aliases: ['astats'],
  type: 'sys',
  description: 'Configurer le salon qui reçoit les stats quand un record vocal est battu',
};

exports.run = async (bot, message) => {
  if (!message.guild) return;
  if (!bot.functions.checkPerm(bot, message, 'sys')) return;

  let selectedChannelId = null;
  const getCurrent = () => getGuildVoiceStats(bot, message.guild.id);
  selectedChannelId = getCurrent().channelId;
  const panelId = `autostats:stepModal:${message.id}`;

  const buildPanel = () => {
    const current = getCurrent();
    const currentStats = collectStats(message.guild);
    const channelMention = selectedChannelId ? `<#${selectedChannelId}>` : (current.channelId ? `<#${current.channelId}>` : '`Aucun`');
    const enabledText = current.enabled ? 'Activé' : 'Désactivé';
    const step = current.step;
    const peak = normalizeVoicePeak(current.peak, step);
    const nextTrigger = peak + step;

    return new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('# Auto Stats Vocal'),
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          `> Salon stats : ${channelMention}\n> Statut : \`${enabledText}\`\n> Record actuel : \`${peak}\`\n> Prochain déclenchement : \`${nextTrigger}\`\n> Vocal actuel : \`${currentStats.voiceMembers}\`\n> Palier : \`${step}\``,
        ),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          `> Utilise le select pour choisir un salon puis les boutons ci-dessous pour activer, désactiver, réinitialiser ou modifier le palier.`,
        ),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
      .addActionRowComponents((row) =>
        row.addComponents(
          new Discord.ChannelSelectMenuBuilder()
            .setCustomId('autostats:channel')
            .setPlaceholder('Choisir le salon de stats')
            .setMinValues(1)
            .setMaxValues(1)
            .setChannelTypes([Discord.ChannelType.GuildText, Discord.ChannelType.GuildAnnouncement]),
        ),
      )
      .addActionRowComponents((row) =>
        row.addComponents(
          new Discord.ButtonBuilder()
            .setCustomId('autostats:enable')
            .setLabel('Activer')
            .setStyle(Discord.ButtonStyle.Success),
          new Discord.ButtonBuilder()
            .setCustomId('autostats:disable')
            .setLabel('Désactiver')
            .setStyle(Discord.ButtonStyle.Danger),
          new Discord.ButtonBuilder()
            .setCustomId('autostats:reset')
            .setLabel('Reset record')
            .setStyle(Discord.ButtonStyle.Secondary),
          new Discord.ButtonBuilder()
            .setCustomId('autostats:step')
            .setLabel('Palier')
            .setStyle(Discord.ButtonStyle.Primary),
        ),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
  };

  const msg = await message.reply({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildPanel()],
    allowedMentions: { parse: [] },
  });

  const collector = msg.createMessageComponentCollector({ time: 300000 });

  const refresh = async () => {
    await msg.edit({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [buildPanel()],
      allowedMentions: { parse: [] },
    });
  };

  collector.on('collect', async (interaction) => {
    if (interaction.user.id !== message.author.id) return;

    if (interaction.isChannelSelectMenu() && interaction.customId === 'autostats:channel') {
      selectedChannelId = interaction.values[0] || null;
      await interaction.reply({
        content: selectedChannelId ? `> Salon sélectionné : <#${selectedChannelId}>` : '> Salon retiré',
        flags: Discord.MessageFlags.Ephemeral,
      });
      return refresh();
    }

    if (!interaction.isButton()) return;

    if (interaction.customId === 'autostats:enable') {
      const current = getCurrent();
      const channelId = selectedChannelId || current.channelId;
      if (!channelId) {
        return interaction.reply({
          content: '> Choisis d’abord un salon de stats.',
          flags: Discord.MessageFlags.Ephemeral,
        });
      }

      const peak = normalizeVoicePeak(collectStats(message.guild).voiceMembers, current.step);
      setGuildVoiceStats(bot, message.guild.id, {
        channelId,
        enabled: true,
        peak,
        step: current.step,
      });

      return interaction.reply({
        content: `> Auto stats activé dans <#${channelId}>`,
        flags: Discord.MessageFlags.Ephemeral,
      }).then(refresh);
    }

    if (interaction.customId === 'autostats:disable') {
      const current = getCurrent();
      setGuildVoiceStats(bot, message.guild.id, {
        channelId: selectedChannelId || current.channelId,
        enabled: false,
        peak: current.peak,
        step: current.step,
      });

      return interaction.reply({
        content: '> Auto stats désactivé.',
        flags: Discord.MessageFlags.Ephemeral,
      }).then(refresh);
    }

    if (interaction.customId === 'autostats:reset') {
      const current = getCurrent();
      const peak = normalizeVoicePeak(collectStats(message.guild).voiceMembers, current.step);
      setGuildVoiceStats(bot, message.guild.id, {
        channelId: selectedChannelId || current.channelId,
        enabled: current.enabled,
        peak,
        step: current.step,
      });

      return interaction.reply({
        content: `> Record réinitialisé à \`${peak}\` membres en vocal.`,
        flags: Discord.MessageFlags.Ephemeral,
      }).then(refresh);
    }

    if (interaction.customId === 'autostats:step') {
      const current = getCurrent();
      const modal = new Discord.ModalBuilder()
        .setCustomId(panelId)
        .setTitle('Modifier le palier')
        .addLabelComponents(
          new Discord.LabelBuilder()
            .setLabel('Nouveau palier')
            .setDescription('Entre un nombre entier supérieur à 0.')
            .setTextInputComponent(
              new Discord.TextInputBuilder()
                .setCustomId('value')
                .setStyle(Discord.TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder('Exemple: 5')
                .setValue(String(current.step || 5)),
            ),
        );

      await interaction.showModal(modal);

      const submitted = await interaction.awaitModalSubmit({
        filter: (modalInteraction) =>
          modalInteraction.user.id === message.author.id &&
          modalInteraction.customId === panelId,
        time: 60000,
      }).catch(() => null);

      if (!submitted) return;

      const parsed = Number.parseInt(submitted.fields.getTextInputValue('value').trim(), 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return submitted.reply({
          content: '> Palier invalide.',
          flags: Discord.MessageFlags.Ephemeral,
        }).catch(() => submitted.followUp({
          content: '> Palier invalide.',
          flags: Discord.MessageFlags.Ephemeral,
        }));
      }

      const nextStep = Math.max(1, Math.floor(parsed));

      setGuildVoiceStats(bot, message.guild.id, {
        channelId: selectedChannelId || current.channelId,
        enabled: current.enabled,
        peak: normalizeVoicePeak(current.peak, nextStep),
        step: nextStep,
      });

      await submitted.reply({
        content: `> Palier défini sur \`${nextStep}\`.`,
        flags: Discord.MessageFlags.Ephemeral,
      }).catch(() => submitted.followUp({
        content: `> Palier défini sur \`${nextStep}\`.`,
        flags: Discord.MessageFlags.Ephemeral,
      }));

      return refresh();
    }
  });
};
