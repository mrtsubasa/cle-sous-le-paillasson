const Discord = require('discord.js');
const {
  getMessageEmbedDeleteWebhookUrl,
  getMessageLogChannelId,
  saveMessageEmbedDeleteWebhookUrl,
  saveMessageLogChannelId,
} = require('../../Utils/logsGuildConfig');

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

function buildBlock(title, description, channelId, customId, placeholder) {
  return {
    title,
    description,
    channelId,
    customId,
    placeholder,
  };
}

function formatWebhook(webhookUrl) {
  return webhookUrl ? '> Webhook configuré' : '> Aucun webhook configuré';
}

function getSelectedChannelIds(bot, guildId) {
  return {
    message_delete_logs: getMessageLogChannelId(bot, guildId, 'delete'),
    message_bulk_delete_logs: getMessageLogChannelId(bot, guildId, 'bulk_delete'),
    message_edit_logs: getMessageLogChannelId(bot, guildId, 'edit'),
    message_embed_delete_webhook: getMessageEmbedDeleteWebhookUrl(bot, guildId),
  };
}

function buildPanel(selected) {
  const blocks = [
    buildBlock(
      'Message delete',
      '> Configure le salon utilisé quand un message est supprimé.',
      selected.message_delete_logs,
      'logsmessage:message_delete_logs',
      'Sélectionnez le salon des logs message delete',
    ),
    buildBlock(
      'Message edit',
      '> Configure le salon utilisé quand un message est modifié.',
      selected.message_edit_logs,
      'logsmessage:message_edit_logs',
      'Sélectionnez le salon des logs message edit',
    ),
    buildBlock(
      'Message bulk delete',
      '> Configure le salon utilisé quand plusieurs messages sont supprimés en même temps.',
      selected.message_bulk_delete_logs,
      'logsmessage:message_bulk_delete_logs',
      'Sélectionnez le salon des logs message bulk delete',
    ),
  ];

  const container = new Discord.ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent('# Panel des logs message'),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        '> Configure les salons utilisés pour les logs des messages supprimés ou modifiés.',
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    );

  for (const block of blocks) {
    const text = `# ${block.title}\n${block.description}\n> Salon actuel : ${formatChannel(block.channelId)}`;

    container.addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(text),
    );

    container
      .addActionRowComponents(
        new Discord.ActionRowBuilder().addComponents(
          makeSelect(block.customId, block.placeholder, block.channelId),
        ),
      )
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
      );
  }

  container
    .addSectionComponents(
      new Discord.SectionBuilder()
        .addTextDisplayComponents(
          new Discord.TextDisplayBuilder().setContent(
            `# Embed delete\n> Configure le webhook utilisé quand un embed de bot est supprimé.\n${formatWebhook(selected.message_embed_delete_webhook)}`,
          ),
        )
        .setButtonAccessory(
          new Discord.ButtonBuilder()
            .setCustomId('logsmessage:embed_delete_webhook')
            .setLabel('Webhook')
            .setStyle(Discord.ButtonStyle.Secondary),
        ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    );

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
  name: 'logsmessage',
  aliases: ['logs-message', 'logsmsg', 'logs-msg'],
  type: 'sys',
  description: 'Configure le salon des logs message',
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

    if (interaction.isButton() && interaction.customId === 'logsmessage:embed_delete_webhook') {
      const modalId = `logsmessage:webhook:${message.id}`;
      const modal = new Discord.ModalBuilder()
        .setCustomId(modalId)
        .setTitle('Webhook embed delete')
        .addComponents(
          new Discord.ActionRowBuilder().addComponents(
            new Discord.TextInputBuilder()
              .setCustomId('webhookUrl')
              .setLabel('URL du webhook')
              .setStyle(Discord.TextInputStyle.Paragraph)
              .setValue(selected.message_embed_delete_webhook || '')
              .setRequired(false),
          ),
        );

      await interaction.showModal(modal);

      const submitted = await interaction.awaitModalSubmit({
        filter: (modalInteraction) => modalInteraction.user.id === message.author.id && modalInteraction.customId === modalId,
        time: 120000,
      }).catch(() => null);

      if (!submitted) return;

      const nextWebhookUrl = submitted.fields.getTextInputValue('webhookUrl');
      const savedWebhookUrl = saveMessageEmbedDeleteWebhookUrl(bot, message.guild.id, nextWebhookUrl);
      selected = getSelectedChannelIds(bot, message.guild.id);

      await msg.edit({
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [buildPanel(selected)],
        allowedMentions: { parse: [] },
      }).catch(() => null);

      return safeReply(
        submitted,
        buildResponse(savedWebhookUrl ? '> Webhook embed delete configuré.' : '> Webhook embed delete retiré ou invalide.'),
      );
    }

    if (!interaction.isChannelSelectMenu()) return;

    const actions = {
      'logsmessage:message_delete_logs': 'delete',
      'logsmessage:message_edit_logs': 'edit',
      'logsmessage:message_bulk_delete_logs': 'bulk_delete',
    };
    const action = actions[interaction.customId];
    if (!action) return;

    saveMessageLogChannelId(bot, message.guild.id, action, interaction.values[0] || '');
    selected = getSelectedChannelIds(bot, message.guild.id);

    return interaction.update({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [buildPanel(selected)],
      allowedMentions: { parse: [] },
    });
  });
};
