const fs = require('node:fs/promises');
const path = require('node:path');
const {
  DEFAULT_GLOBAL_DATA,
  DEFAULT_GIVEAWAYS_DATA,
  DEFAULT_GUILD_CONFIG,
} = require('../config/constants');
const { normalizeText, uniqueIds } = require('../utils/formatters');

class StorageManager {
  constructor(basePath) {
    this.basePath = basePath;
    this.guildsPath = path.join(basePath, 'guilds');
    this.globalPath = path.join(basePath, 'global.json');
    this.giveawaysPath = path.join(basePath, 'giveaways.json');
    this.globalData = DEFAULT_GLOBAL_DATA();
    this.giveawaysData = DEFAULT_GIVEAWAYS_DATA();
    this.guildCache = new Map();
  }

  async init() {
    await fs.mkdir(this.basePath, { recursive: true });
    await fs.mkdir(this.guildsPath, { recursive: true });
    await this.ensureJsonFile(this.globalPath, DEFAULT_GLOBAL_DATA());
    await this.ensureJsonFile(this.giveawaysPath, DEFAULT_GIVEAWAYS_DATA());
    this.globalData = this.hydrateGlobalData(await this.readJson(this.globalPath, DEFAULT_GLOBAL_DATA()));
    this.giveawaysData = this.hydrateGiveawaysData(await this.readJson(this.giveawaysPath, DEFAULT_GIVEAWAYS_DATA()));
    await this.saveGlobal();
    await this.saveGiveaways();
  }

  hydrateGlobalData(data) {
    return {
      ...DEFAULT_GLOBAL_DATA(),
      ...data,
      owners: Array.isArray(data.owners) ? data.owners : [],
    };
  }

  hydrateGuildConfig(data) {
    return {
      allowedRoleIds: uniqueIds(Array.isArray(data.allowedRoleIds) ? data.allowedRoleIds : []),
      allowedCategoryId: data.allowedCategoryId ?? null,
      requiredCustomStatus:
        typeof data.requiredCustomStatus === 'string' && data.requiredCustomStatus.trim()
          ? data.requiredCustomStatus.trim()
          : null,
      blacklistUserIds: uniqueIds(Array.isArray(data.blacklistUserIds) ? data.blacklistUserIds : []),
      activeGiveawayIds: uniqueIds(Array.isArray(data.activeGiveawayIds) ? data.activeGiveawayIds : []),
    };
  }

  hydrateGiveawaysData(data) {
    return {
      records: data.records && typeof data.records === 'object' ? data.records : {},
    };
  }

  async ensureJsonFile(filePath, defaultValue) {
    try {
      await fs.access(filePath);
    } catch {
      await this.writeJson(filePath, defaultValue);
    }
  }

  async readJson(filePath, fallback) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');

      if (!raw.trim()) {
        return typeof fallback === 'function' ? fallback() : fallback;
      }

