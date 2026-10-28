const Discord = require('discord.js');
const {
  getThreadLogChannelId,
  saveThreadLogChannelId,
} = require('../../Utils/logsGuildConfig');

const BLOCKS = [
  {
    key: 'create',
    selectedKey: 'thread_create_logs',
    title: 'Thread create',
    description: '> Configure le salon utilisé quand un thread est créé.',
    placeholder: 'Sélectionnez le salon des logs threadCreate',
  },
  {
    key: 'delete',
    selectedKey: 'thread_delete_logs',
    title: 'Thread delete',
    description: '> Configure le salon utilisé quand un thread est supprimé.',
    placeholder: 'Sélectionnez le salon des logs threadDelete',
  },
  {
    key: 'update',
    selectedKey: 'thread_update_logs',
    title: 'Thread update',
    description: '> Configure le salon utilisé quand un thread est modifié.',
    placeholder: 'Sélectionnez le salon des logs threadUpdate',
  },
  {
    key: 'member_update',
    selectedKey: 'thread_member_update_logs',
    title: 'Thread member update',
    description: '> Configure le salon utilisé quand un membre de thread est modifié.',
    placeholder: 'Sélectionnez le salon des logs threadMemberUpdate',
  },
  {
    key: 'members_update',
    selectedKey: 'thread_members_update_logs',
    title: 'Thread members update',
    description: '> Configure le salon utilisé quand les membres d’un thread changent.',
    placeholder: 'Sélectionnez le salon des logs threadMembersUpdate',
  },
  {
    key: 'list_sync',
    selectedKey: 'thread_list_sync_logs',
    title: 'Thread list sync',
    description: '> Configure le salon utilisé quand Discord synchronise la liste des threads.',
    placeholder: 'Sélectionnez le salon des logs threadListSync',
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
    BLOCKS.map((block) => [block.selectedKey, getThreadLogChannelId(bot, guildId, block.key)]),
  );
}

function buildPanel(selected) {
  const container = new Discord.ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent('# Panel des logs thread'),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        '> Configure les salons pour les créations, suppressions, modifications et synchronisations des threads.',
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
          makeSelect(`logsthread:${block.selectedKey}`, block.placeholder, channelId),
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
  name: 'logsthread',
  aliases: ['logs-thread', 'logsthreads', 'logs-threads'],
  type: 'sys',
  description: 'Configure les logs thread',
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

    const block = BLOCKS.find((item) => interaction.customId === `logsthread:${item.selectedKey}`);
    if (!block) return;

    saveThreadLogChannelId(bot, message.guild.id, block.key, interaction.values[0] || '');
    selected = getSelectedChannelIds(bot, message.guild.id);

    return interaction.update({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [buildPanel(selected)],
      allowedMentions: { parse: [] },
    });
  });
};
