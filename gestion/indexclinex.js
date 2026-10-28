const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./src/config');
const config = loadConfig();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildInvites
    ]
});

const DATA_FILE = path.join(__dirname, 'data.json');
const COMMAND_DATA_DIR = path.join(__dirname, 'data', 'index2');

function cloneDefault(value) {
    return JSON.parse(JSON.stringify(value));
}

function ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function loadJsonFile(filePath, fallback) {
    if (!fs.existsSync(filePath)) {
        return cloneDefault(fallback);
    }

    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const cleanRaw = String(raw || '').replace(/^\uFEFF/, '');
        if (!cleanRaw.trim()) return cloneDefault(fallback);
        const parsed = JSON.parse(cleanRaw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return cloneDefault(fallback);
        }
        return parsed;
    } catch {
        return cloneDefault(fallback);
    }
}

function saveJsonFile(filePath, payload) {
    ensureDirectory(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function isObjectRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

const rootData = loadJsonFile(DATA_FILE, {});
const sharedData = isObjectRecord(rootData) ? rootData : {};
if (!isObjectRecord(sharedData.owners)) sharedData.owners = {};
if (!isObjectRecord(sharedData.wl)) sharedData.wl = {};

ensureDirectory(COMMAND_DATA_DIR);

function readCommandStore(fileName, fallback = {}) {
    return loadJsonFile(path.join(COMMAND_DATA_DIR, fileName), fallback);
}

function writeCommandStore(fileName, payload) {
    saveJsonFile(path.join(COMMAND_DATA_DIR, fileName), payload);
}

function isBuyer(userId) {
    const buyers = Array.isArray(config.buyers) ? config.buyers : [];
    return buyers.includes(String(userId));
}

function isOwnerMember(guildId, userId) {
    const owners = Array.isArray(sharedData.owners[String(guildId)]) ? sharedData.owners[String(guildId)] : [];
    return owners.includes(String(userId));
}

function canUsePingCounter(guildId, userId) {
    return isBuyer(userId) || isOwnerMember(guildId, userId);
}

function canUseSoutien(guildId, userId) {
    return canUsePingCounter(guildId, userId);
}

function getWlEntries(guildId) {
    const raw = sharedData.wl[String(guildId)];

    if (Array.isArray(raw)) {
        return [...new Set(raw.map((entry) => String(entry)).filter(Boolean))];
    }

    if (raw && typeof raw === 'object') {
        const users = Array.isArray(raw.users) ? raw.users.map((id) => String(id)) : [];
        const roles = Array.isArray(raw.roles) ? raw.roles.map((id) => 'role:' + String(id)) : [];
        return [...new Set([...users, ...roles])];
    }

    return [];
}

function isWlBypassForMember(guildId, userId, member) {
    const entries = getWlEntries(guildId);
    const safeUserId = String(userId || '');

    if (safeUserId && entries.includes(safeUserId)) return true;
    if (!member || !member.roles || !member.roles.cache) return false;

    for (const roleId of member.roles.cache.keys()) {
        if (entries.includes('role:' + String(roleId))) return true;
    }

    return false;
}

function createCard(type, content) {
    const emoji = type === 'oui' ? '<:oui:1519424733618110504>' : '<:non:1519424807580733635>';
    const finalContent = type === 'oui' ? content : `*${content}*`;
    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 10, content: `${emoji} ${finalContent}` }
            ]
        }]
    };
}

async function safeDeleteMessage(msg, context = '') {
    try {
        await msg.delete();
        return { ok: true };
    } catch (err) {
        const code = err && typeof err.code !== 'undefined' ? err.code : 'unknown';
        console.warn(`[safeDeleteMessage] failed (${context}) code=${code}`);
        return { ok: false, code };
    }
}

function truncateText(value, maxLength = 90) {
    const clean = String(value || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= maxLength) return clean;
    return clean.slice(0, Math.max(0, maxLength - 3)) + '...';
}

