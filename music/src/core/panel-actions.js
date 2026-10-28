const { buildPanelMessage } = require("./panel");
const { loadPanelStore, savePanelStore } = require("./storage");

const panelCache = new Map();

async function loadCachedPanels() {
  const store = await loadPanelStore();
  for (const [guildId, value] of Object.entries(store)) {
    panelCache.set(guildId, value);
  }
  return panelCache;
}

async function persistPanel(guildId, channelId, messageId) {
  const store = await loadPanelStore();
  store[guildId] = { channelId, messageId };
  await savePanelStore(store);
  panelCache.set(guildId, { channelId, messageId });
}

async function sendPanelMessage(client, pool, guild, channel) {
  const state = pool.getGuildView(guild.id);
  const message = await channel.send(buildPanelMessage(guild, state));

  await persistPanel(guild.id, channel.id, message.id);
  return message;
}

async function replacePanelMessage(client, pool, guild, channel, existingMessage = null) {
  if (existingMessage) {
    await existingMessage.delete().catch(() => null);
  }

  return sendPanelMessage(client, pool, guild, channel);
}

async function ensurePanelForGuild(client, pool, guildId, channelId) {
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return false;

  const targetChannelId = channelId || null;
  if (!targetChannelId) return false;

  const channel = await guild.channels.fetch(targetChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return false;

  const cached = panelCache.get(guildId);
  if (cached?.channelId === channel.id && cached.messageId) {
    const existing = await channel.messages.fetch(cached.messageId).catch(() => null);
    if (existing) {
      const state = pool.getGuildView(guildId);
      try {
        await existing.edit(buildPanelMessage(guild, state));
        return true;
      } catch (error) {
        if (error?.code === 50035) {
          await replacePanelMessage(client, pool, guild, channel, existing);
          return true;
        }
        throw error;
      }
    }
  }

  await sendPanelMessage(client, pool, guild, channel);
  return true;
}

async function refreshPanel(client, pool, guildId) {
  const cached = panelCache.get(guildId);
  if (!cached) return false;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return false;

  const channel = await guild.channels.fetch(cached.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return false;

  const message = await channel.messages.fetch(cached.messageId).catch(() => null);
  if (!message) return false;

  const state = pool.getGuildView(guildId);
  try {
    await message.edit(buildPanelMessage(guild, state));
  } catch (error) {
    if (error?.code === 50035) {
      await replacePanelMessage(client, pool, guild, channel, message);
      return true;
    }
    throw error;
  }

  return true;
}

module.exports = {
  ensurePanelForGuild,
  panelCache,
  loadCachedPanels,
  persistPanel,
  replacePanelMessage,
  sendPanelMessage,
  refreshPanel,
};
