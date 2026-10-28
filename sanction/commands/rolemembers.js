const { noCard, permissionCard } = require('../utils/cards');
const { hasPermissionForCommand } = require('../utils/permissions');
const { resolveRole } = require('../utils/resolvers');

const ROLE_MEMBERS_PAGES = new Map();
const BUTTON_TIMEOUT = 180000;
const ITEMS_PER_PAGE = 10;

function buildRoleMembersCard({ roleMention, entries, page, disabled }) {
  const totalMembers = entries.length;
  const totalPages = Math.max(1, Math.ceil(entries.length / ITEMS_PER_PAGE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const start = safePage * ITEMS_PER_PAGE;
  const list = entries.slice(start, start + ITEMS_PER_PAGE).join('\n') || 'Aucun membre';

  const components = [
    { type: 10, content: `# Membres avec ${roleMention} (${totalMembers})\n> Voici tous les membres ayant ce r\u00f4le dans le serveur, page (${safePage + 1}/${totalPages})` },
    { type: 14 },
    { type: 10, content: list }
  ];

  if (totalPages > 1) {
    const prevId = disabled ? 'rolemembers_expired_prev' : `rolemembers_prev_${safePage}`;
    const nextId = disabled ? 'rolemembers_expired_next' : `rolemembers_next_${safePage}`;
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
      components: [
        {
          type: 17,
          components
        }
      ]
    },
    page: safePage,
    totalPages
  };
}

async function getRoleMemberEntries(guild, role) {
  await guild.members.fetch().catch(() => null);
  return role.members.map((member) => `<@${member.id}>`);
}

module.exports = {
  name: 'rolemembers',
  async executePrefix(message, args) {
    if (!hasPermissionForCommand(message.member, 'rolemembers')) {
      return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    const role = await resolveRole(message, args[0]);
    if (!role) {
      return message.reply({ ...noCard('Utilisation : -rolemembers @role/id'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    const entries = await getRoleMemberEntries(message.guild, role);
    const pageInfo = buildRoleMembersCard({
      roleMention: `<@&${role.id}>`,
      entries,
      page: 0,
      disabled: false
    });

    const reply = await message.reply({ ...pageInfo.card, allowedMentions: { parse: [] }, mentionRepliedUser: false });

    if (pageInfo.totalPages > 1) {
      ROLE_MEMBERS_PAGES.set(reply.id, {
        userId: message.author.id,
        currentPage: pageInfo.page,
        createdAt: Date.now(),
        roleMention: `<@&${role.id}>`,
        entries
      });

      setTimeout(async () => {
        const pageData = ROLE_MEMBERS_PAGES.get(reply.id);
        if (!pageData) return;

        const expiredInfo = buildRoleMembersCard({
          roleMention: pageData.roleMention,
          entries: pageData.entries,
          page: pageData.currentPage,
          disabled: true
        });

        try {
          await reply.edit({ ...expiredInfo.card, allowedMentions: { parse: [] } });
        } catch {}
        ROLE_MEMBERS_PAGES.delete(reply.id);
      }, BUTTON_TIMEOUT);
    }
  }
};

module.exports.handleButton = async (interaction) => {
  if (!interaction.isButton()) return;

  const parts = interaction.customId.split('_');
  if (parts[0] !== 'rolemembers') return;

  if (parts[1] === 'expired') {
    await interaction.reply({
      content: 'Ces boutons ont expir\u00e9 apr\u00e8s 3 minutes. Utilise la commande \u00e0 nouveau',
      flags: 64,
      allowedMentions: { parse: [] }
    });
    return;
  }

  const pageData = ROLE_MEMBERS_PAGES.get(interaction.message.id);
  if (!pageData || pageData.userId !== interaction.user.id) {
    await interaction.reply({
      content: '<:non:1519424807580733635> Vous n\'\u00eates pas l\'auteur de cette commande',
      flags: 64,
      allowedMentions: { parse: [] }
    });
    return;
  }

  const now = Date.now();
  if (now - pageData.createdAt > BUTTON_TIMEOUT) {
    const expiredInfo = buildRoleMembersCard({
      roleMention: pageData.roleMention,
      entries: pageData.entries,
      page: pageData.currentPage,
      disabled: true
    });

    try {
      await interaction.update({ ...expiredInfo.card, allowedMentions: { parse: [] } });
    } catch {
      await interaction.reply({
        content: 'Ces boutons ont expir\u00e9 apr\u00e8s 3 minutes. Utilise la commande \u00e0 nouveau',
        flags: 64,
        allowedMentions: { parse: [] }
      });
    }
    ROLE_MEMBERS_PAGES.delete(interaction.message.id);
    return;
  }

  let newPage = parseInt(parts[2] || '0', 10);
  if (parts[1] === 'next') newPage += 1;
  if (parts[1] === 'prev') newPage -= 1;

  const pageInfo = buildRoleMembersCard({
    roleMention: pageData.roleMention,
    entries: pageData.entries,
    page: newPage,
    disabled: false
  });

  ROLE_MEMBERS_PAGES.set(interaction.message.id, {
    userId: pageData.userId,
    currentPage: pageInfo.page,
    createdAt: pageData.createdAt,
    roleMention: pageData.roleMention,
    entries: pageData.entries
  });

  await interaction.update({ ...pageInfo.card, allowedMentions: { parse: [] } });
};
