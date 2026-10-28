const Discord = require('discord.js');
const {
  getGuildScheduledEventLogChannelId,
  saveGuildScheduledEventLogChannelId,
} = require('../../Utils/logsGuildConfig');

const BLOCKS = [
  {
    key: 'create',
    selectedKey: 'guild_scheduled_event_create_logs',
    title: 'Guild scheduled event create',
    description: '> Configure le salon utilisé quand un événement programmé est créé.',
    placeholder: 'Sélectionnez le salon des logs guildScheduledEventCreate',
  },
  {
    key: 'delete',
    selectedKey: 'guild_scheduled_event_delete_logs',
    title: 'Guild scheduled event delete',
    description: '> Configure le salon utilisé quand un événement programmé est supprimé.',
    placeholder: 'Sélectionnez le salon des logs guildScheduledEventDelete',
  },
  {
    key: 'update',
    selectedKey: 'guild_scheduled_event_update_logs',
    title: 'Guild scheduled event update',
    description: '> Configure le salon utilisé quand un événement programmé est modifié.',
    placeholder: 'Sélectionnez le salon des logs guildScheduledEventUpdate',
  },
  {
    key: 'user_add',
    selectedKey: 'guild_scheduled_event_user_add_logs',
    title: 'Guild scheduled event user add',
    description: "> Configure le salon utilisé quand quelqu'un s'intéresse à un événement programmé.",
    placeholder: 'Sélectionnez le salon des logs guildScheduledEventUserAdd',
  },
  {
    key: 'user_remove',
    selectedKey: 'guild_scheduled_event_user_remove_logs',
    title: 'Guild scheduled event user remove',
    description: "> Configure le salon utilisé quand quelqu'un retire son intérêt d'un événement programmé.",
    placeholder: 'Sélectionnez le salon des logs guildScheduledEventUserRemove',
  },
];

function formatChannel(channelId) {
  return channelId ? `> <#${channelId}>` : '> Aucun salon configuré';
}

function makeSelect(customId, placeholder, selectedChannelId) {
  const builder = new Discord.ChannelSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(0)
    .setMaxValues(1)
    .addChannelTypes(Discord.ChannelType.GuildText);

  if (selectedChannelId) {
    builder.setDefaultChannels(selectedChannelId);
  }

  return builder;
}

function getSelectedChannelIds(bot, guildId) {
  return Object.fromEntries(
    BLOCKS.map((block) => [
      block.selectedKey,
      getGuildScheduledEventLogChannelId(bot, guildId, block.key),
    ]),
  );
}

function buildPanel(selected) {
  const container = new Discord.ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent('# Panel des logs événements programmés'),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    );

  for (const block of BLOCKS) {
    const channelId = selected[block.selectedKey];

    container
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          `# ${block.title}\n${block.description}\n> Salon actuel : ${formatChannel(channelId)}`,
        ),
      )
      .addActionRowComponents(
        new Discord.ActionRowBuilder().addComponents(
          makeSelect(`logsguildScheduled:${block.selectedKey}`, block.placeholder, channelId),
        ),
      )
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
      );
  }

  return container;
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
  name: 'logsguildscheduled',
  aliases: ['logsguildscheduled', 'logs-guild-scheduled', 'logsscheduledevent', 'logs-scheduled-event'],
  type: 'sys',
  description: 'Configure les logs des événements programmés',
};

exports.run = async (bot, message) => {
  if (!message.guild) return;
  if (!bot.functions.checkPerm(bot, message, 'sys')) return;

  let selected = getSelectedChannelIds(bot, message.guild.id);

  const msg = await message.reply({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildPanel(selected)],
    allowedMentions: { parse: [] },
  });

  const collector = msg.createMessageComponentCollector({ time: 300000 });

  collector.on('collect', async (interaction) => {
    if (interaction.user.id !== message.author.id) {
      return safeReply(interaction, buildResponse('> Ce panel ne vous appartient pas.'));
    }

    if (!interaction.isChannelSelectMenu()) return;

    const block = BLOCKS.find((item) => interaction.customId === `logsguildScheduled:${item.selectedKey}`);
    if (!block) return;

    saveGuildScheduledEventLogChannelId(bot, message.guild.id, block.key, interaction.values[0] || '');
    selected = getSelectedChannelIds(bot, message.guild.id);

    return interaction.update({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [buildPanel(selected)],
      allowedMentions: { parse: [] },
    });
  });
};
