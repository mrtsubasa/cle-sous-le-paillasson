const { AuditLogEvent } = require('discord.js');
const { permissionCard } = require('../utils/cards');
const { data } = require('../utils/state');
const { hasPermissionForCommand } = require('../utils/permissions');

const CROSS_EMOJI = '<:non:1519424807580733635>';

function parseUserId(input) {
    if (!input) return null;
    return input.replace(/[<@!>]/g, '');
}

function buildErrorCard(message) {
    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [{ type: 10, content: `*${CROSS_EMOJI} ${message}*` }]
        }]
    };
}

async function resolveModerator(guild, client, targetUserId, log) {
    let authorTag = (log && log.moderatorTag) ? String(log.moderatorTag) : 'Utilisateur inconnu';
    let authorId = 'Inconnu';

    if (log && log.moderator) {
        authorId = String(log.moderator);
        const member = await guild.members.fetch(authorId).catch(() => null);
        if (member) {
            authorTag = member.user.tag;
            return { authorTag, authorId };
        }

        const user = await client.users.fetch(authorId).catch(() => null);
        if (user) {
            authorTag = user.tag;
            return { authorTag, authorId };
        }
    }

    const audit = await guild.fetchAuditLogs({
        type: AuditLogEvent.MemberBanAdd,
        limit: 10
    }).catch(() => null);

    if (!audit) return { authorTag, authorId };

    const entry = audit.entries.find((item) => String(item.target?.id) === String(targetUserId));
    if (!entry || !entry.executor) return { authorTag, authorId };

    return {
        authorTag: entry.executor.tag || entry.executor.username || 'Utilisateur inconnu',
        authorId: String(entry.executor.id || 'Inconnu')
    };
}

module.exports = {
    name: 'baninfo',
    async executePrefix(message, args) {
        if (!hasPermissionForCommand(message.member, 'baninfo')) {
            return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const userId = parseUserId(args[0]);
        if (!userId) {
            return message.reply({ ...buildErrorCard('Mettez un ID'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        let ban;
        try {
            ban = await message.guild.bans.fetch(userId);
        } catch {
            return message.reply({ ...buildErrorCard("Le membre n'est pas banni"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const log = (data.banLogs[String(message.guild.id)] || {})[String(userId)];
        const { authorTag, authorId } = await resolveModerator(message.guild, message.client, userId, log);
        const authorBlock = `**Auteur :**\n> **Tag :** ${authorTag}\n> **Id :** ${authorId}`;

        const reason = ban.reason || 'Aucune raison';
        const timestamp = Math.floor(Date.now() / 1000);
        const infoCard = {
            flags: 32768,
            components: [{
                type: 17,
                components: [
                    { type: 10, content: '# Ban info' },
                    { type: 14, divider: true },
                    { type: 10, content: authorBlock },
                    { type: 14, divider: true },
                    { type: 10, content: `**Victime :**\n> **Tag :** ${ban.user.tag}\n> **Id :** ${ban.user.id}\n> **Raison :** ${reason}` },
                    { type: 14, divider: true },
                    { type: 10, content: `<t:${timestamp}:F>` }
                ]
            }]
        };

        return message.reply({ ...infoCard, allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }
};
