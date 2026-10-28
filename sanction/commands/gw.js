const { data, saveGwConfig, saveGiveaways } = require('../utils/state');
const { hasPermissionForCommand } = require('../utils/permissions');
const { noCard, permissionCard } = require('../utils/cards');

const panelOwners = new Map();
const panelLocks = new Set();
const panelLaunchInProgress = new Set();
const processedLaunchInteractions = new Set();
const awaitingInputs = new Map();
const giveawayTimers = new Map();

const MAX_TIMEOUT_MS = 2147483647;
const DEFAULT_DURATION_MS = 30 * 60 * 1000;
const MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function ensureGuildConfig(guildId) {
    if (!data.gwConfig[guildId]) {
        data.gwConfig[guildId] = {};
    }

    const cfg = data.gwConfig[guildId];
    if (!cfg.title || typeof cfg.title !== 'string') cfg.title = 'Giveaway';
    if (!cfg.channelId || typeof cfg.channelId !== 'string') cfg.channelId = null;
    if (!Number.isInteger(cfg.durationMs) || cfg.durationMs <= 0) cfg.durationMs = DEFAULT_DURATION_MS;
    if (!Number.isInteger(cfg.winnersCount) || cfg.winnersCount <= 0) cfg.winnersCount = 1;
    if (cfg.buttonEmoji === undefined) cfg.buttonEmoji = null;
    if (typeof cfg.buttonLabel !== 'string') cfg.buttonLabel = 'Participer';
    if (!Array.isArray(cfg.uhqUserIds)) cfg.uhqUserIds = [];

    cfg.uhqUserIds = Array.from(new Set(cfg.uhqUserIds.map((id) => String(id).trim()).filter(Boolean)));

    return cfg;
}

function ensureGiveawaysStore() {
    if (!data.giveaways || typeof data.giveaways !== 'object' || Array.isArray(data.giveaways)) {
        data.giveaways = {};
    }
    return data.giveaways;
}

function getGuildGiveaways(guildId) {
    const gid = String(guildId);
    const store = ensureGiveawaysStore();
    return Object.values(store).filter((gw) => gw && String(gw.guildId) === gid);
}

