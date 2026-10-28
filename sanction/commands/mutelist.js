const { SlashCommandBuilder } = require('discord.js');
const { tempMutes, data, saveTempMutes } = require('../utils/state');
const { noCard, permissionCard } = require('../utils/cards');
const { hasPermissionForCommand } = require('../utils/permissions');

const MUTE_PAGES = new Map();
const BUTTON_TIMEOUT = 180000;
const ITEMS_PER_PAGE = 10;

function getMutedRole(guild) {
    const guildId = String(guild.id);
    const roleId = data.mutedRole[guildId];
    if (roleId) {
        const role = guild.roles.cache.get(roleId);
        if (role) return role;
    }
    return guild.roles.cache.find((role) => role.name === 'Muted');
}

async function buildMuteEntries(guild, mutedRole) {
    const guildId = String(guild.id);
    const stored = data.tempMutes[guildId] || {};
    const entries = [];
    let changed = false;

    for (const [memberId, entry] of Object.entries(stored)) {
        if (!entry || !entry.endTime) {
            delete stored[memberId];
            changed = true;
            continue;
        }

        const member = await guild.members.fetch(memberId).catch(() => null);
        if (!member || !mutedRole || !member.roles.cache.has(mutedRole.id)) {
            delete stored[memberId];
            changed = true;
            continue;
        }

        let muteInfo = '';
        const endTime = new Date(entry.endTime);
        const remaining = endTime - new Date();
        if (remaining > 0) {
            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            muteInfo = ` (Temps restant : **\`${hours}h ${minutes}m\`**)`;
        } else {
            muteInfo = ' (Doit \u00eatre unmut\u00e9)';
        }

        const key = `${guildId}:${member.id}`;
        if (!tempMutes.has(key)) {
            tempMutes.set(key, entry);
        }

        entries.push(`- ${member} (\`${member.id}\`)${muteInfo}`);
    }

    if (changed) {
        if (!Object.keys(stored).length) {
            delete data.tempMutes[guildId];
        }
        saveTempMutes();
    }

    return entries;
}

function buildMuteCard(entries, page, disabled, total) {
    const totalPages = Math.max(1, Math.ceil(entries.length / ITEMS_PER_PAGE));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const startIndex = safePage * ITEMS_PER_PAGE;
    const list = entries.slice(startIndex, startIndex + ITEMS_PER_PAGE).join('\n') || 'Aucun';

    const components = [
        { type: 10, content: `# Membres tempmutes (${total})\n> Voici tous les membres tempmutes sur le serveur.\n> Page (${safePage + 1}/${totalPages})` },
        { type: 14 },
        { type: 10, content: list }
    ];

    if (totalPages > 1) {
        const prevId = disabled ? 'mutelist_expired_prev' : `mutelist_prev_${safePage}`;
        const nextId = disabled ? 'mutelist_expired_next' : `mutelist_next_${safePage}`;
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

module.exports = {
    name: 'mutelist',
    slashData: new SlashCommandBuilder()
        .setName('mutelist')
        .setDescription('Affiche tous les membres actuellement mut\u00e9s sur le serveur'),
    async executePrefix(message) {
        if (!hasPermissionForCommand(message.member, 'mutelist')) {
            return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const mutedRole = getMutedRole(message.guild);
        if (!mutedRole) {
            return message.reply({ ...noCard("Le r\u00f4le mute n'est pas configur\u00e9"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const entries = await buildMuteEntries(message.guild, mutedRole);
        const pageInfo = buildMuteCard(entries, 0, false, entries.length);
        const reply = await message.reply({ ...pageInfo.card, allowedMentions: { parse: [] }, mentionRepliedUser: false });

        if (pageInfo.totalPages > 1) {
            MUTE_PAGES.set(reply.id, {
                userId: message.author.id,
                currentPage: pageInfo.page,
                createdAt: Date.now(),
                entries,
                total: entries.length
            });

            setTimeout(async () => {
                const pageData = MUTE_PAGES.get(reply.id);
                if (!pageData) return;

                const expiredInfo = buildMuteCard(pageData.entries, pageData.currentPage, true, pageData.total);
                try {
                    await reply.edit({ ...expiredInfo.card, allowedMentions: { parse: [] } });
                } catch {}
                MUTE_PAGES.delete(reply.id);
            }, BUTTON_TIMEOUT);
        }
    },
    async executeSlash(interaction) {
        const mutedRole = getMutedRole(interaction.guild);
        if (!mutedRole) {
            return interaction.reply(noCard("Le r\u00f4le mute n'est pas configur\u00e9"));
        }

        const entries = await buildMuteEntries(interaction.guild, mutedRole);
        const pageInfo = buildMuteCard(entries, 0, false, entries.length);
        await interaction.reply({ ...pageInfo.card, allowedMentions: { parse: [] } });
        const reply = await interaction.fetchReply();

        if (pageInfo.totalPages > 1) {
            MUTE_PAGES.set(reply.id, {
                userId: interaction.user.id,
                currentPage: pageInfo.page,
                createdAt: Date.now(),
                entries,
                total: entries.length
            });

            setTimeout(async () => {
                const pageData = MUTE_PAGES.get(reply.id);
                if (!pageData) return;

                const expiredInfo = buildMuteCard(pageData.entries, pageData.currentPage, true, pageData.total);
                try {
                    await interaction.editReply({ ...expiredInfo.card, allowedMentions: { parse: [] } });
                } catch {}
                MUTE_PAGES.delete(reply.id);
            }, BUTTON_TIMEOUT);
        }
    }
};

module.exports.handleButton = async (interaction) => {
    if (!interaction.isButton()) return;

    const parts = interaction.customId.split('_');
    if (parts[0] !== 'mutelist') return;

    if (parts[1] === 'expired') {
        await interaction.reply({
            content: 'Ces boutons ont expir\u00e9 apr\u00e8s 3 minutes. Utilise la commande \u00e0 nouveau',
            flags: 64,
            allowedMentions: { parse: [] }
        });
        return;
    }

    const pageData = MUTE_PAGES.get(interaction.message.id);
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
        const expiredInfo = buildMuteCard(pageData.entries, pageData.currentPage, true, pageData.total);
        try {
            await interaction.update({ ...expiredInfo.card, allowedMentions: { parse: [] } });
        } catch {
            await interaction.reply({
                content: 'Ces boutons ont expir\u00e9 apr\u00e8s 3 minutes. Utilise la commande \u00e0 nouveau',
                flags: 64,
                allowedMentions: { parse: [] }
            });
        }
        MUTE_PAGES.delete(interaction.message.id);
        return;
    }

    let newPage = parseInt(parts[2] || '0', 10);
    if (parts[1] === 'next') newPage += 1;
    if (parts[1] === 'prev') newPage -= 1;

    const pageInfo = buildMuteCard(pageData.entries, newPage, false, pageData.total);
    MUTE_PAGES.set(interaction.message.id, {
        userId: pageData.userId,
        currentPage: pageInfo.page,
        createdAt: pageData.createdAt,
        entries: pageData.entries,
        total: pageData.total
    });

    await interaction.update({ ...pageInfo.card, allowedMentions: { parse: [] } });
};
