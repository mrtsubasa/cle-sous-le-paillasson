const Discord = require('discord.js');
const {
  getModLogChannelId,
  saveModLogChannelId,
} = require('../../Utils/logsGuildConfig');

const BLOCKS = [
  {
    key: 'to',
    selectedKey: 'mod_to_logs',
    title: 'TO',
    description: "> Configure le salon utilisé quand un membre reçoit une exclusion temporaire.",
    placeholder: 'Sélectionnez le salon des logs TO',
  },
  {
    key: 'unto',
    selectedKey: 'mod_unto_logs',
    title: 'UNTO',
    description: "> Configure le salon utilisé quand l'exclusion temporaire d'un membre est retirée.",
    placeholder: 'Sélectionnez le salon des logs UNTO',
  },
  {
    key: 'kick',
    selectedKey: 'mod_kick_logs',
    title: 'Kick',
    description: '> Configure le salon utilisé quand un membre est expulsé.',
    placeholder: 'Sélectionnez le salon des logs kick',
  },
  {
    key: 'ban',
    selectedKey: 'mod_ban_logs',
    title: 'Ban',
    description: '> Configure le salon utilisé quand un membre est banni.',
    placeholder: 'Sélectionnez le salon des logs ban',
  },
  {
    key: 'unban',
    selectedKey: 'mod_unban_logs',
    title: 'Unban',
    description: '> Configure le salon utilisé quand un membre est débanni.',
    placeholder: 'Sélectionnez le salon des logs unban',
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
    BLOCKS.map((block) => [block.selectedKey, getModLogChannelId(bot, guildId, block.key)]),
  );
}

function buildPanel(selected) {
  const container = new Discord.ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent('# Panel des logs modération'),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        '> Configure les salons pour les actions faites manuellement sur le serveur.',
      ),
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
          makeSelect(`logsmod:${block.selectedKey}`, block.placeholder, channelId),
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
  name: 'logsmod',
  aliases: ['logs-mod', 'logsmoderation', 'logs-moderation'],
  type: 'sys',
  description: 'Configure les salons des logs de modération',
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

    const block = BLOCKS.find((item) => interaction.customId === `logsmod:${item.selectedKey}`);
    if (!block) return;

    saveModLogChannelId(bot, message.guild.id, block.key, interaction.values[0] || '');
    selected = getSelectedChannelIds(bot, message.guild.id);

    return interaction.update({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [buildPanel(selected)],
      allowedMentions: { parse: [] },
    });
  });
};
