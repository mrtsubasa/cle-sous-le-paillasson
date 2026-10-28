const Discord = require('discord.js');
const {
  getVoiceJoinLogsChannelId,
  getVoiceLeaveLogsChannelId,
  getVoiceMoveLogsChannelId,
  getVoiceLogChannelId,
  saveVoiceJoinLogsChannelId,
  saveVoiceLeaveLogsChannelId,
  saveVoiceMoveLogsChannelId,
  saveVoiceLogChannelId,
} = require('../../Utils/logsGuildConfig');

const VOICE_JOIN_LOG_CHANNEL_ID_FIELD = 'voice_join_logs';
const VOICE_LEAVE_LOG_CHANNEL_ID_FIELD = 'voice_leave_logs';
const VOICE_MOVE_LOG_CHANNEL_ID_FIELD = 'voice_move_logs';
const VOICE_MUTE_MIC_LOG_CHANNEL_ID_FIELD = 'voice_mute_mic_logs';
const VOICE_MUTE_HEADSET_LOG_CHANNEL_ID_FIELD = 'voice_mute_headset_logs';
const VOICE_MUTE_BOTH_LOG_CHANNEL_ID_FIELD = 'voice_mute_both_logs';
const VOICE_UNMUTE_MIC_LOG_CHANNEL_ID_FIELD = 'voice_unmute_mic_logs';
const VOICE_UNMUTE_HEADSET_LOG_CHANNEL_ID_FIELD = 'voice_unmute_headset_logs';
const VOICE_UNMUTE_BOTH_LOG_CHANNEL_ID_FIELD = 'voice_unmute_both_logs';
const VOICE_STREAM_START_LOG_CHANNEL_ID_FIELD = 'voice_stream_start_logs';
const VOICE_STREAM_STOP_LOG_CHANNEL_ID_FIELD = 'voice_stream_stop_logs';
const VOICE_CAM_ON_LOG_CHANNEL_ID_FIELD = 'voice_cam_on_logs';
const VOICE_CAM_OFF_LOG_CHANNEL_ID_FIELD = 'voice_cam_off_logs';
const PAGE_SIZE = 6;

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

