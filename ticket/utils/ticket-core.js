const { ContainerBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const {
    STARS_EMOJI,
    addClaimStat,
    addCloseStat,
    addRatingStat,
    refreshLeaderboardMessage,
} = require('./leaderboard');
const {
    getGeneralLogsChannelId,
    getTranscriptLogsChannelId,
} = require('./logs-config');

const LOG_ALLOWED_MENTIONS = { parse: [] };

const TICKET_TYPE_DEFS = {
    couronne: {
        name: 'Questions Serveur',
        icon: '👑',
        categoryKey: 'ticketcategorycouronne_',
        roleKey: 'couronnerole_',
    },
    gs: {
        name: 'Gestion Staff',
        icon: '🎓',
        categoryKey: 'ticketcategorygs_',
        roleKey: 'gsrole_',
    },
    gap: {
        name: 'Gestion Abus',
        icon: '🧧',
        categoryKey: 'ticketcategorygap_',
        roleKey: 'gaprole_',
    },
    coins: {
        name: 'Gestion Coins',
        icon: '👛',
        categoryKey: 'ticketcategorycoins_',
        roleKey: 'coinsrole_',
    },
    animation: {
        name: 'Gestion Animation',
        icon: '🎪',
        categoryKey: 'ticketcategoryanimation_',
        roleKey: 'animationrole_',
    },
    cm: {
        name: 'Community Manager',
        icon: '📫',
        categoryKey: 'ticketcategorycm_',
        roleKey: 'cmrole_',
    },
};

const LEGACY_ALIASES = {
    couronne: [
        '👑',
        'Pour poser une question sur le serveur, ou contacter un owner.',
    ],
    gs: [
        '🎓',
        'Rank up, questions sur le staff, ou contacter un modérateur.',
    ],
    gap: [
        '🧧',
        'Gestion des abus et des comportements inappropriés.',
    ],
    coins: [
        '👛',
        'Questions concernant le bot coins.',
    ],
    animation: [
        '🎪',
        'Questions sur les animations, ou propositions d\'animations.',
    ],
    cm: [
        '📫',
        'Faire une demande de partenariat, ou contacter un community manager.',
    ],
};

function buildContainer(text) {
    return new ContainerBuilder().addTextDisplayComponents((textDisplay) =>
        textDisplay.setContent(text),
    );
}

async function resolveGuildChannel(guild, channelId) {
    if (!guild || !channelId) return null;
    return guild.channels.cache.get(channelId) || guild.channels.fetch(channelId).catch(() => null);
}

async function sendTranscriptLog(targetChannel, transcriptLogText, filepath, filename) {
    if (!targetChannel) return false;

    const summarySent = await targetChannel.send({
        components: [buildContainer(transcriptLogText)],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: LOG_ALLOWED_MENTIONS,
    }).then(() => true).catch(() => false);

    const fileSent = await targetChannel.send({
        files: [{ attachment: filepath, name: filename }],
        allowedMentions: LOG_ALLOWED_MENTIONS,
    }).then(() => true).catch(() => false);

    return summarySent && fileSent;
}

function normalizeTicketType(selection) {
    if (!selection) return null;
    if (TICKET_TYPE_DEFS[selection]) return selection;

    const canonical = Object.keys(LEGACY_ALIASES).find((key) => LEGACY_ALIASES[key].includes(selection));
    return canonical || null;
}

function resolveTicketConfig(db, guildId, selection) {
    const ticketType = normalizeTicketType(selection);
    if (!ticketType) return null;

    const def = TICKET_TYPE_DEFS[ticketType];

    return {
        key: ticketType,
        name: def.name,
        icon: def.icon,
        category: db.get(`${def.categoryKey}${guildId}`),
        role: db.get(`${def.roleKey}${guildId}`),
    };
}

function getResponsableRoleIds(db, guildId) {
    return db.get(`responsables_${guildId}`) || [];
}

function hasOwnerPower(interaction, config, db) {
    const privilegedIds = config.buyers || [];
    return Boolean(
        db.get(`Owner_${interaction.guild.id}-${interaction.user.id}`) ||
        privilegedIds.includes(interaction.user.id) ||
        interaction.user.id === interaction.guild.ownerId,
    );
}

function canManageTicket(interaction, config, db, ticketRoleId, claimedById = null) {
    const member = interaction.member;
    const responsableRoleIds = getResponsableRoleIds(db, interaction.guild.id);

    const hasTicketRole = ticketRoleId ? member.roles.cache.has(ticketRoleId) : false;
    const isResponsable = responsableRoleIds.some((roleId) => member.roles.cache.has(roleId));
    const isOwner = hasOwnerPower(interaction, config, db);
    const isClaimer = claimedById ? claimedById === interaction.user.id : false;

    return hasTicketRole || isResponsable || isOwner || isClaimer;
}

function canCloseOwnTicket(interaction) {
    return Boolean(interaction.channel?.topic && interaction.channel.topic === interaction.user.id);
}

async function sendInteractionFeedback(interaction, text, ephemeral = true) {
    const payload = {
        components: [buildContainer(text)],
        flags: MessageFlags.IsComponentsV2,
        ephemeral,
    };

    if (interaction.deferred && !interaction.replied) {
        return interaction
            .editReply({ content: text })
            .catch(() => interaction.followUp({ content: text, ephemeral }).catch(() => {}));
    }

    if (interaction.replied) {
        return interaction.followUp(payload).catch(() => {});
    }

    return interaction.reply(payload).catch(() => {});
}

async function applyClaimVisibility(channel, ticketConfig, claimerId, creatorId, responsableRoleIds) {
    const updates = [];

    if (ticketConfig.role) {
        updates.push(
            channel.permissionOverwrites.edit(ticketConfig.role, {
                ViewChannel: false,
                SendMessages: false,
            }),
        );
    }

    updates.push(
        channel.permissionOverwrites.edit(claimerId, {
            ViewChannel: true,
            SendMessages: true,
            AttachFiles: true,
            ReadMessageHistory: true,
        }),
    );

    if (creatorId) {
        updates.push(
            channel.permissionOverwrites.edit(creatorId, {
                ViewChannel: true,
                SendMessages: true,
                AttachFiles: true,
                ReadMessageHistory: true,
            }),
        );
    }

    for (const roleId of responsableRoleIds) {
        updates.push(
            channel.permissionOverwrites.edit(roleId, {
                ViewChannel: true,
                SendMessages: true,
                AttachFiles: true,
                ReadMessageHistory: true,
            }),
        );
    }

    await Promise.allSettled(updates);
}

async function claimTicket({ interaction, client, db, config }) {
    if (!interaction.guild || !interaction.channel?.topic) {
        await sendInteractionFeedback(interaction, "> Cette commande doit être utilisée dans un ticket.");
        return false;
    }

    const ticketTypeRaw = db.get(`ticket_type_${interaction.channel.id}`);
    const ticketConfig = resolveTicketConfig(db, interaction.guild.id, ticketTypeRaw);

    if (!ticketConfig || !ticketConfig.role) {
        await sendInteractionFeedback(interaction, '> Configuration ticket introuvable. Utilisez /setcategorie et /setrole.');
        return false;
    }

    const currentClaimer = db.get(`ticket_claim_${interaction.channel.id}`);
    if (currentClaimer && currentClaimer !== interaction.user.id) {
        await sendInteractionFeedback(interaction, `> Ce ticket est déjà claim par <@${currentClaimer}>.`);
        return false;
    }

    if (currentClaimer === interaction.user.id) {
        await sendInteractionFeedback(interaction, '> Vous avez déjà claim ce ticket.');
        return false;
    }

    if (!canManageTicket(interaction, config, db, ticketConfig.role)) {
        await sendInteractionFeedback(interaction, "> Vous n'avez pas la permission de claim ce ticket.");
        return false;
    }

    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
    }

    db.set(`ticket_claim_${interaction.channel.id}`, interaction.user.id);
    addClaimStat(db, interaction.guild.id, interaction.user.id);
    await refreshLeaderboardMessage({
        client,
        db,
        guildId: interaction.guild.id,
    }).catch(() => null);

    await applyClaimVisibility(
        interaction.channel,
        ticketConfig,
        interaction.user.id,
        interaction.channel.topic,
        getResponsableRoleIds(db, interaction.guild.id),
    );

    const claimContainer = new ContainerBuilder()
        .addTextDisplayComponents((textDisplay) =>
            textDisplay.setContent('## Ticket claim'),
        )
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents((textDisplay) =>
            textDisplay.setContent(`> Vous serez accompagné par <@${interaction.user.id}>`),
        );

    await interaction.channel.send({
        components: [claimContainer],
        flags: MessageFlags.IsComponentsV2,
    }).catch(() => null);

    const generalLogsChannelId = getGeneralLogsChannelId(db, interaction.guild.id);
    if (generalLogsChannelId) {
        const generalLogsChannel = await resolveGuildChannel(interaction.guild, generalLogsChannelId);
        if (generalLogsChannel) {
            const userId = interaction.channel.topic || 'Inconnu';
            const logText = [
                '## Ticket claim',
                '',
                `**Ticket**: ${interaction.channel.name}`,
                `**Utilisateur**: <@${userId}>`,
                `**Claim par**: ${interaction.user}`,
                '',
                `*${new Date().toLocaleString('fr-FR')}*`,
            ].join('\n');

            await generalLogsChannel.send({
                components: [buildContainer(logText)],
                flags: MessageFlags.IsComponentsV2,
                allowedMentions: LOG_ALLOWED_MENTIONS,
            }).catch(() => null);
        }
    }
}

