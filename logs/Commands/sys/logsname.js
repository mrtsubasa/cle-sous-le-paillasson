const Discord = require('discord.js');
const {
  getMemberLogChannelId,
  saveMemberLogChannelId,
} = require('../../Utils/logsGuildConfig');

function formatChannel(channelId) {
  return channelId ? `> <#${channelId}>` : '> Aucun salon configuré';
}

function makeSelect(selectedChannelId) {
  const builder = new Discord.ChannelSelectMenuBuilder()
    .setCustomId('logsname:member_name_logs')
    .setPlaceholder('Sélectionnez le salon des logs changement de pseudo')
    .setMinValues(0)
    .setMaxValues(1)
    .addChannelTypes(Discord.ChannelType.GuildText);

  if (selectedChannelId) {
    builder.setDefaultChannels(selectedChannelId);
  }

  return builder;
}

function buildPanel(channelId) {
  return new Discord.ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent('# Panel des logs pseudo'),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `# Changement de pseudo\n> Configure le salon utilisé quand un membre change son pseudo sur le serveur.\n> Salon actuel : ${formatChannel(channelId)}`,
      ),
    )
    .addActionRowComponents(
      new Discord.ActionRowBuilder().addComponents(makeSelect(channelId)),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    );
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
  name: 'logsname',
  aliases: ['logs-name', 'logspseudo', 'logs-pseudo'],
  type: 'sys',
  description: 'Configure le salon des logs de changement de pseudo',
};

exports.run = async (bot, message) => {
  if (!message.guild) return;
  if (!bot.functions.checkPerm(bot, message, 'sys')) return;

  let channelId = getMemberLogChannelId(bot, message.guild.id, 'name');

  const msg = await message.reply({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildPanel(channelId)],
    allowedMentions: { parse: [] },
  });

  const collector = msg.createMessageComponentCollector({ time: 300000 });

  collector.on('collect', async (interaction) => {
    if (interaction.user.id !== message.author.id) {
      return safeReply(interaction, buildResponse('> Ce panel ne vous appartient pas.'));
    }

    if (!interaction.isChannelSelectMenu() || interaction.customId !== 'logsname:member_name_logs') return;

    channelId = saveMemberLogChannelId(bot, message.guild.id, 'name', interaction.values[0] || '');

    return interaction.update({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [buildPanel(channelId)],
      allowedMentions: { parse: [] },
    });
  });
};
