const Discord = require('discord.js');
const {
  isGuildPrivileged,
  getGuildVoiceStats,
  setGuildVoiceStats,
  getGuildCafardLists,
  getGuildLaisseLists,
  getGuildLaisseList,
  getGuildLaisseOwner,
  getGuildTempVocal,
  setGuildTempVocalChannel,
  updateGuildTempVocalChannel,
  removeGuildTempVocalChannel,
  applyTempVocalAccess,
  sendTempVocalOwnerPanel,
  syncTempVocalOwnerPanel,
} = require('../Utils/bot.js');
const { collectStats, buildStatsPayload } = require('../Utils/voiceStats.js');

const guildQueues = new Map();

function normalizeVoicePeak(value, step = 5) {
  const normalizedStep = Number.isFinite(Number(step)) && Number(step) > 0
    ? Math.max(1, Math.floor(Number(step)))
    : 5;
  const parsed = Number.isFinite(Number(value)) ? Number(value) : 0;
  return Math.max(0, Math.floor(parsed / normalizedStep) * normalizedStep);
}

function runExclusiveByGuild(guildId, task) {
  const key = String(guildId);
  const previous = guildQueues.get(key) || Promise.resolve();

  const current = previous
    .catch(() => {})
    .then(() => task());

  guildQueues.set(
    key,
    current.finally(() => {
      if (guildQueues.get(key) === current) {
        guildQueues.delete(key);
      }
    }),
  );

  return current;
}

async function maybeSendPeakStats(bot, guild, oldState, newState) {
  if (!newState?.channelId) return;
  if (oldState?.channelId === newState.channelId) return;

  const voiceStats = getGuildVoiceStats(bot, guild.id);
  if (!voiceStats.enabled || !voiceStats.channelId) return;

  const stats = collectStats(guild);
  const peak = normalizeVoicePeak(voiceStats.peak, voiceStats.step);
  const currentPeak = normalizeVoicePeak(stats.voiceMembers, voiceStats.step);

  if (currentPeak <= peak) return;

  const channel = await guild.channels.fetch(String(voiceStats.channelId)).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    setGuildVoiceStats(bot, guild.id, {
      channelId: null,
      enabled: false,
      peak,
      step: voiceStats.step,
    });
    return;
  }

  const payload = buildStatsPayload(guild);

  const sent = await channel.send(payload).catch(() => null);
  if (!sent) return;

  setGuildVoiceStats(bot, guild.id, {
    channelId: voiceStats.channelId,
    enabled: true,
    peak: currentPeak,
    step: voiceStats.step,
  });
}

async function maybeBlockCafardJoin(bot, guild) {
  const lists = getGuildCafardLists(bot, guild.id);
  const voiceMembers = [...guild.members.cache.values()].filter((member) => member.voice?.channelId);

  if (!voiceMembers.length) return false;

  const victims = [];

  for (const member of voiceMembers) {
    const memberId = member.id;

    if (isGuildPrivileged(bot, guild.id, memberId, 'wl')) {
      continue;
    }

    for (const ownerId of voiceMembers.map((m) => m.id)) {
      const blockedList = lists[String(ownerId)];
      if (!Array.isArray(blockedList) || !blockedList.length) continue;

      if (blockedList.some((entry) => entry?.id === memberId)) {
        if (memberId !== ownerId) {
          victims.push(member);
        }
        break;
      }
    }
  }

  if (!victims.length) return false;

  const uniqueVictims = [...new Map(victims.map((member) => [member.id, member])).values()];
  await Promise.all(uniqueVictims.map((member) => member.voice.disconnect().catch(() => {})));

  return true;
}

async function maybeMoveLaisseFollowers(bot, guild, ownerId, ownerChannelId, shouldDisconnect) {
  const followers = getGuildLaisseList(bot, guild.id, ownerId);
  if (!followers.length) return false;

  const affectedMembers = [];

  for (const entry of followers) {
    const memberId = entry?.id;
    if (!memberId) continue;

    const member = guild.members.cache.get(memberId) || await guild.members.fetch(memberId).catch(() => null);
    if (!member?.voice) continue;

    if (shouldDisconnect) {
      affectedMembers.push(member.voice.disconnect().catch(() => {}));
      continue;
    }

    if (ownerChannelId && member.voice.channelId !== ownerChannelId) {
      affectedMembers.push(member.voice.setChannel(ownerChannelId).catch(() => {}));
    }
  }

  if (!affectedMembers.length) return false;
  await Promise.all(affectedMembers);
  return true;
}