function createGiveawayId(guildId) {
    return `${guildId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatDuration(ms) {
    const totalSeconds = Math.max(1, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0 && minutes > 0) return `${hours}h${minutes}m`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0 && seconds > 0) return `${minutes}m${seconds}s`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
}

function parseDurationInput(input) {
    const match = String(input || '').trim().match(/^(\d+)\s*([smhd])$/i);
    if (!match) return null;

    const value = parseInt(match[1], 10);
    if (!Number.isInteger(value) || value <= 0) return null;

    const unit = match[2].toLowerCase();
    let multiplier = 1000;
    if (unit === 'm') multiplier = 60 * 1000;
    if (unit === 'h') multiplier = 60 * 60 * 1000;
    if (unit === 'd') multiplier = 24 * 60 * 60 * 1000;

    const ms = value * multiplier;
    if (ms > MAX_DURATION_MS) return { error: 'max' };

    return { ms };
}

function parseChannelId(input) {
    const raw = String(input || '').trim();
    const mention = raw.match(/^<#(\d+)>$/);
    if (mention) return mention[1];
    const id = raw.match(/^(\d{16,21})$/);
    if (id) return id[1];
    return null;
}

function parseEmojiOnly(rawInput) {
    const raw = String(rawInput || '').trim();
    if (!raw) return { error: true };

    if (raw.toLowerCase() === 'aucun') return { value: null };

    const custom = raw.match(/^<(a?):([a-zA-Z0-9_]+):(\d+)>$/);
    if (custom) {
        return {
            value: {
                id: custom[3],
                name: custom[2],
                animated: custom[1] === 'a'
            }
        };
    }

    if (raw.length <= 32 && !raw.includes(' ')) {
        return { value: { name: raw } };
    } return { error : true };
}

function parseButtonInput(input) {
    const raw = String(input || '').trim();
    if (!raw) return { error: true, message: 'Format invalide' };

    if (raw.includes(',,')) {
        const parts = raw.split(',,');
        const left = (parts.shift() || '').trim();
        const right = parts.join(',,').trim();

        const emojiParsed = parseEmojiOnly(left || 'aucun');
        if (emojiParsed.error) {
            return { error: true, message: 'Emoji invalide dans le format "emoji,, texte"' };
        }

        if (!emojiParsed.value && !right) {
            return { error: true, message: 'Sans emoji, le texte du bouton est obligatoire' };
        }

        return {
            value: {
                emoji: emojiParsed.value,
                label: right
            }
        };
    }

    let emojiToken = '';
    let label = '';

    const customEmoji = raw.match(/^<(a?):([a-zA-Z0-9_]+):(\d+)>/);
    if (customEmoji) {
        emojiToken = customEmoji[0];
        label = raw.slice(customEmoji[0].length).trim();
    } else {
        const spaceIndex = raw.indexOf(' ');
        if (spaceIndex === -1) {
            emojiToken = raw;
        } else {
            emojiToken = raw.slice(0, spaceIndex).trim();
            label = raw.slice(spaceIndex + 1).trim();
        }
    }

    const emojiParsed = parseEmojiOnly(emojiToken || 'aucun');
    if (emojiParsed.error) {
        return { error: true, message: 'Format attendu : "emoji" ou "emoji texte"' };
    }

    if (!emojiParsed.value && !label) {
        return { error: true, message: 'Sans emoji, le texte du bouton est obligatoire' };
    }

    return {
        value: {
            emoji: emojiParsed.value,
            label
        }
    };
}

function parseMemberIdsInput(input) {
    const raw = String(input || '').trim();
    if (!raw) return [];
    if (raw.toLowerCase() === 'aucun') return [];

    const ids = new Set();
    const regex = /<@!(\d{16,21})>|(\d{16,21})/g;
    let match = null;

    while ((match = regex.exec(raw)) !== null) {
        const id = match[1] || match[2];
        if (id) ids.add(String(id));
    }

    return Array.from(ids);
}

function emojiToString(emoji) {
    if (!emoji) return 'Aucun';
    if (emoji.id && emoji.name) {
        return emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
    }
    return emoji.name || 'Aucun';
}

function buttonEmojiPayload(emoji) {
    if (!emoji) return undefined;
    if (emoji.id && emoji.name) {
        return {
            id: String(emoji.id),
            name: emoji.name,
            animated: !!emoji.animated
        };
    } if (emoji.name) return { name : emoji.name };
    return undefined;
}

function sanitizeParticipants(participants) {
    if (!Array.isArray(participants)) return [];
    const unique = new Set();
    for (const id of participants) {
        const parsed = String(id || '').trim();
        if (parsed) unique.add(parsed);
    }
    return Array.from(unique);
}

function buildPanelCard(guild, options = {}) {
    const { hideMenu = false } = options;

    const guildId = String(guild.id);
    const cfg = ensureGuildConfig(guildId);
    const activeCount = getGuildGiveaways(guildId).length;
    const uhqText = cfg.uhqUserIds.length ? cfg.uhqUserIds.map((id) => `<@${id}>`).join(', ') : 'Aucun';
    const buttonText = `${emojiToString(cfg.buttonEmoji)}${cfg.buttonLabel ? ` | ${cfg.buttonLabel}` : ''}`;

    const lines = [
        `> Nom : **${cfg.title}**`,
        `> Salon : ${cfg.channelId ? `<#${cfg.channelId}>` : 'Non d\u00e9fini'}`,
        `> Temps : **${formatDuration(cfg.durationMs)}**`,
        `> Bouton : ${buttonText}`,
        `> Nombre de gagnants : **${cfg.winnersCount}**`,
        `> Uhq : ${uhqText}`,
        `*Giveaways en cours : ${activeCount}*`
    ].join('\n\n');

    const panelComponents = [
        { type: 10, content: '# Panel giveaway' },
        { type: 14, divider: true },
        { type: 10, content: lines },
        { type: 14, divider: true }
    ];

    if (!hideMenu) {
        panelComponents.push({
            type: 1,
            components: [{
                type: 3,
                custom_id: 'gw_action',
                placeholder: 'Choisir une option',
                options: [
                    { label: 'Nom du giveaway', value: 'set_title' },
                    { label: 'Salon du giveaway', value: 'set_channel' },
                    { label: 'Temps du giveaway', value: 'set_duration' },
                    { label: 'Emoji du bouton', value: 'set_button' },
                    { label: 'Uhq', value: 'set_uhq' },
                    { label: 'Nombre de gagnants', value: 'set_winners' },
                    { label: 'Lancer le gw', value: 'launch' },
                    { label: 'Annuler le gw', value: 'cancel' }
                ]
            }]
        });
    }

    return {
        flags: 32768,
        components: [{
            type: 17,
            components: panelComponents
        }]
    };
}

function buildInputCard(prompt, details) {
    const promptContent = `### > ${prompt}`;
    const detailsContent = details ? `> ${details}` : null;

    const inputComponents = [
        { type: 10, content: `# Panel giveaway\n> ${details}` },
        { type: 14, divider: true },
        { type: 10, content: promptContent },
    ];

    inputComponents.push({ type: 14, divider: true });

    return {
        flags: 32768,
        components: [{
            type: 17,
            components: inputComponents
        }]
    };
}

