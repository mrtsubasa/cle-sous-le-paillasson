const { data, saveWarns, saveBanLogs } = require('../utils/state');
const { isBotOwner, isOwnerMember, isSystem, isProtected, getCommandAccess } = require('../utils/permissions');
const { resolveMember } = require('../utils/resolvers');
const { formatWaitTime } = require('../utils/rateLimit');
const { logAction } = require('../utils/logAction');

const banUsage = new Map();

function getOtherConfig(guildId) {
    if (!data.otherConfig[guildId]) {
        data.otherConfig[guildId] = {
            banRoles: {},
            lockCategories: [],
            lockChannels: [],
            lockProtected: [],
            renewCategories: [],
            renewProtected: []
        };
    }
    return data.otherConfig[guildId];
}

function pickBanRule(member, cfg) {
    const roles = member.roles.cache.map((role) => String(role.id));
    let selected = null;

    for (const [roleId, rule] of Object.entries(cfg.banRoles || {})) {
        if (!roles.includes(String(roleId))) continue;
        if (!rule || !Number.isInteger(rule.limit) || !Number.isInteger(rule.windowMinutes)) continue;

        if (!selected) {
            selected = rule;
            continue;
        }

        if (rule.limit > selected.limit) {
            selected = rule;
            continue;
        }

        if (rule.limit == selected.limit && rule.windowMinutes > selected.windowMinutes) {
            selected = rule;
        }
    }

    return selected;
}

function checkBanLimit(guildId, userId, rule) {
    if (!rule) return { allowed: true, remaining: null, key: null, recent: null, windowMs: null };

    const key = `${guildId}:${userId}`;
    const now = Date.now();
    const windowMs = rule.windowMinutes * 60 * 1000;
    const history = banUsage.get(key) || [];
    const recent = history.filter((timestamp) => now - timestamp <= windowMs);

    if (recent.length >= rule.limit) {
        return { allowed: false, remaining: windowMs - (now - recent[0]), key, recent, windowMs };
    } return { allowed : true, remaining: null, key, recent, windowMs };
}

module.exports = {
    name: 'ban',
    async executePrefix(message, args) {
        const guildId = String(message.guild.id);
        let limit = null;

        const access = getCommandAccess(guildId);
        const hasAccessRules = access.public.length || access.owners.length || access.sys.length;
        const isOwner = isOwnerMember(guildId, message.author.id, message.member);
        const isSys = isSystem(guildId, message.author.id, message.member);
        const isBuyer = isBotOwner(message.author.id);

        if (!isBuyer && !isSys && !isOwner) {
            const cfg = getOtherConfig(guildId);
            const rule = pickBanRule(message.member, cfg);
            const hasPublicAccess = access.public.includes('ban');

            if (hasAccessRules && !hasPublicAccess && !rule) {
                return message.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande", allowedMentions: { parse: [] }, mentionRepliedUser: false });
            }

            if (!hasPublicAccess && !rule) {
                return message.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande", allowedMentions: { parse: [] }, mentionRepliedUser: false });
            }

            if (rule) {
                limit = checkBanLimit(guildId, message.author.id, rule);
                if (!limit.allowed) {
                    return message.reply({ content: `Vous avez atteint la limite maximale, revenez ${formatWaitTime(limit.remaining || 0)}`, allowedMentions: { parse: [] }, mentionRepliedUser: false });
                }
            }
        } else if (isOwner && !isBuyer && !isSys) {
            if (!access.owners.includes('ban') && !access.public.includes('ban')) {
                return message.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande", allowedMentions: { parse: [] }, mentionRepliedUser: false });
            } const ownerRule = { limit : 10, windowMinutes: 60 };
            limit = checkBanLimit(guildId, message.author.id, ownerRule);
            if (!limit.allowed) {
                return message.reply({ content: `Vous avez atteint la limite maximale, revenez ${formatWaitTime(limit.remaining || 0)}`, allowedMentions: { parse: [] }, mentionRepliedUser: false });
            }
        } else if (isSys && !isBuyer) {
            if (!access.sys.includes('ban') && !access.public.includes('ban')) {
                return message.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande", allowedMentions: { parse: [] }, mentionRepliedUser: false });
            } const sysRule = { limit : 20, windowMinutes: 60 };
            limit = checkBanLimit(guildId, message.author.id, sysRule);
            if (!limit.allowed) {
                return message.reply({ content: `Vous avez atteint la limite maximale, revenez ${formatWaitTime(limit.remaining || 0)}`, allowedMentions: { parse: [] }, mentionRepliedUser: false });
            }
        }

        const member = await resolveMember(message, args[0]);
        if (!member) {
            return message.reply({ content: 'Membre non trouv\u00e9', allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        if (member.id == message.author.id) {
            return message.reply({ content: 'Tu ne peux pas te ban toi-m\u00eame', allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        if (member.roles.highest.position >= message.member.roles.highest.position && message.author.id != message.guild.ownerId) {
            return message.reply({ content: 'Ce membre a un r\u00f4le \u00e9gal ou sup\u00e9rieur au tien', allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        if (isProtected(guildId, member.id, member)) {
            if (!isOwnerMember(guildId, message.author.id, message.member)) {
                return message.reply({ content: "Ce membre est prot\u00e9g\u00e9 et vous n'avez pas le droit de le sanctionner", allowedMentions: { parse: [] }, mentionRepliedUser: false });
            }
            if (isSystem(guildId, member.id, member)) {
                return message.reply({ content: 'Ce membre est un syst\u00e8me. M\u00eame les owners ne peuvent pas le sanctionner', allowedMentions: { parse: [] }, mentionRepliedUser: false });
            }
        }

        if (!member.bannable) {
            return message.reply({ content: "Je n'ai pas la permission de ban ce membre", allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const reason = args.slice(1).join(' ').trim() || 'aucune raison';

        try {
            await member.ban({ reason });
        } catch {
            return message.reply({ content: "Je n'ai pas la permission de ban ce membre", allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const guildIdKey = String(message.guild.id);
        const userIdKey = String(member.id);
        if (!data.warns[guildIdKey]) data.warns[guildIdKey] = {};
        if (!data.warns[guildIdKey][userIdKey]) data.warns[guildIdKey][userIdKey] = [];

        const banData = {
            id: data.warns[guildIdKey][userIdKey].length + 1,
            moderator: String(message.author.id),
            reason: `Ban : ${reason}`,
            date: new Date().toISOString()
        };

        data.warns[guildIdKey][userIdKey].push(banData);
        saveWarns();

        if (!data.banLogs[guildIdKey]) data.banLogs[guildIdKey] = {};
        data.banLogs[guildIdKey][userIdKey] = {
            moderator: String(message.author.id),
            moderatorTag: String(message.author.tag),
            reason: reason || 'aucune raison',
            date: new Date().toISOString()
        };
        saveBanLogs();

        await logAction(message.guild, 'Ban', message.author, member, reason);

        if (typeof limit != 'undefined' && limit && limit.key) {
            const now = Date.now();
            const recent = (limit.recent || []).filter((timestamp) => now - timestamp <= limit.windowMs);
            recent.push(now);
            banUsage.set(limit.key, recent);
        } return message.reply({ content : `${member} a \u00e9t\u00e9 ban pour \`${reason}\``, allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }
};