async function createTranscript(channel) {
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
    transcript += `Date: ${new Date().toLocaleString('fr-FR')}\n`;
    transcript += `\n═══════════════════════════════════\n`;
    transcript += `MESSAGES (${sortedMessages.length})\n`;
    transcript += `═══════════════════════════════════\n\n`;

    for (const message of sortedMessages) {
        const timestamp = message.createdAt.toLocaleString('fr-FR');
        transcript += `[${timestamp}] ${message.author.tag}:\n`;
        if (message.content) transcript += `${message.content}\n`;
        if (message.attachments.size > 0) {
            transcript += `Pièces jointes: ${message.attachments.map((a) => a.url).join(', ')}\n`;
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
        ? path.resolve(__dirname, '../../../BotRuntimes', storageId, 'transcripts')
        : path.join(__dirname, '../transcripts');
    fs.mkdirSync(transcriptDir, { recursive: true });
    const filepath = path.join(transcriptDir, filename);
    fs.writeFileSync(filepath, transcript, 'utf8');

    return { filepath, filename };
}

function buildRatingTextBlock() {
    return [
        `> 1 Etoile : ${STARS_EMOJI}`,
        `> 2 Etoile : ${STARS_EMOJI} ${STARS_EMOJI}`,
        `> 3 Etoile : ${STARS_EMOJI} ${STARS_EMOJI} ${STARS_EMOJI}`,
        `> 4 Etoile : ${STARS_EMOJI} ${STARS_EMOJI} ${STARS_EMOJI} ${STARS_EMOJI}`,
        `> 5 Etoile : ${STARS_EMOJI} ${STARS_EMOJI} ${STARS_EMOJI} ${STARS_EMOJI} ${STARS_EMOJI}`,
    ].join('\n');
}

async function sendRatingPrompt({ client, db, guildId, ticketId, creatorId, claimerId }) {
    if (!creatorId || !claimerId) return false;

    db.set(`ticket_rating_${ticketId}`, {
        guildId,
        creatorId,
        claimerId,
        rated: false,
        createdAt: Date.now(),
    });

    const creatorUser = await client.users.fetch(creatorId).catch(() => null);
    if (!creatorUser) return false;

    const ratingContainer = new ContainerBuilder()
        .addTextDisplayComponents((textDisplay) =>
            textDisplay.setContent('## Comment c\'est passez votre ticket ?'),
        )
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents((textDisplay) =>
            textDisplay.setContent('> Cliquez sur le menu ci-dessous pour donner une note sur 5 au ticket'),
        )
        .addTextDisplayComponents((textDisplay) =>
            textDisplay.setContent(buildRatingTextBlock()),
        )
        .addSeparatorComponents((separator) => separator)
        .addActionRowComponents((actionRow) =>
            actionRow.setComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`ticket_rating_${ticketId}`)
                    .setPlaceholder('Donnez une note')
                    .addOptions([
                        { label: '1 Etoile', value: '1', description: 'Donner une note de 1/5' },
                        { label: '2 Etoile', value: '2', description: 'Donner une note de 2/5' },
                        { label: '3 Etoile', value: '3', description: 'Donner une note de 3/5' },
                        { label: '4 Etoile', value: '4', description: 'Donner une note de 4/5' },
                        { label: '5 Etoile', value: '5', description: 'Donner une note de 5/5' },
                    ]),
            ),
        );

    await creatorUser.send({
        components: [ratingContainer],
        flags: MessageFlags.IsComponentsV2,
    }).catch(() => null);

    return true;
}