function buildLiveGiveawayCard(giveaway) {
    const participantCount = sanitizeParticipants(giveaway.participants).length;
    const emojiText = emojiToString(giveaway.buttonEmoji);
    const instruction = giveaway.buttonEmoji ? `> Interagissez avec le bouton ${emojiText} ci-dessous pour participer au giveaway` : '> Interagissez avec le bouton ci-dessous pour participer au giveaway';

    const button = {
        type: 2,
        custom_id: `gw_join_${giveaway.id}`,
        style: 2
    };

    const normalizedLabel = typeof giveaway.buttonLabel === 'string' ? giveaway.buttonLabel.trim() : '';
    if (normalizedLabel) {
        button.label = normalizedLabel;
    }

    const emoji = buttonEmojiPayload(giveaway.buttonEmoji);
    if (emoji) button.emoji = emoji;

    if (!button.label && !button.emoji) {
        button.label = 'Participer';
    }

    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 10, content: `# ${giveaway.title}` },
                { type: 10, content: instruction },
                { type: 14, divider: true },
                { type: 10, content: `> *Participants : ${participantCount}*\n> *Gagnants : ${giveaway.winnersCount}*\n> Fin dans <t:${Math.floor(giveaway.endAt / 1000)}:R>` },
                {
                    type: 1,
                    components: [button]
                }
            ]
        }]
    };
}

function buildFinishedGiveawayCard(giveaway, winnerIds) {
    const winnersText = winnerIds.length ? winnerIds.map((id) => `<@${id}>`).join('\n') : 'Aucun gagnant';

    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 10, content: `# ${giveaway.title}` },
                { type: 14, divider: true },
                { type: 10, content: `**Gagnants :**\n${winnersText}` }
            ]
        }]
    };
}

function clearTimer(giveawayId) {
    const existing = giveawayTimers.get(String(giveawayId));
    if (existing) {
        clearTimeout(existing);
        giveawayTimers.delete(String(giveawayId));
    }
}

function removeGiveaway(giveawayId) {
    const gid = String(giveawayId);
    clearTimer(gid);
    const store = ensureGiveawaysStore();
    if (store[gid]) {
        delete store[gid];
        saveGiveaways();
    }
}

function sampleWinners(participants, winnersCount, uhqUserIds) {
    const pool = sanitizeParticipants(participants);
    const uhqGuaranteed = sanitizeParticipants(uhqUserIds);
    const uhqSet = new Set(uhqGuaranteed);

    const others = pool.filter((id) => !uhqSet.has(id));

    for (let i = others.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [others[i], others[j]] = [others[j], others[i]];
    }

    if (uhqGuaranteed.length >= winnersCount) {
        return uhqGuaranteed;
    }

    return uhqGuaranteed.concat(others.slice(0, Math.max(0, winnersCount - uhqGuaranteed.length)));
}

function findGiveawayByMessage(guildId, messageId) {
    const gid = String(guildId);
    const mid = String(messageId);
    return getGuildGiveaways(gid).find((gw) => String(gw.messageId) === mid) || null;
}

