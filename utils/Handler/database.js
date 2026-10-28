const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function readRuntimeConfig() {
    const configPath = path.join(process.cwd(), 'config.json');
    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
        return {};
    }
}

const config = readRuntimeConfig();
const dbPath = path.join(process.cwd(), 'Utils', 'DataBase', 'database.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath, {
    timeout: 5000
});

const defaultPrefix = typeof config.prefix === 'string' && config.prefix.trim()
    ? config.prefix.trim()
    : '$';

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
    const botColumns = {
        id: "TEXT DEFAULT NULL",
        nobl: "TEXT DEFAULT '[]'",
        sys: "TEXT DEFAULT '[]'",
        owner: "TEXT DEFAULT '[]'",
        wl: "TEXT DEFAULT '[]'"
    };
    Object.entries(botColumns).forEach(([columnName, columnDefinition]) => {
        addColumnIfNotExists('bot', columnName, columnDefinition);
    });

    db.exec(`CREATE TABLE IF NOT EXISTS guilds (id TEXT PRIMARY KEY)`);
    const guildColumns = {
    id: 'TEXT PRIMARY KEY',
    greetChannels: "TEXT DEFAULT '[]'",
    greetLog: "TEXT DEFAULT NULL",
    greetDeleteTime: "INTEGER DEFAULT 10000",

    welcomeChannels: "TEXT DEFAULT '[]'",
    welcomeMessage: "TEXT DEFAULT 'Bienvenue sur **{server}** {user} !\nNous sommes **{members}** membres !'",
    welcomeRole: "TEXT DEFAULT NULL",
    welcomeLogChannel: "TEXT DEFAULT NULL",
    welcomeLogMessage: "TEXT DEFAULT 'Le membre {user.name} a rejoint {server}. Nous sommes maintenant {members} membres.'",
    leaveChannels: "TEXT DEFAULT '[]'",
    leaveMessage: "TEXT DEFAULT 'Au revoir **{user}** sur **{server}** !\nNous sommes maintenant **{members}** membres.'",
    leaveLogChannel: "TEXT DEFAULT NULL",
    leaveLogMessage: "TEXT DEFAULT 'Le membre {user.name} a quitté {server}. Nous sommes maintenant {members} membres.'",
    prefix: `TEXT DEFAULT '${defaultPrefix.replace(/'/g, "''")}'`,

    owner: "TEXT DEFAULT '[]'",
    sys: "TEXT DEFAULT '[]'",
    wl: "TEXT DEFAULT '[]'",
    badword: "TEXT DEFAULT '[]'",

    mentionChannels: "TEXT DEFAULT '[]'",
    embedChannels:"TEXT DEFAULT '[]'",

    supportRoles: "TEXT DEFAULT '[]'",
    supportKeywords: "TEXT DEFAULT '[]'",
    supportEnabled: "TEXT DEFAULT 'true'",

    pingroleChannels: "TEXT DEFAULT '[]'",
    pingroleRoles: "TEXT DEFAULT '[]'"
};
    Object.entries(guildColumns).forEach(([columnName, columnDefinition]) => {
        addColumnIfNotExists('guilds', columnName, columnDefinition);
    });

    db.prepare(`UPDATE guilds SET prefix = ? WHERE prefix = ?`)
      .run(defaultPrefix, '$');

    return db;
}
