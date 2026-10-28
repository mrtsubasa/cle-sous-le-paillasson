const { noCard, permissionCard } = require('../utils/cards');
const { hasPermissionForCommand, isBotOwner, isSystem } = require('../utils/permissions');
const { PERM_LEVELS, getGuildPermRoles, moveRolesToPerm, removeRolesFromPerm } = require('../utils/permGroups');

const permsOwners = new Map();

function formatRolesForPerm(guild, roleIds) {
  const sorted = roleIds
    .map((roleId) => guild.roles.cache.get(String(roleId)))
    .filter(Boolean)
    .sort((a, b) => b.position - a.position)
    .map((role) => `<@&${role.id}>`);

  if (sorted.length) return sorted.join(', ');
  if (roleIds.length) return roleIds.map((roleId) => `<@&${roleId}>`).join(', ');
  return 'Aucun r\u00f4le';
}

function buildMainCard(guild, permRoles, showMenus) {
  const components = [
    { type: 10, content: '# Permissions\n> Configurez diff\u00e9rents groupes de permissions en leur attribuant des r\u00f4les' },
    { type: 14, divider: true }
  ];

  for (const level of PERM_LEVELS) {
    const roles = formatRolesForPerm(guild, permRoles[String(level)] || []);
    components.push({ type: 10, content: `> **Perm ${level}**\n> ${roles}` });
  }

  if (showMenus) {
    components.push(
      { type: 14, divider: true },
      {
        type: 1,
        components: [{
          type: 3,
          custom_id: 'perms_perm_select',
          placeholder: 'Choisir une permission',
          min_values: 1,
          max_values: 1,
          options: PERM_LEVELS.map((level) => ({
            label: `Perm ${level}`,
            value: String(level)
          }))
        }]
      }
    );
  }

  return {
    flags: 32768,
    components: [{
      type: 17,
      components
    }]
  };
}

function buildActionCard(guild, permRoles, level) {
  const roles = permRoles[String(level)] || [];
  const rendered = formatRolesForPerm(guild, roles);

  const actionOptions = [
    { label: 'Ajouter des r\u00f4les', value: 'add' },
    { label: 'Retour', value: 'back' }
  ];
  if (roles.length) {
    actionOptions.splice(1, 0, { label: 'Supprimer des r\u00f4les', value: 'remove' });
  }

  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 10, content: `# Perm ${level}\n> Choisissez une action pour cette permission` },
        { type: 14, divider: true },
        { type: 10, content: `> **R\u00f4les actuels**\n> ${rendered}` },
        { type: 14, divider: true },
        {
          type: 1,
          components: [{
            type: 3,
            custom_id: `perms_perm_action_${level}`,
            placeholder: 'Choisir une action',
            min_values: 1,
            max_values: 1,
            options: actionOptions
          }]
        }
      ]
    }]
  };
}

function buildAddRolesCard(level) {
  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 10, content: `# Perm ${level}\n> S\u00e9lectionnez les r\u00f4les \u00e0 ajouter dans cette permission` },
        { type: 14, divider: true },
        {
          type: 1,
          components: [{
            type: 6,
            custom_id: `perms_perm_addroles_${level}`,
            placeholder: 'S\u00e9lectionner un ou plusieurs r\u00f4les',
            min_values: 1,
            max_values: 10
          }]
        }
      ]
    }]
  };
}

function buildRemoveRolesCard(guild, level, roleIds) {
  const options = roleIds
    .map((roleId) => guild.roles.cache.get(String(roleId)))
    .filter(Boolean)
    .sort((a, b) => b.position - a.position)
    .map((role) => ({
      label: role.name,
      value: String(role.id),
      description: `ID : ${role.id}`
    }));

  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 10, content: `# Perm ${level}\n> S\u00e9lectionnez les r\u00f4les \u00e0 supprimer de cette permission` },
        { type: 14, divider: true },
        {
          type: 1,
          components: [{
            type: 3,
            custom_id: `perms_perm_removeroles_${level}`,
            placeholder: 'Choisir un ou plusieurs r\u00f4les',
            min_values: 1,
            max_values: Math.min(options.length, 25),
            options: options.slice(0, 25)
          }]
        }
      ]
    }]
  };
}

