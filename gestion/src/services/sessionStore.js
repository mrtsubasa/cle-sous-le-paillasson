const { randomUUID } = require('node:crypto');

function createSessionStore(client) {
  const panelSessions = new Map();
  const adminPanelSessions = new Map();
  const pendingNameInputs = new Map();
  const pendingEmbedInputs = new Map();
  const helpSessions = new Map();

  function resolvePanelSessionKey(sessionId) {
    const raw = String(sessionId || '');
    if (!raw) return null;
    if (panelSessions.has(raw)) return raw;

    const compact = raw.slice(0, 8);
    for (const key of panelSessions.keys()) {
      if (key.startsWith(compact)) return key;
    }
    return null;
  }

  function createPanelSession(payload) {
    const sessionId = randomUUID();
    const session = {
      id: sessionId,
      guildId: String(payload.guildId),
      channelId: String(payload.channelId),
      ownerId: String(payload.ownerId),
      messageId: String(payload.messageId),
      selectedCustomId: payload.selectedCustomId || null,
      expiresAt: Date.now() + 10 * 60 * 1000
    };
    panelSessions.set(sessionId, session);
    schedulePanelExpiration(session);
    return session;
  }

  function getPanelSession(sessionId) {
    const key = resolvePanelSessionKey(sessionId);
    if (!key) return null;
    const session = panelSessions.get(key) || null;
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      panelSessions.delete(key);
      return null;
    }
    return session;
  }

  function touchPanelSession(sessionId) {
    const key = resolvePanelSessionKey(sessionId);
    if (!key) return null;
    const session = panelSessions.get(key);
    if (!session) return null;
    session.expiresAt = Date.now() + 10 * 60 * 1000;
    return session;
  }

  function setSelectedCustom(sessionId, customId) {
    const key = resolvePanelSessionKey(sessionId);
    if (!key) return null;
    const session = panelSessions.get(key);
    if (!session) return null;
    session.selectedCustomId = customId ? String(customId) : null;
    return session;
  }

  function setPanelMessageId(sessionId, messageId) {
    const key = resolvePanelSessionKey(sessionId);
    if (!key) return null;
    const session = panelSessions.get(key);
    if (!session) return null;
    session.messageId = String(messageId);
    return session;
  }

  function setEmbedDraft(sessionId, draft) {
    const key = resolvePanelSessionKey(sessionId);
    if (!key) return null;
    const session = panelSessions.get(key);
    if (!session) return null;
    session.embedDraft = { ...(draft || {}) };
    return session.embedDraft;
  }

  function getEmbedDraft(sessionId) {
    const key = resolvePanelSessionKey(sessionId);
    if (!key) return null;
    const session = panelSessions.get(key);
    if (!session || !session.embedDraft) return null;
    return session.embedDraft;
  }

  function clearEmbedDraft(sessionId) {
    const key = resolvePanelSessionKey(sessionId);
    if (!key) return null;
    const session = panelSessions.get(key);
    if (!session) return null;
    delete session.embedDraft;
    return session;
  }

  function deletePanelSession(sessionId) {
    const key = resolvePanelSessionKey(sessionId);
    if (!key) return;
    panelSessions.delete(key);
  }

  function createAdminPanelSession(payload) {
    const id = randomUUID();
    const session = {
      id,
      ownerId: String(payload.ownerId),
      guildId: String(payload.guildId),
      channelId: String(payload.channelId),
      messageId: String(payload.messageId),
      expiresAt: Date.now() + 10 * 60 * 1000
    };
    adminPanelSessions.set(id, session);
    return session;
  }

  function getAdminPanelSession(id) {
    const session = adminPanelSessions.get(String(id)) || null;
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      adminPanelSessions.delete(String(id));
      return null;
    }
    return session;
  }

  function touchAdminPanelSession(id) {
    const session = adminPanelSessions.get(String(id));
    if (!session) return null;
    session.expiresAt = Date.now() + 10 * 60 * 1000;
    return session;
  }

  function deleteAdminPanelSession(id) {
    adminPanelSessions.delete(String(id));
  }

  function createPendingNameInput(payload) {
    const key = `${String(payload.channelId)}:${String(payload.userId)}`;
    const pending = {
      key,
      sessionId: String(payload.sessionId),
      channelId: String(payload.channelId),
      userId: String(payload.userId),
      guildId: String(payload.guildId),
      messageId: String(payload.messageId),
      expiresAt: Date.now() + (payload.timeoutMs || 90_000)
    };
    pendingNameInputs.set(key, pending);
    return pending;
  }

  function getPendingNameInput(channelId, userId) {
    const key = `${String(channelId)}:${String(userId)}`;
    const pending = pendingNameInputs.get(key) || null;
    if (!pending) return null;
    if (Date.now() > pending.expiresAt) {
      pendingNameInputs.delete(key);
      return null;
    }
    return pending;
  }

  function clearPendingNameInput(channelId, userId) {
    const key = `${String(channelId)}:${String(userId)}`;
    pendingNameInputs.delete(key);
  }

  function createPendingEmbedInput(payload) {
    const key = `${String(payload.channelId)}:${String(payload.userId)}`;
    const pending = {
      key,
      sessionId: String(payload.sessionId),
      channelId: String(payload.channelId),
      userId: String(payload.userId),
      field: String(payload.field),
      step: payload.step ? String(payload.step) : null,
      meta: payload.meta && typeof payload.meta === 'object' ? { ...payload.meta } : null,
      scope: String(payload.scope || 'embed'),
      customId: payload.customId ? String(payload.customId) : null,
      expiresAt: Date.now() + (payload.timeoutMs || 120_000)
    };
    pendingEmbedInputs.set(key, pending);
    return pending;
  }

  function getPendingEmbedInput(channelId, userId) {
    const key = `${String(channelId)}:${String(userId)}`;
    const pending = pendingEmbedInputs.get(key) || null;
    if (!pending) return null;
    if (Date.now() > pending.expiresAt) {
      pendingEmbedInputs.delete(key);
      return null;
    }
    return pending;
  }

  function clearPendingEmbedInput(channelId, userId) {
    const key = `${String(channelId)}:${String(userId)}`;
    pendingEmbedInputs.delete(key);
  }

  function createHelpSession(payload) {
    const id = randomUUID();
    const session = {
      id,
      ownerId: String(payload.ownerId),
      messageId: String(payload.messageId),
      channelId: String(payload.channelId),
      page: 0,
      expiresAt: Date.now() + 5 * 60 * 1000
    };
    helpSessions.set(id, session);
    return session;
  }

  function getHelpSession(id) {
    const session = helpSessions.get(String(id)) || null;
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      helpSessions.delete(String(id));
      return null;
    }
    return session;
  }

  function touchHelpSession(id) {
    const session = helpSessions.get(String(id));
    if (!session) return null;
    session.expiresAt = Date.now() + 5 * 60 * 1000;
    return session;
  }

  function deleteHelpSession(id) {
    helpSessions.delete(String(id));
  }

  async function disablePanelMessage(sessionId, buildDisabledPayload) {
    const key = resolvePanelSessionKey(sessionId);
    if (!key) return;
    const session = panelSessions.get(key);
    if (!session) return;
    panelSessions.delete(key);

    try {
      const channel = await client.channels.fetch(session.channelId);
      if (!channel || !channel.isTextBased()) return;
      const message = await channel.messages.fetch(session.messageId);
      await message.edit(buildDisabledPayload(session));
    } catch (error) {
      // Message can be deleted or inaccessible; safely ignore.
    }
  }

  async function disableHelpMessage(sessionId, buildDisabledPayload) {
    const session = helpSessions.get(String(sessionId));
    if (!session) return;
    helpSessions.delete(String(sessionId));

    try {
      const channel = await client.channels.fetch(session.channelId);
      if (!channel || !channel.isTextBased()) return;
      const message = await channel.messages.fetch(session.messageId);
      await message.edit(buildDisabledPayload(session));
    } catch {
      // Nothing to do if message/channel is gone.
    }
  }

  function schedulePanelExpiration(session) {
    const delayMs = Math.max(5_000, session.expiresAt - Date.now() + 500);
    setTimeout(async () => {
      const current = panelSessions.get(session.id);
      if (!current) return;
      if (Date.now() < current.expiresAt) {
        schedulePanelExpiration(current);
        return;
      }
      panelSessions.delete(session.id);
    }, delayMs).unref();
  }

  return {
    createPanelSession,
    getPanelSession,
    touchPanelSession,
    setSelectedCustom,
    setPanelMessageId,
    setEmbedDraft,
    getEmbedDraft,
    clearEmbedDraft,
    deletePanelSession,
    createPendingNameInput,
    getPendingNameInput,
    clearPendingNameInput,
    createPendingEmbedInput,
    getPendingEmbedInput,
    clearPendingEmbedInput,
    createAdminPanelSession,
    getAdminPanelSession,
    touchAdminPanelSession,
    deleteAdminPanelSession,
    createHelpSession,
    getHelpSession,
    touchHelpSession,
    deleteHelpSession,
    disablePanelMessage,
    disableHelpMessage
  };
}

module.exports = { createSessionStore };
