const Discord = require('discord.js');
const {
  BLR_ADD_LOG_CHANNEL_ID_FIELD,
  BLR_REMOVE_LOG_CHANNEL_ID_FIELD,
  getLogChannelConfig,
  getSelectedChannelIds,
  setLogChannel,
} = require('../../Utils/logChannels');

function buildResponse(title, content) {
  return {
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [
      new Discord.ContainerBuilder()
        .setAccentColor(0x2b2d31)
        .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(title))
        .addSeparatorComponents(
          new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
        )
        .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(content)),
    ],
  };
}

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

function buildChannelBlock(title, description, channelId, customId, placeholder) {
  return {
    title,
    description,
    channelId,
    customId,
    placeholder,
  };
}

function buildPanel(selected) {
  const blocks = [
    buildChannelBlock(
      'Logs BLR',
      '> Configure le salon utilisé quand un membre est blr',
      selected.blr_add_logs,
      'panel:blr_add_logs',
      'Sélectionnez le salon de logs BLR',
    ),
    buildChannelBlock(
      'Logs UNBLR',
      '> Configure le salon utilisé quand un membre est retiré de la blr',
      selected.blr_remove_logs,
      'panel:blr_remove_logs',
      'Sélectionnez le salon de logs UNBLR',
    ),
  ];

  const container = new Discord.ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent('# Panel des logs BLR'),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        '> Configure les salons de logs pour BLR et UNBLR',
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    );

  for (const block of blocks) {
    container
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          `# ${block.title}\n${block.description}\n> Salon actuel : ${formatChannel(block.channelId)}`,
        ),
      )
      .addActionRowComponents(
        new Discord.ActionRowBuilder().addComponents(
          makeSelect(block.customId, block.placeholder, block.channelId),
        ),
      )
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
      );
  }

  return container;
}

exports.help = {
  name: 'panel',
  aliases: ['logs-panel', 'logspanel'],
  type: 'sys',
  description: 'Panel de configuration des logs BLR',
};

exports.run = async (bot, message) => {
  if (!message.guild) return;
  if (!bot.functions.checkPerm(bot, message, 'sys')) return;

  const row = getLogChannelConfig(bot, message.guild.id);
  const selected = getSelectedChannelIds(row);

  const msg = await message.reply({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildPanel(selected)],
  });

  const collector = msg.createMessageComponentCollector({ time: 300000 });

  collector.on('collect', async (interaction) => {
    if (interaction.user.id !== message.author.id) return;
    if (!interaction.isChannelSelectMenu()) return;

    const map = {
      'panel:blr_add_logs': BLR_ADD_LOG_CHANNEL_ID_FIELD,
      'panel:blr_remove_logs': BLR_REMOVE_LOG_CHANNEL_ID_FIELD,
    };

    const field = map[interaction.customId];
    if (!field) return;

    const nextId = interaction.values[0] || null;
    setLogChannel(bot, message.guild.id, field, nextId);

    const updated = getSelectedChannelIds(getLogChannelConfig(bot, message.guild.id));
    await interaction.update({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [buildPanel(updated)],
    });
  });
};
