const { hasPermissionForCommand } = require('../utils/permissions');
const { resolveMember } = require('../utils/resolvers');

module.exports = {
    name: 'nick',
    async executePrefix(message, args) {
        if (!hasPermissionForCommand(message.member, 'nick')) {
            return message.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande", allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const member = await resolveMember(message, args[0]);
        if (!member) {
            return message.reply({ content: 'Membre non trouv\u00e9', allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const nickname = args.slice(1).join(' ').trim();
        if (!nickname) {
            return message.reply({ content: 'Utilisation : -nick @membre/id <nouveau nom>', allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        if (nickname.length > 32) {
            return message.reply({ content: 'Le pseudo ne peut pas depasser 32 caracteres', allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        if (!member.manageable) {
            return message.reply({ content: "Je n'ai pas la permission de renommer ce membre", allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        try {
            await member.setNickname(nickname, `Nick par ${message.author.tag}`);
        } catch {
            return message.reply({ content: "Je n'ai pas la permission de renommer ce membre", allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        return message.reply({ content: `${member} a \u00e9t\u00e9 renomm\u00e9 en \`${nickname}\``, allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }
};