async function finishGiveaway(client, giveawayId) {
    const store = ensureGiveawaysStore();
    const giveaway = store[String(giveawayId)];
    if (!giveaway) return;

    clearTimer(giveaway.id);

    const winners = sampleWinners(giveaway.participants, giveaway.winnersCount, giveaway.uhqUserIds);

    const guild = client.guilds.cache.get(String(giveaway.guildId))
        || await client.guilds.fetch(String(giveaway.guildId)).catch(() => null);

    if (!guild) {
        removeGiveaway(giveaway.id);
        return;
    }

    const channel = guild.channels.cache.get(String(giveaway.channelId))
        || await guild.channels.fetch(String(giveaway.channelId)).catch(() => null);

    if (!channel || !channel.isTextBased()) {
        removeGiveaway(giveaway.id);
        return;
    }

    const giveawayMessage = await channel.messages.fetch(String(giveaway.messageId)).catch(() => null);
    if (giveawayMessage) {
        const finishedCard = buildFinishedGiveawayCard(giveaway, winners);
        await giveawayMessage.edit({ ...finishedCard, allowedMentions: { parse: [] } }).catch(() => {});
    }

    if (winners.length) {
        const mentions = winners.map((id) => `<@${id}>`).join(', ');
        await channel.send({
            content: `F\u00e9licitations ${mentions} vous avez remport\u00e9 : **${giveaway.title}** !`
        }).catch(() => {});
    }

    removeGiveaway(giveaway.id);
}

function scheduleGiveaway(client, giveawayId) {
    const store = ensureGiveawaysStore();
    const giveaway = store[String(giveawayId)];

    if (!giveaway || !Number.isInteger(giveaway.endAt)) {
        removeGiveaway(giveawayId);
        return;
    }

    clearTimer(giveaway.id);

    const remainingMs = giveaway.endAt - Date.now();
    if (remainingMs <= 0) {
        finishGiveaway(client, giveaway.id);
        return;
    }

    if (remainingMs > MAX_TIMEOUT_MS) {
        const timeout = setTimeout(() => scheduleGiveaway(client, giveaway.id), MAX_TIMEOUT_MS);
        giveawayTimers.set(String(giveaway.id), timeout);
        return;
    }

    const timeout = setTimeout(() => finishGiveaway(client, giveaway.id), remainingMs);
    giveawayTimers.set(String(giveaway.id), timeout);
}

async function refreshLiveMessage(client, giveawayId) {
    const store = ensureGiveawaysStore();
    const giveaway = store[String(giveawayId)];
    if (!giveaway) return;

    const guild = client.guilds.cache.get(String(giveaway.guildId))
        || await client.guilds.fetch(String(giveaway.guildId)).catch(() => null);

    if (!guild) {
        removeGiveaway(giveaway.id);
        return;
    }

    const channel = guild.channels.cache.get(String(giveaway.channelId))
        || await guild.channels.fetch(String(giveaway.channelId)).catch(() => null);

    if (!channel || !channel.isTextBased()) {
        removeGiveaway(giveaway.id);
        return;
    }

    const giveawayMessage = await channel.messages.fetch(String(giveaway.messageId)).catch(() => null);
    if (!giveawayMessage) {
        removeGiveaway(giveaway.id);
        return;
    } await giveawayMessage.edit({ ...buildLiveGiveawayCard(giveaway), allowedMentions : { parse: [] } }).catch(() => {});
}

