const { hasPermissionForCommand, isBotOwner, isSystem, isOwnerMember } = require('../utils/permissions');
const { getMemberPermLevel } = require('../utils/permGroups');
const { noCard } = require('../utils/cards');
const { readJsonConfig } = require('../../../Utils/tokenVault');
const { getSanctionRuntimeConfigPath } = require('../utils/runtimeConfig');

const HELP_PAGES = new Map();
const BUTTON_TIMEOUT = 180000;
const ITEMS_PER_PAGE = 10;

function getConfig() {
    return readJsonConfig(getSanctionRuntimeConfigPath(), { migrateToken: false }) || {};
}

const DESCRIPTIONS = {
    alladmins: 'Affiche tous les admins du serveur',
    allbots: 'Affiche tous les bots du serveur',
    banner: 'Affiche la banni\u00e8re d\'un membre ou du serveur',
    ban: 'Ban un membre',
    baninfo: 'Affiche les informations sur un ban',
    banlist: 'Affiche la liste des membres bannis',
    clear: 'Supprime des messages dans le salon',
    clearowner: 'Supprime tous les owners',
    clearprotect: 'Supprime tous les protect',
    clearsys: 'Supprime tous les sys ',
    config: 'Panel de configuration du bot',
    delsanctions: 'Supprime les sanctions d\'un membre',
    gw: 'Panel pour lancer un giveaway',
    help: 'Affiche les commandes disponibles',
    lock: 'Verrouille le salon',
    kick: 'Kick un membre',
    limits: 'Panel pour g\u00e9rer les limites et sections de ban et clear',
    lockall: 'Lock tous les salons du serveur',
    unlockall: 'Unlock les salons lock par lockall',
    hideall: 'Rend tous les salons du serveur priv\u00e9s',
    unhideall: 'Rend publics les salons hide par hideall',
    hide: 'Rend priv\u00e9 le salon actuel',
    unhide: 'Rend public le salon actuel',
    mutelist: 'Affiche la liste des mutes',
    other: 'Panel pour g\u00e9rer les commandes dangereuses',
    owner: 'G\u00e8re les owners',
    perms: 'G\u00e8re les r\u00f4les des Perm 1 \u00e0 9',
    pic: 'Affiche la photo de profil',
    profil: 'Panel de gestion du profil du bot',
    protect: 'G\u00e8re les protect',
    nick: 'Renomme un membre sur le serveur',
    rename: 'Renomme un salon',
    rolemembers: 'Affiche les membres qui ont un r\u00f4le',
    renew: 'Recr\u00e9e le salon actuel',
    special: 'G\u00e8re les permissions pour des r\u00f4les et membres particuliers',
    helpall: 'G\u00e8re les commandes des Perm 1 \u00e0 9',
    clearperms: 'R\u00e9initialise toutes les permissions',
    resetperms: 'Réinitialise les commandes de helpall',
    sanctions: 'Affiche les sanctions d\'un membre',
    sync: 'Synchronise les permissions avec une cat\u00e9gorie',
    sys: 'G\u00e8re les sys',
    tempmute: 'Mute un membre',
    to: 'Timeout un membre',
    tolist: 'Liste les timeouts actifs',
    unmuteall: 'Unmute tous les membres',
    unban: 'D\u00e9ban un membre',
    unbanall: 'D\u00e9ban tous les membres',
    unlock: 'D\u00e9verrouille le salon actuel',
    unmute: 'Unmute un membre',
    user: 'Affiche les informations d\'un membre',
    unto: 'Retire le timeout d\'un membre',
    untoall: 'Retire les timeouts de tous',
    warn: 'Donne un avertissement',
    derank: 'Retire tous les r\u00f4les d\'un membre',
    snipe: 'Affiche le dernier message supprim\u00e9',
    mute: 'Timeout un membre 27 jours',
    addrole: 'Ajoute des r\u00f4les \u00e0 un membre',
    delrole: 'Retire des r\u00f4les \u00e0 un membre',
    mybot: 'Affiche tes bots personnels depuis l\'API'
};

function getHelpRankLabel(member) {
    if (!member || !member.guild) return null;

    const guildId = String(member.guild.id);
    if (isBotOwner(member.id)) return 'Buyer';
    if (isSystem(guildId, member.id, member)) return 'Sys';
    if (isOwnerMember(guildId, member.id, member)) return 'Owner';

    const permLevel = getMemberPermLevel(guildId, member);
    if (permLevel > 0) return `Perm ${permLevel}`;

    return null;
}

