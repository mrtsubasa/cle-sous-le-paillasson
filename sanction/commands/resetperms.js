const { data, savePermCommands } = require('../utils/state');
const { isBotOwner } = require('../utils/permissions');
const { yesCard, noCard } = require('../utils/cards');
const { PERM_LEVELS, EXPT_BUCKET } = require('../utils/permGroups');

function buildDefaultPermCommands() {
  const out = {};
  for (const level of PERM_LEVELS) {
    out[String(level)] = [];
  }
  out['9'] = [];
  out[EXPT_BUCKET] = [];
  return out;
}

module.exports = {
  name: 'resetperms',
  async executePrefix(message) {
    if (!isBotOwner(message.author.id)) {
      return message.reply({
        ...noCard('Seuls les buyers peuvent utiliser cette commande'),
        allowedMentions: { parse: [] },
        mentionRepliedUser: false
      });
    }

    const guildId = String(message.guild.id);
    const defaults = buildDefaultPermCommands();
    data.permCommands[guildId] = defaults;
    savePermCommands();

    return message.reply({
      ...yesCard(`Les permissions de \`helpall\` ont \u00e9t\u00e9 r\u00e9initialis\u00e9es`),
      allowedMentions: { parse: [] },
      mentionRepliedUser: false
    });
  }
};
