const { loadRuntimeConfig } = require('../../../Utils/runtimeContext');
const config = loadRuntimeConfig();

function getDefaultPrefix() {
    return typeof config.prefix === 'string' && config.prefix.trim()
        ? config.prefix.trim()
        : '$';
}

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

function checkbot(bot, guildId) {
    if (guildId) return ensureGuildRow(bot, guildId);

    let req = bot.db.prepare('SELECT * FROM bot WHERE id = ?').get(bot.user.id);
    if (!req) bot.db.exec(`INSERT INTO bot (id) VALUES ('${bot.user.id}')`);
    req = bot.db.prepare('SELECT * FROM bot WHERE id = ?').get(bot.user.id);
    return req;
}

function ensureGuildRow(bot, guildId) {
    if (!guildId) return null;

    let req = bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
    if (!req) {
        bot.db.prepare('INSERT INTO guilds (id, prefix, limits) VALUES (?, ?, ?)').run(
            guildId,
            config.prefix,
            JSON.stringify(DEFAULT_LIMITS)
        );
        req = bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
    } else if (!req.prefix) {
        bot.db.prepare('UPDATE guilds SET prefix = ? WHERE id = ?').run(config.prefix, guildId);
        req = bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
    }

    if (!req?.limits) {
        bot.db.prepare('UPDATE guilds SET limits = ? WHERE id = ?').run(JSON.stringify(DEFAULT_LIMITS), guildId);
        req = bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
    }

    return req;
}

function parseJson(value, fallback) {
    if (value == null) return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function normalizeLimits(rawLimits) {
    const limits = rawLimits && typeof rawLimits === 'object' ? rawLimits : {};

    return {
        bl: {
            owner: Number.isFinite(Number(limits.bl?.owner)) && Number(limits.bl.owner) > 0
                ? Math.floor(Number(limits.bl.owner))
                : DEFAULT_LIMITS.bl.owner,
            sys: Number.isFinite(Number(limits.bl?.sys)) && Number(limits.bl.sys) > 0
                ? Math.floor(Number(limits.bl.sys))
                : DEFAULT_LIMITS.bl.sys,
            wl: Number.isFinite(Number(limits.bl?.wl)) && Number(limits.bl.wl) > 0
                ? Math.floor(Number(limits.bl.wl))
                : DEFAULT_LIMITS.bl.wl
        },
        nobl: {
            owner: Number.isFinite(Number(limits.nobl?.owner)) && Number(limits.nobl.owner) > 0
                ? Math.floor(Number(limits.nobl.owner))
                : DEFAULT_LIMITS.nobl.owner,
            sys: Number.isFinite(Number(limits.nobl?.sys)) && Number(limits.nobl.sys) > 0
                ? Math.floor(Number(limits.nobl.sys))
                : DEFAULT_LIMITS.nobl.sys
        }
    };
}

function getCommandLimits(req) {
    return normalizeLimits(parseJson(req.limits, null));
}

async function saveCommandLimits(bot, guildId, limits) {
    const data = JSON.stringify(normalizeLimits(limits));
    await bot.db.prepare(`UPDATE guilds SET limits = @data WHERE id = @id`).run({
        data,
        id: guildId
    });
}

function getGuildPrefix(bot, guildId) {
    const fallbackPrefix = getDefaultPrefix();
    if (!guildId) return fallbackPrefix;

    const req = ensureGuildRow(bot, guildId);
    const prefix = typeof req?.prefix === 'string' ? req.prefix.trim() : '';
    return prefix || fallbackPrefix;
}

function saveGuildPrefix(bot, guildId, prefix) {
    bot.db.prepare(
        'INSERT INTO guilds (id, prefix) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET prefix = excluded.prefix'
    ).run(guildId, prefix);
}

function getConfiguredBuyers() {
    return Array.isArray(config.buyers)
        ? config.buyers.map((id) => String(id))
        : [String(config.buyers || config.buyer || '')];
}

function parseList(value) {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function getGuildData(bot, guildId) {
    const guildRow = ensureGuildRow(bot, guildId) || {};
    const botRow = checkbot(bot) || {};

    return {
        ...botRow,
        ...guildRow,
    };
}

function hasId(list, userId) {
    return Array.isArray(list) && list.some((entry) => {
        if (entry == null) return false;
        if (typeof entry === 'string' || typeof entry === 'number') {
            return String(entry) === String(userId);
        }
        return String(entry.id || '') === String(userId);
    });
}

function getGuildAccessLists(bot, guildId) {
    const guild = getGuildData(bot, guildId);
    return {
        owner: parseList(guild?.owner),
        sys: parseList(guild?.sys),
        wl: parseList(guild?.wl),
        buyers: parseList(guild?.buyers),
    };
}

function isGuildPrivileged(bot, guildId, userId, type = 'owner') {
    const guild = getGuildData(bot, guildId);
    if (!guild) return false;
    const configuredBuyers = getConfiguredBuyers();
    const { owner, sys, wl, buyers } = getGuildAccessLists(bot, guildId);

    if (type === 'buyer') {
        return hasId(configuredBuyers, userId) || hasId(buyers, userId);
    }

    if (hasId(configuredBuyers, userId) || hasId(buyers, userId)) return true;
    if (type === 'owner') return hasId(owner, userId);
    if (type === 'sys') return hasId(owner, userId) || hasId(sys, userId);
    if (type === 'wl') return hasId(owner, userId) || hasId(sys, userId) || hasId(wl, userId);

    return false;
}

function checkperm(bot, message, type) {
    const userId = message.author?.id || message.user?.id;
    const configuredBuyers = getConfiguredBuyers();
    const buyers = configuredBuyers;
    if (type === 'everyone') return true;
    if (type === 'buyer') {
        if (!message.guild) return buyers.includes(String(userId));

        const { buyers: guildBuyers } = getGuildAccessLists(bot, message.guild.id);
        if (guildBuyers.length) return hasId(guildBuyers, userId);
        return buyers.includes(String(userId));
    }
    if (buyers.includes(String(userId))) return true;

    if (!message.guild) return false;

    if (message.guild.ownerId === userId) {
        return ['owner', 'sys', 'wl'].includes(type);
    }

    const { wl, owner, sys } = getGuildAccessLists(bot, message.guild.id);

    if (hasId(sys, userId)) return true;
    if (type === 'owner' && hasId(owner, userId)) return true;
    if (type === 'wl' && (hasId(owner, userId) || hasId(wl, userId))) return true;

    return false;
}

module.exports = {
    checkBot: checkbot,
    ensureGuildRow,
    getGuildData,
    isGuildPrivileged,
    checkPerm: checkperm,
    getCommandLimits,
    saveCommandLimits,
    getGuildPrefix,
    saveGuildPrefix
};
