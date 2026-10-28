const { data, saveRoles, saveCommandUsers } = require('../utils/state');
const { hasPermissionForCommand } = require('../utils/permissions');
const { noCard } = require('../utils/cards');

const specialOwners = new Map();
const specialPages = new Map();
const BUTTON_TIMEOUT = 180000;
const COMMANDS_PER_PAGE = 23;
const LIST_ITEMS_PER_PAGE = 10;
const NAV_NEXT = '__special_nav_next__';
const NAV_PREV = '__special_nav_prev__';

const EMOJIS = {
  roles: { id: '1457452872240201901', name: 'roles' },
  membres: { id: '1463252956479754496', name: 'membres' },
  add: { id: '1462902411965235427', name: 'add' },
  minus: { id: '1462902378016542924', name: 'moins' }
};

function resolveOptionEmoji(client, emoji, fallback) {
  if (!emoji || !emoji.id) return fallback ? { name: fallback } : undefined;
  const cached = client && client.emojis && client.emojis.cache ? client.emojis.cache.get(String(emoji.id)) : null;
  if (!cached) return fallback ? { name: fallback } : undefined;
  return { id: String(cached.id), name: cached.name || emoji.name };
}

function getAllCommands(client) {
  const names = new Set();
  const excluded = new Set([
    'clearowner',
    'ban',
    'clearsys',
    'clearprotect',
    'config',
    'help',
    'limits',
    'other',
    'owner',
    'special',
    'perms',
    'helpall',
    'protect',
    'clearperms',
    'resetperms',
    'lockall',
    'unlockall',
    'hideall',
    'unhideall',
    'untoall',
    'unmuteall',
    'unbanall',
    'sys'
  ]);

  for (const command of client.commands.values()) {
    if (!(command.executePrefix || command.slashData)) continue;
    if (excluded.has(command.name)) continue;
    names.add(command.name);
  }

  return Array.from(names).sort();
}

function ensureRolesEntry(guildId, commandName) {
  if (!data.roles[guildId]) data.roles[guildId] = {};
  if (!data.roles[guildId][commandName]) data.roles[guildId][commandName] = [];
}

function ensureUsersEntry(guildId, commandName) {
  if (!data.commandUsers[guildId]) data.commandUsers[guildId] = {};
  if (!data.commandUsers[guildId][commandName]) data.commandUsers[guildId][commandName] = [];
}

function getRolesForCommand(guildId, commandName) {
  const guildRoles = data.roles[guildId] || {};
  return Array.isArray(guildRoles[commandName]) ? guildRoles[commandName] : [];
}

function getUsersForCommand(guildId, commandName) {
  const guildUsers = data.commandUsers[guildId] || {};
  return Array.isArray(guildUsers[commandName]) ? guildUsers[commandName] : [];
}

function setRolesForCommand(guildId, commandName, roleIds) {
  const clean = Array.from(new Set((roleIds || []).map((id) => String(id))));
  if (clean.length) {
    ensureRolesEntry(guildId, commandName);
    data.roles[guildId][commandName] = clean;
  } else if (data.roles[guildId]) {
    delete data.roles[guildId][commandName];
    if (!Object.keys(data.roles[guildId]).length) delete data.roles[guildId];
  }
  saveRoles();
}

function setUsersForCommand(guildId, commandName, userIds) {
  const clean = Array.from(new Set((userIds || []).map((id) => String(id))));
  if (clean.length) {
    ensureUsersEntry(guildId, commandName);
    data.commandUsers[guildId][commandName] = clean;
  } else if (data.commandUsers[guildId]) {
    delete data.commandUsers[guildId][commandName];
    if (!Object.keys(data.commandUsers[guildId]).length) delete data.commandUsers[guildId];
  }
  saveCommandUsers();
}

