const { data, saveRoles, saveCommandUsers, savePermRoles } = require('../utils/state');
const { hasPermissionForCommand } = require('../utils/permissions');
const { yesCard, noCard, permissionCard } = require('../utils/cards');

module.exports = {
  name: 'clearperms',
  async executePrefix(message) {
    if (!hasPermissionForCommand(message.member, 'clearperms')) {
      return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    const guildId = String(message.guild.id);
    const roleCommandsCount = data.roles[guildId] ? Object.keys(data.roles[guildId]).length : 0;
    const userCommandsCount = data.commandUsers[guildId] ? Object.keys(data.commandUsers[guildId]).length : 0;
    const permRolesCount = data.permRoles[guildId]
      ? Object.values(data.permRoles[guildId]).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0)
      : 0;
    const total = roleCommandsCount + userCommandsCount + permRolesCount;

    if (total === 0) {
      return message.reply({ ...noCard("Aucune permission personnalis\u00e9e n'est enregistr\u00e9e pour ce serveur"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    if (data.roles[guildId]) delete data.roles[guildId];
    if (data.commandUsers[guildId]) delete data.commandUsers[guildId];
    if (data.permRoles[guildId]) delete data.permRoles[guildId];
    saveRoles();
    saveCommandUsers();
    savePermRoles();

    return message.reply({
      ...yesCard(`Toutes les permissions (**${total}** commandes) ont \u00e9t\u00e9 r\u00e9initialis\u00e9es pour ce serveur`),
      allowedMentions: { parse: [] },
      mentionRepliedUser: false
    });
  }
};