function updateInteractionCard(interaction, payload) {
    return interaction.update({
        ...payload,
        allowedMentions: { parse: [], repliedUser: false }
    });
}

function buildActionSelectRow(customId, options, placeholder = 'Choisir une action') {
    return {
        type: 1,
        components: [{
            type: 3,
            custom_id: customId,
            placeholder,
            min_values: 1,
            max_values: 1,
            options
        }]
    };
}

function buildRoleSelectCard(title, customId, hint, maxValues = 25) {
    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 10, content: `# ${title}` },
                { type: 14, divider: true },
                { type: 10, content: hint || '> Selectionnez un ou plusieurs roles' },
                { type: 14, divider: true },
                {
                    type: 1,
                    components: [{
                        type: 6,
                        custom_id: customId,
                        placeholder: 'Selectionner des roles',
                        min_values: 1,
                        max_values: maxValues
                    }]
                }
            ]
        }]
    };
}

function buildChannelSelectCard(title, customId, hint, channelTypes = [0, 2, 5, 13, 15], maxValues = 1) {
    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 10, content: `# ${title}` },
                { type: 14, divider: true },
                { type: 10, content: hint || (maxValues > 1 ? '> Selectionnez un ou plusieurs salons' : '> Selectionnez un salon') },
                { type: 14, divider: true },
                {
                    type: 1,
                    components: [{
                        type: 8,
                        custom_id: customId,
                        placeholder: 'Selectionner un salon',
                        channel_types: channelTypes,
                        min_values: 1,
                        max_values: maxValues
                    }]
                }
            ]
        }]
    };
}

function buildExistingValuesSelectCard(title, customId, placeholder, options, hint, maxValues = null) {
    const effectiveMaxValues = Math.max(1, Math.min(
        typeof maxValues === 'number' && Number.isFinite(maxValues) ? maxValues : options.length,
        options.length,
        25
    ));
    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 10, content: `# ${title}` },
                { type: 14, divider: true },
                ...(hint ? [{ type: 10, content: hint }, { type: 14, divider: true }] : []),
                {
                    type: 1,
                    components: [{
                        type: 3,
                        custom_id: customId,
                        placeholder,
                        min_values: 1,
                        max_values: effectiveMaxValues,
                        options: options.slice(0, 25)
                    }]
                }
            ]
        }]
    };
}

function parseChannelIdsFromInput(rawInput) {
    const matches = String(rawInput || '').match(/\d{15,20}/g) || [];
    return [...new Set(matches.map((id) => String(id)))];
}

const awaitingResponses = new Map();
const commandAuthors = new Map();
const registeredCommands = new Map();

function getResponseKey(userId, channelId) {
    return `${String(userId)}_${String(channelId)}`;
}

function setAwaitingResponse(userId, channelId, handler) {
    const key = getResponseKey(userId, channelId);
    awaitingResponses.set(key, handler);
    return key;
}

function clearAwaitingResponse(userId, channelId) {
    awaitingResponses.delete(getResponseKey(userId, channelId));
}

function buildBaseContext() {
    return {
        client,
        config,
        sharedData,
        readCommandStore,
        writeCommandStore,
        createCard,
        updateInteractionCard,
        buildActionSelectRow,
        buildRoleSelectCard,
        buildChannelSelectCard,
        buildExistingValuesSelectCard,
        truncateText,
        parseChannelIdsFromInput,
        safeDeleteMessage,
        canUsePingCounter,
        canUseSoutien,
        isWlBypassForMember,
        setAwaitingResponse,
        clearAwaitingResponse,
        commandAuthors
    };
}

