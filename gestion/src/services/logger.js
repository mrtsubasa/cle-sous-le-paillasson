const { buildNoticePayload } = require('../utils/components');

function createLogger(client, accessStore) {
  async function log(guild, title, body) {
    try {
      const channelId = accessStore.getGuildLogChannel(guild.id);
      if (!channelId) return;
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) return;
      await channel.send(buildNoticePayload({ title, body }));
    } catch {
      // Ignore logging errors to avoid breaking command flow.
    }
  }

  return { log };
}

module.exports = { createLogger };
