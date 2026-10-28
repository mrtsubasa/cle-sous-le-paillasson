const { noCard, permissionCard } = require('../utils/cards');
const { hasPermissionForCommand, isBotOwner, isSystem } = require('../utils/permissions');
const { PERM_LEVELS, EXPT_BUCKET, getAssignableCommands, getGuildPermCommands, moveCommandsToPerm } = require('../utils/permGroups');

const helpallOwners = new Map();
const pendingCommandSelections = new Map();
const COMMANDS_PER_PAGE = 23;
const NAV_NEXT = '__helpall_nav_next__';
const NAV_PREV = '__helpall_nav_prev__';

function formatCommands(commands) {
  if (!commands.length) return 'Aucune commande';
  return commands.map((name) => `\`${name}\``).join(', ');
}

function buildCommandOptions(allCommands, page) {
  const totalPages = Math.max(1, Math.ceil(allCommands.length / COMMANDS_PER_PAGE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const start = safePage * COMMANDS_PER_PAGE;

  const options = allCommands.slice(start, start + COMMANDS_PER_PAGE).map((name) => ({
    label: name,
    value: name
  }));

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

function buildMainCard(permCommands, showMenus, commandPage = 0) {
  const allCommands = getAssignableCommands();
  const commandMenu = buildCommandOptions(allCommands, commandPage);
  const components = [
    { type: 10, content: '# Permissions\n> Configurez diff\u00e9rents groupes de permissions en leur attribuant des commandes' },
    { type: 14, divider: true }
  ];

  for (const level of PERM_LEVELS) {
    const commands = permCommands[String(level)] || [];
    components.push({ type: 10, content: `> **Perm ${level}**\n> ${formatCommands(commands)}` });
  }
  components.push({ type: 10, content: `> **Expt**\n> ${formatCommands(permCommands[EXPT_BUCKET] || [])}` });

  if (showMenus) {
    components.push(
      { type: 14, divider: true },
      {
        type: 1,
        components: [{
          type: 3,
          custom_id: `helpall_commands_${commandMenu.safePage}`,
          placeholder: `Choisir les commandes (${commandMenu.safePage + 1}/${commandMenu.totalPages})`,
          options: commandMenu.options,
          min_values: 1,
          max_values: Math.min(commandMenu.options.length, 25)
        }]
      }
    );
  }

  return {
    card: {
      flags: 32768,
      components: [{
        type: 17,
        components
      }]
    },
    commandPage: commandMenu.safePage
  };
}

function buildPermPickCard(commands) {
  const rendered = commands.map((name) => `\`${name}\``).join(', ');
  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 10, content: '# Permissions\n> Choisissez dans quelle permission d\u00e9placer les commandes s\u00e9lectionn\u00e9es' },
        { type: 14, divider: true },
        { type: 10, content: `> Commandes s\u00e9lectionn\u00e9es\n> ${rendered || 'Aucune commande'}` },
        { type: 14, divider: true },
        {
          type: 1,
          components: [{
            type: 3,
            custom_id: 'helpall_pickperm',
            placeholder: 'Choisir une permission',
            min_values: 1,
            max_values: 1,
            options: [
              ...PERM_LEVELS.map((level) => ({
                label: `Perm ${level}`,
                value: String(level)
              })),
              {
                label: 'Expt',
                value: EXPT_BUCKET
              }
            ]
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
  name: 'helpall',
  async executePrefix(message) {
    if (!hasPermissionForCommand(message.member, 'helpall')) {
      return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    const guildId = String(message.guild.id);
    const permCommands = getGuildPermCommands(guildId, true);
    const showMenus = isBotOwner(message.author.id) || isSystem(guildId, message.author.id, message.member);
    const pageInfo = buildMainCard(permCommands, showMenus, 0);
    const reply = await message.reply({ ...pageInfo.card, allowedMentions: { parse: [] }, mentionRepliedUser: false });
    helpallOwners.set(reply.id, message.author.id);
    return reply;
  },

  async handleMenu(interaction) {
    const ownerId = helpallOwners.get(interaction.message.id)
      || interaction.message.interaction?.user?.id
      || interaction.user.id;
    if (ownerId && interaction.user.id !== ownerId) {
      return interaction.reply({ content: "<:non:1519424807580733635> Vous n'\u00eates pas l'auteur de cette commande", flags: 64, allowedMentions: { parse: [] } });
    }

    const isPrivilegedEditor = isBotOwner(interaction.user.id) || isSystem(interaction.guild.id, interaction.user.id, interaction.member);
    if (!isPrivilegedEditor) {
      return interaction.reply({ content: "<:non:1519424807580733635> Seuls les buyers ou les sys peuvent utiliser le menu de cette commande", flags: 64, allowedMentions: { parse: [] } });
    }

    if (!hasPermissionForCommand(interaction.member, 'helpall')) {
      return interaction.reply({ ...noCard("Vous n'avez pas la permission d'utiliser cette commande"), flags: 64, allowedMentions: { parse: [] } });
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('helpall_commands_')) {
      const commandPage = parseInt(interaction.customId.split('_')[2] || '0', 10) || 0;
      const selected = interaction.values || [];

      if (selected.includes(NAV_NEXT)) {
        const guildId = String(interaction.guild.id);
        const permCommands = getGuildPermCommands(guildId, true);
        const pageInfo = buildMainCard(permCommands, true, commandPage + 1);
        return updateSafe(interaction, pageInfo.card);
      }

      if (selected.includes(NAV_PREV)) {
        const guildId = String(interaction.guild.id);
        const permCommands = getGuildPermCommands(guildId, true);
        const pageInfo = buildMainCard(permCommands, true, commandPage - 1);
        return updateSafe(interaction, pageInfo.card);
      }

      const commands = selected.map((name) => String(name || '').trim().toLowerCase()).filter(Boolean);
      if (!commands.length) {
        return updateSafe(interaction, { ...noCard('Aucune commande s\u00e9lectionn\u00e9e'), components: [] });
      }

      pendingCommandSelections.set(interaction.message.id, {
        userId: interaction.user.id,
        commands,
        commandPage
      });

      return updateSafe(interaction, buildPermPickCard(commands));
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'helpall_pickperm') {
      const pending = pendingCommandSelections.get(interaction.message.id);
      if (!pending || pending.userId !== interaction.user.id) {
        return updateSafe(interaction, { ...noCard('S\u00e9lection expir\u00e9e, relance la commande'), components: [] });
      }

      const selectedTarget = String(interaction.values[0] || '').trim().toLowerCase();
      const targetPerm = selectedTarget === EXPT_BUCKET ? EXPT_BUCKET : parseInt(selectedTarget, 10);
      const guildId = String(interaction.guild.id);
      const nextCommands = moveCommandsToPerm(guildId, pending.commands, targetPerm);
      const pageInfo = buildMainCard(nextCommands, true, pending.commandPage);
      pendingCommandSelections.delete(interaction.message.id);
      return updateSafe(interaction, pageInfo.card);
    }
  }
};
