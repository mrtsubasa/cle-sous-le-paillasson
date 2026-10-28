const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { encryptToken, isEncryptedToken } = require('../Utils/tokenVault');

const databasePath = path.join(__dirname, '..', 'Utils', 'DataBase', 'database.db');

function ensureDatabaseDirectory() {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
}

module.exports = () => {
  ensureDatabaseDirectory();

  const db = new Database(databasePath, {
    timeout: 5000,
  });

  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS bot (
      botId TEXT DEFAULT NULL,
      expired TEXT NOT NULL DEFAULT 'false',
      token TEXT DEFAULT NULL,
      type TEXT DEFAULT NULL,
      folder TEXT DEFAULT NULL,
      time TEXT DEFAULT NULL,
      starttime TEXT DEFAULT NULL,
      ownerId TEXT DEFAULT NULL,
      started TEXT NOT NULL DEFAULT 'true',
      reminderSent TEXT NOT NULL DEFAULT 'false',
      reminderSentAt TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS cle (
      code TEXT DEFAULT NULL,
      type TEXT DEFAULT NULL,
      day TEXT DEFAULT NULL,
      targetUserId TEXT DEFAULT NULL,
      use TEXT NOT NULL DEFAULT 'false'
    );

    CREATE TABLE IF NOT EXISTS trial_use (
      userId TEXT NOT NULL PRIMARY KEY,
      botId TEXT DEFAULT NULL,
      usedAt TEXT DEFAULT NULL
    );
  `);

  try {
    db.prepare("ALTER TABLE bot ADD COLUMN folder TEXT DEFAULT NULL").run();
  } catch {}

  try {
    db.prepare("ALTER TABLE bot ADD COLUMN reminderSent TEXT NOT NULL DEFAULT 'false'").run();
  } catch {}

  try {
    db.prepare("ALTER TABLE bot ADD COLUMN reminderSentAt TEXT DEFAULT NULL").run();
  } catch {}

  try {
    db.prepare("ALTER TABLE cle ADD COLUMN targetUserId TEXT DEFAULT NULL").run();
  } catch {}

  try {
    db.prepare("ALTER TABLE trial_use ADD COLUMN botId TEXT DEFAULT NULL").run();
  } catch {}

  const duplicateBotIds = db.prepare(
    "SELECT botId, COUNT(*) AS count FROM bot WHERE botId IS NOT NULL AND botId != '' GROUP BY botId HAVING count > 1"
  ).all();

  if (duplicateBotIds.length > 0) {
    const dedupeBots = db.transaction((rows) => {
      const deleteDuplicates = db.prepare(`
        DELETE FROM bot
        WHERE botId = ?
          AND rowid NOT IN (
            SELECT MAX(rowid)
            FROM bot
            WHERE botId = ?
          )
      `);

      for (const row of rows) {
        deleteDuplicates.run(row.botId, row.botId);
      }
    });

    dedupeBots(duplicateBotIds);
  }

  try {
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_botId ON bot(botId)').run();
  } catch {}

  try {
    db.prepare('CREATE INDEX IF NOT EXISTS idx_bot_folder ON bot(folder)').run();
  } catch {}

  try {
    db.prepare('CREATE INDEX IF NOT EXISTS idx_bot_ownerId_time ON bot(ownerId, time DESC)').run();
  } catch {}

  try {
    db.prepare('CREATE INDEX IF NOT EXISTS idx_bot_expired_time ON bot(expired, time DESC)').run();
  } catch {}

  try {
    db.prepare('CREATE INDEX IF NOT EXISTS idx_bot_started ON bot(started)').run();
  } catch {}

  const storedBots = db.prepare("SELECT botId, token FROM bot WHERE token IS NOT NULL AND token != ''").all();
  const migrateBotTokens = db.transaction((rows) => {
    const updateToken = db.prepare('UPDATE bot SET token = ? WHERE botId = ?');

    for (const row of rows) {
      if (!row?.token || isEncryptedToken(row.token)) continue;
      updateToken.run(encryptToken(row.token), row.botId);
    }
  });

  migrateBotTokens(storedBots);

  db.query = (sql, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = undefined;
    }

    const statement = db.prepare(sql);
    const isSelect = /^\s*(SELECT|PRAGMA|WITH|EXPLAIN)\b/i.test(sql);

    try {
      const result = isSelect
        ? (params === undefined
            ? statement.all()
            : Array.isArray(params)
              ? statement.all(...params)
              : statement.all(params))
        : (params === undefined
            ? statement.run()
            : Array.isArray(params)
              ? statement.run(...params)
              : statement.run(params));

      if (callback) {
        callback(null, result);
      }

      return result;
    } catch (error) {
      if (callback) {
        callback(error);
        return;
      }

      throw error;
    }
  };

  return db;
};