function buildPanel(selected, page = 0) {
  const blocks = [
    buildChannelBlock(
      'Vocal join',
      '> Configure le salon utilisé quand un membre rejoint un vocal.',
      selected.voice_join_logs,
      'logsvocal:voice_join_logs',
      'Sélectionnez le salon des logs vocal join',
    ),
    buildChannelBlock(
      'Vocal leave',
      '> Configure le salon utilisé quand un membre quitte un vocal.',
      selected.voice_leave_logs,
      'logsvocal:voice_leave_logs',
      'Sélectionnez le salon des logs vocal leave',
    ),
    buildChannelBlock(
      'Vocal move',
      '> Configure le salon utilisé quand un membre se déplace entre deux vocaux.',
      selected.voice_move_logs,
      'logsvocal:voice_move_logs',
      'Sélectionnez le salon des logs vocal move',
    ),
    buildChannelBlock(
      'Mute micro',
      '> Configure le salon utilisé quand un membre mute son micro.',
      selected.voice_mute_mic_logs,
      'logsvocal:voice_mute_mic_logs',
      'Sélectionnez le salon des logs mute micro',
    ),
    buildChannelBlock(
      'Mute casque',
      '> Configure le salon utilisé quand un membre mute son casque.',
      selected.voice_mute_headset_logs,
      'logsvocal:voice_mute_headset_logs',
      'Sélectionnez le salon des logs mute casque',
    ),
    buildChannelBlock(
      'Mute micro/casque',
      '> Configure le salon utilisé quand un membre mute son micro et son casque.',
      selected.voice_mute_both_logs,
      'logsvocal:voice_mute_both_logs',
      'Sélectionnez le salon des logs mute micro/casque',
    ),
    buildChannelBlock(
      'Unmute micro',
      '> Configure le salon utilisé quand un membre unmute son micro.',
      selected.voice_unmute_mic_logs,
      'logsvocal:voice_unmute_mic_logs',
      'Sélectionnez le salon des logs unmute micro',
    ),
    buildChannelBlock(
      'Unmute casque',
      '> Configure le salon utilisé quand un membre unmute son casque.',
      selected.voice_unmute_headset_logs,
      'logsvocal:voice_unmute_headset_logs',
      'Sélectionnez le salon des logs unmute casque',
    ),
    buildChannelBlock(
      'Unmute micro/casque',
      '> Configure le salon utilisé quand un membre unmute son micro et son casque.',
      selected.voice_unmute_both_logs,
      'logsvocal:voice_unmute_both_logs',
      'Sélectionnez le salon des logs unmute micro/casque',
    ),
    buildChannelBlock(
      'Stream start',
      '> Configure le salon utilisé quand un membre commence à streamer.',
      selected.voice_stream_start_logs,
      'logsvocal:voice_stream_start_logs',
      'Sélectionnez le salon des logs stream start',
    ),
    buildChannelBlock(
      'Stream stop',
      '> Configure le salon utilisé quand un membre arrête de streamer.',
      selected.voice_stream_stop_logs,
      'logsvocal:voice_stream_stop_logs',
      'Sélectionnez le salon des logs stream stop',
    ),
    buildChannelBlock(
      'Cam on',
      '> Configure le salon utilisé quand un membre active sa caméra.',
      selected.voice_cam_on_logs,
      'logsvocal:voice_cam_on_logs',
      'Sélectionnez le salon des logs cam on',
    ),
    buildChannelBlock(
      'Cam off',
      '> Configure le salon utilisé quand un membre désactive sa caméra.',
      selected.voice_cam_off_logs,
      'logsvocal:voice_cam_off_logs',
      'Sélectionnez le salon des logs cam off',
    ),
  ];
  const pageTotal = Math.ceil(blocks.length / PAGE_SIZE) || 1;
  const safePage = Math.min(Math.max(page, 0), pageTotal - 1);
  const visibleBlocks = blocks.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const container = new Discord.ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent('# Panel des logs vocal'),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `> Configure les salons de logs pour les connexions, déplacements, mute, stream et caméra\n> Page ${safePage + 1}/${pageTotal}`,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    );

  for (const block of visibleBlocks) {
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
      );
  }

  if (pageTotal > 1) {
    container
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
      )
      .addActionRowComponents(
        new Discord.ActionRowBuilder().addComponents(
          new Discord.ButtonBuilder()
            .setCustomId('logsvocal:prev')
            .setLabel('<')
            .setStyle(Discord.ButtonStyle.Secondary)
            .setDisabled(safePage <= 0),
          new Discord.ButtonBuilder()
            .setCustomId('logsvocal:next')
            .setLabel('>')
            .setStyle(Discord.ButtonStyle.Secondary)
            .setDisabled(safePage >= pageTotal - 1),
        ),
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

function getSelectedChannelIds(bot, guildId) {
  return {
    voice_join_logs: getVoiceJoinLogsChannelId(bot, guildId),
    voice_leave_logs: getVoiceLeaveLogsChannelId(bot, guildId),
    voice_move_logs: getVoiceMoveLogsChannelId(bot, guildId),
    voice_mute_mic_logs: getVoiceLogChannelId(bot, guildId, 'mute_mic'),
    voice_mute_headset_logs: getVoiceLogChannelId(bot, guildId, 'mute_headset'),
    voice_mute_both_logs: getVoiceLogChannelId(bot, guildId, 'mute_both'),
    voice_unmute_mic_logs: getVoiceLogChannelId(bot, guildId, 'unmute_mic'),
    voice_unmute_headset_logs: getVoiceLogChannelId(bot, guildId, 'unmute_headset'),
    voice_unmute_both_logs: getVoiceLogChannelId(bot, guildId, 'unmute_both'),
    voice_stream_start_logs: getVoiceLogChannelId(bot, guildId, 'stream_start'),
    voice_stream_stop_logs: getVoiceLogChannelId(bot, guildId, 'stream_stop'),
    voice_cam_on_logs: getVoiceLogChannelId(bot, guildId, 'cam_on'),
    voice_cam_off_logs: getVoiceLogChannelId(bot, guildId, 'cam_off'),
  };
}

exports.help = {
  name: 'logsvocal',
  aliases: ['logs-vocal', 'vocal-logs'],
  type: 'sys',
  description: 'Configure les salons des logs vocal',
};

exports.run = async (bot, message) => {
  if (!message.guild) return;
  if (!bot.functions.checkPerm(bot, message, 'sys')) return;

  let selected = getSelectedChannelIds(bot, message.guild.id);
  let page = 0;

  const msg = await message.reply({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildPanel(selected, page)],
    allowedMentions: { parse: [] },
  });

  const collector = msg.createMessageComponentCollector({ time: 300000 });

  collector.on('collect', async (interaction) => {
    if (interaction.user.id !== message.author.id) {
      return safeReply(interaction, buildResponse('> Ce panel ne vous appartient pas.'));
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'logsvocal:prev') {
        page = Math.max(page - 1, 0);
      } else if (interaction.customId === 'logsvocal:next') {
        page += 1;
      } else {
        return;
      }

      return interaction.update({
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [buildPanel(selected, page)],
        allowedMentions: { parse: [] },
      });
    }

    if (!interaction.isChannelSelectMenu()) return;

    const map = {
      'logsvocal:voice_join_logs': VOICE_JOIN_LOG_CHANNEL_ID_FIELD,
      'logsvocal:voice_leave_logs': VOICE_LEAVE_LOG_CHANNEL_ID_FIELD,
      'logsvocal:voice_move_logs': VOICE_MOVE_LOG_CHANNEL_ID_FIELD,
      'logsvocal:voice_mute_mic_logs': VOICE_MUTE_MIC_LOG_CHANNEL_ID_FIELD,
      'logsvocal:voice_mute_headset_logs': VOICE_MUTE_HEADSET_LOG_CHANNEL_ID_FIELD,
      'logsvocal:voice_mute_both_logs': VOICE_MUTE_BOTH_LOG_CHANNEL_ID_FIELD,
      'logsvocal:voice_unmute_mic_logs': VOICE_UNMUTE_MIC_LOG_CHANNEL_ID_FIELD,
      'logsvocal:voice_unmute_headset_logs': VOICE_UNMUTE_HEADSET_LOG_CHANNEL_ID_FIELD,
      'logsvocal:voice_unmute_both_logs': VOICE_UNMUTE_BOTH_LOG_CHANNEL_ID_FIELD,
      'logsvocal:voice_stream_start_logs': VOICE_STREAM_START_LOG_CHANNEL_ID_FIELD,
      'logsvocal:voice_stream_stop_logs': VOICE_STREAM_STOP_LOG_CHANNEL_ID_FIELD,
      'logsvocal:voice_cam_on_logs': VOICE_CAM_ON_LOG_CHANNEL_ID_FIELD,
      'logsvocal:voice_cam_off_logs': VOICE_CAM_OFF_LOG_CHANNEL_ID_FIELD,
    };

    const field = map[interaction.customId];
    if (!field) return;

    const nextId = interaction.values[0] || '';
    if (field === VOICE_JOIN_LOG_CHANNEL_ID_FIELD) {
      saveVoiceJoinLogsChannelId(bot, message.guild.id, nextId);
    }
    if (field === VOICE_LEAVE_LOG_CHANNEL_ID_FIELD) {
      saveVoiceLeaveLogsChannelId(bot, message.guild.id, nextId);
    }
    if (field === VOICE_MOVE_LOG_CHANNEL_ID_FIELD) {
      saveVoiceMoveLogsChannelId(bot, message.guild.id, nextId);
    }
    if (field === VOICE_MUTE_MIC_LOG_CHANNEL_ID_FIELD) {
      saveVoiceLogChannelId(bot, message.guild.id, 'mute_mic', nextId);
    }
    if (field === VOICE_MUTE_HEADSET_LOG_CHANNEL_ID_FIELD) {
      saveVoiceLogChannelId(bot, message.guild.id, 'mute_headset', nextId);
    }
    if (field === VOICE_MUTE_BOTH_LOG_CHANNEL_ID_FIELD) {
      saveVoiceLogChannelId(bot, message.guild.id, 'mute_both', nextId);
    }
    if (field === VOICE_UNMUTE_MIC_LOG_CHANNEL_ID_FIELD) {
      saveVoiceLogChannelId(bot, message.guild.id, 'unmute_mic', nextId);
    }
    if (field === VOICE_UNMUTE_HEADSET_LOG_CHANNEL_ID_FIELD) {
      saveVoiceLogChannelId(bot, message.guild.id, 'unmute_headset', nextId);
    }
    if (field === VOICE_UNMUTE_BOTH_LOG_CHANNEL_ID_FIELD) {
      saveVoiceLogChannelId(bot, message.guild.id, 'unmute_both', nextId);
    }
    if (field === VOICE_STREAM_START_LOG_CHANNEL_ID_FIELD) {
      saveVoiceLogChannelId(bot, message.guild.id, 'stream_start', nextId);
    }
    if (field === VOICE_STREAM_STOP_LOG_CHANNEL_ID_FIELD) {
      saveVoiceLogChannelId(bot, message.guild.id, 'stream_stop', nextId);
    }
    if (field === VOICE_CAM_ON_LOG_CHANNEL_ID_FIELD) {
      saveVoiceLogChannelId(bot, message.guild.id, 'cam_on', nextId);
    }
    if (field === VOICE_CAM_OFF_LOG_CHANNEL_ID_FIELD) {
      saveVoiceLogChannelId(bot, message.guild.id, 'cam_off', nextId);
    }

    selected = getSelectedChannelIds(bot, message.guild.id);

    return interaction.update({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [buildPanel(selected, page)],
      allowedMentions: { parse: [] },
    });
  });
};
