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

db.pragma('journal_mode = WAL');


module.exports = () => {
    const defaultPrefix = typeof config.prefix === 'string' && config.prefix.trim()
        ? config.prefix.trim()
        : '$';
    const defaultBuyers = Array.isArray(config.buyers)
        ? JSON.stringify(config.buyers.map((id) => String(id)))
        : JSON.stringify([String(config.buyers || '')].filter(Boolean));

    const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;

    function addColumnIfNotExists(tableName, columnName, columnDefinition) {
        const row = db.prepare(`PRAGMA table_info(${tableName})`).all().find(col => col.name === columnName);
        if (!row) {
            console.log(`Ajout de la colonne ${columnName} à la table ${tableName}`);
            db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`).run();
        }
    }

    db.exec(`CREATE TABLE IF NOT EXISTS bot (id TEXT DEFAULT NULL)`);
    db.exec(`
        CREATE TABLE IF NOT EXISTS guilds (
            id TEXT NOT NULL PRIMARY KEY
        )
    `);

    addColumnIfNotExists('guilds', 'prefix', `TEXT DEFAULT ${sqlString(defaultPrefix)}`);
    addColumnIfNotExists('guilds', 'owner', "TEXT DEFAULT '[]'");
    addColumnIfNotExists('guilds', 'sys', "TEXT DEFAULT '[]'");
    addColumnIfNotExists('guilds', 'wl', "TEXT DEFAULT '[]'");
    addColumnIfNotExists('guilds', 'buyers', `TEXT DEFAULT ${sqlString(defaultBuyers)}`);
    addColumnIfNotExists('guilds', 'serverProfileBio', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'roleBypass', "TEXT DEFAULT '[]'");
    addColumnIfNotExists('guilds', 'nobl', "TEXT DEFAULT '[]'");
    addColumnIfNotExists('guilds', 'blrAddLogsChannel', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'blrRemoveLogsChannel', "TEXT DEFAULT ''");

    db.prepare(`
        UPDATE guilds
        SET prefix = @prefix
        WHERE prefix IS NULL OR TRIM(prefix) = ''
    `).run({ prefix: defaultPrefix });
    db.prepare(`
        UPDATE guilds
        SET buyers = @buyers
        WHERE buyers IS NULL OR TRIM(buyers) = ''
    `).run({ buyers: defaultBuyers });
    db.prepare(`
        UPDATE guilds
        SET serverProfileBio = ''
        WHERE serverProfileBio IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET roleBypass = '[]'
        WHERE roleBypass IS NULL OR TRIM(roleBypass) = ''
    `).run();
    db.prepare(`
        UPDATE guilds
        SET nobl = '[]'
        WHERE nobl IS NULL OR TRIM(nobl) = ''
    `).run();
    db.prepare(`
        UPDATE guilds
        SET blrAddLogsChannel = ''
        WHERE blrAddLogsChannel IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET blrRemoveLogsChannel = ''
        WHERE blrRemoveLogsChannel IS NULL
    `).run();
    
    const botColumns = {
        id: "TEXT DEFAULT NULL",
        sys: "TEXT DEFAULT '[]'",
        owner: "TEXT DEFAULT '[]'",
        wl: "TEXT DEFAULT '[]'",
        categories: "TEXT DEFAULT '[]'",
    };
    
    Object.entries(botColumns).forEach(([columnName, columnDefinition]) => {
        addColumnIfNotExists('bot', columnName, columnDefinition);
    });
    return db;
}
