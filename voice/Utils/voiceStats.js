const {
  EmbedBuilder,
} = require('discord.js');

function collectStats(guild) {
  const members = guild.members.cache;
  const voiceMembersList = members.filter((m) => m.voice && m.voice.channelId !== null);

  return {
    totalMembers: guild.memberCount || 0,
    onlineMembers: members.filter((m) => m.presence && m.presence.status !== 'offline').size,
    voiceMembers: voiceMembersList.size,
    streamingMembers: voiceMembersList.filter((m) => m.voice.streaming).size,
    muteMembers: voiceMembersList.filter((m) => m.voice.selfMute || m.voice.serverMute || m.voice.selfDeaf || m.voice.serverDeaf).size,
    boostCount: guild.premiumSubscriptionCount || 0,
  };
}

function buildStatsPayload(guild) {
  const stats = collectStats(guild);
  const icon = guild.iconURL({ size: 1024, forceStatic: false }) || 'https://i.imgur.com/839VA94.png';

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x2b2d31)
        .setAuthor({
          name: `${guild.name} Statistiques !`,
          iconURL: icon,
        })
        .setThumbnail(icon)
        .setDescription(
          [
            `Membres: **${stats.totalMembers}**`,
            `En ligne: **${stats.onlineMembers}**`,
            `En vocal: **${stats.voiceMembers}**`,
            `En stream: **${stats.streamingMembers}**`,
            `Actifs: **${Math.max(0, stats.voiceMembers - stats.muteMembers)}**`,
            `Mute: **${stats.muteMembers}**`,
          ].join('\n'),
        ),
    ],
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  collectStats,
  buildStatsPayload,
};
