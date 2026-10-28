const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { loadRuntimeConfig, getRuntimeDatabasePath } = require('../../../Utils/runtimeContext');

const config = loadRuntimeConfig();
const dbPath = getRuntimeDatabasePath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath, {
    timeout: 5000 
  });

const DEFAULT_LIMITS = {
    bl: {
        owner: 5,
        sys: 10,
        wl: 3
    },
    nobl: {
        owner: 5,
        sys: 10
    }
};

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
    db.exec(`CREATE TABLE IF NOT EXISTS guilds (id TEXT PRIMARY KEY, prefix TEXT DEFAULT NULL)`);
    
    const botColumns = {
        id: "TEXT DEFAULT NULL",
        nobl: "TEXT DEFAULT '[]'",
        bl: "TEXT DEFAULT '[]'",
        sys: "TEXT DEFAULT '[]'",
        owner: "TEXT DEFAULT '[]'",
        wl: "TEXT DEFAULT '[]'",
        logs: "TEXT DEFAULT NULL",
        wet: "TEXT DEFAULT '[]'",
        limits: "TEXT DEFAULT NULL"
    };
    
    Object.entries(botColumns).forEach(([columnName, columnDefinition]) => {
        addColumnIfNotExists('bot', columnName, columnDefinition);
    });

    const guildColumns = {
        id: "TEXT PRIMARY KEY",
        prefix: `TEXT DEFAULT '${config.prefix}'`,
        nobl: "TEXT DEFAULT '[]'",
        bl: "TEXT DEFAULT '[]'",
        sys: "TEXT DEFAULT '[]'",
        owner: "TEXT DEFAULT '[]'",
        wl: "TEXT DEFAULT '[]'",
        logs: "TEXT DEFAULT NULL",
        wet: "TEXT DEFAULT '[]'",
        limits: `TEXT DEFAULT '${JSON.stringify(DEFAULT_LIMITS)}'`
    };

    Object.entries(guildColumns).forEach(([columnName, columnDefinition]) => {
        addColumnIfNotExists('guilds', columnName, columnDefinition);
    });

    db.prepare(
        "UPDATE guilds SET prefix = ? WHERE prefix IS NULL OR prefix = ''"
    ).run(config.prefix);

    db.prepare(
        "UPDATE guilds SET limits = ? WHERE limits IS NULL OR limits = ''"
    ).run(JSON.stringify(DEFAULT_LIMITS));

    return db;
}