async function maybeFollowLaisse(bot, guild, oldState, newState) {
  const member = newState.member || oldState.member;
  if (!member) return false;

  const lists = getGuildLaisseLists(bot, guild.id);
  const memberId = member.id;
  const isOwner = Object.prototype.hasOwnProperty.call(lists, memberId);
  const ownerId = isOwner ? memberId : getGuildLaisseOwner(bot, guild.id, memberId);

  if (!ownerId) return false;

  const ownerMember = guild.members.cache.get(ownerId) || await guild.members.fetch(ownerId).catch(() => null);
  const ownerChannelId = ownerMember?.voice?.channelId || null;

  if (isOwner) {
    if (!newState.channelId) {
      await maybeMoveLaisseFollowers(bot, guild, ownerId, null, true);
      return true;
    }

    await maybeMoveLaisseFollowers(bot, guild, ownerId, ownerChannelId, false);
    return true;
  }

  if (!member.voice?.channelId) return false;

  if (!ownerChannelId) {
    await member.voice.disconnect().catch(() => {});
    return true;
  }

  if (member.voice.channelId !== ownerChannelId) {
    await member.voice.setChannel(ownerChannelId).catch(() => {});
    return true;
  }

  return false;
}

function formatTempVocalName(template, member) {
  const raw = typeof template === 'string' && template.trim() ? template.trim() : 'Temp vocal {displayName}';
  return raw
    .replaceAll('{username}', member.user.username)
    .replaceAll('{displayName}', member.displayName)
    .replaceAll('{globalName}', member.user.globalName || member.user.username)
    .replaceAll('{id}', member.id)
    .slice(0, 100);
}

async function maybeCreateTempVocal(bot, guild, oldState, newState) {
  if (!newState?.channelId) return false;

  const config = getGuildTempVocal(bot, guild.id);
  if (!config.enabled || !config.triggerId) return false;
  if (newState.channelId !== config.triggerId) return false;

  const member = newState.member || oldState.member;
  if (!member || member.user?.bot) return false;

  const ownedEntry = Object.entries(config.channels || {}).find(([, entry]) => entry?.ownerId === member.id);
  if (ownedEntry) {
    const [ownedChannelId] = ownedEntry;
    const ownedChannel = guild.channels.cache.get(ownedChannelId) || await guild.channels.fetch(ownedChannelId).catch(() => null);

    if (ownedChannel && [Discord.ChannelType.GuildVoice, Discord.ChannelType.GuildStageVoice].includes(ownedChannel.type)) {
      await applyTempVocalAccess(bot, guild, ownedChannel, member.id);
      const existingPanelId = ownedEntry[1]?.panelMessageId || null;
      const existingPanel = existingPanelId
        ? await ownedChannel.messages.fetch(existingPanelId).catch(() => null)
        : null;

      if (!existingPanel) {
        const sentPanel = await sendTempVocalOwnerPanel(ownedChannel, member.user, ownedChannel);
        if (sentPanel?.id) {
          await updateGuildTempVocalChannel(bot, guild.id, ownedChannelId, {
            panelMessageId: sentPanel.id,
          });
        }
      }
      if (newState.channelId !== ownedChannelId) {
        await newState.setChannel(ownedChannelId).catch(() => {});
      }
      return true;
    }

    await removeGuildTempVocalChannel(bot, guild.id, ownedChannelId);
  }

  const parentId = config.categoryId || newState.channel?.parentId || null;
  const created = await guild.channels.create({
    name: formatTempVocalName(config.nameTemplate, member),
    type: Discord.ChannelType.GuildVoice,
    parent: parentId || undefined,
    userLimit: Number.isFinite(Number(config.limit)) ? Number(config.limit) : 0,
    reason: `Temp vocal créé pour ${member.user.tag}`,
  }).catch(() => null);

  if (!created) return false;

  setGuildTempVocalChannel(bot, guild.id, created.id, member.id, { createdAt: Date.now() });
  await applyTempVocalAccess(bot, guild, created, member.id);

  await newState.setChannel(created.id).catch(() => {});

  const sentPanel = await sendTempVocalOwnerPanel(created, member.user, created);
  if (sentPanel?.id) {
    await updateGuildTempVocalChannel(bot, guild.id, created.id, {
      panelMessageId: sentPanel.id,
    });
  }

  return true;
}

