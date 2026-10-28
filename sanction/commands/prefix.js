const { isBotOwner } = require('../utils/permissions');
const { yesCard, noCard, permissionCard } = require('../utils/cards');
const { getSanctionRuntimeConfigPath } = require('../utils/runtimeConfig');
const { readJsonConfig, writeJsonConfig } = require('../../../Utils/tokenVault');

module.exports = {
  name: 'prefix',

  async executePrefix(message, args) {
    if (!isBotOwner(message.author.id)) {
      return message.reply({
        ...permissionCard(),
        allowedMentions: { parse: [] },
        mentionRepliedUser: false,
      });
    }

    const configPath = getSanctionRuntimeConfigPath();
    const config = readJsonConfig(configPath, { migrateToken: false }) || {};
    const currentPrefix = String(config.prefix);
    const nextPrefix = String(args[0] || '').trim();

    if (!nextPrefix) {
      return message.reply({
        ...noCard(`Utilisation : ${currentPrefix}prefix <nouveau_prefixe>`),
        allowedMentions: { parse: [] },
        mentionRepliedUser: false,
      });
    }

    if (/\s/.test(nextPrefix) || nextPrefix.length > 5) {
      return message.reply({
        ...noCard('Le préfixe doit contenir entre 1 et 5 caractères, sans espace'),
        allowedMentions: { parse: [] },
        mentionRepliedUser: false,
      });
    }

    if (nextPrefix === currentPrefix) {
      return message.reply({
        ...noCard(`Le préfixe est déjà \`${nextPrefix}\``),
        allowedMentions: { parse: [] },
        mentionRepliedUser: false,
      });
    }

    config.prefix = nextPrefix;
    writeJsonConfig(configPath, config);

    return message.reply({
      ...yesCard(`Préfixe modifié : \`${currentPrefix}\` → \`${nextPrefix}\``),
      allowedMentions: { parse: [] },
      mentionRepliedUser: false,
    });
  },
};
