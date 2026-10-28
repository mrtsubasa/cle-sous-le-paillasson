const fs = require('fs');
const path = require('path');
const { getPresenceFile } = require('../Utils/presencePath');
const Discord = require('discord.js');

function formatTempVocalName(template, member) {
  const raw = typeof template === 'string' && template.trim()
    ? template.trim()
    : 'Temp vocal {displayName}';

  return raw
    .replaceAll('{username}', member.user.username)
    .replaceAll('{displayName}', member.displayName)
    .replaceAll('{globalName}', member.user.globalName || member.user.username)
    .replaceAll('{id}', member.id)
    .slice(0, 100);
}

async function recoverGuildTempVocals(bot, guild) {
  const config = bot.functions.getGuildTempVocal(bot, guild.id);
  if (!config.enabled || !config.triggerId) return;

  const triggerChannel = guild.channels.cache.get(config.triggerId)
    || await guild.channels.fetch(config.triggerId).catch(() => null);

  if (!triggerChannel || ![Discord.ChannelType.GuildVoice, Discord.ChannelType.GuildStageVoice].includes(triggerChannel.type)) {
    return;
  }

  for (const [voiceChannelId, entry] of Object.entries(config.channels || {})) {
    const voiceChannel = guild.channels.cache.get(voiceChannelId) || await guild.channels.fetch(voiceChannelId).catch(() => null);
    if (!voiceChannel) {
      await bot.functions.removeGuildTempVocalChannel(bot, guild.id, voiceChannelId);
      continue;
    }

    if (voiceChannel.members.size === 0) {
      await voiceChannel.delete('Nettoyage vocal temporaire apres redemarrage').catch(() => {});
      await bot.functions.removeGuildTempVocalChannel(bot, guild.id, voiceChannelId);
      continue;
    }

    const ownerMember = guild.members.cache.get(entry?.ownerId) || await guild.members.fetch(entry?.ownerId).catch(() => null);
    if (ownerMember) {
      await bot.functions.applyTempVocalAccess(bot, guild, voiceChannel, ownerMember.id);

      const existingPanelId = entry?.panelMessageId || null;
      const existingPanel = existingPanelId
        ? await voiceChannel.messages.fetch(existingPanelId).catch(() => null)
        : null;

      if (!existingPanel) {
        const sentPanel = await bot.functions.sendTempVocalOwnerPanel(voiceChannel, ownerMember.user, voiceChannel);
        if (sentPanel?.id) {
          await bot.functions.updateGuildTempVocalChannel(bot, guild.id, voiceChannelId, {
            panelMessageId: sentPanel.id,
          });
        }
      }
    }
  }

  const refreshedConfig = bot.functions.getGuildTempVocal(bot, guild.id);
  const triggerMembers = [...triggerChannel.members.values()].filter((member) => !member.user.bot);

  for (const member of triggerMembers) {
    const ownedEntry = Object.entries(refreshedConfig.channels || {}).find(([, entry]) => entry?.ownerId === member.id);

    if (ownedEntry) {
      const [ownedVoiceChannelId] = ownedEntry;
      const ownedVoiceChannel = guild.channels.cache.get(ownedVoiceChannelId)
        || await guild.channels.fetch(ownedVoiceChannelId).catch(() => null);

      if (ownedVoiceChannel && [Discord.ChannelType.GuildVoice, Discord.ChannelType.GuildStageVoice].includes(ownedVoiceChannel.type)) {
        const existingPanelId = ownedEntry[1]?.panelMessageId || null;
        const existingPanel = existingPanelId
          ? await ownedVoiceChannel.messages.fetch(existingPanelId).catch(() => null)
          : null;

        if (!existingPanel) {
          const sentPanel = await bot.functions.sendTempVocalOwnerPanel(ownedVoiceChannel, member.user, ownedVoiceChannel);
          if (sentPanel?.id) {
            await bot.functions.updateGuildTempVocalChannel(bot, guild.id, ownedVoiceChannelId, {
              panelMessageId: sentPanel.id,
            });
          }
        }

        await member.voice.setChannel(ownedVoiceChannel.id).catch(() => {});
        continue;
      }

      await bot.functions.removeGuildTempVocalChannel(bot, guild.id, ownedVoiceChannelId);
    }

    const voiceChannel = await guild.channels.create({
      name: formatTempVocalName(refreshedConfig.nameTemplate, member),
      type: Discord.ChannelType.GuildVoice,
      parent: refreshedConfig.categoryId || triggerChannel.parentId || undefined,
      userLimit: Number.isFinite(Number(refreshedConfig.limit)) ? Number(refreshedConfig.limit) : 0,
      reason: `Recuperation temp vocal pour ${member.user.tag}`,
    }).catch(() => null);

    if (!voiceChannel) continue;

    bot.functions.setGuildTempVocalChannel(bot, guild.id, voiceChannel.id, member.id, { createdAt: Date.now() });
    await bot.functions.applyTempVocalAccess(bot, guild, voiceChannel, member.id);
    await member.voice.setChannel(voiceChannel.id).catch(() => {});

    const sentPanel = await bot.functions.sendTempVocalOwnerPanel(voiceChannel, member.user, voiceChannel);
    if (sentPanel?.id) {
      await bot.functions.updateGuildTempVocalChannel(bot, guild.id, voiceChannel.id, {
        panelMessageId: sentPanel.id,
      });
    }
  }
}

module.exports = {
  name: 'clientReady',
  async execute(bot) {
    const presenceFile = getPresenceFile(bot);

    try {
      if (presenceFile && fs.existsSync(presenceFile)) {
        const raw = fs.readFileSync(presenceFile, 'utf8');
        const saved = JSON.parse(raw);

        const status = ['online', 'idle', 'dnd', 'invisible'].includes(saved.status) ? saved.status : 'idle';
        const activityName = typeof saved.activityName === 'string' ? saved.activityName.trim() : '';
        const activityType = Number.isInteger(saved.activityType) ? saved.activityType : 4;
        const activityUrl = typeof saved.activityUrl === 'string' ? saved.activityUrl.trim() : '';
        const activityEmoji = typeof saved.activityEmoji === 'string' ? saved.activityEmoji.trim() : '';

        await bot.user.setPresence({
          status,
          activities: activityName
            ? [{
                name: activityType === 4 ? 'Custom Status' : activityName,
                type: activityType,
                ...(activityType === 4
                  ? { state: `${activityEmoji ? `${activityEmoji} ` : ''}${activityName}`.trim() }
                  : {}),
                ...(activityType === 1 && activityUrl ? { url: activityUrl } : {}),
              }]
            : [],
        });
      } else {
        await bot.user.setPresence({
          activities: [{ name: 'discord.gg/zix', type: 4 }],
          status: 'idle',
        });
      }
    } catch (err) {
      console.error('Erreur presence/clientReady:', err);
    }

    try {
      for (const guild of bot.guilds.cache.values()) {
        await recoverGuildTempVocals(bot, guild);
      }
    } catch (err) {
      console.error('Erreur recuperation temp vocaux:', err);
    }
  },
};
