const { ContainerBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { claimTicket, closeTicket, handleRatingSelection } = require('../../utils/ticket-core');
const {
    buildLogsConfigContainer,
    getGeneralLogsChannelId,
    getTranscriptLogsChannelId,
    setGeneralLogsChannelId,
    setTranscriptLogsChannelId,
    migrateLegacyLogsConfig,
} = require('../../utils/logs-config');

const LOG_ALLOWED_MENTIONS = { parse: [] };

async function resolveGuildChannel(guild, channelId) {
    if (!guild || !channelId) return null;
    return guild.channels.cache.get(channelId) || guild.channels.fetch(channelId).catch(() => null);
}

async function sendTranscriptLog(targetChannel, logContainer, transcriptPath, transcriptFileName) {
    if (!targetChannel || !transcriptPath) return false;

    const summarySent = await targetChannel.send({
        components: [logContainer],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: LOG_ALLOWED_MENTIONS,
    }).then(() => true).catch(() => false);

    const fileSent = await targetChannel.send({
        files: [{
            attachment: transcriptPath,
            name: transcriptFileName,
        }],
        allowedMentions: LOG_ALLOWED_MENTIONS,
    }).then(() => true).catch(() => false);

    return summarySent && fileSent;
}

async function resolveTicketCategoryChannel(guild, categoryId) {
    if (!guild || !categoryId) return null;

    const channel = guild.channels.cache.get(categoryId) || await guild.channels.fetch(categoryId).catch(() => null);
    if (!channel) return null;

    if (typeof channel.isCategory === 'function') {
        return channel.isCategory() ? channel : null;
    }

    return channel.type === 4 ? channel : null;
}

module.exports = async (client, db, config, interaction) => {
    try {
        if (!interaction.isStringSelectMenu() && !interaction.isChannelSelectMenu() && !interaction.isButton() && !interaction.isModalSubmit()) return;

        if (interaction.isStringSelectMenu()) {
            const handledRating = await handleRatingSelection({ interaction, db, client });
            if (handledRating) return;
        }

        if (!interaction.guild) return;

        if (interaction.isChannelSelectMenu() && interaction.customId === 'logs_channel_select') {
            if (!canManageLogs(interaction, db, config)) {
                await interaction.reply({ content: "Vous n'avez pas la permission de configurer les logs.", flags: MessageFlags.Ephemeral }).catch(() => {});
                return;
            }

            const selectedChannelId = interaction.values[0];
            setGeneralLogsChannelId(db, interaction.guild.id, selectedChannelId);

            await interaction.update({
                components: [buildLogsConfigContainer(db, interaction.guild.id, `Salon de logs principal configure sur <#${selectedChannelId}>.`)],
            }).catch(() => {});
            return;
        }

        if (interaction.isChannelSelectMenu() && interaction.customId === 'logs_transcript_select') {
            if (!canManageLogs(interaction, db, config)) {
                await interaction.reply({ content: "Vous n'avez pas la permission de configurer les logs.", flags: MessageFlags.Ephemeral }).catch(() => {});
                return;
            }

            const selectedChannelId = interaction.values[0];
            setTranscriptLogsChannelId(db, interaction.guild.id, selectedChannelId);

            await interaction.update({
                components: [buildLogsConfigContainer(db, interaction.guild.id, `Salon des transcripts configure sur <#${selectedChannelId}>.`)],
            }).catch(() => {});
            return;
        }

        migrateLegacyLogsConfig(db, interaction.guild.id);

        const ticketConfig = {
            categoryCouronne: db.get(`ticketcategorycouronne_${interaction.guild.id}`),
            categoryGs: db.get(`ticketcategorygs_${interaction.guild.id}`),
            categoryGap: db.get(`ticketcategorygap_${interaction.guild.id}`),
            categoryCoins: db.get(`ticketcategorycoins_${interaction.guild.id}`),
            categoryAnimation: db.get(`ticketcategoryanimation_${interaction.guild.id}`),
            categoryCm: db.get(`ticketcategorycm_${interaction.guild.id}`),
            roles: {
                couronne: db.get(`couronnerole_${interaction.guild.id}`),
                gs: db.get(`gsrole_${interaction.guild.id}`),
                gap: db.get(`gaprole_${interaction.guild.id}`),
                coins: db.get(`coinsrole_${interaction.guild.id}`),
                animation: db.get(`animationrole_${interaction.guild.id}`),
                cm: db.get(`cmrole_${interaction.guild.id}`),
            }
        };

        const existingChannel = interaction.guild.channels.cache.find(c => c.topic === interaction.user.id);

        if (interaction.customId === "selectticket") {
            if (existingChannel) {
                const errorContainer = new ContainerBuilder()
                    .addTextDisplayComponents((textDisplay) =>
                        textDisplay.setContent('**Erreur**\n\nVous avez déjà un ticket ouvert sur le serveur.'),
                    );

                return interaction.reply({
                    components: [errorContainer],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
                });
            }

            if (db.get(`blacklist_${interaction.user.id}`)) {
                const errorContainer = new ContainerBuilder()
                    .addTextDisplayComponents((textDisplay) =>
                        textDisplay.setContent('**Erreur**\n\nVous êtes blacklisté et ne pouvez pas ouvrir de tickets.'),
                    );

                return interaction.reply({
                    components: [errorContainer],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
                });
            }

            const selectedValue = interaction.values[0];

            if (selectedValue === 'bug') {
                return interaction.deferUpdate().catch(() => {});
            }

            const selectedConfig = TicketConfig(selectedValue, ticketConfig);
            
            if (!selectedConfig || !selectedConfig.category || !selectedConfig.role) {
                const errorContainer = new ContainerBuilder()
                    .addTextDisplayComponents((textDisplay) =>
                        textDisplay.setContent('**Erreur**\n\nConfiguration de ticket non trouvée ou incomplète. Veuillez configurer la catégorie et le rôle avec `/setcategorie` et `/setrole`.'),
                    );

                return interaction.reply({
                    components: [errorContainer],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
                });
            }

            const modalId = `ticket_reason_${Date.now()}_${interaction.user.id}`;
            const reasonModal = {
                customId: modalId,
                title: 'Raison du Ticket',
                components: [{
                    type: 1,
                    components: [{
                        type: 4,
                        custom_id: 'reason',
                        label: "» Raison de votre Ticket",
                        style: 2,
                        placeholder: "Expliquez brièvement la raison de votre demande.",
                        required: true
                    }]
                }]
            };

            await interaction.showModal(reasonModal);

            try {
                const submittedModal = await interaction.awaitModalSubmit({
                    time: 0,
                    filter: i => i.customId === modalId && i.user.id === interaction.user.id
                });

                await submittedModal.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

                const reason = submittedModal.fields.getTextInputValue('reason');
                const channel = await CreationTicket(interaction, selectedConfig, reason, db, selectedValue);

                const generalLogsChannelId = getGeneralLogsChannelId(db, interaction.guild.id);
                if (generalLogsChannelId) {
                    const logsChannel = interaction.guild.channels.cache.get(generalLogsChannelId);
                    if (logsChannel) {
                            let logText = `## Nouveau ticket créé\n\n`;
                            logText += `**Utilisateur**: ${interaction.user}\n`;
                            logText += `**ID**: \`${interaction.user.id}\`\n`;
                            logText += `**Type**: ${selectedConfig.name}\n`;
                            logText += `**Salon**: <#${channel.id}>\n`;
                            logText += `**Raison**: \`\`\`${reason}\`\`\`\n`;
                            logText += `*${new Date().toLocaleString('fr-FR')}*`;

                        const logContainer = new ContainerBuilder()
                            .addTextDisplayComponents((textDisplay) =>
                                textDisplay.setContent(logText),
                            );

                        await logsChannel.send({
                            components: [logContainer],
                            flags: MessageFlags.IsComponentsV2,
                            allowedMentions: LOG_ALLOWED_MENTIONS,
                        });
                    }
                }

                const successContainer = new ContainerBuilder()
                    .addTextDisplayComponents((textDisplay) =>
                        textDisplay.setContent(`## **Ticket Créé !**\n> Votre nouveau ticket a été créé dans <#${channel.id}>.`),
                    )
                    .addActionRowComponents((actionRow) =>
                        actionRow.setComponents(
                            new ButtonBuilder()
                                .setLabel('Clique ici')
                                .setStyle(ButtonStyle.Link)
                                .setURL(`https://discord.com/channels/${interaction.guild.id}/${channel.id}`)
                        ),
                    );

                await submittedModal.editReply({
                    components: [successContainer],
                    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                });
            } catch (error) {
                console.error(error);
            }
        }

        if (interaction.customId === 'claim_ticket') {
            return claimTicket({ interaction, client, db, config });
        }

        if (interaction.customId.startsWith('resoudre_')) {
            return closeTicket({ interaction, client, db, config });
        }

        if (interaction.customId.startsWith('bl_')) {
            const ticketCreatorId = interaction.customId.split('_')[1];
            
            const responsableRoleIds = db.get(`responsables_${interaction.guild.id}`) || [];
            const isResponsable = responsableRoleIds.some((roleId) => interaction.member.roles.cache.has(roleId));
            const privilegedIds = config.buyers || [];
            const isOwner = db.get(`Owner_${interaction.guild.id}-${interaction.user.id}`) || privilegedIds.includes(interaction.user.id) || interaction.user.id === interaction.guild.ownerId;

            if (!isResponsable && !isOwner) {
                return interaction.reply({ content: "Seuls les responsables peuvent utiliser cette fonction.", flags: MessageFlags.Ephemeral });
            }

            db.set(`blacklist_${ticketCreatorId}`, true);

            const transcriptPath = await createTranscript(interaction.channel, interaction.guild, db, client, interaction.user);
            const transcriptFileName = `ticket-${interaction.channel.name}-${Date.now()}.txt`;

            const generalLogsChannelId = getGeneralLogsChannelId(db, interaction.guild.id);
            if (generalLogsChannelId) {
                const logsChannel = await resolveGuildChannel(interaction.guild, generalLogsChannelId);
                if (logsChannel) {
                    const userId = interaction.channel.topic || 'Inconnu';
                    let logText = `## Ticket - utilisateur blackliste\n\n`;
                    logText += `**Ticket**: ${interaction.channel.name}\n`;
                    logText += `**Utilisateur**: <@${userId}>\n`;
                    logText += `**Blackliste par**: ${interaction.user}\n`;
                    logText += `\n*${new Date().toLocaleString('fr-FR')}*`;

                    const logContainer = new ContainerBuilder()
                        .addTextDisplayComponents((textDisplay) =>
                            textDisplay.setContent(logText),
                        );

                    await logsChannel.send({
                        components: [logContainer],
                        flags: MessageFlags.IsComponentsV2,
                        allowedMentions: LOG_ALLOWED_MENTIONS,
                    }).catch(() => null);
                }
            }

            const transcriptLogsChannelId = getTranscriptLogsChannelId(db, interaction.guild.id);
            let transcriptSent = false;
            if (transcriptLogsChannelId && transcriptPath) {
                const logsChannel = await resolveGuildChannel(interaction.guild, transcriptLogsChannelId);
                if (logsChannel) {
                    let logText = `## Transcript blacklist\n\n`;
                    logText += `**Ticket**: ${interaction.channel.name}\n`;
                    logText += `**Action**: Blacklist\n`;
                    logText += `**Par**: ${interaction.user}\n`;
                    logText += `\n*${new Date().toLocaleString('fr-FR')}*`;

                    const logContainer = new ContainerBuilder()
                        .addTextDisplayComponents((textDisplay) =>
                            textDisplay.setContent(logText),
                        );

                    transcriptSent = await sendTranscriptLog(logsChannel, logContainer, transcriptPath, transcriptFileName);
                }
            }

            if (!transcriptSent && generalLogsChannelId && transcriptPath) {
                const logsChannel = await resolveGuildChannel(interaction.guild, generalLogsChannelId);
                if (logsChannel) {
                    const fallbackLogContainer = new ContainerBuilder().addTextDisplayComponents((textDisplay) =>
                        textDisplay.setContent(`## Transcript blacklist\n\n**Ticket**: ${interaction.channel.name}\n\n*${new Date().toLocaleString('fr-FR')}*`),
                    );

                    await sendTranscriptLog(logsChannel, fallbackLogContainer, transcriptPath, transcriptFileName);
                }
            }

            await interaction.channel.delete();
        }

        if (interaction.customId === "close_ticket") {
            return closeTicket({ interaction, client, db, config });
        }



    } catch (error) {
        client.error(error);
    }
};

function canManageLogs(interaction, db, config) {
    return Boolean(
        db.get(`Owner_${interaction.guild.id}-${interaction.user.id}`)
        || (config.buyers || []).includes(interaction.user.id)
        || interaction.user.id === interaction.guild.ownerId,
    );
}

function TicketConfig(selection, config) {
    switch (selection) {
        case "couronne":
        case "👑":
        case "Pour poser une question sur le serveur, ou contacter un owner.":
            return { category: config.categoryCouronne, role: config.roles.couronne, name: 'Questions Serveur', icon: '👑' };
        case "gs":
        case "🎓":
        case "Rank up, questions sur le staff, ou contacter un modérateur.":
            return { category: config.categoryGs, role: config.roles.gs, name: 'Gestion Staff', icon: '🎓' };
        case "gap":
        case "🧧":
        case "Gestion des abus et des comportements inappropriés.":
            return { category: config.categoryGap, role: config.roles.gap, name: 'Gestion Abus', icon: '🧧' };
        case "coins":
        case "👛":
        case "Questions concernant le bot coins.":
            return { category: config.categoryCoins, role: config.roles.coins, name: 'Gestion Coins', icon: '👛' };
        case "animation":
        case "🎪":
        case "Questions sur les animations, ou propositions d'animations.":
            return { category: config.categoryAnimation, role: config.roles.animation, name: 'Gestion Animation', icon: '🎪' };
        case "cm":
        case "📫":
        case "Faire une demande de partenariat, ou contacter un community manager.":
            return { category: config.categoryCm, role: config.roles.cm, name: 'Community Manager', icon: '📫' };
        default:
            return null;
    }
}

async function CreationTicket(interaction, config, reason, db, ticketType) {
    
    const permissionOverwrites = [
        { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'AttachFiles', 'ReadMessageHistory'] },
        { id: interaction.guild.id, deny: ['ViewChannel'] }
    ];

    if (config.role) {
        permissionOverwrites.push({ id: config.role, allow: ['ViewChannel', 'SendMessages', 'AttachFiles', 'ReadMessageHistory'] });
    }

    const responsables = db.get(`responsables_${interaction.guild.id}`) || [];
    for (const roleId of responsables) {
        permissionOverwrites.push({ id: roleId, allow: ['ViewChannel', 'SendMessages', 'AttachFiles', 'ReadMessageHistory'] });
    }

    const parentCategory = await resolveTicketCategoryChannel(interaction.guild, config.category);

    const channel = await interaction.guild.channels.create({
        name: `${config.icon}・${interaction.user.username}`,
        type: 0,
        topic: `${interaction.user.id}`,
        parent: parentCategory?.id ?? undefined,
        permissionOverwrites: permissionOverwrites
    });

    db.set(`ticket_type_${channel.id}`, ticketType);
    db.set(`ticket_opened_at_${channel.id}`, Date.now());

    const createdAtUnix = Math.floor(interaction.createdTimestamp / 1000);

    const ticketContainer = new ContainerBuilder()
        .addTextDisplayComponents((textDisplay) =>
            textDisplay.setContent(
                `### Nouveau Ticket - <@&${config.role}> \n> <:icons8businessman50:1519429501346648104> <@${interaction.user.id}> a créé un ticket concernant les **${config.name}** !`
            ),
        )
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents((textDisplay) =>
            textDisplay.setContent(
                `### **${config.name}**\n> Un membre de l'équipe **${config.name}** va vous répondre très rapidement.\n### **Raison**\n\`\`\`${reason}\`\`\`\n>  Créé le <t:${createdAtUnix}:F> • Ouvert <t:${createdAtUnix}:R>`
            ),
        )
        .addSeparatorComponents((separator) => separator);

    ticketContainer.addActionRowComponents((actionRow) =>
        actionRow.setComponents(
            new ButtonBuilder()
                .setCustomId('claim_ticket')
                .setStyle(ButtonStyle.Success)
                .setLabel('Claim'),
            new ButtonBuilder()
                .setCustomId('close_ticket')
                .setStyle(ButtonStyle.Danger)
                .setLabel('Close'),
            new ButtonBuilder()
                .setCustomId(`bl_${interaction.user.id}`)
                .setStyle(ButtonStyle.Secondary)
                .setLabel('Blacklist')
        ),
    );

    await channel.send({
        components: [ticketContainer],
        flags: MessageFlags.IsComponentsV2
    });

    return channel;
}

