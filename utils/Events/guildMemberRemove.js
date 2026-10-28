function formatTemplate(content, member) {
  if (!content) return '';

  const createdAt = member.user.createdAt instanceof Date ? member.user.createdAt : null;
  const joinedAt = member.joinedAt instanceof Date ? member.joinedAt : null;
  const createdAtText = createdAt ? createdAt.toLocaleString('fr-FR') : 'Inconnu';
  const joinedAtText = joinedAt ? joinedAt.toLocaleString('fr-FR') : 'Inconnu';
  const serverOwner = member.guild.ownerId ? `<@${member.guild.ownerId}>` : 'Inconnu';
  const avatarUrl = member.user.displayAvatarURL?.({ extension: 'png', size: 1024 }) || member.user.displayAvatarURL?.() || '';

  return content
    .replace(/{user}/g, `<@${member.id}>`)
    .replace(/{user.mention}/g, `<@${member.id}>`)
    .replace(/{user.name}/g, member.user.username)
    .replace(/{user.id}/g, member.id)
    .replace(/{user.tag}/g, member.user.tag)
    .replace(/{user.globalName}/g, member.user.globalName || member.user.username)
    .replace(/{user.bot}/g, member.user.bot ? 'true' : 'false')
    .replace(/{user.createdAt}/g, createdAtText)
    .replace(/{user.createdAtRaw}/g, createdAt ? createdAt.toISOString() : 'Inconnu')
    .replace(/{user.avatar}/g, avatarUrl)
    .replace(/{server}/g, member.guild.name)
    .replace(/{server.id}/g, member.guild.id)
    .replace(/{server.owner}/g, serverOwner)
    .replace(/{members}/g, `${member.guild.memberCount}`)
    .replace(/{joinedAt}/g, joinedAtText)
    .replace(/{joinedAtRaw}/g, joinedAt ? joinedAt.toISOString() : 'Inconnu');
}

async function safeSend(channel, payload) {
  try {
    return await channel.send(payload);
  } catch {
    return null;
  }
}

module.exports = {
  name: 'guildMemberRemove',
  once: false,
  execute: async (member, bot) => {
    try {
      if (!bot.db) return;

      const data = await bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(member.guild.id);
      if (!data) return;

      const leaveChannels = Array.isArray(JSON.parse(data.leaveChannels || '[]')) ? JSON.parse(data.leaveChannels) : [];
      if (leaveChannels.length && data.leaveMessage) {
        const msgContent = formatTemplate(data.leaveMessage, member);

        for (const channelId of leaveChannels) {
          const channel = member.guild.channels.cache.get(channelId);
          if (!channel?.isTextBased()) continue;
          await safeSend(channel, {
            content: msgContent,
            allowedMentions: { users: [member.id], parse: [] },
          });
        }
      }

      const leaveLogChannelId = data.leaveLogChannel || null;
      if (leaveLogChannelId && data.leaveLogMessage) {
        const channel = member.guild.channels.cache.get(leaveLogChannelId);
        if (channel?.isTextBased()) {
          const logContent = formatTemplate(data.leaveLogMessage, member);
          await safeSend(channel, {
            content: logContent,
            allowedMentions: { users: [member.id], parse: [] },
          });
        }
      }
    } catch (err) {
      console.error('[GUILD] Erreur guildMemberRemove:', err);
    }
  },
};
