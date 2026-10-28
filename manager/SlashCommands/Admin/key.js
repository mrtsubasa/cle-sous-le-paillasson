const config = require('../../config.json');
const Discord = require('discord.js');
const buildPanel = require('../../Utils/buildPanel');
const { hasAdminAccess } = require('../../Utils/adminAccess');

const PAGE_SIZE = 10;

function isUsed(row) {
    return String(row.use) === 'true' || String(row.use) === '1';
}

function formatKeyRow(row, index) {
    const targetUser = row.targetUserId ? `<@${row.targetUserId}> (\`${row.targetUserId}\`)` : '`Aucun`';
    return [
        `\`${index}.\` **${row.code}**`,
        `┖ Type: \`${row.type || 'inconnu'}\` | Temps: \`${row.day || 'inconnu'}\` | Utilisée: \`${isUsed(row) ? 'oui' : 'non'}\``,
        `┖ Utilisateur: ${targetUser}`,
    ].join('\n');
}

function buildKeyListPage(rows, page, totalPages, totalRows) {
    const pageIndex = Math.min(Math.max(page, 1), totalPages);
    const start = (pageIndex - 1) * PAGE_SIZE;
    const lines = rows.map((row, index) => formatKeyRow(row, start + index + 1));

    const container = buildPanel(
        `# Liste des clés - page ${pageIndex}/${totalPages}`,
        [
            `> *${totalRows} clé${totalRows > 1 ? 's' : ''} enregistrée${totalRows > 1 ? 's' : ''} dans la base de données*`,
            lines.length ? lines.join('\n\n') : '> *Aucune clé sur cette page*',
        ]
    );

    if (totalPages > 1) {
        container.addSeparatorComponents(
            new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
        );
        container.addActionRowComponents(
            new Discord.ActionRowBuilder().addComponents(
                new Discord.ButtonBuilder()
                    .setCustomId('key_list_prev')
                    .setLabel('⬅')
                    .setStyle(Discord.ButtonStyle.Secondary)
                    .setDisabled(pageIndex <= 1),
                new Discord.ButtonBuilder()
                    .setCustomId('key_list_next')
                    .setLabel('➡')
                    .setStyle(Discord.ButtonStyle.Secondary)
                    .setDisabled(pageIndex >= totalPages)
            )
        );
    }

    return container;
}

async function sendInitialResponse(message, payload) {
    if (message.deferred || message.replied) {
        return message.editReply(payload);
    }

    const response = await message.reply({ ...payload, withResponse: true });
    return response?.resource?.message ?? message.fetchReply().catch(() => null);
}

module.exports = {
    name: 'key',
    description: 'Permet de gérer les clés',
    permission: 'Aucune',
    dm: true,
    subcommands: [
        {
            name: 'list',
            description: 'Permet de voir la liste des clés',
        }
    ],

    async run(bot, message, args) {
        if(!hasAdminAccess(message)) {
            const embed = buildPanel(
                '# <:croix:1505270277796397146> Utilisateur non autorisé',
                ['> *Vous n’êtes pas autorisé à utiliser cette commande*']
            );
            return message.reply({ components: [embed], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
        }

        const subcommand = args.getSubcommand?.();

        if(subcommand === 'list') {
            try {
                const totalRows = bot.db.prepare('SELECT COUNT(*) AS count FROM cle').get()?.count || 0;

                if(totalRows < 1) {
                    return sendInitialResponse(message, {
                        components: [buildPanel('# <:croix:1505270277796397146> Aucune clé', ['> *Aucune clé n\'a été trouvée*'])],
                        allowedMentions: { parse: [] },
                        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral
                    });
                }

                const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
                let page = 1;

                const render = () => {
                    const rows = bot.db.prepare(
                        'SELECT * FROM cle ORDER BY "use" ASC, type ASC, day DESC LIMIT ? OFFSET ?'
                    ).all(PAGE_SIZE, (page - 1) * PAGE_SIZE);

                    return {
                        components: [buildKeyListPage(rows, page, totalPages, totalRows)],
                    };
                };

                const initial = render();
                const msg = await sendInitialResponse(message, {
                    components: initial.components,
                    allowedMentions: { parse: [] },
                    flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral
                });

                if(totalPages <= 1 || !msg?.createMessageComponentCollector) {
                    return msg;
                }

                const collector = msg.createMessageComponentCollector({
                    filter: (interaction) =>
                        interaction.user.id === message.author.id &&
                        (interaction.customId === 'key_list_prev' || interaction.customId === 'key_list_next'),
                    time: 10 * 60 * 1000,
                });

                collector.on('collect', async (interaction) => {
                    if(interaction.customId === 'key_list_prev') {
                        page = Math.max(1, page - 1);
                    } else if(interaction.customId === 'key_list_next') {
                        page = Math.min(totalPages, page + 1);
                    }

                    const view = render();
                    return interaction.update({
                        components: view.components,
                        allowedMentions: { parse: [] },
                        flags: Discord.MessageFlags.IsComponentsV2,
                    }).catch(() => {});
                });

                return msg;
            } catch {
                return sendInitialResponse(message, {
                    components: [buildPanel('# <:croix:1505270277796397146> Erreur', ['> *Impossible de récupérer la liste des clés*'])],
                    allowedMentions: { parse: [] },
                    flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral
                });
            }
        }
    }
};
