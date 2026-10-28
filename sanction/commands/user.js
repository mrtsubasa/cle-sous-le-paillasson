const { noCard, permissionCard } = require('../utils/cards');
const { hasPermissionForCommand } = require('../utils/permissions');
const { resolveMember } = require('../utils/resolvers');

module.exports = {
  name: 'user',
  async executePrefix(message, args) {
    if (!hasPermissionForCommand(message.member, 'user')) {
      return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    const member = await resolveMember(message, args[0]);
    if (!member) {
      return message.reply({ ...noCard('Membre non trouv\u00e9'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    const createdTs = Math.floor(member.user.createdTimestamp / 1000);
    const joinedTs = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
    const joinedText = joinedTs ? `<t:${joinedTs}:R>` : 'Inconnu';

    const card = {
      flags: 32768,
      components: [{
        type: 17,
        components: [
          { type: 10, content: `# Infos de ${member}` },
          { type: 14, divider: true },
          {
            type: 10,
            content: `> **Nom d'utilisateur :** ${member.user.tag}\n> **Identifiant :** ${member.user.id}\n> **Date de cr\u00e9ation du compte :** <t:${createdTs}:D>\n> **Rejoint le serveur :** ${joinedText}`
          },
          { type: 14, divider: true }
        ]
      }]
    };

    return message.reply({ ...card, allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }
};