function buildHelpCard(entries, page, totalCount, subtitle, disabled = false) {
    const totalPages = Math.max(1, Math.ceil(entries.length / ITEMS_PER_PAGE));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const startIndex = safePage * ITEMS_PER_PAGE;
    const list = entries.slice(startIndex, startIndex + ITEMS_PER_PAGE).join('\n\n') || 'Aucune commande disponible';

    const components = [
        { type: 10, content: `# Aide (${safePage + 1}/${totalPages})\n${subtitle}` },
        { type: 14 },
        { type: 10, content: list }
    ];

    if (totalPages > 1) {
        const prevId = disabled ? 'help_expird_prev' : `help_prev_${safePage}`;
        const nextId = disabled ? 'help_expird_next' : `help_next_${safePage}`;
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
    name: 'help',
    async executePrefix(message) {
        const available = [];
        const prefix = String(getConfig().prefix || '');

        for (const command of message.client.commands.values()) {
            if (!command.executePrefix) continue;
            const name = command.name;
            if (!hasPermissionForCommand(message.member, name)) continue;

            const description = DESCRIPTIONS[name] || 'Aucune description';
            available.push({
                name,
                text: `**\`${prefix}${name}\`**\n${description}`
            });
        }

        available.sort((a, b) => a.name.localeCompare(b.name));
        const entries = available.map((entry) => entry.text);
        const rankLabel = getHelpRankLabel(message.member);
        const subtitle = rankLabel
            ? `> Voici toutes les commandes que vous pouvez faire en tant que \`${rankLabel}\`.\n> Vous avez acc\u00e8s \u00e0 \`${entries.length}\` commandes`
            : `> Voici toutes les commandes que vous pouvez faire.\n> Vous avez acc\u00e8s \u00e0 \`${entries.length}\` commandes`;

        if (entries.length === 0) {
            return message.reply({ ...noCard("Vous n'avez acc\u00e8s \u00e0 aucune commande"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const pageInfo = buildHelpCard(entries, 0, entries.length, subtitle);
        const reply = await message.reply({ ...pageInfo.card, allowedMentions: { parse: [] }, mentionRepliedUser: false });

        if (pageInfo.totalPages > 1) {
            HELP_PAGES.set(reply.id, {
                userId: message.author.id,
                currentPage: pageInfo.page,
                createdAt: Date.now(),
                entries: entries,
                totalCount: entries.length,
                subtitle
            });

            setTimeout(async () => {
                const pageData = HELP_PAGES.get(reply.id);
                if (!pageData) return;

                const expiredInfo = buildHelpCard(pageData.entries, pageData.currentPage, pageData.totalCount, pageData.subtitle, true);

                try {
                    await reply.edit({ ...expiredInfo.card, allowedMentions: { parse: [] } });
                } catch {}
                HELP_PAGES.delete(reply.id);
            }, BUTTON_TIMEOUT);
        }
    }
};

module.exports.handleButton = async (interaction) => {
    if (!interaction.isButton()) return;

    const parts = interaction.customId.split('_');
    if (parts[0] !== 'help') return;

    if (parts[1] === 'expird') {
        await interaction.reply({
            content: 'Ces boutons ont expir\u00e9 apr\u00e8s 3 minutes. Utilise la commande \u00e0 nouveau',
            flags: 64,
            allowedMentions: { parse: [] }
        });
        return;
    }

    const pageData = HELP_PAGES.get(interaction.message.id);
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
        const expiredInfo = buildHelpCard(pageData.entries, pageData.currentPage, pageData.totalCount, pageData.subtitle, true);

        try {
            await interaction.update({ ...expiredInfo.card, allowedMentions: { parse: [] } });
        } catch {
            await interaction.reply({
                content: 'Ces boutons ont expir\u00e9 apr\u00e8s 3 minutes. Utilise la commande \u00e0 nouveau',
                flags: 64,
                allowedMentions: { parse: [] }
            });
        }
        HELP_PAGES.delete(interaction.message.id);
        return;
    }

    let newPage = parseInt(parts[2] || '0', 10);
    if (parts[1] === 'next') {
        newPage += 1;
    } else if (parts[1] === 'prev') {
        newPage -= 1;
    }

    const pageInfo = buildHelpCard(pageData.entries, newPage, pageData.totalCount, pageData.subtitle);
    HELP_PAGES.set(interaction.message.id, {
        userId: pageData.userId,
        currentPage: pageInfo.page,
        createdAt: pageData.createdAt,
        entries: pageData.entries,
        totalCount: pageData.totalCount,
        subtitle: pageData.subtitle
    });

    await interaction.update({ ...pageInfo.card, allowedMentions: { parse: [] } });
};