async function launchGiveaway(client, guild, userId) {
    const guildId = String(guild.id);
    const cfg = ensureGuildConfig(guildId);

    if (!cfg.channelId) {
        return { error: 'Vous devez d\u00e9finir un salon giveaway avant de lancer le gw' };
    }

    const channel = guild.channels.cache.get(String(cfg.channelId))
        || await guild.channels.fetch(String(cfg.channelId)).catch(() => null);

    if (!channel || !channel.isTextBased()) {
        return { error: 'Le salon giveaway est introuvable ou invalide' };
    }

    const giveaway = {
        id: createGiveawayId(guildId),
        guildId,
        channelId: String(cfg.channelId),
        messageId: null,
        title: String(cfg.title).trim() || 'Giveaway',
        winnersCount: Math.max(1, parseInt(cfg.winnersCount, 10) || 1),
        buttonEmoji: cfg.buttonEmoji || null,
        buttonLabel: typeof cfg.buttonLabel === 'string' ? cfg.buttonLabel : 'Participer',
        uhqUserIds: Array.isArray(cfg.uhqUserIds) ? cfg.uhqUserIds.map((id) => String(id)) : [],
        participants: [],
        endAt: Date.now() + cfg.durationMs,
        createdBy: String(userId),
        createdAt: Date.now()
    };

    let sendError = null;
    let sent = await channel.send({
        ...buildLiveGiveawayCard(giveaway),
        allowedMentions: { parse: [] }
    }).catch((error) => {
        sendError = error;
        return null;
    });

    if (!sent && giveaway.buttonEmoji) {
        giveaway.buttonEmoji = null;
        if (!String(giveaway.buttonLabel || '').trim()) {
            giveaway.buttonLabel = 'Participer';
        }

        sent = await channel.send({
            ...buildLiveGiveawayCard(giveaway),
            allowedMentions: { parse: [] }
        }).catch((error) => {
            sendError = error;
            return null;
        });
    }

    if (!sent) {
        const message = String(sendError && sendError.message ? sendError.message : '').toLowerCase();
        if (sendError && sendError.code === 50013) {
            return { error: 'Le bot n\'a pas la permission d\'envoyer des messages dans le salon configur\u00e9' };
        }
        if (message.includes('emoji') || message.includes('invalid form body') || message.includes('component')) {
            return { error: 'Le bouton du giveaway est invalide (emoji indisponible ou format incorrect)' };
        }
        return { error: 'Impossible d\'envoyer le giveaway dans le salon configur\u00e9' };
    }

    giveaway.messageId = String(sent.id);
    const store = ensureGiveawaysStore();
    store[giveaway.id] = giveaway;
    saveGiveaways();
    cfg.uhqUserIds = [];
    saveGwConfig();
    scheduleGiveaway(client, giveaway.id);

    return { ok: true, giveawayId: giveaway.id };
}


function markLaunchInteractionProcessed(interactionId) {
    const key = String(interactionId || '');
    if (!key) return false;
    if (processedLaunchInteractions.has(key)) return true;

    processedLaunchInteractions.add(key);
    setTimeout(() => {
        processedLaunchInteractions.delete(key);
    }, 2 * 60 * 1000);

    return false;
}async function cancelGiveawayById(client, giveawayId) {
    const store = ensureGiveawaysStore();
    const giveaway = store[String(giveawayId)];
    if (!giveaway) return false;

    clearTimer(giveaway.id);

    const guild = client.guilds.cache.get(String(giveaway.guildId))
        || await client.guilds.fetch(String(giveaway.guildId)).catch(() => null);

    if (guild) {
        const channel = guild.channels.cache.get(String(giveaway.channelId))
            || await guild.channels.fetch(String(giveaway.channelId)).catch(() => null);

        if (channel && channel.isTextBased()) {
            const giveawayMessage = await channel.messages.fetch(String(giveaway.messageId)).catch(() => null);
            if (giveawayMessage) {
                await giveawayMessage.delete().catch(() => {});
            }
        }
    }

    removeGiveaway(giveaway.id);
    return true;
}

async function cancelLatestGiveaway(client, guildId) {
    const giveaways = getGuildGiveaways(guildId)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (!giveaways.length) return false;
    return cancelGiveawayById(client, giveaways[0].id);
}

function setAwaitingInput(interaction, field) {
    awaitingInputs.set(`${interaction.user.id}:${interaction.channel.id}`, {
        field,
        messageId: interaction.message.id
    });
}

function updateSafe(interaction, payload) {
    return interaction.update({ ...payload, allowedMentions: { parse: [] } });
}

