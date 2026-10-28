const { data, saveProtected } = require('../utils/state');
const { hasPermissionForCommand } = require('../utils/permissions');
const { yesCard, noCard, permissionCard } = require('../utils/cards');
const { resolveMember } = require('../utils/resolvers');

module.exports = {
    name: 'protect',
    async executePrefix(message, args) {
        if (!hasPermissionForCommand(message.member, 'protect')) {
            return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const member = await resolveMember(message, args[0]);
        if (!member && args[0]) {
            return message.reply({ ...noCard('Membre non trouv\u00e9'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        if (!member) {
            const guildId = String(message.guild.id);
            const list = data.protected[guildId] || [];
            const userList = list.length ? list.map((userId) => `- <@${userId}> (\`${userId}\`)`).join('\n') : 'Aucun';

            const listCard = {
                flags: 32768,
                components: [{
                    type: 17,
                    components: [
                        { type: 10, content: '# Protects' },
                        { type: 14, divider: true },
                        { type: 10, content: '**Membres :**' },
                        { type: 10, content: userList }
                    ]
                }]
            };
            return message.reply({ ...listCard, allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const guildId = String(message.guild.id);
        const userId = String(member.id);
        if (!data.protected[guildId]) {
            data.protected[guildId] = [];
        }

        const wasActive = data.protected[guildId].includes(userId);
        if (wasActive) {
            data.protected[guildId] = data.protected[guildId].filter((id) => String(id) !== userId);
        } else {
            data.protected[guildId].push(userId);
        }

        saveProtected();
        const status = wasActive ? 'plus' : 'maintenant';
        return message.reply({ ...yesCard(`*${member} est ${status} protect*`), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }
};