function registerCommand(definition) {
    const name = String(definition && definition.name || '').trim().toLowerCase();
    if (!name) throw new Error('Commande sans nom');
    if (typeof definition.execute !== 'function') throw new Error(`Commande invalide: ${name}`);

    registeredCommands.set(name, {
        name,
        customIdPrefix: String(definition.customIdPrefix || name),
        ownerOnlyInteractions: definition.ownerOnlyInteractions !== false,
        execute: definition.execute,
        onInteraction: typeof definition.onInteraction === 'function' ? definition.onInteraction : null
    });
}

async function replyOwned(message, payload, type = 'custom') {
    const sent = await message.reply({
        ...payload,
        allowedMentions: { parse: [], repliedUser: false }
    });
    commandAuthors.set(String(sent.id), { userId: String(message.author.id), type: String(type || 'custom') });
    return sent;
}

registerCommand({
    name: 'modele',
    customIdPrefix: 'modele',
    async execute(message) {
        const card = {
            flags: 32768,
            components: [{
                type: 17,
                components: [
                    { type: 10, content: '# Modele' },
                    { type: 14, divider: true },
                    { type: 10, content: '> Remplacez cette commande par celle que vous voulez ajouter' },
                    { type: 14, divider: true },
                    buildActionSelectRow('modele_action', [
                        { label: 'Bouton exemple', value: 'open' }
                    ])
                ]
            }]
        };

        await replyOwned(message, card, 'modele');
    },
    async onInteraction(interaction) {
        if (!interaction.isStringSelectMenu()) {
            return interaction.reply({ content: 'Action invalide', flags: 64 });
        }

        if (interaction.customId === 'modele_action') {
            return updateInteractionCard(interaction, createCard('oui', 'Commande modele active'));
        }

        return interaction.reply({ content: 'Action invalide', flags: 64 });
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const responseKey = getResponseKey(message.author.id, message.channel.id);
    if (awaitingResponses.has(responseKey)) {
        const handler = awaitingResponses.get(responseKey);
        awaitingResponses.delete(responseKey);
        await handler(message);
        return;
    }

    if (!message.guild) return;
    if (!message.content.startsWith(config.prefix)) return;

    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const commandName = String(args.shift() || '').toLowerCase();
    if (!commandName) return;

    const command = registeredCommands.get(commandName);
    if (!command) return;

    if (!canUseSoutien(message.guild.id, message.author.id)) {
        return message.reply({
            ...createCard('non', 'Vous n\'avez pas la permission d\'utiliser cette commande'),
            allowedMentions: { parse: [], repliedUser: false }
        });
    }

    try {
        await command.execute(message, args, buildBaseContext());
    } catch (error) {
        console.error(`[command:${command.name}]`, error);
        await message.reply({
            ...createCard('non', 'Erreur pendant l\'execution de la commande'),
            allowedMentions: { parse: [], repliedUser: false }
        }).catch(() => {});
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isChannelSelectMenu() && !interaction.isRoleSelectMenu() && !interaction.isModalSubmit()) return;

    const customId = String(interaction.customId || '');
    if (!interaction.guild || !customId) return;

    for (const command of registeredCommands.values()) {
        const prefix = `${command.customIdPrefix}_`;
        const matches = customId === command.customIdPrefix || customId.startsWith(prefix);
        if (!matches || !command.onInteraction) continue;

        if (!canUseSoutien(interaction.guild.id, interaction.user.id)) {
            return interaction.reply({ content: 'Vous n\'avez pas la permission', flags: 64 });
        }

        if (command.ownerOnlyInteractions) {
            const authorInfo = commandAuthors.get(String(interaction.message && interaction.message.id));
            if (!authorInfo || String(authorInfo.userId) !== String(interaction.user.id)) {
                return interaction.reply({ content: 'Vous n\'etes pas l\'auteur de cette commande', flags: 64 });
            }
        }

        try {
            await command.onInteraction(interaction, buildBaseContext());
        } catch (error) {
            console.error(`[interaction:${command.name}]`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'Erreur pendant l\'interaction', flags: 64 }).catch(() => {});
            }
        }
        return;
    }
});

client.login(config.token);