function buildCommandMenuOptions(allCommands, page) {
  const totalPages = Math.max(1, Math.ceil(allCommands.length / COMMANDS_PER_PAGE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const startIndex = safePage * COMMANDS_PER_PAGE;

  const options = allCommands
    .slice(startIndex, startIndex + COMMANDS_PER_PAGE)
    .map((cmd) => ({ label: cmd, value: cmd }));

  if (totalPages > 1 && safePage < totalPages - 1) {
    options.push({ label: 'Page suivante', value: NAV_NEXT });
  }
  if (totalPages > 1 && safePage > 0) {
    options.push({ label: 'Page arri\u00e8re', value: NAV_PREV });
  }

  return {
    options: options.slice(0, 25),
    safePage,
    totalPages
  };
}

function renderRoles(guild, roleIds) {
  if (!roleIds.length) return 'Aucun r\u00f4le';
  const sorted = roleIds
    .map((roleId) => guild.roles.cache.get(String(roleId)))
    .filter(Boolean)
    .sort((a, b) => b.position - a.position)
    .map((role) => `<@&${role.id}>`);
  return sorted.length ? sorted.join(', ') : roleIds.map((id) => `<@&${id}>`).join(', ');
}

function renderUsers(userIds) {
  if (!userIds.length) return 'Aucun membre';
  return userIds.map((id) => `<@${id}>`).join(', ');
}

function generateMainCard(client, guild, listPage = 0, menuPage = 0, disabled = false) {
  const guildId = String(guild.id);
  const allCommands = getAllCommands(client);
  const menu = buildCommandMenuOptions(allCommands, menuPage);
  const totalListPages = Math.max(1, Math.ceil(allCommands.length / LIST_ITEMS_PER_PAGE));
  const safeListPage = Math.min(Math.max(listPage, 0), totalListPages - 1);
  const listStart = safeListPage * LIST_ITEMS_PER_PAGE;
  const commandsForPage = allCommands.slice(listStart, listStart + LIST_ITEMS_PER_PAGE);

  let content = '';
  for (const cmd of commandsForPage) {
    const roles = getRolesForCommand(guildId, cmd);
    const users = getUsersForCommand(guildId, cmd);
    content += `**\`${cmd}\`**\n`;
    content += `R\u00f4les : ${renderRoles(guild, roles)}\n`;
    content += `Membres : ${renderUsers(users)}\n\n`;
  }

  const components = [
    { type: 10, content: `# Permissions des commandes (${safeListPage + 1}/${totalListPages})\n> Configurez les commandes par r\u00f4les ou membres` },
    { type: 14, divider: true },
    { type: 10, content: content || 'Aucune commande disponible' }
  ];

  if (totalListPages > 1) {
    const prevId = disabled ? 'special_list_expired_prev' : `special_list_prev_${safeListPage}_${menu.safePage}`;
    const nextId = disabled ? 'special_list_expired_next' : `special_list_next_${safeListPage}_${menu.safePage}`;
    components.push(
      { type: 14, divider: true },
      {
        type: 1,
        components: [
          { type: 2, custom_id: prevId, style: 2, label: '<', disabled: disabled || safeListPage === 0 },
          { type: 2, custom_id: nextId, style: 2, label: '>', disabled: disabled || safeListPage >= totalListPages - 1 }
        ]
      }
    );
  }

  components.push(
    { type: 14, divider: true },
    {
      type: 1,
      components: [{
        type: 3,
        custom_id: `special_command_${safeListPage}_${menu.safePage}`,
        placeholder: `Choisir une commande (${menu.safePage + 1}/${menu.totalPages})`,
        options: menu.options
      }]
    }
  );

  return {
    card: {
      flags: 32768,
      components: [{
        type: 17,
        components
      }]
    },
    listPage: safeListPage,
    totalListPages,
    menuPage: menu.safePage
  };
}

function buildActionCard(client, commandName, hasRoles, hasUsers) {
  const options = [
    { label: 'Ajouter des r\u00f4les', value: 'add_roles', emoji: resolveOptionEmoji(client, EMOJIS.roles, '\uD83D\uDC65') },
    { label: 'Ajouter des membres', value: 'add_users', emoji: resolveOptionEmoji(client, EMOJIS.membres, '\uD83D\uDC64') }
  ];

  if (hasRoles) options.push({ label: 'Supprimer des r\u00f4les', value: 'remove_roles', emoji: resolveOptionEmoji(client, EMOJIS.minus, '\u2796') });
  if (hasUsers) options.push({ label: 'Supprimer des membres', value: 'remove_users', emoji: resolveOptionEmoji(client, EMOJIS.minus, '\u2796') });

  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 10, content: `# G\u00e9rer la commande : ${commandName}` },
        { type: 14, divider: true },
        { type: 10, content: "> Choisissez le type d'action \u00e0 appliquer" },
        { type: 14, divider: true },
        {
          type: 1,
          components: [{
            type: 3,
            custom_id: `special_action_${commandName}`,
            placeholder: 'Choisir une action',
            min_values: 1,
            max_values: 1,
            options
          }]
        }
      ]
    }]
  };
}

function updateSafe(interaction, payload) {
  return interaction.update({ ...payload, allowedMentions: { parse: [] } });
}

