const { SlashCommandBuilder, time } = require('discord.js');
const { data } = require('../utils/state');
const { noCard, permissionCard } = require('../utils/cards');
const { hasPermissionForCommand } = require('../utils/permissions');
const { resolveMember } = require('../utils/resolvers');

const SANCTIONS_PAGES = new Map();
const BUTTON_TIMEOUT = 180000;
const ITEMS_PER_PAGE = 5;

function parseSanctionReason(reason) {
    const rawReason = String(reason || '').trim();
    const match = rawReason.match(/^(Ban|Kick|Timeout|Tempmute|Mute)\s*:\s*(.+)$/i);

    if (!match) {
        return {
            type: 'Warn',
            indication: '',
            reason: rawReason || 'Aucune raison'
        };
    }

    const type = `${match[1].charAt(0).toUpperCase()}${match[1].slice(1).toLowerCase()}`;
    const content = String(match[2] || '').trim() || 'Aucune raison';
    const durationMatch = (type === 'Timeout' || type === 'Tempmute')
        ? content.match(/^(.*)\s\(([^()]+)\)$/)
        : null;

    return {
        type,
        indication: durationMatch ? String(durationMatch[2] || '').trim() : '',
        reason: durationMatch ? (String(durationMatch[1] || '').trim() || 'Aucune raison') : content
    };
}

function buildWarnEntries(warns) {
    if (!Array.isArray(warns)) return [];
    return warns.map((warn) => {
        const date = time(new Date(warn.date), 'R');
        const parsed = parseSanctionReason(warn.reason);
        const firstLine = parsed.indication
            ? `**\`#${warn.id}\`** - **${parsed.type}** : ${parsed.indication}`
            : `**\`#${warn.id}\`** - **${parsed.type}**`;
        return `${firstLine}\n> *Par* : <@${warn.moderator}> (${warn.moderator})\n> *Raison* : **${parsed.reason}**\n> *Date* : ${date}`;
    });
}

