const { SlashCommandBuilder } = require('discord.js');
const { permissionCard } = require('../utils/cards');
const { hasPermissionForCommand } = require('../utils/permissions');
const { data, saveTempTimeouts } = require('../utils/state');

const TO_PAGES = new Map();
const BUTTON_TIMEOUT = 180000;
const ITEMS_PER_PAGE = 10;

async function buildTimeoutEntries(guild) {
    const guildId = String(guild.id);
    const stored = data.tempTimeouts[guildId] || {};
    const entries = [];
    let changed = false;
    const fetchedMembers = await guild.members.fetch().catch(() => null);
    const members = fetchedMembers || guild.members.cache;
    const canPruneStored = !!fetchedMembers;
    const active = [];
    const seen = new Set();

    for (const member of members.values()) {
        if (!member || typeof member.isCommunicationDisabled != 'function') continue;
        if (!member.isCommunicationDisabled()) continue;

        const untilDate = member.communicationDisabledUntil;
        if (!untilDate) continue;

        const untilMs = untilDate.getTime();
        const remaining = untilMs - Date.now();
        if (remaining <= 0) continue;

        active.push({ member, untilMs, remaining });
        seen.add(String(member.id));

        const memberId = String(member.id);
        const current = stored[memberId] || {};
        const endIso = new Date(untilMs).toISOString();

        if (current.endTime != endIso) {
            stored[memberId] = { ...current, endTime: endIso };
            changed = true;
        }
    }

    if (canPruneStored) {
        for (const memberId of Object.keys(stored)) {
            if (seen.has(String(memberId))) continue;
            delete stored[memberId];
            changed = true;
        }
    }

    active.sort((a, b) => a.untilMs - b.untilMs);
    for (const entry of active) {
        const hours = Math.floor(entry.remaining / (1000 * 60 * 60));
        const minutes = Math.floor((entry.remaining % (1000 * 60 * 60)) / (1000 * 60));
        entries.push(`- ${entry.member} (\`${entry.member.id}\`) (Temps restant : **\`${hours}h ${minutes}m\`**)`);
    }

    if (changed) {
        if (!Object.keys(stored).length) {
            delete data.tempTimeouts[guildId];
        } else {
            data.tempTimeouts[guildId] = stored;
        }
        saveTempTimeouts();
    }

    return entries;
}

function buildTimeoutCard(entries, page, disabled, total) {
    const totalPages = Math.max(1, Math.ceil(entries.length / ITEMS_PER_PAGE));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const startIndex = safePage * ITEMS_PER_PAGE;
    const list = entries.slice(startIndex, startIndex + ITEMS_PER_PAGE).join('\n') || 'Aucun';

    const components = [
        { type: 10, content: `# Membres timeout (${total})\n> Voici tous les membres timeout sur le serveur.\n> Page (${safePage + 1}/${totalPages})` },
        { type: 14 },
        { type: 10, content: list }
    ];

    if (totalPages > 1) {
        const prevId = disabled ? 'tolist_expired_prev' : `tolist_prev_${safePage}`;
        const nextId = disabled ? 'tolist_expired_next' : `tolist_next_${safePage}`;
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
    name: 'tolist',
    slashData: new SlashCommandBuilder()
        .setName('tolist')
        .setDescription('Affiche tous les membres actuellement timeout'),
    async executePrefix(message) {
        if (!hasPermissionForCommand(message.member, 'tolist')) {
            return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const entries = await buildTimeoutEntries(message.guild);
        const pageInfo = buildTimeoutCard(entries, 0, false, entries.length);
        const reply = await message.reply({ ...pageInfo.card, allowedMentions: { parse: [] }, mentionRepliedUser: false });

        if (pageInfo.totalPages > 1) {
            TO_PAGES.set(reply.id, {
                userId: message.author.id,
                currentPage: pageInfo.page,
                createdAt: Date.now(),
                entries,
                total: entries.length
            });

            setTimeout(async () => {
                const pageData = TO_PAGES.get(reply.id);
                if (!pageData) return;

                const expiredInfo = buildTimeoutCard(pageData.entries, pageData.currentPage, true, pageData.total);
                try {
                    await reply.edit({ ...expiredInfo.card, allowedMentions: { parse: [] } });
                } catch {}
                TO_PAGES.delete(reply.id);
            }, BUTTON_TIMEOUT);
        }
    },
    async executeSlash(interaction) {
        const entries = await buildTimeoutEntries(interaction.guild);
        const pageInfo = buildTimeoutCard(entries, 0, false, entries.length);
        await interaction.reply({ ...pageInfo.card, allowedMentions: { parse: [] } });
        const reply = await interaction.fetchReply();

        if (pageInfo.totalPages > 1) {
            TO_PAGES.set(reply.id, {
                userId: interaction.user.id,
                currentPage: pageInfo.page,
                createdAt: Date.now(),
                entries,
                total: entries.length
            });

            setTimeout(async () => {
                const pageData = TO_PAGES.get(reply.id);
                if (!pageData) return;

                const expiredInfo = buildTimeoutCard(pageData.entries, pageData.currentPage, true, pageData.total);
                try {
                    await interaction.editReply({ ...expiredInfo.card, allowedMentions: { parse: [] } });
                } catch {}
                TO_PAGES.delete(reply.id);
            }, BUTTON_TIMEOUT);
        }
    }
};

module.exports.handleButton = async (interaction) => {
    if (!interaction.isButton()) return;

    const parts = interaction.customId.split('_');
    if (parts[0] !== 'tolist') return;

    if (parts[1] === 'expired') {
        await interaction.reply({
            content: 'Ces boutons ont expir\u00e9 apr\u00e8s 3 minutes. Utilise la commande \u00e0 nouveau',
            flags: 64,
            allowedMentions: { parse: [] }
        });
        return;
    }

    const pageData = TO_PAGES.get(interaction.message.id);
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
        const expiredInfo = buildTimeoutCard(pageData.entries, pageData.currentPage, true, pageData.total);
        try {
            await interaction.update({ ...expiredInfo.card, allowedMentions: { parse: [] } });
        } catch {
            await interaction.reply({
                content: 'Ces boutons ont expir\u00e9 apr\u00e8s 3 minutes. Utilise la commande \u00e0 nouveau',
                flags: 64,
                allowedMentions: { parse: [] }
            });
        }
        TO_PAGES.delete(interaction.message.id);
        return;
    }

    let newPage = parseInt(parts[2] || '0', 10);
    if (parts[1] === 'next') newPage += 1;
    if (parts[1] === 'prev') newPage -= 1;

    const pageInfo = buildTimeoutCard(pageData.entries, newPage, false, pageData.total);
    TO_PAGES.set(interaction.message.id, {
        userId: pageData.userId,
        currentPage: pageInfo.page,
        createdAt: pageData.createdAt,
        entries: pageData.entries,
        total: pageData.total
    });

    await interaction.update({ ...pageInfo.card, allowedMentions: { parse: [] } });
};
