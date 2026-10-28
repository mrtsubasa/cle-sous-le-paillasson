const fs = require('fs');
const path = require('path');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    FileUploadBuilder,
    LabelBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    ModalBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActivityType,
} = require('discord.js');

const fetch = globalThis.fetch || require('node-fetch').default;

const DEFAULT_PRESENCE_STATE = {
    status: 'idle',
    activityType: ActivityType.Custom,
    activityName: '/zix',
    activityUrl: '',
    activityEmoji: '',
};

function getPresenceFile() {
    const storageId = String(process.env.BOT_STORAGE_ID || '').trim();
    if (storageId) {
        return path.resolve(__dirname, '../../../BotRuntimes', storageId, 'botpresence.json');
    }

    const cwd = path.resolve(process.cwd());
    if (cwd.split(path.sep).includes('BotRuntimes')) {
        return path.join(cwd, 'botpresence.json');
    }

    throw new Error('Runtime ticket introuvable pour botpresence.json');
}

function createContainer(text) {
    return new ContainerBuilder().addTextDisplayComponents((textDisplay) => textDisplay.setContent(text));
}

function buildCdnImageUrl(type, id, hash) {
    if (!hash) return null;
    const ext = hash.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/${type}/${id}/${hash}.${ext}?size=1024`;
}

function normalizePresenceState(raw) {
    if (!raw || typeof raw !== 'object') return null;

    return {
        status: ['online', 'idle', 'dnd', 'invisible'].includes(raw.status) ? raw.status : 'dnd',
        activityType: Number.isInteger(raw.activityType) ? raw.activityType : ActivityType.Custom,
        activityName: typeof raw.activityName === 'string' ? raw.activityName : 'Gestion du bot',
        activityUrl: typeof raw.activityUrl === 'string' ? raw.activityUrl : '',
        activityEmoji: typeof raw.activityEmoji === 'string' ? raw.activityEmoji : '',
    };
}

function readCurrentPresence(bot) {
    const presence = bot.user.presence;
    const activity = presence?.activities?.[0] ?? null;

    return normalizePresenceState({
        status: presence?.status || 'dnd',
        activityType: activity?.type ?? ActivityType.Custom,
        activityName: activity?.type === ActivityType.Custom
            ? (activity?.state || activity?.name || '/zix')
            : (activity?.name || '/zix'),
        activityUrl: activity?.url || '',
        activityEmoji: activity?.type === ActivityType.Custom ? (activity?.emoji?.name || '') : '',
    }) || {
        status: 'dnd',
        activityType: ActivityType.Custom,
        activityName: '/zix',
        activityUrl: '',
        activityEmoji: '',
    };
}

function loadSavedPresenceState() {
    try {
        const presenceFile = getPresenceFile();
        if (!fs.existsSync(presenceFile)) return null;
        const raw = fs.readFileSync(presenceFile, 'utf8');
        return normalizePresenceState(JSON.parse(raw));
    } catch (error) {
        console.error('Erreur lecture presence sauvegardee:', error);
        return null;
    }
}

function savePresenceState(state) {
    try {
        const presenceFile = getPresenceFile();
        const normalized = normalizePresenceState(state) || {
            status: 'dnd',
            activityType: ActivityType.Custom,
            activityName: 'Gestion du bot',
            activityUrl: '',
            activityEmoji: '',
        };
        fs.mkdirSync(path.dirname(presenceFile), { recursive: true });
        fs.writeFileSync(presenceFile, JSON.stringify(normalized, null, 2), 'utf8');
    } catch (error) {
        console.error('Erreur sauvegarde presence:', error);
    }
}

function presenceStateToPayload(state) {
    const normalized = normalizePresenceState(state) || {
        status: 'dnd',
        activityType: ActivityType.Custom,
        activityName: '/zix',
        activityUrl: '',
        activityEmoji: '',
    };

    const activities = normalized.activityName
        ? [{
            type: normalized.activityType,
            name: normalized.activityType === ActivityType.Custom ? 'Custom Status' : normalized.activityName,
            ...(normalized.activityType === ActivityType.Custom
                ? { state: `${normalized.activityEmoji ? `${normalized.activityEmoji} ` : ''}${normalized.activityName}`.trim() }
                : {}),
            ...(normalized.activityType === ActivityType.Streaming && normalized.activityUrl
                ? { url: normalized.activityUrl }
                : {}),
        }]
        : [];

    return {
        status: normalized.status === 'invisible' ? 'invisible' : normalized.status,
        activities,
    };
}

function formatStatus(status) {
    if (status === 'invisible') return 'offline (invisible)';
    return status || 'online';
}

function formatActivity(state) {
    if (!state.activityName) return '> Aucune activite definie';

    const typeLabel = {
        [ActivityType.Playing]: 'Playing',
        [ActivityType.Streaming]: 'Streaming',
        [ActivityType.Listening]: 'Listening',
        [ActivityType.Watching]: 'Watching',
        [ActivityType.Custom]: 'Custom',
        [ActivityType.Competing]: 'Competing',
    }[state.activityType] || `Type ${state.activityType}`;

    const urlPart = state.activityType === ActivityType.Streaming && state.activityUrl
        ? `\n> URL: ${state.activityUrl}`
        : '';

    const emojiPart = state.activityType === ActivityType.Custom && state.activityEmoji
        ? `${state.activityEmoji} `
        : '';

    return `> **Type :** ${typeLabel}\n> **Texte :** ${emojiPart}${state.activityName}${urlPart}`;
}

function getStatusInputValue(state) {
    return state.status === 'invisible' ? 'offline' : (state.status || 'online');
}

async function syncBotMedia(bot) {
    let currentAvatarUrl = bot.user.displayAvatarURL({ size: 1024 });
    let currentBannerUrl = bot.user.bannerURL({ size: 1024 });

    try {
        const userData = await bot.rest.get('/users/@me');
        currentAvatarUrl = buildCdnImageUrl('avatars', bot.user.id, userData.avatar) || currentAvatarUrl;
        currentBannerUrl = buildCdnImageUrl('banners', bot.user.id, userData.banner) || currentBannerUrl;
    } catch (error) {
        console.error('Erreur sync profil bot:', error);
    }

    return { currentAvatarUrl, currentBannerUrl };
}

async function uploadedImageToBuffer(attachment) {
    if (!attachment?.url) throw new Error('Aucun fichier fourni');

    const response = await fetch(attachment.url);
    if (!response.ok) throw new Error('Impossible de telecharger le fichier');

    const contentType = attachment.contentType || response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
        throw new Error('Le fichier doit etre une image');
    }

    return Buffer.from(await response.arrayBuffer());
}

function buildPanel(bot, state, currentAvatarUrl, currentBannerUrl, panelId, disabled = false) {
    const container = new ContainerBuilder()
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents((text) => text.setContent('# Panel de gestion du bot'))
        .addTextDisplayComponents((text) => text.setContent('> Modifie le nom, la pp, la banner, le statut et l activite en temps reel'))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents((text) => text.setContent('# Infos actuelles'))
        .addTextDisplayComponents((text) => text.setContent(`> **Nom :** \`${bot.user.username}\`\n> **Status :** \`${formatStatus(state.status)}\`\n${formatActivity(state)}`));

    if (currentAvatarUrl || currentBannerUrl) {
        const gallery = new MediaGalleryBuilder();
        if (currentAvatarUrl) {
            gallery.addItems(new MediaGalleryItemBuilder().setURL(currentAvatarUrl));
        }
        if (currentBannerUrl) {
            gallery.addItems(new MediaGalleryItemBuilder().setURL(currentBannerUrl));
        }
        container
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents((text) => text.setContent('# Apercu visuel'))
            .addMediaGalleryComponents(gallery);
    }

    const nameButton = new ButtonBuilder()
        .setCustomId(`${panelId}:name`)
        .setLabel('Modifier nom')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);

    const avatarButton = new ButtonBuilder()
        .setCustomId(`${panelId}:avatar`)
        .setLabel('Modifier pp')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);

    const bannerButton = new ButtonBuilder()
        .setCustomId(`${panelId}:banner`)
        .setLabel('Modifier banner')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);

    const activityButton = new ButtonBuilder()
        .setCustomId(`${panelId}:activity`)
        .setLabel('Modifier activite')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);

    const statusButton = new ButtonBuilder()
        .setCustomId(`${panelId}:status`)
        .setLabel('Modifier status')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);

    return container
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addActionRowComponents((row) => row.setComponents(nameButton, avatarButton, bannerButton))
        .addActionRowComponents((row) => row.setComponents(activityButton, statusButton))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
}