function buildSanctionsCard({
    memberTag,
    total,
    status,
    entries,
    page,
    disabled
}) {
    const totalPages = Math.max(1, Math.ceil(entries.length / ITEMS_PER_PAGE));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const startIndex = safePage * ITEMS_PER_PAGE;
    const list = entries.slice(startIndex, startIndex + ITEMS_PER_PAGE).join('\n\n') || 'Aucune sanction';

    const components = [
        { type: 10, content: `# Sanctions de ${memberTag} (${total})\n> Voici toutes les sanctions de ce membre, page (${safePage + 1}/${totalPages})` },
        { type: 14 }
    ];

    if (status.length) {
        components.push(
            { type: 10, content: `Statut actuel : ${status.join(' / ')}` },
            { type: 14 }
        );
    }

    components.push({ type: 10, content: list });

    if (totalPages > 1) {
        const prevId = disabled ? 'sanctions_expired_prev' : `sanctions_prev_${safePage}`;
        const nextId = disabled ? 'sanctions_expired_next' : `sanctions_next_${safePage}`;
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

function getStatus(member, guild) {
    const status = [];
    if (member.isCommunicationDisabled()) status.push('Timeout');
    const mutedRole = guild.roles.cache.find((role) => role.name === 'Muted');
    if (mutedRole && member.roles.cache.has(mutedRole.id)) status.push('Mute');
    return status;
}

module.exports = {
    name: 'sanctions',
    slashData: new SlashCommandBuilder()
        .setName('sanctions')
        .setDescription("Affiche les sanctions d'un membre (timeouts, mutes et warns)")
        .addUserOption((option) =>
            option
                .setName('membre')
                .setDescription('Le membre \u00e0 v\u00e9rifier')
                .setRequired(true)
        ),
    async executePrefix(message, args) {
        if (!hasPermissionForCommand(message.member, 'sanctions')) {
            return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const member = await resolveMember(message, args[0]);
        if (!member) {
            return message.reply({ ...noCard('Membre non trouv\u00e9'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const guildId = String(message.guild.id);
        const userId = String(member.id);
        const warns = (data.warns[guildId] && data.warns[guildId][userId]) ? data.warns[guildId][userId] : [];
        const entries = buildWarnEntries(warns);
        const status = getStatus(member, message.guild);
        const memberTag = member.user ? member.user.tag : member.displayName;
        const total = warns.length;

        const pageInfo = buildSanctionsCard({
            memberTag,
            total,
            status,
            entries,
            page: 0,
            disabled: false
        });

        const reply = await message.reply({ ...pageInfo.card, allowedMentions: { parse: [] }, mentionRepliedUser: false });

        if (pageInfo.totalPages > 1) {
            SANCTIONS_PAGES.set(reply.id, {
                userId: message.author.id,
                currentPage: pageInfo.page,
                createdAt: Date.now(),
                entries,
                status,
                memberTag,
                total
            });

            setTimeout(async () => {
                const pageData = SANCTIONS_PAGES.get(reply.id);
                if (!pageData) return;

                const expiredInfo = buildSanctionsCard({
                    memberTag: pageData.memberTag,
                    total: pageData.total,
                    status: pageData.status,
                    entries: pageData.entries,
                    page: pageData.currentPage,
                    disabled: true
                });

                try {
                    await reply.edit({ ...expiredInfo.card, allowedMentions: { parse: [] } });
                } catch {}
                SANCTIONS_PAGES.delete(reply.id);
            }, BUTTON_TIMEOUT);
        }
    },
    async executeSlash(interaction) {
        const member = interaction.options.getMember('membre');
        const guildId = String(interaction.guild.id);
        const userId = String(member.id);
        const warns = (data.warns[guildId] && data.warns[guildId][userId]) ? data.warns[guildId][userId] : [];
        const entries = buildWarnEntries(warns);
        const status = getStatus(member, interaction.guild);
        const memberTag = member.user ? member.user.tag : member.displayName;
        const total = warns.length;

        const pageInfo = buildSanctionsCard({
            memberTag,
            total,
            status,
            entries,
            page: 0,
            disabled: false
        });

        await interaction.reply({ ...pageInfo.card, allowedMentions: { parse: [] } });
        const reply = await interaction.fetchReply();

        if (pageInfo.totalPages > 1) {
            SANCTIONS_PAGES.set(reply.id, {
                userId: interaction.user.id,
                currentPage: pageInfo.page,
                createdAt: Date.now(),
                entries,
                status,
                memberTag,
                total
            });

            setTimeout(async () => {
                const pageData = SANCTIONS_PAGES.get(reply.id);
                if (!pageData) return;

                const expiredInfo = buildSanctionsCard({
                    memberTag: pageData.memberTag,
                    total: pageData.total,
                    status: pageData.status,
                    entries: pageData.entries,
                    page: pageData.currentPage,
                    disabled: true
                });

                try {
                    await interaction.editReply({ ...expiredInfo.card, allowedMentions: { parse: [] } });
                } catch {}
                SANCTIONS_PAGES.delete(reply.id);
            }, BUTTON_TIMEOUT);
        }
    }
};

module.exports.handleButton = async (interaction) => {
    if (!interaction.isButton()) return;

    const parts = interaction.customId.split('_');
    if (parts[0] !== 'sanctions') return;

    if (parts[1] === 'expired') {
        await interaction.reply({
            content: 'Ces boutons ont expir\u00e9 apr\u00e8s 3 minutes. Utilise la commande \u00e0 nouveau',
            flags: 64,
            allowedMentions: { parse: [] }
        });
        return;
    }

    const pageData = SANCTIONS_PAGES.get(interaction.message.id);
    if (!pageData || pageData.userId !== interaction.user.id) {
        await interaction.reply({
            content: '<:croix:1449141420915953706> Vous n\'\u00eates pas l\'auteur de cette commande',
            flags: 64,
            allowedMentions: { parse: [] }
        });
        return;
    }

    const now = Date.now();
    if (now - pageData.createdAt > BUTTON_TIMEOUT) {
        const expiredInfo = buildSanctionsCard({
            memberTag: pageData.memberTag,
            total: pageData.total,
            status: pageData.status,
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
        SANCTIONS_PAGES.delete(interaction.message.id);
        return;
    }

    let newPage = parseInt(parts[2] || '0', 10);
    if (parts[1] === 'next') newPage += 1;
    if (parts[1] === 'prev') newPage -= 1;

    const pageInfo = buildSanctionsCard({
        memberTag: pageData.memberTag,
        total: pageData.total,
        status: pageData.status,
        entries: pageData.entries,
        page: newPage,
        disabled: false
    });

    SANCTIONS_PAGES.set(interaction.message.id, {
        userId: pageData.userId,
        currentPage: pageInfo.page,
        createdAt: pageData.createdAt,
        entries: pageData.entries,
        status: pageData.status,
        memberTag: pageData.memberTag,
        total: pageData.total
    });

    await interaction.update({ ...pageInfo.card, allowedMentions: { parse: [] } });
};
