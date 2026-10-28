const activeTimers = new Map();
const MAX_TIMEOUT_MS = 2147483647;

function getBotStorageId(row) {
  return row?.folder || row?.botId;
}

function normalizeUnixTime(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;

  if (raw > 1e12) {
    return Math.floor(raw / 1000);
  }

  return Math.floor(raw);
}

function clearExpirationTimer(botId) {
  const entry = activeTimers.get(String(botId));
  if (entry?.timer) {
    clearTimeout(entry.timer);
  }
  activeTimers.delete(String(botId));
}

function scheduleExpiration(bot, row, ownerUser, stopBot, options = {}) {
  const botId = String(row?.botId || '');
  const storageId = getBotStorageId(row);
  const now = Math.floor(Date.now() / 1000);
  const targetUnix = normalizeUnixTime(row?.time);

  if (!botId || targetUnix === null) {
    return null;
  }

  clearExpirationTimer(botId);

  const delayMs = Math.max(0, (targetUnix - now) * 1000);

  if (delayMs > MAX_TIMEOUT_MS) {
    const timer = setTimeout(() => {
      scheduleExpiration(bot, row, ownerUser, stopBot, options);
    }, MAX_TIMEOUT_MS);

    activeTimers.set(botId, {
      timer,
      targetUnix,
      createdAt: Date.now(),
    });

    return timer;
  }

  const timer = setTimeout(async () => {
    try {
      const freshRow = bot.db.prepare('SELECT * FROM bot WHERE botId = ?').get(botId);

      if (!freshRow) {
        clearExpirationTimer(botId);
        return;
      }

      if (freshRow.expired === 'true') {
        clearExpirationTimer(botId);
        return;
      }

      const freshTime = normalizeUnixTime(freshRow.time);
      const remainingMs = freshTime === null
        ? -1
        : (freshTime - Math.floor(Date.now() / 1000)) * 1000;

      if (remainingMs > 0) {
        scheduleExpiration(bot, freshRow, ownerUser, stopBot, options);
        return;
      }

      await stopBot({
        botId,
        storageId,
        ownerUser,
        row: freshRow,
      });

      clearExpirationTimer(botId);
    } catch (error) {
      console.error(`[EXPIRATION] Erreur pour ${botId}:`, error);
    }
  }, delayMs);

  activeTimers.set(botId, {
    timer,
    targetUnix,
    createdAt: Date.now(),
  });

  return timer;
}

module.exports = {
  clearExpirationTimer,
  scheduleExpiration,
};
