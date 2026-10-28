function formatTemplate(content, member, joinSource = null) {
  if (!content) return '';

  const createdAt = member.user.createdAt instanceof Date ? member.user.createdAt : null;
  const joinedAt = member.joinedAt instanceof Date ? member.joinedAt : null;
  const createdAtText = createdAt ? createdAt.toLocaleString('fr-FR') : 'Inconnu';
  const joinedAtText = joinedAt ? joinedAt.toLocaleString('fr-FR') : 'Inconnu';
  const serverOwner = member.guild.ownerId ? `<@${member.guild.ownerId}>` : 'Inconnu';
  const avatarUrl = member.user.displayAvatarURL?.({ extension: 'png', size: 1024 }) || member.user.displayAvatarURL?.() || '';
  const inviter = joinSource?.inviter || null;
  const joinSourceLabel = joinSource?.label || 'Source inconnue';
  const inviterMention = inviter ? `<@${inviter.id}>` : 'Inconnu';
  const inviterName = inviter?.username || 'Inconnu';
  const inviterTag = inviter?.tag || 'Inconnu';

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
    .replace(/{joinedAtRaw}/g, joinedAt ? joinedAt.toISOString() : 'Inconnu')
    .replace(/{joinSource}/g, joinSourceLabel)
    .replace(/{invite.code}/g, joinSource?.code || 'Inconnu')
    .replace(/{inviteCode}/g, joinSource?.code || 'Inconnu')
    .replace(/{inviter}/g, inviterMention)
    .replace(/{inviter.mention}/g, inviterMention)
    .replace(/{inviter.name}/g, inviterName)
    .replace(/{inviter.id}/g, inviter?.id || 'Inconnu')
    .replace(/{inviter.tag}/g, inviterTag);
}

const fetchWithTimeout = (promise, ms = 3000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);

async function safeSend(channel, payload) {
  try {
    return await channel.send(payload);
  } catch {
    return null;
  }
}

const getJoinSource = async (member, bot) => {
  const previousState = bot.inviteStateCache?.get(member.guild.id) || {
    invites: new Map(),
  };

  let currentInvites = null;
  try {
    currentInvites = await fetchWithTimeout(member.guild.invites.fetch(), 3000);
  } catch (err) {
    currentInvites = null;
  }

  if (currentInvites) {
    let matchedInvite = null;

    for (const invite of currentInvites.values()) {
      const previousUses = previousState.invites.get(invite.code);
      const currentUses = invite.uses ?? 0;

      if (typeof previousUses === 'number' && currentUses > previousUses) {
        matchedInvite = invite;
        break;
      }
    }

    bot.inviteStateCache.set(member.guild.id, {
      invites: new Map([...currentInvites.values()].map((invite) => [invite.code, invite.uses ?? 0])),
    });

    if (matchedInvite) {
      return {
        type: 'invite',
        code: matchedInvite.code,
        inviter: matchedInvite.inviter || null,
        label: matchedInvite.inviter
          ? `Invitation de ${matchedInvite.inviter.tag}`
          : `Invitation ${matchedInvite.code}`,
      };
    }
  }

  return {
    type: 'unknown',
    code: null,
    inviter: null,
    label: 'Source inconnue',
  };
};

module.exports = {
  name: 'guildMemberAdd',
  once: false,
  execute: async (member, bot) => {
    try {
     // console.log(`[GUILD] Membre rejoint : ${member.user.tag}`);
      if (!bot.db) return;

      const data = await bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(member.guild.id);
      if (!data) return;
      
      const greetChannels = Array.isArray(JSON.parse(data.greetChannels || '[]')) ? JSON.parse(data.greetChannels) : [];
      const greetDeleteTime = data.greetDeleteTime ?? 10000;

      for (const channelId of greetChannels) {
        const channel = member.guild.channels.cache.get(channelId);
        if (!channel?.isTextBased()) continue;

        const msg = await safeSend(channel, { content: `<@${member.id}>`, allowedMentions: { users: [member.id] } });
        if (!msg) continue;

        if (greetDeleteTime > 0) {
          setTimeout(() => msg.delete().catch(() => {}), greetDeleteTime);
        }
      }

      const welcomeChannels = Array.isArray(JSON.parse(data.welcomeChannels || '[]')) ? JSON.parse(data.welcomeChannels) : [];
      if (welcomeChannels.length && data.welcomeMessage) {
        const msgContent = formatTemplate(data.welcomeMessage, member);

        for (const channelId of welcomeChannels) {
          const channel = member.guild.channels.cache.get(channelId);
          if (!channel?.isTextBased()) continue;
          await safeSend(channel, {
            content: msgContent,
            allowedMentions: { users: [member.id], parse: [] },
          });
        }
      }

      const welcomeLogChannelId = data.welcomeLogChannel || null;
      if (welcomeLogChannelId && data.welcomeLogMessage) {
        const channel = member.guild.channels.cache.get(welcomeLogChannelId);
        if (channel?.isTextBased()) {
          const joinSource = await getJoinSource(member, bot);
          const logContent = formatTemplate(data.welcomeLogMessage, member, joinSource);
          await safeSend(channel, {
            content: `${logContent}\n> **Source :** ${joinSource.label}`,
            allowedMentions: { users: [member.id], parse: [] },
          });
        }
      }

      const welcomeRoleId = data.welcomeRole || null;
      if (welcomeRoleId) {
        const role = member.guild.roles.cache.get(welcomeRoleId);
        if (role) {
          await member.roles.add(role.id).catch((error) => {
            console.error('[GUILD] Impossible d\'ajouter le rôle de welcome:', error);
          });
        }
      }

    } catch (err) {
      console.error('[GUILD] Erreur guildMemberAdd:', err);
    }
  },
};