async function maybeTransferTempVocalOwner(bot, guild, oldState, newState) {
  const oldChannelId = oldState?.channelId;
  if (!oldChannelId) return false;

  const member = oldState.member || newState.member;
  if (!member) return false;

  const config = getGuildTempVocal(bot, guild.id);
  const entry = config.channels?.[oldChannelId];
  if (!entry || entry.ownerId !== member.id) return false;

  const channel = guild.channels.cache.get(oldChannelId) || await guild.channels.fetch(oldChannelId).catch(() => null);
  if (!channel) {
    await removeGuildTempVocalChannel(bot, guild.id, oldChannelId);
    return false;
  }

  if (![Discord.ChannelType.GuildVoice, Discord.ChannelType.GuildStageVoice].includes(channel.type)) {
    await removeGuildTempVocalChannel(bot, guild.id, oldChannelId);
    return false;
  }

  const candidates = [...channel.members.values()].filter((voiceMember) => !voiceMember.user?.bot && voiceMember.id !== member.id);
  if (!candidates.length) return false;

  const nextOwner = candidates[Math.floor(Math.random() * candidates.length)];
  if (!nextOwner) return false;

  await updateGuildTempVocalChannel(bot, guild.id, oldChannelId, {
    ownerId: nextOwner.id,
  });

  await applyTempVocalAccess(bot, guild, channel, nextOwner.id);

  const refreshedEntry = bot.functions.getGuildTempVocalChannelEntry(bot, guild.id, oldChannelId);
  const existingPanelId = refreshedEntry?.panelMessageId || null;
  const existingPanel = existingPanelId
    ? await channel.messages.fetch(existingPanelId).catch(() => null)
    : null;

  if (existingPanel) {
    await existingPanel.edit({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [bot.functions.buildTempVocalOwnerPanel(channel, nextOwner.user, channel)],
      allowedMentions: { parse: [] },
    }).catch(() => null);
  } else {
    const sentPanel = await sendTempVocalOwnerPanel(channel, nextOwner.user, channel);
    if (sentPanel?.id) {
      await updateGuildTempVocalChannel(bot, guild.id, oldChannelId, {
        panelMessageId: sentPanel.id,
      });
    }
  }

  return true;
}

async function maybeDeleteEmptyTempVocal(bot, guild, oldState, newState) {
  const oldChannelId = oldState?.channelId;
  if (!oldChannelId) return false;

  const ownerId = config => config.channels?.[oldChannelId]?.ownerId || null;
  const config = getGuildTempVocal(bot, guild.id);
  const tempOwnerId = ownerId(config);
  if (!tempOwnerId) return false;

  const channel = guild.channels.cache.get(oldChannelId) || await guild.channels.fetch(oldChannelId).catch(() => null);
  if (!channel) {
    await removeGuildTempVocalChannel(bot, guild.id, oldChannelId);
    return false;
  }

  if (![Discord.ChannelType.GuildVoice, Discord.ChannelType.GuildStageVoice].includes(channel.type)) {
    await removeGuildTempVocalChannel(bot, guild.id, oldChannelId);
    return false;
  }

  if (channel.members.size > 0) return false;

  await channel.delete('Salon temporaire vide').catch(() => {});
  await removeGuildTempVocalChannel(bot, guild.id, oldChannelId);
  return true;
}

async function maybeRefreshTempVocalPanel(bot, guild, oldState, newState) {
  const channelId = oldState?.channelId || newState?.channelId || null;
  if (!channelId) return false;

  const entry = getGuildTempVocal(bot, guild.id).channels?.[channelId];
  if (!entry) return false;

  const voiceChannel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!voiceChannel || ![Discord.ChannelType.GuildVoice, Discord.ChannelType.GuildStageVoice].includes(voiceChannel.type)) {
    return false;
  }

  const ownerMember = guild.members.cache.get(entry.ownerId) || await guild.members.fetch(entry.ownerId).catch(() => null);
  if (!ownerMember) return false;

  await syncTempVocalOwnerPanel(bot, guild, voiceChannel, ownerMember.user);
  return true;
}

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, bot) {
    const guild = newState.guild || oldState.guild;
    if (!guild) return;

    return runExclusiveByGuild(guild.id, async () => {
      const blocked = await maybeBlockCafardJoin(bot, guild, oldState, newState);
      if (blocked) return;

      await maybeFollowLaisse(bot, guild, oldState, newState);
      await maybeCreateTempVocal(bot, guild, oldState, newState);
      await maybeTransferTempVocalOwner(bot, guild, oldState, newState);
      await maybeDeleteEmptyTempVocal(bot, guild, oldState, newState);
      await maybeRefreshTempVocalPanel(bot, guild, oldState, newState);

      await maybeSendPeakStats(bot, guild, oldState, newState);
    });
  },
};
