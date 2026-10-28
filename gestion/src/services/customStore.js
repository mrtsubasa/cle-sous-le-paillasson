const { randomUUID } = require('node:crypto');

function createCustomStore(storage) {
  function listGuildCustoms(guildId) {
    const state = storage.read();
    const guildBucket = state.guilds[String(guildId)];
    if (!guildBucket || !Array.isArray(guildBucket.customs)) return [];
    return guildBucket.customs;
  }

  function getByName(guildId, commandName) {
    const safeName = normalizeCommandName(commandName);
    return listGuildCustoms(guildId).find((entry) => entry.name.toLowerCase() === safeName.toLowerCase()) || null;
  }

  function getById(guildId, customId) {
    return listGuildCustoms(guildId).find((entry) => entry.id === String(customId)) || null;
  }

  function create(guildId, payload) {
    const state = storage.read();
    const safeGuildId = String(guildId);
    if (!state.guilds[safeGuildId]) state.guilds[safeGuildId] = { customs: [] };
    if (!Array.isArray(state.guilds[safeGuildId].customs)) state.guilds[safeGuildId].customs = [];

    const name = normalizeCommandName(payload.name);
    if (!isValidCommandName(name)) {
      throw new Error('INVALID_CUSTOM_NAME');
    }

    const exists = state.guilds[safeGuildId].customs.some((item) => item.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      throw new Error('CUSTOM_ALREADY_EXISTS');
    }

    const now = Date.now();
    const custom = {
      id: randomUUID(),
      guildId: safeGuildId,
      name,
      createdBy: String(payload.createdBy),
      createdAt: now,
      updatedAt: now,
      permissions: {
        roleIds: [],
        userIds: []
      },
      type: null,
      config: {
        embed: {
          title: '',
          description: '',
          accentColor: '',
          footer: '',
          thumbnailUrl: '',
          imageRightUrl: '',
          pictureUrl: '',
          imageUrl: '',
          buttonMode: 'none',
          buttonTarget: '',
          buttonContentMode: 'text',
          buttonLabel: 'Bouton',
          buttonColor: 'none',
          buttonEmoji: '',
          authorName: ''
        },
        message: {
          content: ''
        },
        roleAction: {
          roleId: null,
          action: 'add',
          targetMode: 'mention_or_author',
          responseMode: 'panel',
          confirmationTemplate: 'Action `{ActionName}` effectuée sur {TargetMention}.',
          responseEmbed: {
            title: '',
            description: '{ConfirmationMessage}',
            footer: '',
            thumbnailUrl: '',
            imageUrl: '',
            authorName: ''
          }
        },
        behavior: {
          deleteBotResponse: false,
          deleteCommand: false,
          targetAnotherMember: false
        },
        selector: {
          title: 'Choisissez vos rôles',
          description: 'Sélectionnez vos rôles ci-dessous.',
          accentColor: '#2B2D31',
          placeholder: 'Sélectionnez vos rôles',
          roleIds: [],
          maxValues: 1
        }
      }
    };

    state.guilds[safeGuildId].customs.push(custom);
    storage.write(state);
    return custom;
  }

  function update(guildId, customId, updater) {
    const state = storage.read();
    const safeGuildId = String(guildId);
    const bucket = state.guilds[safeGuildId];
    if (!bucket || !Array.isArray(bucket.customs)) return null;

    const target = bucket.customs.find((item) => item.id === String(customId));
    if (!target) return null;

    updater(target);
    target.updatedAt = Date.now();
    storage.write(state);
    return target;
  }

  function deleteCustom(guildId, customId) {
    const state = storage.read();
    const safeGuildId = String(guildId);
    const bucket = state.guilds[safeGuildId];
    if (!bucket || !Array.isArray(bucket.customs)) return false;

    const before = bucket.customs.length;
    bucket.customs = bucket.customs.filter((item) => item.id !== String(customId));
    const changed = bucket.customs.length !== before;
    if (changed) storage.write(state);
    return changed;
  }

  function clearGuildCustoms(guildId) {
    const state = storage.read();
    const safeGuildId = String(guildId);
    const bucket = state.guilds[safeGuildId];
    if (!bucket || !Array.isArray(bucket.customs)) return 0;

    const removedCount = bucket.customs.length;
    bucket.customs = [];
    storage.write(state);
    return removedCount;
  }

  function setPermissions(guildId, customId, roleIds, userIds) {
    return update(guildId, customId, (target) => {
      target.permissions.roleIds = uniqueStrings(roleIds);
      target.permissions.userIds = uniqueStrings(userIds);
    });
  }

  function setType(guildId, customId, type) {
    const allowed = new Set(['embed', 'message', 'role_action', 'selector']);
    if (!allowed.has(type)) throw new Error('INVALID_CUSTOM_TYPE');
    return update(guildId, customId, (target) => {
      target.type = type;
    });
  }

  function rename(guildId, customId, newName) {
    const normalized = normalizeCommandName(newName);
    if (!isValidCommandName(normalized)) throw new Error('INVALID_CUSTOM_NAME');

    return update(guildId, customId, (target) => {
      const found = listGuildCustoms(guildId).find((item) => item.id !== target.id && item.name.toLowerCase() === normalized.toLowerCase());
      if (found) throw new Error('CUSTOM_ALREADY_EXISTS');
      target.name = normalized;
    });
  }

  return {
    listGuildCustoms,
    getByName,
    getById,
    create,
    update,
    deleteCustom,
    clearGuildCustoms,
    rename,
    setPermissions,
    setType
  };
}

function normalizeCommandName(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function isValidCommandName(name) {
  return /^\+[a-z0-9][a-z0-9_-]{0,31}$/.test(name);
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => String(item)).filter(Boolean))];
}

module.exports = {
  createCustomStore,
  normalizeCommandName,
  isValidCommandName
};
