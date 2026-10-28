class VoiceTracker {
  constructor() {
    this.entries = new Map();
  }

  createKey(guildId, userId) {
    return `${guildId}:${userId}`;
  }

  setEntry(guildId, userId, channelId, joinedAt, approximate = false) {
    this.entries.set(this.createKey(guildId, userId), {
      channelId,
      joinedAt,
      approximate,
    });
  }

  removeEntry(guildId, userId) {
    this.entries.delete(this.createKey(guildId, userId));
  }

  getEntry(guildId, userId) {
    return this.entries.get(this.createKey(guildId, userId)) ?? null;
  }

  async seed(client) {
    for (const guild of client.guilds.cache.values()) {
      for (const [userId, voiceState] of guild.voiceStates.cache.entries()) {
        if (voiceState?.channelId) {
          this.setEntry(guild.id, userId, voiceState.channelId, Date.now(), true);
        }
      }
    }
  }

  handleUpdate(oldState, newState) {
    const guildId = newState.guild.id;
    const userId = newState.id;
    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;

    if (!oldChannelId && newChannelId) {
      this.setEntry(guildId, userId, newChannelId, Date.now(), false);
      return;
    }

    if (oldChannelId && !newChannelId) {
      this.removeEntry(guildId, userId);
      return;
    }

    if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
      const existing = this.getEntry(guildId, userId);
      this.setEntry(guildId, userId, newChannelId, existing?.joinedAt ?? Date.now(), existing?.approximate ?? false);
    }
  }
}

module.exports = VoiceTracker;