function updateSafe(interaction, payload) {
  return interaction.update({ ...payload, allowedMentions: { parse: [] } });
}

function getPanelOwnerId(interaction, ownersMap) {
  const storedOwnerId = ownersMap.get(interaction.message?.id);
  if (storedOwnerId) return storedOwnerId;

  const sourceOwnerId = interaction.message?.interaction?.user?.id;
  if (sourceOwnerId) return sourceOwnerId;

  return interaction.user?.id || null;
}

module.exports = {
  name: 'perms',
  async executePrefix(message) {
    if (!hasPermissionForCommand(message.member, 'perms')) {
      return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    const guildId = String(message.guild.id);
    const permRoles = getGuildPermRoles(guildId, true);
    const showMenus = isBotOwner(message.author.id) || isSystem(guildId, message.author.id, message.member);
    const card = buildMainCard(message.guild, permRoles, showMenus);
    const reply = await message.reply({ ...card, allowedMentions: { parse: [] }, mentionRepliedUser: false });
    permsOwners.set(reply.id, message.author.id);
    return reply;
  },

  async handleMenu(interaction) {
    const ownerId = getPanelOwnerId(interaction, permsOwners);
    if (ownerId && interaction.user.id !== ownerId) {
      return interaction.reply({ content: "<:non:1519424807580733635> Vous n'\u00eates pas l'auteur de cette commande", flags: 64, allowedMentions: { parse: [] } });
    }

    const isPrivilegedEditor = isBotOwner(interaction.user.id) || isSystem(interaction.guild.id, interaction.user.id, interaction.member);
    if (!isPrivilegedEditor) {
      return interaction.reply({ content: "<:non:1519424807580733635> Seuls les buyers ou les sys peuvent utiliser le menu de cette commande", flags: 64, allowedMentions: { parse: [] } });
    }

    if (!hasPermissionForCommand(interaction.member, 'perms')) {
      return interaction.reply({ ...noCard("Vous n'avez pas la permission d'utiliser cette commande"), flags: 64, allowedMentions: { parse: [] } });
    }

    const guildId = String(interaction.guild.id);
    const permRoles = getGuildPermRoles(guildId, true);

    if (interaction.isStringSelectMenu() && interaction.customId === 'perms_perm_select') {
      const level = parseInt(interaction.values[0], 10);
      return updateSafe(interaction, buildActionCard(interaction.guild, permRoles, level));
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('perms_perm_action_')) {
      const level = parseInt(interaction.customId.split('_')[3] || '9', 10);
      const action = String(interaction.values[0] || '');

      if (action === 'back') {
        return updateSafe(interaction, buildMainCard(interaction.guild, permRoles, true));
      }

      if (action === 'add') {
        return updateSafe(interaction, buildAddRolesCard(level));
      }

      if (action === 'remove') {
        const roles = permRoles[String(level)] || [];
        if (!roles.length) {
          return updateSafe(interaction, buildActionCard(interaction.guild, permRoles, level));
        }

        return updateSafe(interaction, buildRemoveRolesCard(interaction.guild, level, roles));
      }
    }

    if (interaction.isRoleSelectMenu() && interaction.customId.startsWith('perms_perm_addroles_')) {
      const level = parseInt(interaction.customId.split('_')[3] || '9', 10);
      const roleIds = (interaction.values || []).map((id) => String(id));
      if (!roleIds.length) {
        return updateSafe(interaction, { ...noCard('Aucun r\u00f4le s\u00e9lectionn\u00e9'), components: [] });
      }

      const nextRoles = moveRolesToPerm(guildId, roleIds, level);
      return updateSafe(interaction, buildMainCard(interaction.guild, nextRoles, true));
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('perms_perm_removeroles_')) {
      const level = parseInt(interaction.customId.split('_')[3] || '9', 10);
      const roleIds = (interaction.values || []).map((id) => String(id));
      if (!roleIds.length) {
        return updateSafe(interaction, { ...noCard('Aucun r\u00f4le s\u00e9lectionn\u00e9'), components: [] });
      }

      const nextRoles = removeRolesFromPerm(guildId, roleIds, level);
      return updateSafe(interaction, buildMainCard(interaction.guild, nextRoles, true));
    }
  }
};
