const Discord = require('discord.js');
const { getVoiceLogTarget } = require('../Utils/logsGuildConfig');

function getMuteAction(oldState, newState) {
  const oldMute = Boolean(oldState.mute);
  const newMute = Boolean(newState.mute);
  const oldDeaf = Boolean(oldState.deaf);
  const newDeaf = Boolean(newState.deaf);
  const muteChanged = oldMute !== newMute;
  const deafChanged = oldDeaf !== newDeaf;

  if (muteChanged && deafChanged && newMute && newDeaf) return 'mute_both';
  if (muteChanged && deafChanged && !newMute && !newDeaf) return 'unmute_both';
  if (muteChanged) return newMute ? 'mute_mic' : 'unmute_mic';
  if (deafChanged) return newDeaf ? 'mute_headset' : 'unmute_headset';
  return null;
}

function getMediaAction(oldState, newState) {
  const oldStreaming = Boolean(oldState.streaming);
  const newStreaming = Boolean(newState.streaming);
  const oldVideo = Boolean(oldState.selfVideo);
  const newVideo = Boolean(newState.selfVideo);

  if (oldStreaming !== newStreaming) return newStreaming ? 'stream_start' : 'stream_stop';
  if (oldVideo !== newVideo) return newVideo ? 'cam_on' : 'cam_off';
  return null;
}

function buildVoiceLog(member, voiceChannel, action, nextVoiceChannel = null) {
  const timestamp = Math.floor(Date.now() / 1000);
  const voiceChannelName = voiceChannel?.name || 'Salon vocal inconnu';
  const nextVoiceChannelName = nextVoiceChannel?.name || 'Salon vocal inconnu';
  const isLeave = action === 'leave';
  const isMove = action === 'move';
  const voiceMuteLabels = {
    mute_mic: { emoji: '<:mutemicro:1382304516946264165>', actionText: "s'est mute", target: 'Micro' },
    mute_headset: { emoji: '<:mutecasque:1382304470616113256>', actionText: "s'est mute", target: 'Casque' },
    mute_both: { emoji: '<:mutemicro:1382304516946264165> <:mutecasque:1382304470616113256>', actionText: "s'est mute", target: 'Micro/Casque' },
    unmute_mic: { emoji: '<:on:1432722720986103918>', actionText: "s'est unmute", target: 'Micro' },
    unmute_headset: { emoji: '<:unmutecasque:1382304522264776714>', actionText: "s'est unmute", target: 'Casque' },
    unmute_both: { emoji: '<:on:1432722720986103918> <:unmutecasque:1382304522264776714>', actionText: "s'est unmute", target: 'Micro/Casque' },
  };
  const voiceMediaLabels = {
    stream_start: { emoji: '<:voicestream:1382304501758824468>', text: 'a commencé à streamer' },
    stream_stop: { emoji: '<:streamoff:1382304506750042134>', text: 'a arrêté de streamer' },
    cam_on: { emoji: '<:camon:1382304496771792948>', text: 'a activé sa caméra' },
    cam_off: { emoji: '<:camoff:1382304511858573462>', text: 'a désactivé sa caméra' },
  };
  const muteLog = voiceMuteLabels[action];
  const mediaLog = voiceMediaLabels[action];
  const emoji = muteLog?.emoji
    || mediaLog?.emoji
    || (isMove ? '<:voiceswitch:1510335562551398471>' : isLeave ? '<:voiceleave:1510334126618837184>' : '<:voicejoin:1510330412071915620>');
  const text = muteLog
    ? `${muteLog.actionText} \`${muteLog.target}\` dans le salon vocal \`${voiceChannelName}\``
    : mediaLog
      ? `${mediaLog.text} dans le salon vocal \`${voiceChannelName}\``
    : isMove
      ? `s'est déplacé de \`${voiceChannelName}\` à \`${nextVoiceChannelName}\``
      : `${isLeave ? 'a quitté le salon vocal' : 'a rejoint le salon vocal'} \`${voiceChannelName}\``;

  return new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `${emoji} ${member} ${text}`,
      ),
    )
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    )
}

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, bot) {
    const guild = newState?.guild || oldState?.guild;
    const member = newState?.member || oldState?.member;
    if (!guild || !member) return;

    const isJoin = !oldState.channelId && Boolean(newState.channelId);
    const isLeave = Boolean(oldState.channelId) && !newState.channelId;
    const isMove = Boolean(oldState.channelId) && Boolean(newState.channelId) && oldState.channelId !== newState.channelId;
    const muteAction = !isJoin && !isLeave && !isMove ? getMuteAction(oldState, newState) : null;
    const mediaAction = !isJoin && !isLeave && !isMove && !muteAction ? getMediaAction(oldState, newState) : null;
    if (!isJoin && !isLeave && !isMove && !muteAction && !mediaAction) return;

    const voiceChannel = isLeave || isMove ? oldState.channel : newState.channel;
    const action = muteAction || mediaAction || (isMove ? 'move' : isLeave ? 'leave' : 'join');
    if (!voiceChannel) return;

    const target = getVoiceLogTarget(bot, guild.id, action);
    if (!target) return;

    const destinationGuild = bot.guilds.cache.get(target.secondaryGuildId)
      || await bot.guilds.fetch(target.secondaryGuildId).catch(() => null);
    if (!destinationGuild) return;

    const logChannel = destinationGuild.channels.cache.get(target.channelId)
      || await destinationGuild.channels.fetch(target.channelId).catch(() => null);
    if (!logChannel?.isTextBased?.()) return;

    await logChannel.send({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [buildVoiceLog(member, voiceChannel, action, newState.channel)],
      allowedMentions: { parse: [] },
    }).catch((error) => {
      console.error(`Erreur log vocal : ${error?.message || error}`);
    });
  },
};
