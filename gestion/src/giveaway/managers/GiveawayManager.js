const { GIVEAWAY_REACTION_SYMBOL } = require('../config/constants');
const { buildPublishedGiveawayView } = require('../ui/giveawayViews');
const { applyV2Flags, buildSimpleSectionView, simpleContent } = require('../ui/shared');
const { createId } = require('../utils/ids');
const { formatUserList, uniqueIds } = require('../utils/formatters');

class GiveawayManager {
  constructor(client, storage, permissions, eligibility) {
    this.client = client;
    this.storage = storage;
    this.permissions = permissions;
    this.eligibility = eligibility;
    this.scheduled = new Map();
  }

  clearSchedule(giveawayId) {
    const timeout = this.scheduled.get(giveawayId);

    if (timeout) {
      clearTimeout(timeout);
      this.scheduled.delete(giveawayId);
    }
  }

  scheduleEnd(giveaway) {
    this.clearSchedule(giveaway.id);
    const remaining = Math.max(0, giveaway.endAt - Date.now());
    const maxDelay = 2_147_483_647;

    const timeout = setTimeout(async () => {
      const refreshed = this.storage.getGiveaway(giveaway.id);

      if (!refreshed || refreshed.ended) {
        return;
      }

      if (refreshed.endAt > Date.now()) {
        this.scheduleEnd(refreshed);
        return;
      }

      await this.endGiveaway(giveaway.id);
    }, Math.min(remaining, maxDelay));

    this.scheduled.set(giveaway.id, timeout);
  }

  async recover() {
    const activeGiveaways = this.storage.getActiveGiveaways();

    for (const giveaway of activeGiveaways) {
      if (giveaway.endAt <= Date.now()) {
        await this.endGiveaway(giveaway.id);
      } else {
        this.scheduleEnd(giveaway);
      }
    }
  }

  async createGiveaway(session) {
    const channel = await this.client.channels.fetch(session.channelId);

    if (!channel?.isTextBased?.() || typeof channel.send !== 'function') {
      throw new Error('Salon giveaway invalide');
    }

    const guildConfig = await this.storage.getGuildConfig(session.guildId);
    const giveaway = {
      id: createId('giveaway'),
      guildId: session.guildId,
      channelId: session.channelId,
      hostId: session.userId,
      prize: session.prize,
      winnerCount: session.winnerCount,
      durationMs: session.durationMs,
      createdAt: Date.now(),
      endAt: Date.now() + session.durationMs,
      mode: session.mode,
      joinText: session.joinText,
      buttonEmoji: '\uD83C\uDF89',
      reactionSymbol: GIVEAWAY_REACTION_SYMBOL,
      forcedWinnerIds: uniqueIds(session.forcedWinnerIds),
      participantIds: [],
      winnerIds: [],
      ended: false,
      endedAt: null,
    };

    const message = await channel.send(applyV2Flags(buildPublishedGiveawayView(giveaway, guildConfig)));
    giveaway.messageId = message.id;

    await this.storage.upsertGiveaway(giveaway);
    await this.storage.updateGuildConfig(giveaway.guildId, (config) => {
      config.activeGiveawayIds.push(giveaway.id);
    });

    if (giveaway.mode === 'REACTION') {
      await message.react(giveaway.reactionSymbol).catch(() => null);
    }

    this.scheduleEnd(giveaway);
    return giveaway;
  }

  async refreshMessage(giveawayId) {
    const giveaway = this.storage.getGiveaway(giveawayId);

    if (!giveaway?.messageId) {
      return;
    }

    const guildConfig = await this.storage.getGuildConfig(giveaway.guildId);

    try {
      const channel = await this.client.channels.fetch(giveaway.channelId);
      const message = await channel.messages.fetch(giveaway.messageId);
      await message.edit(buildPublishedGiveawayView(giveaway, guildConfig));
    } catch {
      return;
    }
  }

  pickRandom(values, count) {
    if (count <= 0) {
      return [];
    }

    const pool = [...values];

    for (let index = pool.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
    }

    return pool.slice(0, count);
  }