function showPanelErrorThenBack(channel, panelMessageId, panelCard, errorText) {
    const errorCard = noCard(errorText);

    if (!panelMessageId) {
        channel.send({ ...errorCard, allowedMentions: { parse: [] } }).catch(() => {});
        return;
    }

    channel.messages.fetch(panelMessageId)
        .then((panelMessage) => {
            panelMessage.edit({ ...errorCard, allowedMentions: { parse: [] } }).catch(() => {});
            setTimeout(() => {
                panelMessage.edit({ ...panelCard, allowedMentions: { parse: [] } }).catch(() => {});
            }, 3000);
        })
        .catch(() => {
            channel.send({ ...errorCard, allowedMentions: { parse: [] } }).catch(() => {});
        });
}

function handleAwaiting(message) {
    const key = `${message.author.id}:${message.channel.id}`;
    if (!awaitingInputs.has(key)) return false;

    const payload = awaitingInputs.get(key);
    awaitingInputs.delete(key);

    const guildId = String(message.guild.id);
    const cfg = ensureGuildConfig(guildId);
    const hideMenu = !!(payload.messageId && panelLocks.has(String(payload.messageId)));
    const raw = String(message.content || '').trim();

    if (hideMenu) {
        message.delete().catch(() => {});
        return true;
    }

    let error = null;

    if (payload.field === 'title') {
        if (!raw.length) {
            error = 'Le nom du giveaway ne peut pas \u00eatre vide';
        } else {
            cfg.title = raw.slice(0, 120);
            saveGwConfig();
        }
    }

    if (payload.field === 'channel') {
        const channelId = parseChannelId(raw);
        const channel = channelId ? message.guild.channels.cache.get(channelId) : null;
        if (!channel || !channel.isTextBased()) {
            error = 'Salon invalide, envoyez une mention de salon ou un ID valide';
        } else {
            cfg.channelId = String(channel.id);
            saveGwConfig();
        }
    }

    if (payload.field === 'duration') {
        const parsed = parseDurationInput(raw);
        if (!parsed) {
            error = 'Temps invalide, exemple : 30s, 10m, 1h';
        } else if (parsed.error === 'max') {
            error = 'Le temps maximum est de 30 jours';
        } else {
            cfg.durationMs = parsed.ms;
            saveGwConfig();
        }
    }

    if (payload.field === 'button') {
        const parsed = parseButtonInput(raw);
        if (parsed.error) {
            error = parsed.message || 'Format invalide';
        } else {
            cfg.buttonEmoji = parsed.value.emoji;
            cfg.buttonLabel = parsed.value.label;
            saveGwConfig();
        }
    }

    if (payload.field === 'uhq') {
        const ids = parseMemberIdsInput(raw);
        if (raw.toLowerCase() !== 'aucun' && !ids.length) {
            error = 'Aucun membre valide trouv\u00e9. Utilisez @membre ou id';
        } else {
            cfg.uhqUserIds = ids;
            saveGwConfig();
        }
    }

    if (payload.field === 'winners') {
        const winnersCount = parseInt(raw, 10);
        if (!Number.isInteger(winnersCount) || winnersCount <= 0) {
            error = 'Nombre de gagnants invalide';
        } else {
            cfg.winnersCount = winnersCount;
            saveGwConfig();
        }
    }

    message.delete().catch(() => {});

    if (error) {
        const panelCard = buildPanelCard(message.guild, { hideMenu });
        showPanelErrorThenBack(message.channel, payload.messageId, panelCard, error);
        return true;
    }
    const panelCard = buildPanelCard(message.guild, { hideMenu });

    if (payload.messageId) {
        message.channel.messages.fetch(payload.messageId) ?.then((panelMessage) => panelMessage.edit({ ...panelCard, allowedMentions : { parse: [] } }).catch(() => {}))
            .catch(() => {
                message.channel.send({ ...panelCard, allowedMentions: { parse: [] } }).catch(() => {});
            });
    } else {
        message.channel.send({ ...panelCard, allowedMentions: { parse: [] } }).catch(() => {});
    }

    return true;
}

