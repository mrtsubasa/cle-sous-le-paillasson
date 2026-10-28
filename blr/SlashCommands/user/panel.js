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
      '> Configure le salon utilisé quand un membre est mis en BLR.',
      selected.blr_add_logs,
      'panel:blr_add_logs',
      'Sélectionnez le salon de logs BLR',
    ),
    buildChannelBlock(
      'Logs UNBLR',
      '> Configure le salon utilisé quand un membre est retiré de la BLR.',
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

module.exports = {
  name: 'panel',
  description: 'Panel de configuration des logs BLR',
  dm_permission: false,
  perm: 'sys',

  run: async (bot, interaction) => {
    if (!bot.functions.checkPerm(bot, interaction, 'sys')) {
      return interaction.reply(buildResponse(
        '# Utilisateur non autorisé',
        '> Vous n\'êtes pas autorisé à exécuter cette commande',
      ));
    }

    const row = getLogChannelConfig(bot, interaction.guild.id);
    const selected = getSelectedChannelIds(row);

    await interaction.reply({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [buildPanel(selected)],
    });

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ time: 300000 });

    collector.on('collect', async (component) => {
      if (component.user.id !== interaction.user.id) return;
      if (!component.isChannelSelectMenu()) return;

    const map = {
      'panel:blr_add_logs': BLR_ADD_LOG_CHANNEL_ID_FIELD,
      'panel:blr_remove_logs': BLR_REMOVE_LOG_CHANNEL_ID_FIELD,
    };

      const field = map[component.customId];
      if (!field) return;

      const nextId = component.values[0] || null;
      setLogChannel(bot, interaction.guild.id, field, nextId);

      const updated = getSelectedChannelIds(getLogChannelConfig(bot, interaction.guild.id));
      await component.update({
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [buildPanel(updated)],
      });
    });
  },
};