module.exports = {
  name: 'special',
  async executePrefix(message, args, client) {
    if (!hasPermissionForCommand(message.member, 'special')) {
      return message.reply({ ...noCard("Vous n'avez pas la permission d'utiliser cette commande"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    const pageInfo = generateMainCard(client, message.guild, 0, 0, false);
    const reply = await message.reply({ ...pageInfo.card, allowedMentions: { parse: [] }, mentionRepliedUser: false });
    specialOwners.set(reply.id, message.author.id);

    if (pageInfo.totalListPages > 1) {
      specialPages.set(reply.id, {
        userId: message.author.id,
        createdAt: Date.now(),
        currentListPage: pageInfo.listPage,
        currentMenuPage: pageInfo.menuPage
      });

      setTimeout(async () => {
        const pageData = specialPages.get(reply.id);
        if (!pageData) return;

        const expiredInfo = generateMainCard(client, message.guild, pageData.currentListPage, pageData.currentMenuPage, true);
        try {
          await reply.edit({ ...expiredInfo.card, allowedMentions: { parse: [] } });
        } catch {}
        specialPages.delete(reply.id);
      }, BUTTON_TIMEOUT);
    }
    return reply;
  },

  async handleMenu(interaction, client) {
    const ownerId = specialOwners.get(interaction.message.id)
      || interaction.message.interaction?.user?.id
      || interaction.user.id;
    if (ownerId && interaction.user.id !== ownerId) {
      return interaction.reply({ content: "<:non:1519424807580733635> Vous n'\u00eates pas l'auteur de cette commande", flags: 64, allowedMentions: { parse: [] } });
    }
    if (!hasPermissionForCommand(interaction.member, 'special')) {
      return interaction.reply({ content: "<:non:1519424807580733635> Vous n'avez pas la permission", flags: 64, allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    const guildId = String(interaction.guild.id);

    if (interaction.isStringSelectMenu()) {
      const parts = interaction.customId.split('_');
      const type = parts[1];

      if (type === 'command') {
        const currentListPage = parseInt(parts[2] || '0', 10) || 0;
        const currentMenuPage = parseInt(parts[3] || '0', 10) || 0;
        const selectedCommand = interaction.values[0];

        if (selectedCommand === NAV_NEXT || selectedCommand === NAV_PREV) {
          const nextMenuPage = selectedCommand === NAV_NEXT ? currentMenuPage + 1 : currentMenuPage - 1;
          const pageInfo = generateMainCard(client, interaction.guild, currentListPage, nextMenuPage, false);
          const pageData = specialPages.get(interaction.message.id);
          if (pageData) {
            specialPages.set(interaction.message.id, {
              ...pageData,
              currentListPage: pageInfo.listPage,
              currentMenuPage: pageInfo.menuPage
            });
          }
          return updateSafe(interaction, pageInfo.card);
        }

        const assignedRoles = getRolesForCommand(guildId, selectedCommand);
        const assignedUsers = getUsersForCommand(guildId, selectedCommand);
        return updateSafe(interaction, buildActionCard(client, selectedCommand, assignedRoles.length > 0, assignedUsers.length > 0));
      }

      if (type === 'action') {
        const commandName = parts.slice(2).join('_');
        const action = interaction.values[0];

        if (action === 'add_roles') {
          return updateSafe(interaction, {
            flags: 32768,
            components: [{
              type: 17,
              components: [
                { type: 10, content: `# Ajouter des r\u00f4les pour ${commandName}` },
                { type: 14, divider: true },
                { type: 10, content: '> S\u00e9lectionnez les r\u00f4les qui auront acc\u00e8s \u00e0 la commande' },
                { type: 14, divider: true },
                {
                  type: 1,
                  components: [{
                    type: 6,
                    custom_id: `special_addrole_${commandName}`,
                    placeholder: 'S\u00e9lectionner des r\u00f4les',
                    min_values: 1,
                    max_values: 10
                  }]
                }
              ]
            }]
          });
        }

        if (action === 'add_users') {
          return updateSafe(interaction, {
            flags: 32768,
            components: [{
              type: 17,
              components: [
                { type: 10, content: `# Ajouter des membres pour ${commandName}` },
                { type: 14, divider: true },
                { type: 10, content: '> S\u00e9lectionnez les membres qui auront acc\u00e8s \u00e0 la commande' },
                { type: 14, divider: true },
                {
                  type: 1,
                  components: [{
                    type: 5,
                    custom_id: `special_adduser_${commandName}`,
                    placeholder: 'S\u00e9lectionner des membres',
                    min_values: 1,
                    max_values: 10
                  }]
                }
              ]
            }]
          });
        }

        if (action === 'remove_roles') {
          const assignedRoles = getRolesForCommand(guildId, commandName);
          if (!assignedRoles.length) {
            return updateSafe(interaction, { ...noCard('Aucun r\u00f4le \u00e0 supprimer'), components: [] });
          }

          const options = assignedRoles
            .map((roleId) => interaction.guild.roles.cache.get(String(roleId)))
            .filter(Boolean)
            .sort((a, b) => b.position - a.position)
            .map((role) => ({ label: role.name, value: String(role.id), description: `ID : ${role.id}` }))
            .slice(0, 25);

          if (!options.length) {
            return updateSafe(interaction, { ...noCard('Aucun r\u00f4le valide \u00e0 supprimer'), components: [] });
          }

          return updateSafe(interaction, {
            flags: 32768,
            components: [{
              type: 17,
              components: [
                { type: 10, content: `# Supprimer des r\u00f4les pour ${commandName}` },
                { type: 14, divider: true },
                { type: 10, content: '> S\u00e9lectionnez les r\u00f4les \u00e0 retirer de la commande' },
                { type: 14, divider: true },
                {
                  type: 1,
                  components: [{
                    type: 3,
                    custom_id: `special_removerole_${commandName}`,
                    placeholder: 'Choisir des r\u00f4les',
                    min_values: 1,
                    max_values: Math.min(options.length, 25),
                    options
                  }]
                }
              ]
            }]
          });
        }

        if (action === 'remove_users') {
          const assignedUsers = getUsersForCommand(guildId, commandName);
          if (!assignedUsers.length) {
            return updateSafe(interaction, { ...noCard('Aucun membre \u00e0 supprimer'), components: [] });
          }

          const options = [];
          for (const userId of assignedUsers.slice(0, 25)) {
            const member = interaction.guild.members.cache.get(String(userId));
            const label = member ? (member.user.tag || member.displayName || String(userId)) : String(userId);
            options.push({ label: label.slice(0, 100), value: String(userId), description: `ID : ${userId}` });
          }

          if (!options.length) {
            return updateSafe(interaction, { ...noCard('Aucun membre valide \u00e0 supprimer'), components: [] });
          }

          return updateSafe(interaction, {
            flags: 32768,
            components: [{
              type: 17,
              components: [
                { type: 10, content: `# Supprimer des membres pour ${commandName}` },
                { type: 14, divider: true },
                { type: 10, content: '> S\u00e9lectionnez les membres \u00e0 retirer de la commande' },
                { type: 14, divider: true },
                {
                  type: 1,
                  components: [{
                    type: 3,
                    custom_id: `special_removeuser_${commandName}`,
                    placeholder: 'Choisir des membres',
                    min_values: 1,
                    max_values: Math.min(options.length, 25),
                    options
                  }]
                }
              ]
            }]
          });
        }
      }

      if (interaction.customId.startsWith('special_removerole_')) {
        const commandName = interaction.customId.replace('special_removerole_', '');
        const selected = (interaction.values || []).map((id) => String(id));
        if (!selected.length) return updateSafe(interaction, { ...noCard('Aucun r\u00f4le s\u00e9lectionn\u00e9'), components: [] });
        const next = getRolesForCommand(guildId, commandName).filter((id) => !selected.includes(String(id)));
        setRolesForCommand(guildId, commandName, next);

        const pageData = specialPages.get(interaction.message.id);
        const pageInfo = generateMainCard(
          client,
          interaction.guild,
          pageData ? pageData.currentListPage : 0,
          pageData ? pageData.currentMenuPage : 0,
          false
        );
        if (pageData) {
          specialPages.set(interaction.message.id, {
            ...pageData,
            currentListPage: pageInfo.listPage,
            currentMenuPage: pageInfo.menuPage
          });
        }
        return updateSafe(interaction, pageInfo.card);
      }

      if (interaction.customId.startsWith('special_removeuser_')) {
        const commandName = interaction.customId.replace('special_removeuser_', '');
        const selected = (interaction.values || []).map((id) => String(id));
        if (!selected.length) return updateSafe(interaction, { ...noCard('Aucun membre s\u00e9lectionn\u00e9'), components: [] });
        const next = getUsersForCommand(guildId, commandName).filter((id) => !selected.includes(String(id)));
        setUsersForCommand(guildId, commandName, next);

        const pageData = specialPages.get(interaction.message.id);
        const pageInfo = generateMainCard(
          client,
          interaction.guild,
          pageData ? pageData.currentListPage : 0,
          pageData ? pageData.currentMenuPage : 0,
          false
        );
        if (pageData) {
          specialPages.set(interaction.message.id, {
            ...pageData,
            currentListPage: pageInfo.listPage,
            currentMenuPage: pageInfo.menuPage
          });
        }
        return updateSafe(interaction, pageInfo.card);
      }
    }

    if (interaction.isRoleSelectMenu() && interaction.customId.startsWith('special_addrole_')) {
      const commandName = interaction.customId.replace('special_addrole_', '');
      const selected = (interaction.values || []).map((id) => String(id));
      if (!selected.length) return updateSafe(interaction, { ...noCard('Aucun r\u00f4le s\u00e9lectionn\u00e9'), components: [] });
      const next = Array.from(new Set([...getRolesForCommand(guildId, commandName), ...selected]));
      setRolesForCommand(guildId, commandName, next);

      const pageData = specialPages.get(interaction.message.id);
      const pageInfo = generateMainCard(
        client,
        interaction.guild,
        pageData ? pageData.currentListPage : 0,
        pageData ? pageData.currentMenuPage : 0,
        false
      );
      if (pageData) {
        specialPages.set(interaction.message.id, {
          ...pageData,
          currentListPage: pageInfo.listPage,
          currentMenuPage: pageInfo.menuPage
        });
      }
      return updateSafe(interaction, pageInfo.card);
    }

    if (interaction.isUserSelectMenu() && interaction.customId.startsWith('special_adduser_')) {
      const commandName = interaction.customId.replace('special_adduser_', '');
      const selected = (interaction.values || []).map((id) => String(id));
      if (!selected.length) return updateSafe(interaction, { ...noCard('Aucun membre s\u00e9lectionn\u00e9'), components: [] });
      const next = Array.from(new Set([...getUsersForCommand(guildId, commandName), ...selected]));
      setUsersForCommand(guildId, commandName, next);

      const pageData = specialPages.get(interaction.message.id);
      const pageInfo = generateMainCard(
        client,
        interaction.guild,
        pageData ? pageData.currentListPage : 0,
        pageData ? pageData.currentMenuPage : 0,
        false
      );
      if (pageData) {
        specialPages.set(interaction.message.id, {
          ...pageData,
          currentListPage: pageInfo.listPage,
          currentMenuPage: pageInfo.menuPage
        });
      }
      return updateSafe(interaction, pageInfo.card);
    }
  }
};

module.exports.handleButton = async (interaction, client) => {
  if (!interaction.isButton()) return;

  const parts = interaction.customId.split('_');
  if (parts[0] !== 'special' || parts[1] !== 'list') return;

  if (parts[2] === 'expired') {
    await interaction.reply({
      content: 'Ces boutons ont expir\u00e9 apr\u00e8s 3 minutes. Utilise la commande \u00e0 nouveau',
      flags: 64,
      allowedMentions: { parse: [] }
    });
    return;
  }

  const ownerId = specialOwners.get(interaction.message.id)
    || interaction.message.interaction?.user?.id
    || interaction.user.id;
  if (!ownerId || interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "<:non:1519424807580733635> Vous n'\u00eates pas l'auteur de cette commande",
      flags: 64,
      allowedMentions: { parse: [] }
    });
    return;
  }

  const pageData = specialPages.get(interaction.message.id);
  if (!pageData) {
    await interaction.reply({
      content: 'Ces boutons ont expir\u00e9 apr\u00e8s 3 minutes. Utilise la commande \u00e0 nouveau',
      flags: 64,
      allowedMentions: { parse: [] }
    });
    return;
  }

  const now = Date.now();
  if (now - pageData.createdAt > BUTTON_TIMEOUT) {
    const expiredInfo = generateMainCard(client, interaction.guild, pageData.currentListPage, pageData.currentMenuPage, true);
    try {
      await interaction.update({ ...expiredInfo.card, allowedMentions: { parse: [] } });
    } catch {
      await interaction.reply({
        content: 'Ces boutons ont expir\u00e9 apr\u00e8s 3 minutes. Utilise la commande \u00e0 nouveau',
        flags: 64,
        allowedMentions: { parse: [] }
      });
    }
    specialPages.delete(interaction.message.id);
    return;
  }

  const direction = parts[2];
  const currentListPage = parseInt(parts[3] || String(pageData.currentListPage), 10) || 0;
  const currentMenuPage = parseInt(parts[4] || String(pageData.currentMenuPage), 10) || 0;
  let newListPage = currentListPage;
  if (direction === 'next') newListPage += 1;
  if (direction === 'prev') newListPage -= 1;

  const nextInfo = generateMainCard(client, interaction.guild, newListPage, currentMenuPage, false);
  specialPages.set(interaction.message.id, {
    ...pageData,
    currentListPage: nextInfo.listPage,
    currentMenuPage: nextInfo.menuPage
  });

  await interaction.update({ ...nextInfo.card, allowedMentions: { parse: [] } });
};