function normalizeGiveawaysStore() {
    const raw = ensureGiveawaysStore();
    const normalized = {};

    for (const [key, value] of Object.entries(raw)) {
        if (!value || typeof value !== 'object') continue;

        const guildId = String(value.guildId || key);
        const messageId = value.messageId ? String(value.messageId) : null;
        const channelId = value.channelId ? String(value.channelId) : null;
        const endAt = Number.isInteger(value.endAt) ? value.endAt : parseInt(value.endAt, 10);

        if (!guildId || !messageId || !channelId || !Number.isInteger(endAt)) continue;

        const id = String(value.id || `${guildId}_${messageId}`);
        normalized[id] = {
            ...value,
            id,
            guildId,
            messageId,
            channelId,
            endAt,
            buttonLabel: typeof value.buttonLabel === 'string' ? value.buttonLabel : 'Participer',
            uhqUserIds: Array.isArray(value.uhqUserIds) ? value.uhqUserIds.map((uid) => String(uid)) : [],
            participants: sanitizeParticipants(value.participants),
            winnersCount: Math.max(1, parseInt(value.winnersCount, 10) || 1),
            createdAt: Number.isInteger(value.createdAt) ? value.createdAt : Date.now()
        };
    }

    data.giveaways = normalized;
    saveGiveaways();
}