async function closeTicket({ interaction, client, db, config }) {
    if (!interaction.guild || !interaction.channel?.topic) {
        await sendInteractionFeedback(interaction, "> Cette commande doit être utilisée dans un ticket.");
        return false;
    }

    const ticketTypeRaw = db.get(`ticket_type_${interaction.channel.id}`);
    const ticketConfig = resolveTicketConfig(db, interaction.guild.id, ticketTypeRaw);
    const claimedBy = db.get(`ticket_claim_${interaction.channel.id}`);

    if (!ticketConfig || !ticketConfig.role) {
        await sendInteractionFeedback(interaction, '> Configuration ticket introuvable. Utilisez /setcategorie et /setrole.');
        return false;
    }

    const canClose = canManageTicket(interaction, config, db, ticketConfig.role, claimedBy) || canCloseOwnTicket(interaction);

    if (!canClose) {
        await sendInteractionFeedback(interaction, "> Vous n'avez pas la permission de fermer ce ticket.");
        return false;
    }

    if (interaction.isButton()) {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate().catch(() => {});
        }
    } else if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});
    }

    const closeKey = `closeLimit_${interaction.user.id}`;
    const closeTimestamps = db.get(closeKey) || [];
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentCloses = closeTimestamps.filter((timestamp) => timestamp > oneMinuteAgo);

    if (recentCloses.length >= 3) {
        await sendInteractionFeedback(interaction, '## Limite atteinte\n\nVous avez atteint la limite de 3 fermetures par minute.');
        return false;
    }

    recentCloses.push(now);
    db.set(closeKey, recentCloses);

    const closeWarningContainer = new ContainerBuilder()
        .addTextDisplayComponents((textDisplay) =>
            textDisplay.setContent('## Fermeture du ticket'),
        )
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents((textDisplay) =>
            textDisplay.setContent('> Le ticket va bientot se fermer :p'),
        )
        .addSeparatorComponents((separator) => separator);

    await interaction.channel.send({
        components: [closeWarningContainer],
        flags: MessageFlags.IsComponentsV2,
    }).catch(() => null);

    await new Promise((resolve) => setTimeout(resolve, 5000));

    const { filepath, filename } = await createTranscript(interaction.channel);

    const generalLogsChannelId = getGeneralLogsChannelId(db, interaction.guild.id);
    if (generalLogsChannelId) {
        const generalLogsChannel = await resolveGuildChannel(interaction.guild, generalLogsChannelId);
        if (generalLogsChannel) {
            const userId = interaction.channel.topic || 'Inconnu';
            const logText = [
                '## Ticket ferme',
                '',
                `**Ticket**: ${interaction.channel.name}`,
                `**Utilisateur**: <@${userId}>`,
                `**Ferme par**: ${interaction.user}`,
                `**Claim par**: ${claimedBy ? `<@${claimedBy}>` : 'Aucun'}`,
                '',
                `*${new Date().toLocaleString('fr-FR')}*`,
            ].join('\n');

            await generalLogsChannel.send({
                components: [buildContainer(logText)],
                flags: MessageFlags.IsComponentsV2,
                allowedMentions: LOG_ALLOWED_MENTIONS,
            }).catch(() => null);
        }
    }

    const transcriptLogsChannelId = getTranscriptLogsChannelId(db, interaction.guild.id);
    const transcriptLogsChannel = transcriptLogsChannelId
        ? await resolveGuildChannel(interaction.guild, transcriptLogsChannelId)
        : null;

    const transcriptLogText = [
        '## Transcript ticket',
        '',
        `**Ticket**: ${interaction.channel.name}`,
        `**Ferme par**: ${interaction.user}`,
        '',
        `*${new Date().toLocaleString('fr-FR')}*`,
    ].join('\n');

    let transcriptSent = false;

    if (transcriptLogsChannel) {
        transcriptSent = await sendTranscriptLog(
            transcriptLogsChannel,
            transcriptLogText,
            filepath,
            filename,
        );
    }

    if (!transcriptSent && generalLogsChannelId) {
        const generalLogsChannel = await resolveGuildChannel(interaction.guild, generalLogsChannelId);
        if (generalLogsChannel) {
            await sendTranscriptLog(
                generalLogsChannel,
                transcriptLogText,
                filepath,
                filename,
            );
        }
    }

    if (claimedBy) {
        addCloseStat(db, interaction.guild.id, claimedBy);
        await refreshLeaderboardMessage({
            client,
            db,
            guildId: interaction.guild.id,
        }).catch(() => null);

        await sendRatingPrompt({
            client,
            db,
            guildId: interaction.guild.id,
            ticketId: interaction.channel.id,
            creatorId: interaction.channel.topic,
            claimerId: claimedBy,
        });
    }

    if (!interaction.isButton()) {
        await sendInteractionFeedback(interaction, '> Ticket fermé.');
    }

    await interaction.channel.delete().catch(() => null);
    return true;
}

