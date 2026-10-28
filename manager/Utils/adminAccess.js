const config = require('../config.json');
const Discord = require('discord.js');
const buildPanel = require('./buildPanel');

const ADMIN_ROLE_ID = '1505533894416404521';

function getAllowedRole(context) {
  if (!context?.guild) return null;
  return context.guild.roles.cache.get(ADMIN_ROLE_ID) || null;
}

function getUserId(context) {
  return context?.author?.id || context?.user?.id || null;
}

function hasAdminAccess(context) {
  const userId = getUserId(context);
  if (!userId) return false;

  if (Array.isArray(config.owners) && config.owners.includes(userId)) {
    return true;
  }

  const allowedRole = getAllowedRole(context);
  if (!allowedRole) return false;

  return Boolean(context?.member?.roles?.cache?.has(allowedRole.id));
}

function buildAccessError(message, title = '# <:croix:1505270277796397146> Accès refusé', description = '> *Vous n’êtes pas autorisé à utiliser cette commande*') {
  const allowedRole = getAllowedRole(message);
  const roleText = allowedRole ? `<@&${allowedRole.id}>` : `<@&${ADMIN_ROLE_ID}>`;

  return {
    components: [
      buildPanel(title, [description.replace('{role}', roleText)]),
    ],
    allowedMentions: { parse: [] },
    flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
  };
}

module.exports = {
  ADMIN_ROLE_ID,
  buildAccessError,
  getAllowedRole,
  hasAdminAccess,
};
