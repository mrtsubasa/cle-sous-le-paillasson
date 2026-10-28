const Discord = require('discord.js');
const {
  getAutoModerationLogChannelId,
  saveAutoModerationLogChannelId,
} = require('../../Utils/logsGuildConfig');

const BLOCKS = [
  {
    key: 'action_execution',
    selectedKey: 'automod_action_execution_logs',
    title: 'Auto moderation action execution',
    description: '> Configure le salon utilisé quand AutoMod exécute une action.',
    placeholder: 'Sélectionnez le salon des logs autoModerationActionExecution',
  },
  {
    key: 'rule_create',
    selectedKey: 'automod_rule_create_logs',
    title: 'Auto moderation rule create',
    description: '> Configure le salon utilisé quand une règle AutoMod est créée.',
    placeholder: 'Sélectionnez le salon des logs autoModerationRuleCreate',
  },
  {
    key: 'rule_delete',
    selectedKey: 'automod_rule_delete_logs',
    title: 'Auto moderation rule delete',
    description: '> Configure le salon utilisé quand une règle AutoMod est supprimée.',
    placeholder: 'Sélectionnez le salon des logs autoModerationRuleDelete',
  },
  {
    key: 'rule_update',
    selectedKey: 'automod_rule_update_logs',
    title: 'Auto moderation rule update',
    description: '> Configure le salon utilisé quand une règle AutoMod est modifiée.',
    placeholder: 'Sélectionnez le salon des logs autoModerationRuleUpdate',
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
    BLOCKS.map((block) => [block.selectedKey, getAutoModerationLogChannelId(bot, guildId, block.key)]),
  );
}

function buildPanel(selected) {
  const container = new Discord.ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent('# Panel des logs auto moderation'),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        '> Configure les salons pour les actions et règles AutoMod.',
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
          makeSelect(`logsautomoderation:${block.selectedKey}`, block.placeholder, channelId),
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
  name: 'logsautomoderation',
  aliases: ['logs-auto-moderation', 'logsautomod', 'logs-automod'],
  type: 'sys',
  description: 'Configure les logs AutoMod',
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

    const block = BLOCKS.find((item) => interaction.customId === `logsautomoderation:${item.selectedKey}`);
    if (!block) return;

    saveAutoModerationLogChannelId(bot, message.guild.id, block.key, interaction.values[0] || '');
    selected = getSelectedChannelIds(bot, message.guild.id);

    return interaction.update({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [buildPanel(selected)],
      allowedMentions: { parse: [] },
    });
  });
};