async function handleRatingSelection({ interaction, db, client }) {
    if (!interaction.isStringSelectMenu()) return false;
    if (!interaction.customId.startsWith('ticket_rating_')) return false;

    const ticketId = interaction.customId.replace('ticket_rating_', '');
    const ratingKey = `ticket_rating_${ticketId}`;
    const ratingData = db.get(ratingKey);

    if (!ratingData) {
        await interaction.reply({ content: 'Cette notation est expirée ou introuvable.', ephemeral: true }).catch(() => {});
        return true;
    }

    if (interaction.user.id !== ratingData.creatorId) {
        await interaction.reply({ content: 'Seul le créateur du ticket peut noter.', ephemeral: true }).catch(() => {});
        return true;
    }

    if (ratingData.rated) {
        await interaction.reply({ content: 'Vous avez déjà noté ce ticket.', ephemeral: true }).catch(() => {});
        return true;
    }

    const stars = Math.max(1, Math.min(5, Number(interaction.values[0] || 0)));
    if (!stars) {
        await interaction.reply({ content: 'Note invalide.', ephemeral: true }).catch(() => {});
        return true;
    }

    addRatingStat(db, ratingData.guildId, ratingData.claimerId, stars);
    if (client) {
        await refreshLeaderboardMessage({
            client,
            db,
            guildId: ratingData.guildId,
        }).catch(() => null);
    }

    ratingData.rated = true;
    ratingData.stars = stars;
    ratingData.ratedAt = Date.now();
    db.set(ratingKey, ratingData);

    const starsDisplay = Array.from({ length: stars }, () => STARS_EMOJI).join(' ');
    await interaction.reply({
        components: [
            buildContainer(`## Merci pour votre avis\n> Votre note: ${starsDisplay}`),
        ],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
    }).catch(() => {});

    return true;
}

module.exports = {
    normalizeTicketType,
    resolveTicketConfig,
    claimTicket,
    closeTicket,
    handleRatingSelection,
};
