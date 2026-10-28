const { PermissionFlagsBits } = require('discord.js');
const { noCard, permissionCard } = require('../utils/cards');
const { hasPermissionForCommand } = require('../utils/permissions');

const ADMIN_PAGES = new Map();
const BUTTON_TIMEOUT = 180000;
const ITEMS_PER_PAGE = 10;

async function fetchMembersSafe(guild) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const members = await guild.members.fetch().catch(() => null);
    if (members) return members;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (guild.members && guild.members.cache && guild.members.cache.size > 0) {
    return guild.members.cache;
  }

  return null;
}

function buildAdminsCard(entries, page, disabled) {
  const total = entries.length;
  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const start = safePage * ITEMS_PER_PAGE;
  const list = entries.slice(start, start + ITEMS_PER_PAGE).join('\n') || 'Aucun membre';

  const components = [
    { type: 10, content: `# Membres Admin (${total})\n> Voici tous les membres membres ayant la permission administrateur sur le serveur,\n> page (${safePage + 1}/${totalPages})` },
    { type: 14 },
    { type: 10, content: list }
  ];

  if (totalPages > 1) {
    const prevId = disabled ? 'alladmins_expired_prev' : `alladmins_prev_${safePage}`;
    const nextId = disabled ? 'alladmins_expired_next' : `alladmins_next_${safePage}`;
    components.push(
      { type: 14 },
      {
        type: 1,
        components: [
          {
            type: 2,
            custom_id: prevId,
            style: 2,
            label: '<',
            disabled: disabled || safePage === 0
          },
          {
            type: 2,
            custom_id: nextId,
            style: 2,
            label: '>',
            disabled: disabled || safePage >= totalPages - 1
          }
        ]
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
    page: safePage,
    totalPages
  };
}

module.exports = {
  name: 'alladmins',
  async executePrefix(message) {
    if (!hasPermissionForCommand(message.member, 'alladmins')) {
      return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    const members = await fetchMembersSafe(message.guild);
    if (!members) {
      return message.reply({ ...noCard('Impossible de r\u00e9cup\u00e9rer les membres'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    const entries = members
      .filter((member) => member.permissions.has(PermissionFlagsBits.Administrator))
      .map((member) => `<@${member.id}>`);

    const pageInfo = buildAdminsCard(entries, 0, false);
    const reply = await message.reply({ ...pageInfo.card, allowedMentions: { parse: [] }, mentionRepliedUser: false });

    if (pageInfo.totalPages > 1) {
      ADMIN_PAGES.set(reply.id, {
        userId: message.author.id,
        currentPage: pageInfo.page,
        createdAt: Date.now(),
        entries
      });

      setTimeout(async () => {
        const pageData = ADMIN_PAGES.get(reply.id);
        if (!pageData) return;

        const expiredInfo = buildAdminsCard(pageData.entries, pageData.currentPage, true);
        try {
          await reply.edit({ ...expiredInfo.card, allowedMentions: { parse: [] } });
        } catch {}
        ADMIN_PAGES.delete(reply.id);
      }, BUTTON_TIMEOUT);
    }
  }
};

module.exports.handleButton = async (interaction) => {
  if (!interaction.isButton()) return;
  const parts = interaction.customId.split('_');
  if (parts[0] !== 'alladmins') return;

  if (parts[1] === 'expired') {
    await interaction.reply({
      content: 'Ces boutons ont expir\u00e9 apr\u00e8s 3 minutes. Utilise la commande \u00e0 nouveau',
      flags: 64,
      allowedMentions: { parse: [] }
    });
    return;
  }

  const pageData = ADMIN_PAGES.get(interaction.message.id);
  if (!pageData || pageData.userId !== interaction.user.id) {
    await interaction.reply({
      content: "<:non:1519424807580733635> Vous n'\u00eates pas l'auteur de cette commande",
      flags: 64,
      allowedMentions: { parse: [] }
    });
    return;
  }

  const now = Date.now();
  if (now - pageData.createdAt > BUTTON_TIMEOUT) {
    const expiredInfo = buildAdminsCard(pageData.entries, pageData.currentPage, true);
    try {
      await interaction.update({ ...expiredInfo.card, allowedMentions: { parse: [] } });
    } catch {
      await interaction.reply({
        content: 'Ces boutons ont expir\u00e9 apr\u00e8s 3 minutes. Utilise la commande \u00e0 nouveau',
        flags: 64,
        allowedMentions: { parse: [] }
      });
    }
    ADMIN_PAGES.delete(interaction.message.id);
    return;
  }

  let newPage = parseInt(parts[2] || '0', 10);
  if (parts[1] === 'next') newPage += 1;
  if (parts[1] === 'prev') newPage -= 1;

  const pageInfo = buildAdminsCard(pageData.entries, newPage, false);
  ADMIN_PAGES.set(interaction.message.id, {
    userId: pageData.userId,
    currentPage: pageInfo.page,
    createdAt: pageData.createdAt,
    entries: pageData.entries
  });

  await interaction.update({ ...pageInfo.card, allowedMentions: { parse: [] } });
};
