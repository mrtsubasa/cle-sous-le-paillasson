const Discord = require('discord.js');
const {
  getLogsGuildConfig,
  normalizeGuildId,
  saveLogsGuildConfig,
} = require('../../Utils/logsGuildConfig');

function formatGuild(bot, guildId) {
  if (!guildId) return '`Non configuré`';

  const guild = bot.guilds.cache.get(guildId);
  if (!guild) return `\`${guildId}\` - bot absent ou cache indisponible`;

  return `**${guild.name}**\n> ID : \`${guild.id}\`\n> Membres : \`${guild.memberCount || 'Inconnu'}\``;
}

function buildPanel(bot, config) {
  const sameGuild = config.mainGuildId && config.mainGuildId === config.secondaryGuildId;
  const explanation = [
    '> **Serveur principal :** c’est le serveur à surveiller. Le bot y détecte les événements à logger.',
    '> **Serveur secondaire :** c’est le serveur qui recevra les logs. Les salons de logs seront configurés dessus avec la commande `logs`.',
    '> Une fois les deux serveurs configurés, les logs du serveur principal seront envoyés dans les salons choisis sur le serveur secondaire.',
    sameGuild ? '> **Attention :** les deux IDs sont identiques. Il faut normalement deux serveurs différents : un pour surveiller, un pour recevoir les logs.' : null,
  ].filter(Boolean).join('\n');

  return new Discord.ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent('# Configuration des serveurs de logs'),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        '> Indique les IDs des deux serveurs. Le serveur principal est celui à surveiller, et le serveur secondaire est celui où les logs seront envoyés.',
      ),
    )
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`# Serveur principal - source\n> Le bot surveille ce serveur et récupère les événements à logger.\n> ${formatGuild(bot, config.mainGuildId)}`),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`# Serveur secondaire - destination\n> Les salons de logs seront configurés sur ce serveur avec la commande \`logs\`.\n> ${formatGuild(bot, config.secondaryGuildId)}`),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`# À quoi ça sert ?\n${explanation}`),
    )
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(
      new Discord.ActionRowBuilder().addComponents(
        new Discord.ButtonBuilder()
          .setCustomId('config-guild:edit-main')
          .setLabel('ID serveur principal')
          .setStyle(Discord.ButtonStyle.Primary),
        new Discord.ButtonBuilder()
          .setCustomId('config-guild:edit-secondary')
          .setLabel('ID serveur secondaire')
          .setStyle(Discord.ButtonStyle.Secondary),
      ),
    )
    .addActionRowComponents(
      new Discord.ActionRowBuilder().addComponents(
        new Discord.ButtonBuilder()
          .setCustomId('config-guild:set-current-main')
          .setLabel('Serveur actuel = principal')
          .setStyle(Discord.ButtonStyle.Secondary),
        new Discord.ButtonBuilder()
          .setCustomId('config-guild:set-current-secondary')
          .setLabel('Serveur actuel = secondaire')
          .setStyle(Discord.ButtonStyle.Secondary),
        new Discord.ButtonBuilder()
          .setCustomId('config-guild:reset')
          .setLabel('Reset')
          .setStyle(Discord.ButtonStyle.Danger),
      ),
    )
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
}

function buildResponse(content) {
  return {
    flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
    components: [
      new Discord.ContainerBuilder()
        .setAccentColor(0x2b2d31)
        .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(content)),
    ],
  };
}

async function safeReply(interaction, payload) {
  if (interaction.replied || interaction.deferred) return interaction.followUp(payload);
  return interaction.reply(payload);
}

exports.help = {
  name: 'config-guild',
  aliases: ['configguild', 'guild-config'],
  type: 'sys',
  description: 'Configure le serveur source et le serveur de destination des logs',
};