async function createTranscript(channel, guild, db, client, closedBy) {
    try {
        const allMessages = [];
        let lastMessageId = null;

        while (true) {
            const options = { limit: 100 };
            if (lastMessageId) options.before = lastMessageId;

            const batch = await channel.messages.fetch(options);
            if (!batch.size) break;

            allMessages.push(...batch.values());
            lastMessageId = batch.last().id;

            if (batch.size < 100) break;
        }

        const sortedMessages = allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

        let transcript = `═══════════════════════════════════\n`;
        transcript += `TRANSCRIPT DU TICKET\n`;
        transcript += `═══════════════════════════════════\n\n`;
        transcript += `Ticket: ${channel.name}\n`;
        transcript += `Créé pour: ${channel.topic ? `<@${channel.topic}>` : 'Inconnu'}\n`;
        transcript += `Fermé par: ${closedBy}\n`;
        transcript += `Date de fermeture: ${new Date().toLocaleString('fr-FR')}\n`;
        transcript += `\n═══════════════════════════════════\n`;
        transcript += `MESSAGES (${sortedMessages.length})\n`;
        transcript += `═══════════════════════════════════\n\n`;

        for (const message of sortedMessages) {
            const timestamp = message.createdAt.toLocaleString('fr-FR');
            transcript += `[${timestamp}] ${message.author.tag}:\n`;
            if (message.content) transcript += `${message.content}\n`;
            if (message.attachments.size > 0) {
                transcript += `Pièces jointes: ${message.attachments.map(a => a.url).join(', ')}\n`;
            }
            transcript += `\n`;
        }

        transcript += `═══════════════════════════════════\n`;
        transcript += `Fin du transcript\n`;
        transcript += `═══════════════════════════════════`;

        const safeChannelName = String(channel.name || 'ticket')
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .replace(/\s+/g, '-')
            .slice(0, 80);
        const filename = `ticket-${safeChannelName}-${Date.now()}.txt`;
        const storageId = process.env.BOT_STORAGE_ID;
        const transcriptDir = storageId
            ? path.resolve(__dirname, '../../../../BotRuntimes', storageId, 'transcripts')
            : path.join(__dirname, '../../transcripts');
        fs.mkdirSync(transcriptDir, { recursive: true });
        const filepath = path.join(transcriptDir, filename);
        fs.writeFileSync(filepath, transcript, 'utf8');

        return filepath;
    } catch (error) {
        console.error('Erreur lors de la création du transcript:', error);
        return null;
    }
}