  async drawWinners(giveaway, excludeIds = []) {
    const forced = uniqueIds(giveaway.forcedWinnerIds.filter((id) => !excludeIds.includes(id)));
    const requiredTotal = Math.max(giveaway.winnerCount, forced.length);
    const pool = this.pickRandom(
      uniqueIds(giveaway.participantIds).filter(
        (participantId) => !forced.includes(participantId) && !excludeIds.includes(participantId),
      ),
      giveaway.participantIds.length,
    );
    const guildConfig = await this.storage.getGuildConfig(giveaway.guildId);
    const guild = this.client.guilds.cache.get(giveaway.guildId) ?? (await this.client.guilds.fetch(giveaway.guildId));
    const winnerIds = [...forced];
    const rejectedIds = [];
    const rejectedForStatusIds = [];

    for (const participantId of pool) {
      if (winnerIds.length >= requiredTotal) {
        break;
      }

      const member = await guild.members.fetch(participantId).catch(() => null);
      const finalCheck = this.eligibility.checkFinal(member, guildConfig);

      if (finalCheck.ok) {
        winnerIds.push(participantId);
        continue;
      }

      rejectedIds.push(participantId);

      if (finalCheck.message === '> Statut non valide') {
        rejectedForStatusIds.push(participantId);
      }
    }

    return {
      winnerIds: uniqueIds(winnerIds),
      rejectedIds: uniqueIds(rejectedIds),
      rejectedForStatusIds: uniqueIds(rejectedForStatusIds),
    };
  }

  async joinGiveaway(giveawayId, member) {
    const giveaway = this.storage.getGiveaway(giveawayId);

    if (!giveaway || giveaway.ended) {
      return {
        ok: false,
        message: '> Giveaway indisponible',
      };
    }

    if (!member) {
      return {
        ok: false,
        message: '> Utilisateur introuvable',
      };
    }

    if (giveaway.participantIds.includes(member.id)) {
      return {
        ok: false,
        message: '> Tu participes deja a ce giveaway',
      };
    }

    const guildConfig = await this.storage.getGuildConfig(giveaway.guildId);
    const eligibility = this.eligibility.checkJoin(member, guildConfig);

    if (!eligibility.ok) {
      return eligibility;
    }

    await this.storage.patchGiveaway(giveawayId, (record) => {
      record.participantIds.push(member.id);
    });

    await this.refreshMessage(giveawayId);

    return {
      ok: true,
      message: '> Giveaway rejoint',
    };
  }

  async announceGiveawayEnd(giveaway) {
    try {
      const channel = await this.client.channels.fetch(giveaway.channelId);
      let content = giveaway.winnerIds.length
        ? `> Giveaway termine. Gagnant(s) : ${formatUserList(giveaway.winnerIds)}`
        : '> Giveaway termine. Aucun gagnant valide';

      if (giveaway.rejectedForStatusIds?.length) {
        content += `\n> Check final statut invalide : ${formatUserList(giveaway.rejectedForStatusIds)}`;
      }

      await channel.send(applyV2Flags(buildSimpleSectionView(content)));
    } catch {
      return;
    }
  }

  async endGiveaway(giveawayId) {
    const giveaway = this.storage.getGiveaway(giveawayId);

    if (!giveaway || giveaway.ended) {
      return giveaway;
    }

    this.clearSchedule(giveawayId);
    const finalResults = await this.drawWinners(giveaway);

    await this.storage.patchGiveaway(giveawayId, (record) => {
      record.ended = true;
      record.endedAt = Date.now();
      record.winnerIds = finalResults.winnerIds;
      record.rejectedIds = finalResults.rejectedIds;
      record.rejectedForStatusIds = finalResults.rejectedForStatusIds;
    });

    await this.storage.updateGuildConfig(giveaway.guildId, (config) => {
      config.activeGiveawayIds = config.activeGiveawayIds.filter((id) => id !== giveawayId);
    });

    const endedGiveaway = this.storage.getGiveaway(giveawayId);
    await this.refreshMessage(giveawayId);
    await this.announceGiveawayEnd(endedGiveaway);
    return endedGiveaway;
  }

