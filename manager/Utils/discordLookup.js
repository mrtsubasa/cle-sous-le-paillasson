const Discord = require('discord.js');
const { decryptToken } = require('./tokenVault');

const DEFAULT_TOKEN_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_USER_CACHE_TTL_MS = 15 * 60 * 1000;
const tokenValidityCache = new Map();
const tokenValidityInflight = new Map();
const userCache = new Map();
const userInflight = new Map();

function getFallbackUser(userId) {
  const id = String(userId || '');
  return {
    id,
    username: id,
    tag: id,
    displayAvatarURL: () => null,
    avatarURL: () => null,
  };
}

async function fetchUser(bot, userId) {
  const id = String(userId || '');
  if (!bot || !id) return null;

  const now = Date.now();
  const cached = userCache.get(id);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const liveCache = bot.users?.cache?.get(id);
  if (liveCache) {
    userCache.set(id, {
      value: liveCache,
      expiresAt: now + DEFAULT_USER_CACHE_TTL_MS,
    });
    return liveCache;
  }

  if (userInflight.has(id)) {
    return userInflight.get(id);
  }

  const request = bot.users.fetch(id)
    .then((user) => {
      const value = user || getFallbackUser(id);
      userCache.set(id, {
        value,
        expiresAt: Date.now() + DEFAULT_USER_CACHE_TTL_MS,
      });
      return value;
    })
    .catch(() => {
      const value = getFallbackUser(id);
      userCache.set(id, {
        value,
        expiresAt: Date.now() + 60 * 1000,
      });
      return value;
    })
    .finally(() => {
      userInflight.delete(id);
    });

  userInflight.set(id, request);
  return request;
}

function invalidateTokenValidityCache(token) {
  const plainToken = decryptToken(token);
  if (plainToken) {
    tokenValidityCache.delete(plainToken);
    tokenValidityInflight.delete(plainToken);
  }
}

async function isTokenValid(token, options = {}) {
  const plainToken = decryptToken(token);
  if (!plainToken) return false;

  const ttlMs = options.ttlMs ?? DEFAULT_TOKEN_CACHE_TTL_MS;
  const now = Date.now();
  const cached = tokenValidityCache.get(plainToken);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  if (tokenValidityInflight.has(plainToken)) {
    return tokenValidityInflight.get(plainToken);
  }

  const check = (async () => {
    const probe = new Discord.Client({ intents: [] });
    let timeout = null;

    try {
      const loginPromise = probe.login(plainToken);
      const timeoutMs = options.timeoutMs ?? 8000;
      const timeoutPromise = new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('TOKEN_VALIDATION_TIMEOUT')), timeoutMs);
      });

      await Promise.race([loginPromise, timeoutPromise]);
      const value = true;
      tokenValidityCache.set(plainToken, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
      return value;
    } catch {
      const value = false;
      tokenValidityCache.set(plainToken, {
        value,
        expiresAt: Date.now() + Math.min(ttlMs, 60 * 1000),
      });
      return value;
    } finally {
      if (timeout) clearTimeout(timeout);
      probe.destroy();
      tokenValidityInflight.delete(plainToken);
    }
  })();

  tokenValidityInflight.set(plainToken, check);
  return check;
}

module.exports = {
  fetchUser,
  getFallbackUser,
  invalidateTokenValidityCache,
  isTokenValid,
};
