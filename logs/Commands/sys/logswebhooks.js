const Discord = require('discord.js');
const {
  getWebhookLogChannelId,
  saveWebhookLogChannelId,
} = require('../../Utils/logsGuildConfig');

const BLOCKS = [
  {
    key: 'create',
    selectedKey: 'webhook_create_logs',
    title: 'Webhook create',
    description: '> Configure le salon utilisé quand un webhook est créé.',
    placeholder: 'Sélectionnez le salon des logs webhookCreate',
  },
  {
    key: 'delete',
    selectedKey: 'webhook_delete_logs',
    title: 'Webhook delete',
    description: '> Configure le salon utilisé quand un webhook est supprimé.',
    placeholder: 'Sélectionnez le salon des logs webhookDelete',
  },
  {
    key: 'update',
    selectedKey: 'webhook_update_logs',
    title: 'Webhook update',
    description: '> Configure le salon utilisé quand un webhook est modifié.',
    placeholder: 'Sélectionnez le salon des logs webhookUpdate',
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
    BLOCKS.map((block) => [block.selectedKey, getWebhookLogChannelId(bot, guildId, block.key)]),
  );
}

function buildPanel(selected) {
  const container = new Discord.ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent('# Panel des logs webhooks'),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        '> Configure les salons pour les créations, suppressions et modifications de webhooks.',
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
          makeSelect(`logswebhooks:${block.selectedKey}`, block.placeholder, channelId),
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
  name: 'logswebhooks',
  aliases: ['logs-webhooks', 'logswebhook', 'logs-webhook'],
  type: 'sys',
  description: 'Configure les salons des logs webhooks',
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

    const block = BLOCKS.find((item) => interaction.customId === `logswebhooks:${item.selectedKey}`);
    if (!block) return;

    saveWebhookLogChannelId(bot, message.guild.id, block.key, interaction.values[0] || '');
    selected = getSelectedChannelIds(bot, message.guild.id);

    return interaction.update({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [buildPanel(selected)],
      allowedMentions: { parse: [] },
    });
  });
};