  async rerollGiveaway(giveawayId) {
    const giveaway = this.storage.getGiveaway(giveawayId);

    if (!giveaway || !giveaway.ended) {
      return null;
    }

    const forcedSet = new Set(giveaway.forcedWinnerIds);
    const previousExtra = giveaway.winnerIds.filter((winnerId) => !forcedSet.has(winnerId));
    let rerolled = await this.drawWinners(giveaway, previousExtra);

    if (rerolled.winnerIds.length < Math.max(giveaway.winnerCount, giveaway.forcedWinnerIds.length)) {
      rerolled = await this.drawWinners(giveaway);
    }

    await this.storage.patchGiveaway(giveawayId, (record) => {
      record.winnerIds = rerolled.winnerIds;
      record.rejectedIds = rerolled.rejectedIds;
      record.rejectedForStatusIds = rerolled.rejectedForStatusIds;
      record.endedAt = Date.now();
    });

    await this.refreshMessage(giveawayId);
    return this.storage.getGiveaway(giveawayId);
  }

  async handleInteraction(interaction) {
    const customId = interaction.customId;

    if (!customId || !customId.startsWith('giveaway:')) {
      return false;
    }

    const [, action, giveawayId] = customId.split(':');

    if (action === 'join' && interaction.isButton()) {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const result = await this.joinGiveaway(giveawayId, member);
      await interaction.reply(simpleContent(result.message));
      return true;
    }

    if (action === 'reroll' && interaction.isButton()) {
      const giveaway = this.storage.getGiveaway(giveawayId);

      if (!giveaway) {
        await interaction.reply(simpleContent('> Giveaway introuvable'));
        return true;
      }

      const member = await interaction.guild.members.fetch(interaction.user.id);
      const guildConfig = await this.storage.getGuildConfig(giveaway.guildId);

      if (!this.permissions.canUseGiveawayAdmin(member, guildConfig)) {
        await interaction.reply(simpleContent('> Permission refusee'));
        return true;
      }

      const rerolled = await this.rerollGiveaway(giveawayId);

      if (!rerolled) {
        await interaction.reply(simpleContent('> Reroll impossible'));
        return true;
      }

      await interaction.reply(simpleContent('> Reroll effectue'));

      try {
        const channel = await this.client.channels.fetch(rerolled.channelId);
        const content = rerolled.winnerIds.length
          ? `> Nouveau tirage : ${formatUserList(rerolled.winnerIds)}`
          : '> Nouveau tirage impossible';
        await channel.send({ content });
      } catch {
        return true;
      }

      return true;
    }

    return false;
  }

  async sendTransientMessage(channel, content) {
    const sent = await channel.send(applyV2Flags(buildSimpleSectionView(content))).catch(() => null);

    if (sent) {
      setTimeout(() => {
        sent.delete().catch(() => null);
      }, 7000);
    }
  }

  async replyTransient(message, content) {
    const sent = await message
      .reply({
        ...applyV2Flags(buildSimpleSectionView(content)),
        allowedMentions: {
          repliedUser: false,
        },
      })
      .catch(() => null);

    if (sent) {
      setTimeout(() => {
        sent.delete().catch(() => null);
      }, 7000);
    }
  }

  async handleMessage(message) {
    if (!message.guild || message.author.bot) {
      return false;
    }

    const giveaway = this.storage.findTextGiveaway(message.channel.id, message.content);

    if (!giveaway) {
      return false;
    }

    const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
    const result = await this.joinGiveaway(giveaway.id, member);
    await this.replyTransient(message, result.message);
    return true;
  }

  async handleReactionAdd(reaction, user) {
    if (!reaction.message.guild || user.bot) {
      return false;
    }

    const giveaway = this.storage.getGiveawayByMessageId(reaction.message.id);

    if (!giveaway || giveaway.ended || giveaway.mode !== 'REACTION') {
      return false;
    }

    if (reaction.emoji.name !== giveaway.reactionSymbol) {
      return false;
    }

    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    const result = await this.joinGiveaway(giveaway.id, member);

    if (!result.ok) {
      await reaction.users.remove(user.id).catch(() => null);
    }

    await this.sendTransientMessage(reaction.message.channel, result.message);
    return true;
  }
}

module.exports = GiveawayManager;
