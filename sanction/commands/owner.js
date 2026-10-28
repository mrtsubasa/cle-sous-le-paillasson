const { data, saveOwners } = require('../utils/state');
const { hasPermissionForCommand } = require('../utils/permissions');
const { yesCard, noCard, permissionCard } = require('../utils/cards');
const { resolveMember, resolveRole } = require('../utils/resolvers');

function getOwnerEntries(guildId) {
    const raw = data.owners[guildId];
    if (Array.isArray(raw)) {
        return Array.from(new Set(raw.map((entry) => String(entry))));
    }

    if (raw && typeof raw === 'object') {
        const users = Array.isArray(raw.users) ? raw.users.map((id) => String(id)) : [];
        const roles = Array.isArray(raw.roles) ? raw.roles.map((id) => `role:${String(id)}`) : [];
        return Array.from(new Set([...users, ...roles]));
    }

    return [];
}

function splitOwnerEntries(entries) {
    const users = [];
    const roles = [];

    for (const entry of entries) {
        if (entry.startsWith('role:')) {
            const roleId = entry.slice(5).trim();
            if (roleId) roles.push(roleId);
            continue;
        }
        users.push(entry);
    }

    return { users, roles };
}

async function resolveTarget(message, input) {
    const member = await resolveMember(message, input);
    if (member) {
        return {
            key: String(member.id),
            mention: `<@${member.id}>`,
            type: 'member',
            id: String(member.id)
        };
    }

    const role = await resolveRole(message, input);
    if (role) {
        return {
            key: `role:${role.id}`,
            mention: `<@&${role.id}>`,
            type: 'r\u00f4le',
            id: String(role.id)
        };
    }

    return null;
}

module.exports = {
    name: 'owner',
    async executePrefix(message, args) {
        if (!hasPermissionForCommand(message.member, 'owner')) {
            return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const input = args[0];
        const target = input ? await resolveTarget(message, input) : null;
        if (!target && input) {
            return message.reply({ ...noCard('Membre ou r\u00f4le non trouv\u00e9'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const guildId = String(message.guild.id);

        if (!target) {
            const ownersList = getOwnerEntries(guildId);
            const { users, roles } = splitOwnerEntries(ownersList);
            const userList = users.length ? users.map((userId) => `- <@${userId}> (\`${userId}\`)`).join('\n') : 'Aucun';
            const roleList = roles.length ? roles.map((roleId) => `- <@&${roleId}> (\`${roleId}\`)`).join('\n') : 'Aucun';

            const listCard = {
                flags: 32768,
                components: [{
                    type: 17,
                    components: [
                        { type: 10, content: '# Owners' },
                        { type: 14, divider: true },
                        { type: 10, content: '**Membres :**' },
                        { type: 10, content: userList },
                        { type: 14, divider: false },
                        { type: 10, content: '**R\u00f4les :**' },
                        { type: 10, content: roleList }
                    ]
                }]
            };
            return message.reply({ ...listCard, allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        if (target.type === 'member' && target.id === String(message.client.user.id)) {
            return message.reply({ ...noCard('Le bot est d\u00e9j\u00e0 administrateur'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const entries = getOwnerEntries(guildId);
        const wasActive = entries.includes(target.key);
        const nextEntries = wasActive ? entries.filter((entry) => entry !== target.key) : [...entries, target.key];

        data.owners[guildId] = nextEntries;
        saveOwners();

        const status = wasActive ? 'n\'est plus' : 'est maintenant';
        return message.reply({ ...yesCard(`*${target.mention} ${status} owner*`), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }
};


