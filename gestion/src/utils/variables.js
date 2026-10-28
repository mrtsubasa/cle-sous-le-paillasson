function formatTemplate(template, context) {
  let output = String(template || '');
  for (const [key, value] of Object.entries(context)) {
    output = output.replaceAll(`{${key}}`, String(value));
  }
  return output;
}

function buildVariableContext({ guild, targetMember }) {
  const members = [...guild.members.cache.values()];
  const voiceMembers = members.filter((member) => !!member.voice?.channelId);
  const muteCount = voiceMembers.filter((member) => member.voice.serverMute || member.voice.selfMute).length;
  const deafCount = voiceMembers.filter((member) => member.voice.serverDeaf || member.voice.selfDeaf).length;
  const streamCount = voiceMembers.filter((member) => member.voice.streaming).length;
  const videoCount = voiceMembers.filter((member) => member.voice.selfVideo).length;

  const presenceCache = guild.presences?.cache;
  const onlineCountFromPresences = presenceCache ? presenceCache.size : 0;
  const onlineCountFromMembers = members.filter((member) => member.presence && member.presence.status !== 'offline').length;
  const onlineCount = onlineCountFromPresences > 0 ? onlineCountFromPresences : onlineCountFromMembers;
  const offlineCount = Math.max(0, guild.memberCount - onlineCount);

  const member = targetMember && targetMember.user ? targetMember : null;
  const user = member?.user || (targetMember && targetMember.username ? targetMember : null);
  const joinedAt = member?.joinedAt ? formatDate(member.joinedAt) : 'N/A';
  const createdAt = user?.createdAt ? formatDate(user.createdAt) : 'N/A';
  const memberId = member?.id || user?.id || '';
  const memberName = user?.username || 'N/A';
  const memberFullName = user
    ? (user.discriminator && user.discriminator !== '0' ? `${user.username}#${user.discriminator}` : user.tag)
    : 'N/A';
  const displayName = member?.displayName || memberName;
  const avatarUrl = user?.displayAvatarURL ? user.displayAvatarURL({ size: 512 }) : '';

  return {
    MemberMention: memberId ? `<@${memberId}>` : 'N/A',
    MemberName: memberName,
    MemberFullName: memberFullName,
    MemberDisplayName: displayName,
    MemberJoinedAt: joinedAt,
    MemberCreatedAt: createdAt,
    MemberID: memberId || 'N/A',
    MemberPic: avatarUrl,
    ServerName: guild.name || 'N/A',
    ServerID: guild.id || 'N/A',
    ServerPic: guild.iconURL ? guild.iconURL({ size: 512 }) || '' : '',
    ServerBoostsCount: guild.premiumSubscriptionCount || 0,
    ServerLevel: guild.premiumTier || 0,
    ServerMembersCount: guild.memberCount || 0,
    VocalMembersCount: voiceMembers.length,
    MuteMembersCount: muteCount,
    DeafMembersCount: deafCount,
    StreamMembersCount: streamCount,
    VideoMembersCount: videoCount,
    OnlineMembersCount: onlineCount,
    OfflineMembersCount: offlineCount,
    ServerRolesCount: guild.roles.cache.size,
    ServerChannelsCount: guild.channels.cache.size
  };
}

function formatDate(value) {
  const date = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

module.exports = {
  formatTemplate,
  buildVariableContext,
  formatDate
};