exports.run = async (bot, message, args = []) => {
  if (!message.guild) return;
  if (!bot.functions.checkPerm(bot, message, 'sys')) return;

  const panelId = `config-guild:${message.id}`;
  let config = getLogsGuildConfig(bot, message.guild.id);

  const [mainArg, secondaryArg] = args;
  if (mainArg || secondaryArg) {
    const nextMainGuildId = mainArg ? normalizeGuildId(mainArg) : config.mainGuildId;
    const nextSecondaryGuildId = secondaryArg ? normalizeGuildId(secondaryArg) : config.secondaryGuildId;

    if ((mainArg && !nextMainGuildId) || (secondaryArg && !nextSecondaryGuildId)) {
      return message.reply({
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [
          new Discord.ContainerBuilder()
            .setAccentColor(0x2b2d31)
            .addTextDisplayComponents(
              new Discord.TextDisplayBuilder().setContent('> ID invalide. Exemple : `config-guild <id_serveur_principal> <id_serveur_secondaire>`'),
            ),
        ],
      });
    }

    config = saveLogsGuildConfig(bot, message.guild.id, {
      mainGuildId: nextMainGuildId,
      secondaryGuildId: nextSecondaryGuildId,
    });

    return message.reply({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [buildPanel(bot, config)],
      allowedMentions: { parse: [] },
    });
  }

  const msg = await message.reply({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildPanel(bot, config)],
    allowedMentions: { parse: [] },
  });

  const refresh = async () => {
    config = getLogsGuildConfig(bot, message.guild.id);
    await msg.edit({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [buildPanel(bot, config)],
      allowedMentions: { parse: [] },
    });
  };

  const showGuildModal = async (interaction, target) => {
    const currentValue = target === 'main' ? config.mainGuildId : config.secondaryGuildId;
    const title = target === 'main' ? 'Serveur principal' : 'Serveur secondaire';

    const modal = new Discord.ModalBuilder()
      .setCustomId(`${panelId}:modal:${target}`)
      .setTitle(title)
      .addComponents(
        new Discord.ActionRowBuilder().addComponents(
          new Discord.TextInputBuilder()
            .setCustomId('guildId')
            .setLabel(target === 'main' ? 'ID du serveur principal' : 'ID du serveur secondaire')
            .setStyle(Discord.TextInputStyle.Short)
            .setPlaceholder('Exemple: 123456789012345678')
            .setValue(currentValue || '')
            .setRequired(false),
        ),
      );

    return interaction.showModal(modal);
  };

  const handleModal = async (modal) => {
    if (!modal.isModalSubmit()) return;
    if (modal.user.id !== message.author.id) return;
    if (!modal.customId.startsWith(`${panelId}:modal:`)) return;

    const target = modal.customId.endsWith(':main') ? 'main' : 'secondary';
    const guildId = normalizeGuildId(modal.fields.getTextInputValue('guildId'));

    if (modal.fields.getTextInputValue('guildId').trim() && !guildId) {
      return safeReply(modal, buildResponse('> ID invalide. Mets un ID de serveur Discord valide, par exemple `123456789012345678`.'));
    }

    const next = {
      ...config,
      ...(target === 'main' ? { mainGuildId: guildId } : { secondaryGuildId: guildId }),
    };

    saveLogsGuildConfig(bot, message.guild.id, next);
    await refresh();
    return safeReply(modal, buildResponse('> Configuration mise à jour.'));
  };

  bot.on('interactionCreate', handleModal);

  const collector = msg.createMessageComponentCollector({ time: 300000 });

  collector.on('collect', async (interaction) => {
    if (interaction.user.id !== message.author.id) {
      return safeReply(interaction, buildResponse('> Ce panel ne vous appartient pas.'));
    }

    if (interaction.customId === 'config-guild:set-current-main') {
      saveLogsGuildConfig(bot, message.guild.id, { ...config, mainGuildId: message.guild.id });
      config = getLogsGuildConfig(bot, message.guild.id);
      return interaction.update({
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [buildPanel(bot, config)],
        allowedMentions: { parse: [] },
      });
    }

    if (interaction.customId === 'config-guild:set-current-secondary') {
      saveLogsGuildConfig(bot, message.guild.id, { ...config, secondaryGuildId: message.guild.id });
      config = getLogsGuildConfig(bot, message.guild.id);
      return interaction.update({
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [buildPanel(bot, config)],
        allowedMentions: { parse: [] },
      });
    }

    if (interaction.customId === 'config-guild:edit-main') {
      return showGuildModal(interaction, 'main');
    }

    if (interaction.customId === 'config-guild:edit-secondary') {
      return showGuildModal(interaction, 'secondary');
    }

    if (interaction.customId === 'config-guild:reset') {
      saveLogsGuildConfig(bot, message.guild.id, { mainGuildId: '', secondaryGuildId: '' });
      config = getLogsGuildConfig(bot, message.guild.id);
      return interaction.update({
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [buildPanel(bot, config)],
        allowedMentions: { parse: [] },
      });
    }
  });

  collector.on('end', () => {
    bot.off('interactionCreate', handleModal);
  });
};
