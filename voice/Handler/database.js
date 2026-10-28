const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { getRuntimeDatabasePath, loadRuntimeConfig } = require('../../../Utils/runtimeContext');

const config = loadRuntimeConfig();
const defaultPrefix = typeof config.prefix === 'string' && config.prefix.trim()
    ? config.prefix.trim()
    : '$';
const defaultBuyers = Array.isArray(config.buyers)
    ? config.buyers.map((id) => String(id))
    : [String(config.buyers || '')].filter(Boolean);

const dbPath = getRuntimeDatabasePath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath, {
    timeout: 5000 
  });

db.pragma('journal_mode = WAL');


module.exports = () => {
    function addColumnIfNotExists(tableName, columnName, columnDefinition) {
        const row = db.prepare(`PRAGMA table_info(${tableName})`).all().find(col => col.name === columnName);
        if (!row) {
            console.log(`Ajout de la colonne ${columnName} à la table ${tableName}`);
            db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`).run();
        }
    }

    db.exec(`CREATE TABLE IF NOT EXISTS bot (id TEXT DEFAULT NULL)`);
    db.exec(`CREATE TABLE IF NOT EXISTS guilds (id TEXT PRIMARY KEY, prefix TEXT DEFAULT '${defaultPrefix.replace(/'/g, "''")}')`);
    
    const botColumns = {
        id: "TEXT DEFAULT NULL",
        nobl: "TEXT DEFAULT '[]'",
        bl: "TEXT DEFAULT '[]'",
        sys: "TEXT DEFAULT '[]'",
        owner: "TEXT DEFAULT '[]'",
        wl: "TEXT DEFAULT '[]'",
        uhqLock: "TEXT DEFAULT '[]'",
       // voicePeak: "TEXT DEFAULT '{}'",
    };
    
    Object.entries(botColumns).forEach(([columnName, columnDefinition]) => {
        addColumnIfNotExists('bot', columnName, columnDefinition);
    });

    const guildColumns = {
        id: "TEXT PRIMARY KEY",
        prefix: `TEXT DEFAULT '${defaultPrefix.replace(/'/g, "''")}'`,
        buyers: "TEXT DEFAULT '[]'",
        sys: "TEXT DEFAULT '[]'",
        owner: "TEXT DEFAULT '[]'",
        wl: "TEXT DEFAULT '[]'",
        uhqLock: "TEXT DEFAULT '{}'",
        cafard: "TEXT DEFAULT '{}'",
        laisse: "TEXT DEFAULT '{}'",
        tempvocal: "TEXT DEFAULT '{}'",
        voiceStatsChannel: "TEXT DEFAULT NULL",
        voiceStatsEnabled: "TEXT DEFAULT '0'",
        voiceStatsPeak: "INTEGER DEFAULT 0",
        voiceStatsStep: "INTEGER DEFAULT 5",
    };

    Object.entries(guildColumns).forEach(([columnName, columnDefinition]) => {
        addColumnIfNotExists('guilds', columnName, columnDefinition);
    });

    db.prepare(`
        UPDATE guilds
        SET prefix = @prefix
        WHERE prefix IS NULL OR TRIM(prefix) = ''
    `).run({ prefix: defaultPrefix });

    db.prepare(`
        UPDATE guilds
        SET buyers = @buyers
        WHERE buyers IS NULL OR TRIM(buyers) = ''
    `).run({ buyers: JSON.stringify(defaultBuyers) });

    return db;
}
