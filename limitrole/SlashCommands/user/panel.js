const Discord = require('discord.js');
const {
  BYPASS_ADD_LOG_CHANNEL_ID_FIELD,
  BYPASS_REMOVE_LOG_CHANNEL_ID_FIELD,
  DEL_LIMIT_LOG_CHANNEL_ID_FIELD,
  getLogChannelConfig,
  getSelectedChannelIds,
  ROLE_LIMIT_LOG_CHANNEL_ID_FIELD,
  ROLE_LIMIT_OVERFLOW_LOG_CHANNEL_ID_FIELD,
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
      'Logs limite de rôle',
      '> Configure le salon utilisé quand une limite est définie.',
      selected.role_limit_logs,
      'panel:role_limit_logs',
      'Sélectionnez le salon de logs des limites',
    ),
    buildChannelBlock(
      'Logs limite dépassée',
      '> Configure le salon utilisé quand un rôle dépasse sa limite.',
      selected.role_limit_overflow_logs,
      'panel:role_limit_overflow_logs',
      'Sélectionnez le salon de logs limite dépassée',
    ),
    buildChannelBlock(
      'Logs bypass ajout',
      '> Configure le salon utilisé quand un bypass reçoit un rôle.',
      selected.bypass_add_logs,
      'panel:bypass_add_logs',
      'Sélectionnez le salon de logs des bypass ajout',
    ),
    buildChannelBlock(
      'Logs bypass retrait',
      '> Configure le salon utilisé quand un bypass perd un rôle.',
      selected.bypass_remove_logs,
      'panel:bypass_remove_logs',
      'Sélectionnez le salon de logs des bypass retrait',
    ),
    buildChannelBlock(
      'Logs del-limite',
      '> Configure le salon utilisé quand une limite est supprimée.',
      selected.del_limite_logs,
      'panel:del_limite_logs',
      'Sélectionnez le salon de logs del-limite',
    ),
  ];

  const container = new Discord.ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent('# Panel des logs des rôles'),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        '> Configure les salons de logs pour les limites de rôles, les dépassements et les bypass',
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
  description: 'Panel de configuration des logs des rôles',
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
        'panel:role_limit_logs': ROLE_LIMIT_LOG_CHANNEL_ID_FIELD,
        'panel:role_limit_overflow_logs': ROLE_LIMIT_OVERFLOW_LOG_CHANNEL_ID_FIELD,
        'panel:bypass_add_logs': BYPASS_ADD_LOG_CHANNEL_ID_FIELD,
        'panel:bypass_remove_logs': BYPASS_REMOVE_LOG_CHANNEL_ID_FIELD,
        'panel:del_limite_logs': DEL_LIMIT_LOG_CHANNEL_ID_FIELD,
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
