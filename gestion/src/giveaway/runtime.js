const path = require('node:path');
const StorageManager = require('./managers/StorageManager');
const VoiceTracker = require('./managers/VoiceTracker');
const GiveawayManager = require('./managers/GiveawayManager');
const GiveawayCreationManager = require('./managers/GiveawayCreationManager');
const EligibilityService = require('./services/EligibilityService');
const { hasCommandAccess } = require('../utils/access');

class GiveawayPermissionAdapter {
  constructor(accessStore) {
    this.accessStore = accessStore;
  }

  isElevated(member) {
    if (!member?.guild) return false;
    return this.accessStore.isSys(member.id) || this.accessStore.isOwner(member.guild.id, member.id);
  }

  hasConfiguredRole(member, guildConfig) {
    if (!member?.roles?.cache || !Array.isArray(guildConfig?.allowedRoleIds) || guildConfig.allowedRoleIds.length === 0) {
      return false;
    }

    return guildConfig.allowedRoleIds.some((roleId) => member.roles.cache.has(String(roleId)));
  }

  canUseGiveawayAdmin(member, guildConfig) {
    return this.isElevated(member) || this.hasConfiguredRole(member, guildConfig);
  }

  canUsePanel(member) {
    if (!member?.guild) return false;
    return this.isElevated(member);
  }

  canUseCommand(member, commandName) {
    if (!member?.guild || !commandName) return false;

    return hasCommandAccess({
      guildId: member.guild.id,
      member,
      userId: member.id,
      commandName,
      accessStore: this.accessStore
    });
  }
}

async function createGiveawayRuntime(context) {
  const storage = new StorageManager(path.join(process.cwd(), 'Giveaway', 'data'));
  await storage.init();

  const permissions = new GiveawayPermissionAdapter(context.accessStore);
  const eligibility = new EligibilityService(storage);
  const voiceTracker = new VoiceTracker();
  const giveawayManager = new GiveawayManager(context.client, storage, permissions, eligibility);
  const giveawayCreationManager = new GiveawayCreationManager(storage, giveawayManager);

  return {
    storage,
    permissions,
    eligibility,
    voiceTracker,
    giveawayManager,
    giveawayCreationManager,
    hasCommandAccess(member, userId, commandName) {
      if (!member?.guild) return false;

      return hasCommandAccess({
        guildId: member.guild.id,
        member,
        userId,
        commandName,
        accessStore: context.accessStore
      });
    }
  };
}

module.exports = {
  GiveawayPermissionAdapter,
  createGiveawayRuntime
};