      return JSON.parse(raw);
    } catch {
      return typeof fallback === 'function' ? fallback() : fallback;
    }
  }

  async writeJson(filePath, data) {
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tempPath, filePath);
  }

  getGuildPath(guildId) {
    return path.join(this.guildsPath, `${guildId}.json`);
  }

  async getGuildConfig(guildId) {
    if (this.guildCache.has(guildId)) {
      return this.guildCache.get(guildId);
    }

    const guildPath = this.getGuildPath(guildId);
    await this.ensureJsonFile(guildPath, DEFAULT_GUILD_CONFIG());
    const data = this.hydrateGuildConfig(await this.readJson(guildPath, DEFAULT_GUILD_CONFIG()));
    this.guildCache.set(guildId, data);
    await this.saveGuildConfig(guildId);
    return data;
  }

  async saveGuildConfig(guildId) {
    const guildPath = this.getGuildPath(guildId);
    const config = this.guildCache.get(guildId) ?? DEFAULT_GUILD_CONFIG();
    await this.writeJson(guildPath, config);
  }

  async updateGuildConfig(guildId, updater) {
    const config = await this.getGuildConfig(guildId);
    await updater(config);
    config.allowedRoleIds = uniqueIds(config.allowedRoleIds);
    config.blacklistUserIds = uniqueIds(config.blacklistUserIds);
    config.activeGiveawayIds = uniqueIds(config.activeGiveawayIds);
    config.requiredCustomStatus =
      typeof config.requiredCustomStatus === 'string' && config.requiredCustomStatus.trim()
        ? config.requiredCustomStatus.trim()
        : null;
    await this.saveGuildConfig(guildId);
    return config;
  }

  getOwners() {
    return [...this.globalData.owners];
  }

  async saveGlobal() {
    await this.writeJson(this.globalPath, this.globalData);
  }

  async saveGiveaways() {
    await this.writeJson(this.giveawaysPath, this.giveawaysData);
  }

  async addOwner(userId, addedBy) {
    const existing = this.globalData.owners.find((owner) => owner.id === userId);

    if (existing) {
      return {
        created: false,
        owner: existing,
      };
    }

    const owner = {
      id: userId,
      addedBy,
      addedAt: new Date().toISOString(),
    };

    this.globalData.owners.push(owner);
    await this.saveGlobal();

    return {
      created: true,
      owner,
    };
  }

  async removeOwner(userId) {
    const index = this.globalData.owners.findIndex((owner) => owner.id === userId);

    if (index === -1) {
      return false;
    }

    this.globalData.owners.splice(index, 1);
    await this.saveGlobal();
    return true;
  }

  async addBlacklistUser(guildId, userId) {
    let created = false;

    await this.updateGuildConfig(guildId, (config) => {
      if (!config.blacklistUserIds.includes(userId)) {
        config.blacklistUserIds.push(userId);
        created = true;
      }
    });

    return created;
  }

  async upsertGiveaway(record) {
    this.giveawaysData.records[record.id] = {
      ...record,
      participantIds: uniqueIds(record.participantIds ?? []),
      forcedWinnerIds: uniqueIds(record.forcedWinnerIds ?? []),
      winnerIds: uniqueIds(record.winnerIds ?? []),
      normalizedJoinText: record.joinText ? normalizeText(record.joinText) : null,
    };
    await this.saveGiveaways();
    return this.giveawaysData.records[record.id];
  }

  async patchGiveaway(giveawayId, updater) {
    const giveaway = this.getGiveaway(giveawayId);

    if (!giveaway) {
      return null;
    }

    await updater(giveaway);
    giveaway.participantIds = uniqueIds(giveaway.participantIds ?? []);
    giveaway.forcedWinnerIds = uniqueIds(giveaway.forcedWinnerIds ?? []);
    giveaway.winnerIds = uniqueIds(giveaway.winnerIds ?? []);
    giveaway.normalizedJoinText = giveaway.joinText ? normalizeText(giveaway.joinText) : null;
    await this.saveGiveaways();
    return giveaway;
  }

  getGiveaway(giveawayId) {
    return this.giveawaysData.records[giveawayId] ?? null;
  }

  getAllGiveaways() {
    return Object.values(this.giveawaysData.records);
  }

  getActiveGiveaways() {
    return this.getAllGiveaways().filter((giveaway) => !giveaway.ended);
  }

  getGiveawayByMessageId(messageId) {
    return this.getAllGiveaways().find((giveaway) => giveaway.messageId === messageId) ?? null;
  }

  getActiveGiveawaysByChannel(channelId) {
    return this.getActiveGiveaways().filter((giveaway) => giveaway.channelId === channelId);
  }

  findTextGiveaway(channelId, rawText) {
    const normalized = normalizeText(rawText);

    return this.getActiveGiveawaysByChannel(channelId)
      .filter((giveaway) => giveaway.mode === 'TEXT' && giveaway.normalizedJoinText === normalized)
      .sort((first, second) => second.createdAt - first.createdAt)[0] ?? null;
  }
}

module.exports = StorageManager;
