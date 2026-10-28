const { noCard, permissionCard } = require('../utils/cards');
const { hasPermissionForCommand } = require('../utils/permissions');

const banPages = new Map();
const BUTTON_TIMEOUT = 180000;
const ITEMS_PER_PAGE = 10;

async function getBanPage(guild, page = 0) {
    const bans = await guild.bans.fetch();
    const entries = Array.from(bans.values());
    const totalPages = Math.max(1, Math.ceil(entries.length / ITEMS_PER_PAGE));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const startIndex = safePage * ITEMS_PER_PAGE;
    const pageEntries = entries.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    const list = pageEntries.map((ban) => {
        const reason = ban.reason ? ` - ${ban.reason}` : '';
        return `- ${ban.user.tag} (\`${ban.user.id}\`)${reason}`;
    }).join('\n') || 'Aucun membre banni';

    return {
        title: `# Ban list (${entries.length})\n> Faites la commande \`-baninfo\` si vous souhaitez voir plus d'informations sur un bannissement.\n> Page (${safePage + 1}/${totalPages})`,
        list,
        page: safePage,
        totalPages
    };
}

function buildListCard(pageInfo) {
    const components = [
        { type: 10, content: pageInfo.title },
        { type: 14, divider: true },
        { type: 10, content: pageInfo.list }
    ];

    if (pageInfo.totalPages > 1) {
        components.push(
            { type: 14, divider: true },
            {
                type: 1,
                components: [
                    {
                        type: 2,
                        custom_id: `banlist_prev_${pageInfo.page}`,
                        style: 2,
                        label: '<',
                        disabled: pageInfo.page === 0
                    },
                    {
                        type: 2,
                        custom_id: `banlist_next_${pageInfo.page}`,
                        style: 2,
                        label: '>',
                        disabled: pageInfo.page >= pageInfo.totalPages - 1
                    }
                ]
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

module.exports = {
    name: 'banlist',
    async executePrefix(message) {
        if (!hasPermissionForCommand(message.member, 'banlist')) {
            return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        let pageInfo
        try {
            pageInfo = await getBanPage(message.guild, 0);
        } catch {
            return message.reply({ ...noCard('Impossible de r\u00e9cup\u00e9rer la liste des bans'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const card = buildListCard(pageInfo);
        const reply = await message.reply({ ...card, allowedMentions: { parse: [] }, mentionRepliedUser: false });

        if (pageInfo.totalPages > 1) {
            banPages.set(reply.id, {
                userId: message.author.id,
                currentPage: pageInfo.page,
                createdAt: Date.now()
            });

            setTimeout(async () => {
                const pageData = banPages.get(reply.id);
                if (!pageData) return;

                let expiredInfo
                try {
                    expiredInfo = await getBanPage(message.guild, pageData.currentPage);
                } catch {
                    banPages.delete(reply.id);
                    return;
                }

                const expiredComponents = expiredInfo.totalPages > 1 ? [
                    { type: 14, divider: true },
                    {
                        type: 1,
                        components: [
                            {
                                type: 2,
                                custom_id: 'banlist_expired_prev',
                                style: 2,
                                label: '<',
                                disabled: true
                            },
                            {
                                type: 2,
                                custom_id: 'banlist_expired_next',
                                style: 2,
                                label: '>',
                                disabled: true
                            }
                        ]
                    }
                ] : [];

                const expiredCard = {
                    flags: 32768,
                    components: [{
                        type: 17,
                        components: [
                            { type: 10, content: expiredInfo.title },
                            { type: 14, divider: true },
                            { type: 10, content: expiredInfo.list },
                            ...expiredComponents
                        ]
                    }]
                };

                try {
                    await reply.edit({ ...expiredCard, allowedMentions: { parse: [] } });
                } catch {}
                banPages.delete(reply.id);
            }, BUTTON_TIMEOUT);
        }
    }
};

module.exports.handleButton = async (interaction) => {
    if (!interaction.isButton()) return;

    const parts = interaction.customId.split('_');
    if (parts[0] !== 'banlist') return;

    if (parts[1] === 'expired') {
        await interaction.reply({
            content: 'Ces boutons ont expir\u00e9 apr\u00e8s 3 minutes. Utilise la commande \u00e0 nouveau',
            flags: 64,
            allowedMentions: { parse: [] }
        });
        return;
    }

    const pageData = banPages.get(interaction.message.id);
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
        let expiredInfo
        try {
            expiredInfo = await getBanPage(interaction.guild, pageData.currentPage);
        } catch {
            banPages.delete(interaction.message.id);
            return;
        }

        const expiredComponents = expiredInfo.totalPages > 1 ? [
            { type: 14, divider: true },
            {
                type: 1,
                components: [
                    {
                        type: 2,
                        custom_id: 'banlist_expired_prev',
                        style: 2,
                        label: '<',
                        disabled: true
                    },
                    {
                        type: 2,
                        custom_id: 'banlist_expired_next',
                        style: 2,
                        label: '>',
                        disabled: true
                    }
                ]
            }
        ] : [];

        const expiredCard = {
            flags: 32768,
            components: [{
                type: 17,
                components: [
                    { type: 10, content: expiredInfo.title },
                    { type: 14, divider: true },
                    { type: 10, content: expiredInfo.list },
                    ...expiredComponents
                ]
            }]
        };

        try {
            await interaction.update({ ...expiredCard, allowedMentions: { parse: [] } });
        } catch {
            await interaction.reply({
                content: 'Ces boutons ont expir\u00e9 apr\u00e8s 3 minutes. Utilise la commande \u00e0 nouveau',
                flags: 64,
                allowedMentions: { parse: [] }
            });
        }
        banPages.delete(interaction.message.id);
        return;
    }

    let newPage = parseInt(parts[2] || '0', 10);
    if (parts[1] === 'next') {
        newPage += 1;
    } else if (parts[1] === 'prev') {
        newPage -= 1;
    }

    let pageInfo
    try {
        pageInfo = await getBanPage(interaction.guild, newPage);
    } catch {
        return;
    }

    const updatedCard = buildListCard(pageInfo);

    banPages.set(interaction.message.id, {
        userId: interaction.user.id,
        currentPage: pageInfo.page,
        createdAt: pageData.createdAt
    });

    await interaction.update({ ...updatedCard, allowedMentions: { parse: [] } });
};