module.exports = {
    name: 'gw',

    async executePrefix(message) {
        if (!hasPermissionForCommand(message.member, 'gw')) {
            return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const card = buildPanelCard(message.guild);
        const reply = await message.reply({ ...card, allowedMentions: { parse: [] }, mentionRepliedUser: false });
        panelOwners.set(reply.id, message.author.id);
        return reply;
    },

    handleAwaiting,

    async handleMenu(interaction, client) {
        const ownerId = panelOwners.get(interaction.message.id)
          || interaction.message.interaction?.user?.id
          || interaction.user.id;
        if (ownerId && interaction.user.id !== ownerId) {
            return interaction.reply({
                content: "<:non:1519424807580733635> Vous n\'\u00eates pas l\'auteur de cette commande",
                flags: 64,
                allowedMentions: { parse: [] }
            });
        }

        if (!hasPermissionForCommand(interaction.member, 'gw')) {
            return interaction.reply({
                content: "<:non:1519424807580733635> Vous n'avez pas la permission",
                flags: 64,
                allowedMentions: { parse: [] }
            });
        }

        if (!interaction.isStringSelectMenu() || interaction.customId !== 'gw_action') return;

        const panelMessageId = String(interaction.message.id || '');
        if (panelLocks.has(panelMessageId)) {
            return interaction.reply({ content: 'Ce panel est verrouill\u00e9', flags: 64, allowedMentions: { parse: [] } });
        }

        const action = interaction.values[0];

        if (action === 'set_title') {
            setAwaitingInput(interaction, 'title');
            return updateSafe(interaction, buildInputCard('\u00c9crivez le nom du giveaway', '*Exemple : Nitro 1 mois*'));
        }

        if (action === 'set_channel') {
            setAwaitingInput(interaction, 'channel');
            return updateSafe(interaction, buildInputCard('\u00c9crivez le salon giveaway', '*Exemple : #giveaway ou 123456789012345678*'));
        }

        if (action === 'set_duration') {
            setAwaitingInput(interaction, 'duration');
            return updateSafe(interaction, buildInputCard('\u00c9crivez le temps du giveaway', '*Exemple : 30s, 10m, 1h*'));
        }

        if (action === 'set_button') {
            setAwaitingInput(interaction, 'button');
            return updateSafe(interaction, buildInputCard('\u00c9crivez la config du bouton', '*Exemple : (emoji) (espace) (nom du bouton (pas oblig\u00c9))*'));
        }

        if (action === 'set_uhq') {
            setAwaitingInput(interaction, 'uhq');
            return updateSafe(interaction, buildInputCard(
                '\u00c9crivez les membres UHQ',
                '*Exemple : @membre @membre*. *"aucun" = aucun*'
            ));
        }

        if (action === 'set_winners') {
            setAwaitingInput(interaction, 'winners');
            return updateSafe(interaction, buildInputCard('\u00c9crivez le nombre de gagnants', '*Exemple : 1*'));
        }

        if (action === 'launch') {
            if (markLaunchInteractionProcessed(interaction.id)) {
                return;
            }

            if (panelLaunchInProgress.has(panelMessageId)) {
                return;
            }

            panelLaunchInProgress.add(panelMessageId);
            panelLocks.add(panelMessageId);

            try {
                await interaction.deferUpdate();

                const launched = await launchGiveaway(client, interaction.guild, interaction.user.id);
                if (launched.error) {
                    panelLocks.delete(panelMessageId);
                    return interaction.editReply({ ...noCard(launched.error), allowedMentions: { parse: [] } });
                } return interaction.editReply({ ...buildPanelCard(interaction.guild, { hideMenu : true }), allowedMentions: { parse: [] } });
            } catch (error) {
                panelLocks.delete(panelMessageId);
                if (error && (error.code === 40060 || String(error.message || '').includes('already been acknowledged'))) {
                    return;
                }
                throw error;
            } finally {
                panelLaunchInProgress.delete(panelMessageId);
            }
        }

        if (action === 'cancel') {
            const cancelled = await cancelLatestGiveaway(client, interaction.guild.id);
            if (!cancelled) {
                return interaction.reply({ content: 'Aucun giveaway en cours', flags: 64, allowedMentions: { parse: [] } });
            }
            return updateSafe(interaction, buildPanelCard(interaction.guild));
        }
    },

    async handleButton(interaction, client) {
        if (!interaction.customId || !interaction.customId.startsWith('gw_join_')) return;
        if (interaction.user.bot) {
            return interaction.reply({ content: 'Les bots ne peuvent pas participer', flags: 64, allowedMentions: { parse: [] } });
        }

        const giveawayId = String(interaction.customId.slice('gw_join_'.length));
        const store = ensureGiveawaysStore();
        let giveaway = store[giveawayId] || null;

        if (!giveaway) {
            giveaway = findGiveawayByMessage(interaction.guild.id, interaction.message.id);
        }

        if (!giveaway) {
            return interaction.reply({ content: 'Ce giveaway n\'est plus actif', flags: 64, allowedMentions: { parse: [] } });
        }

        if (Date.now() >= giveaway.endAt) {
            finishGiveaway(client, giveaway.id);
            return interaction.reply({ content: 'Ce giveaway est termin\u00e9', flags: 64, allowedMentions: { parse: [] } });
        }

        giveaway.participants = sanitizeParticipants(giveaway.participants);
        if (giveaway.participants.includes(String(interaction.user.id))) {
            return interaction.reply({
                content: 'Vous participez d\u00e9j\u00e0 \u00e0 ce gw',
                flags: 64,
                allowedMentions: { parse: [] }
            });
        }

        giveaway.participants.push(String(interaction.user.id));
        store[giveaway.id] = giveaway;
        saveGiveaways();

        await interaction.reply({
            content: 'Votre participation a bien \u00e9t\u00e9 prise en compte',
            flags: 64,
            allowedMentions: { parse: [] }
        });

        await refreshLiveMessage(client, giveaway.id);
    },

    async restoreActiveGiveaways(client) {
        normalizeGiveawaysStore();

        const store = ensureGiveawaysStore();
        let changed = false;

        for (const [giveawayId, giveaway] of Object.entries(store)) {
            if (!giveaway || typeof giveaway !== 'object') {
                delete store[giveawayId];
                changed = true;
                continue;
            }

            const guild = client.guilds.cache.get(String(giveaway.guildId))
                || await client.guilds.fetch(String(giveaway.guildId)).catch(() => null);

            if (!guild) {
                delete store[giveawayId];
                changed = true;
                continue;
            }

            const channel = guild.channels.cache.get(String(giveaway.channelId))
                || await guild.channels.fetch(String(giveaway.channelId)).catch(() => null);

            if (!channel || !channel.isTextBased()) {
                delete store[giveawayId];
                changed = true;
                continue;
            }

            giveaway.participants = sanitizeParticipants(giveaway.participants);
            store[giveawayId] = giveaway;
            scheduleGiveaway(client, giveawayId);
        }

        if (changed) saveGiveaways();
    },

    cleanupGiveawaysForChannel(channelId) {
        const target = String(channelId);
        const store = ensureGiveawaysStore();
        let changed = false;

        for (const [giveawayId, giveaway] of Object.entries(store)) {
            if (String(giveaway.channelId) === target) {
                clearTimer(giveawayId);
                delete store[giveawayId];
                changed = true;
            }
        }

        if (changed) saveGiveaways();
    }
};