async function openBotProfilePanel(bot, db, config, interaction) {
    const privilegedIds = config.buyers || config.owners || [];
    const isOwner =
        interaction.guild &&
        (db.get(`Owner_${interaction.guild.id}-${interaction.user.id}`) ||
            privilegedIds.includes(interaction.user.id) ||
            interaction.user.id === interaction.guild.ownerId);

    if (!isOwner) {
        return interaction.reply({
            components: [createContainer(`> Vous n'avez pas les permissions pour exécuter cette commande`)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        }).catch(() => {});
    }

    const panelId = `botprofile:${interaction.id}`;
    let presenceState = loadSavedPresenceState() || readCurrentPresence(bot);
    savePresenceState(presenceState);
    let { currentAvatarUrl, currentBannerUrl } = await syncBotMedia(bot);

    const refreshPanel = async (disabled = false) => {
        ({ currentAvatarUrl, currentBannerUrl } = await syncBotMedia(bot));
        await interaction.editReply({
            components: [buildPanel(bot, presenceState, currentAvatarUrl, currentBannerUrl, panelId, disabled)],
            flags: MessageFlags.IsComponentsV2,
        });
    };

    const sendFeedback = async (currentInteraction, content) => {
        const payload = {
            components: [createContainer(content)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        };

        if (currentInteraction.replied || currentInteraction.deferred) {
            return currentInteraction.followUp(payload);
        }

        return currentInteraction.reply(payload);
    };

    await interaction.reply({
        components: [buildPanel(bot, presenceState, currentAvatarUrl, currentBannerUrl, panelId)],
        flags: MessageFlags.IsComponentsV2,
    });

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ time: 300000 });

    const handleModal = async (modal) => {
        if (!modal.isModalSubmit()) return;
        if (modal.user.id !== interaction.user.id) return;
        if (!modal.customId.startsWith(panelId)) return;

        if (modal.customId === `${panelId}:nameModal`) {
            await modal.deferReply({ flags: MessageFlags.Ephemeral });

            const newName = modal.fields.getTextInputValue('botNameInput').trim();
            if (!newName) {
                return modal.editReply({ content: '> Le nom ne peut pas etre vide' });
            }

            try {
                await bot.user.setUsername(newName);
                await refreshPanel();
                return modal.editReply({ content: `> Nom du bot mis a jour en \`${bot.user.username}\`` });
            } catch (error) {
                console.error('Erreur nom bot:', error);
                return modal.editReply({ content: `> Impossible de modifier le nom du bot : ${error.message}` });
            }
        }

        if (modal.customId === `${panelId}:statusModal`) {
            await modal.deferReply({ flags: MessageFlags.Ephemeral });

            const rawStatus = modal.fields.getTextInputValue('statusInput').trim().toLowerCase();
            const statusMap = {
                online: 'online',
                idle: 'idle',
                dnd: 'dnd',
                invisible: 'invisible',
                offline: 'invisible',
            };

            const status = statusMap[rawStatus];
            if (!status) {
                return modal.editReply({ content: '> Status invalide Choisis online, idle, dnd, invisible ou offline' });
            }

            try {
                presenceState = {
                    ...presenceState,
                    status,
                };
                savePresenceState(presenceState);
                await bot.user.setPresence(presenceStateToPayload(presenceState));
                savePresenceState(presenceState);
                await refreshPanel();
                return modal.editReply({ content: `> Status mis a jour : \`${status === 'invisible' ? 'offline (invisible)' : status}\`` });
            } catch (error) {
                console.error('Erreur status bot:', error);
                return modal.editReply({ content: `> Impossible de modifier le status : ${error.message}` });
            }
        }

        if (modal.customId === `${panelId}:activityModal`) {
            await modal.deferReply({ flags: MessageFlags.Ephemeral });

            const rawType = modal.fields.getTextInputValue('activityTypeInput').trim();
            const activityText = modal.fields.getTextInputValue('activityTextInput').trim();
            const activityUrl = modal.fields.getTextInputValue('activityUrlInput').trim();
            const activityEmoji = modal.fields.getTextInputValue('activityEmojiInput').trim();

            const type = Number.parseInt(rawType, 10);
            if (!Number.isInteger(type) || type < 0 || type > 5) {
                return modal.editReply({ content: '> Type invalide. Utilise un nombre entre 0 et 5' });
            }

            if (!activityText) {
                return modal.editReply({ content: '> Le texte de l activite ne peut pas etre vide' });
            }

            if (type === ActivityType.Streaming && !activityUrl) {
                return modal.editReply({ content: '> Le type Streaming demande une URL' });
            }

            const activityPayload = {
                type,
                name: type === ActivityType.Custom ? 'Custom Status' : activityText,
            };

            if (type === ActivityType.Streaming) {
                activityPayload.url = activityUrl;
            }

            if (type === ActivityType.Custom) {
                activityPayload.state = `${activityEmoji ? `${activityEmoji} ` : ''}${activityText}`.trim();
            }

            try {
                presenceState = {
                    ...presenceState,
                    activityType: type,
                    activityName: activityText,
                    activityUrl: type === ActivityType.Streaming ? activityUrl : '',
                    activityEmoji: type === ActivityType.Custom ? activityEmoji : '',
                };
                savePresenceState(presenceState);
                await bot.user.setPresence({
                    ...presenceStateToPayload(presenceState),
                    activities: [activityPayload],
                });
                savePresenceState(presenceState);
                await refreshPanel();
                return modal.editReply({ content: '> Activite du bot mise a jour' });
            } catch (error) {
                console.error('Erreur activite bot:', error);
                return modal.editReply({ content: `> Impossible de modifier l activite : ${error.message}` });
            }
        }

        if (modal.customId === `${panelId}:avatarModal`) {
            await modal.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                const uploadedFiles = modal.fields.getUploadedFiles('avatar_upload', true);
                const file = uploadedFiles?.first();
                if (!file) throw new Error('Aucune image fournie');

                const buffer = await uploadedImageToBuffer(file);
                await bot.user.setAvatar(buffer);
                await refreshPanel();
                return modal.editReply({ content: '> Photo de profil du bot mise a jour' });
            } catch (error) {
                console.error('Erreur avatar bot:', error);
                return modal.editReply({ content: `> Impossible de modifier la pp : ${error.message}` });
            }
        }

        if (modal.customId === `${panelId}:bannerModal`) {
            await modal.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                const uploadedFiles = modal.fields.getUploadedFiles('banner_upload', true);
                const file = uploadedFiles?.first();
                if (!file) throw new Error('Aucune image fournie');

                const buffer = await uploadedImageToBuffer(file);
                await bot.user.setBanner(buffer);
                await refreshPanel();
                return modal.editReply({ content: '> Banner du bot mise a jour' });
            } catch (error) {
                console.error('Erreur banner bot:', error);
                return modal.editReply({ content: `> Impossible de modifier la banner : ${error.message}` });
            }
        }
    };

    bot.on('interactionCreate', handleModal);

    collector.on('collect', async (buttonInteraction) => {
        if (buttonInteraction.user.id !== interaction.user.id) return;

        if (buttonInteraction.customId === `${panelId}:name`) {
            const modal = new ModalBuilder()
                .setCustomId(`${panelId}:nameModal`)
                .setTitle('Modifier le nom du bot')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('botNameInput')
                            .setLabel('Nouveau nom')
                            .setStyle(TextInputStyle.Short)
                            .setValue(bot.user.username)
                            .setRequired(true),
                    ),
                );

            return buttonInteraction.showModal(modal);
        }

        if (buttonInteraction.customId === `${panelId}:status`) {
            const modal = new ModalBuilder()
                .setCustomId(`${panelId}:statusModal`)
                .setTitle('Modifier le status')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('statusInput')
                            .setLabel('online / idle / dnd / invisible / offline')
                            .setStyle(TextInputStyle.Short)
                            .setValue(getStatusInputValue(presenceState))
                            .setRequired(true),
                    ),
                );

            return buttonInteraction.showModal(modal);
        }

        if (buttonInteraction.customId === `${panelId}:activity`) {
            const modal = new ModalBuilder()
                .setCustomId(`${panelId}:activityModal`)
                .setTitle('Modifier l activite')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('activityTypeInput')
                            .setLabel('Type 0-5')
                            .setStyle(TextInputStyle.Short)
                            .setValue(String(presenceState.activityType))
                            .setRequired(true),
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('activityTextInput')
                            .setLabel('Texte / nom de l activite')
                            .setStyle(TextInputStyle.Paragraph)
                            .setValue(presenceState.activityName || '')
                            .setRequired(true),
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('activityUrlInput')
                            .setLabel('URL streaming (type 1 seulement)')
                            .setStyle(TextInputStyle.Short)
                            .setValue(presenceState.activityUrl || '')
                            .setRequired(false),
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('activityEmojiInput')
                            .setLabel('Emoji custom (type 4 seulement)')
                            .setStyle(TextInputStyle.Short)
                            .setValue(presenceState.activityEmoji || '')
                            .setRequired(false),
                    ),
                );

            return buttonInteraction.showModal(modal);
        }

        if (buttonInteraction.customId === `${panelId}:avatar`) {
            const modal = new ModalBuilder()
                .setCustomId(`${panelId}:avatarModal`)
                .setTitle('Modifier la photo de profil')
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel('Upload de la photo de profil')
                        .setDescription('Envoie une image pour remplacer la photo de profil du bot')
                        .setFileUploadComponent(
                            new FileUploadBuilder()
                                .setCustomId('avatar_upload')
                                .setMinValues(1)
                                .setMaxValues(1)
                                .setRequired(true),
                        ),
                );

            return buttonInteraction.showModal(modal);
        }

        if (buttonInteraction.customId === `${panelId}:banner`) {
            const modal = new ModalBuilder()
                .setCustomId(`${panelId}:bannerModal`)
                .setTitle('Modifier la banner')
                .addLabelComponents(
                    new LabelBuilder()
                        .setLabel('Upload de la banner')
                        .setDescription('Envoie une image pour remplacer la banner du bot')
                        .setFileUploadComponent(
                            new FileUploadBuilder()
                                .setCustomId('banner_upload')
                                .setMinValues(1)
                                .setMaxValues(1)
                                .setRequired(true),
                        ),
                );

            return buttonInteraction.showModal(modal);
        }
    });

    collector.on('end', async () => {
        bot.off('interactionCreate', handleModal);
        await refreshPanel(true).catch(() => {});
    });
}

module.exports = {
    DEFAULT_PRESENCE_STATE,
    getPresenceFile,
    loadSavedPresenceState,
    readCurrentPresence,
    savePresenceState,
    presenceStateToPayload,
    openBotProfilePanel,
};
