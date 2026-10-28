const { data, saveOtherConfig } = require('../utils/state');
const { hasPermissionForCommand } = require('../utils/permissions');
const { noCard, permissionCard } = require('../utils/cards');
const { ensureSanctionLimitsConfig, SANCTION_LIMIT_COMMANDS } = require('../utils/rateLimit');

const limitsOwners = new Map();
const awaitingLimits = new Map();
const SANCTION_COMMAND_ORDER = ['warn', 'tempmute', 'mute', 'to'].filter((name) => SANCTION_LIMIT_COMMANDS.includes(name));

const EMOJIS = {
    add: { id: '1462902411965235427', name: 'add' },
    minus: { id: '1462902378016542924', name: 'moins' },
    refresh: { id: '1462902476641665164', name: 'refresh' },
    roles: { id: '1457452872240201901', name: 'roles' }
};

function updateSafe(interaction, payload) {
    return interaction.update({ ...payload, allowedMentions: { parse: [] } });
}

function ensureConfig(guildId) {
    if (!data.otherConfig[guildId]) {
        data.otherConfig[guildId] = {};
    }

    const cfg = data.otherConfig[guildId];
    if (!cfg.banRoles) cfg.banRoles = {};
    if (!Array.isArray(cfg.clearCategories)) cfg.clearCategories = [];
    if (!Array.isArray(cfg.clearChannels)) cfg.clearChannels = [];
    if (!Array.isArray(cfg.clearProtected)) cfg.clearProtected = [];
    if (!Number.isInteger(cfg.clearLimit)) cfg.clearLimit = 100;
    ensureSanctionLimitsConfig(guildId, true);
}

function buildBanMenu(hasRoles) {
    const options = [{ label: 'Ajouter un r\u00f4le', value: 'add', emoji: EMOJIS.add }];
    if (hasRoles) {
        options.push(
            { label: 'Modifier un r\u00f4le', value: 'modify', emoji: EMOJIS.refresh },
            { label: 'Supprimer un r\u00f4le', value: 'remove', emoji: EMOJIS.minus }
        );
    }
    return {
        type: 1,
        components: [{
            type: 3,
            custom_id: 'limits_ban_action',
            placeholder: 'Choisir une action',
            options
        }]
    };
}

function buildClearLimitMenu(canReset) {
    const options = [{ label: 'Modifier la limite', value: 'modify', emoji: EMOJIS.refresh }];
    if (canReset) {
        options.push({ label: 'R\u00e9initialiser la limite', value: 'reset', emoji: EMOJIS.minus });
    }
    return {
        type: 1,
        components: [{
            type: 3,
            custom_id: 'limits_clear_limit_action',
            placeholder: 'Choisir une action',
            options
        }]
    };
}

function buildClearChannelMenu(hasChannels) {
    const options = [{ label: 'Ajouter un salon autoris\u00e9', value: 'add', emoji: EMOJIS.add }];
    if (hasChannels) {
        options.push({ label: 'Supprimer un salon autoris\u00e9', value: 'remove', emoji: EMOJIS.minus });
    }
    return {
        type: 1,
        components: [{
            type: 3,
            custom_id: 'limits_clear_channels_action',
            placeholder: 'Choisir une action',
            options
        }]
    };
}

function buildClearCategoryMenu(hasCategories) {
    const options = [{ label: 'Ajouter une cat\u00e9gorie', value: 'add', emoji: EMOJIS.add }];
    if (hasCategories) {
        options.push({ label: 'Supprimer une cat\u00e9gorie', value: 'remove', emoji: EMOJIS.minus });
    }
    return {
        type: 1,
        components: [{
            type: 3,
            custom_id: 'limits_clear_categories_action',
            placeholder: 'Choisir une action',
            options
        }]
    };
}

function buildClearProtectedMenu(hasProtected) {
    const options = [{ label: 'Ajouter un salon prot\u00e9g\u00e9', value: 'add', emoji: EMOJIS.add }];
    if (hasProtected) {
        options.push({ label: 'Supprimer un salon prot\u00e9g\u00e9', value: 'remove', emoji: EMOJIS.minus });
    }
    return {
        type: 1,
        components: [{
            type: 3,
            custom_id: 'limits_clear_protected_action',
            placeholder: 'Choisir une action',
            options
        }]
    };
}

function buildClearLimitPromptCard(title) {
    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 10, content: `# ${title}\n> Limite entre \`1 et 1000\` possible` },
                { type: 14, divider: true },
                { type: 10, content: '> ### \u00c9crivez la nouvelle limite de suppression de messages maximale pour une commande clear' },
                { type: 14, divider: true }
            ]
        }]
    };
}

function getSanctionConfig(guildId, commandName) {
    ensureConfig(guildId);
    return data.otherConfig[guildId].sanctionLimits[String(commandName)];
}

function formatRule(rule) {
    if (!rule || !Number.isInteger(rule.limit) || !Number.isInteger(rule.windowMinutes)) {
        return '`Aucune`';
    }
    return `\`${rule.limit} / ${rule.windowMinutes} min\``;
}

function buildSanctionCommandMenu() {
    return {
        type: 1,
        components: [{
            type: 3,
            custom_id: 'limits_sanctions_command',
            placeholder: 'Choisir une sanction',
            min_values: 1,
            max_values: 1,
            options: SANCTION_COMMAND_ORDER.map((commandName) => ({
                label: commandName,
                value: commandName
            }))
        }]
    };
}

function buildSanctionActionCard(commandName) {
    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 10, content: `# Limites de sanctions` },
                { type: 14, divider: true },
                { type: 10, content: `> Choisissez une action pour \`${commandName}\`` },
                { type: 14, divider: true },
                {
                    type: 1,
                    components: [{
                        type: 3,
                        custom_id: `limits_sanction_action_${commandName}`,
                        placeholder: 'Choisir une action',
                        min_values: 1,
                        max_values: 1,
                        options: [
                            { label: 'Modifier la limite g\u00e9n\u00e9rale', value: 'general', emoji: EMOJIS.refresh },
                            { label: 'R\u00f4les particuliers', value: 'roles', emoji: EMOJIS.roles }
                        ]
                    }]
                }
            ]
        }]
    };
}

function buildSanctionRoleActionCard(commandName, hasRoles) {
    const options = [{ label: 'Ajouter un r\u00f4le', value: 'add', emoji: EMOJIS.add }];
    if (hasRoles) {
        options.push(
            { label: 'Modifier un r\u00f4le', value: 'modify', emoji: EMOJIS.refresh },
            { label: 'Supprimer un r\u00f4le', value: 'remove', emoji: EMOJIS.minus }
        );
    }

    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 10, content: `# R\u00f4les particuliers` },
                { type: 14, divider: true },
                { type: 10, content: `> Choisissez une action de r\u00f4le particulier a faire pour la commande \`${commandName}\`` },
                { type: 14, divider: true },
                {
                    type: 1,
                    components: [{
                        type: 3,
                        custom_id: `limits_sanction_roles_action_${commandName}`,
                        placeholder: 'Choisir une action',
                        min_values: 1,
                        max_values: 1,
                        options
                    }]
                }
            ]
        }]
    };
}

function buildRoleOptions(roleIds, guild) {
    return roleIds.map((roleId) => {
        const role = guild.roles.cache.get(String(roleId));
        return {
            label: String(role ? role.name : roleId).slice(0, 100),
            value: String(roleId),
            description: `ID : ${roleId}`
        };
    }).slice(0, 25);
}

function buildSanctionRoleModifyCard(commandName, roles, guild) {
    const options = buildRoleOptions(roles, guild);

    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 10, content: `# Modifier un r\u00f4le sp\u00e9cial ${commandName}` },
                { type: 14, divider: true },
                { type: 10, content: `> Choisissez un r\u00f4le d\u00e9j\u00e0 configur\u00e9 pour \`${commandName}\`` },
                { type: 14, divider: true },
                {
                    type: 1,
                    components: [{
                        type: 3,
                        custom_id: `limits_sanction_role_modify_${commandName}`,
                        placeholder: 'Choisir un r\u00f4le',
                        options,
                        min_values: 1,
                        max_values: 1
                    }]
                }
            ]
        }]
    };
}

function buildTextLimitPromptCard(title, prompt, example) {
    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 10, content: `# ${title}` },
                { type: 14, divider: true },
                { type: 10, content: `> ${prompt}` },
                { type: 14, divider: true },
                { type: 10, content: `> ${example}` },
                { type: 14, divider: true }
            ]
        }]
    };
}

function buildSanctionSummary(guildId) {
    const sections = [];

    for (const commandName of SANCTION_COMMAND_ORDER) {
        const commandConfig = getSanctionConfig(guildId, commandName);
        const specialRoles = Object.entries(commandConfig.roles || {});
        const rolesText = specialRoles.length
            ? specialRoles.map(([roleId, rule]) => `> <@&${roleId}> : ${formatRule(rule)}`).join('\n')
            : '> Aucun';

        sections.push(`**Limite g\u00e9n\u00e9rale ${commandName} :** ${formatRule(commandConfig.general)}\n${rolesText}`);
    }

    return sections.join('\n\n');
}

function buildMainCard(guild) {
    const guildId = String(guild.id);
    ensureConfig(guildId);
    const cfg = data.otherConfig[guildId];

    const banRoles = Object.entries(cfg.banRoles);
    const banList = banRoles.length
        ? banRoles.map(([roleId, rule]) => `> <@&${roleId}> : ${rule.limit} bans / ${rule.windowMinutes} min`).join('\n')
        : '> Aucun r\u00f4le';

    const clearCategories = cfg.clearCategories.length ? cfg.clearCategories.map((id) => `<#${id}>`).join(', ') : 'Aucune cat\u00e9gorie';
    const clearChannels = cfg.clearChannels.length ? cfg.clearChannels.map((id) => `<#${id}>`).join(', ') : 'Aucun salon';
    const clearProtected = cfg.clearProtected.length ? cfg.clearProtected.map((id) => `<#${id}>`).join(', ') : 'Aucun salon';
    const sanctionsText = buildSanctionSummary(guildId);

    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 10, content: '# Panel limits\n> Voici le panel pour g\u00e9rer les sections `ban`, `clear` et les `limites de sanctions`' },
                { type: 14, divider: true },
                { type: 10, content: '## Ban\n> Vous pouvez configurer quels r\u00f4les ont acc\u00e8s \u00e0 la commande ban, et leur attribuer des `limites de ban` par minute ou par heure' },
                { type: 10, content: banList },
                buildBanMenu(banRoles.length > 0),
                { type: 14, divider: true },
                { type: 10, content: '## Clear\n> Vous pouvez configurer les `cat\u00e9gories autoris\u00e9es`, les `salons autoris\u00e9s`, les `salons prot\u00e9g\u00e9s` et la `limite maximale` de suppression pour la commande clear. Les membres ayant acc\u00e8s \u00e0 la commande pourront seulement clear dans les salons autoris\u00e9s et ne pourront pas clear les salons prot\u00e9g\u00e9s' },
                { type: 10, content: `**Cat\u00e9gories autoris\u00e9es :** ${clearCategories}` },
                buildClearCategoryMenu(cfg.clearCategories.length > 0),
                { type: 10, content: `**Salons autoris\u00e9s :** ${clearChannels}` },
                buildClearChannelMenu(cfg.clearChannels.length > 0),
                { type: 10, content: `**Salons prot\u00e9g\u00e9s :** ${clearProtected}` },
                buildClearProtectedMenu(cfg.clearProtected.length > 0),
                { type: 10, content: `**Limite actuelle :** ${cfg.clearLimit}` },
                buildClearLimitMenu(Number.isInteger(cfg.clearLimit) && cfg.clearLimit !== 100),
                { type: 14, divider: true },
                { type: 10, content: '## Limites de sanctions\n> Vous pouvez configurer une `limite g\u00e9n\u00e9rale` et des `r\u00f4les particuliers` pour **warn**, **tempmute**, **mute** et **to**' },
                { type: 10, content: sanctionsText },
                buildSanctionCommandMenu(),
                { type: 14, divider: true }
            ]
        }]
    };
}

function buildRoleSelectCard(title, customId) {
    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 10, content: `# ${title}` },
                { type: 14, divider: true },
                { type: 10, content: '> S\u00e9lectionnez un r\u00f4le' },
                { type: 14, divider: true },
                {
                    type: 1,
                    components: [{
                        type: 6,
                        custom_id: customId,
                        placeholder: 'S\u00e9lectionner un r\u00f4le',
                        min_values: 1,
                        max_values: 1
                    }]
                }
            ]
        }]
    };
}

function buildCategorySelectCard(title, customId, maxValues = 1, hint) {
    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 10, content: `# ${title}` },
                { type: 14, divider: true },
                { type: 10, content: hint || (maxValues > 1 ? '> S\u00e9lectionnez une ou plusieurs cat\u00e9gories' : '> S\u00e9lectionnez une cat\u00e9gorie') },
                { type: 14, divider: true },
                {
                    type: 1,
                    components: [{
                        type: 8,
                        custom_id: customId,
                        placeholder: 'S\u00e9lectionner une cat\u00e9gorie',
                        channel_types: [4],
                        min_values: 1,
                        max_values: maxValues
                    }]
                }
            ]
        }]
    };
}

function buildChannelSelectCard(title, customId, maxValues = 1, hint) {
    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 10, content: `# ${title}` },
                { type: 14, divider: true },
                { type: 10, content: hint || (maxValues > 1 ? '> S\u00e9lectionnez un ou plusieurs salons' : '> S\u00e9lectionnez un salon') },
                { type: 14, divider: true },
                {
                    type: 1,
                    components: [{
                        type: 8,
                        custom_id: customId,
                        placeholder: 'S\u00e9lectionner un salon',
                        channel_types: [0, 2, 5, 13, 15],
                        min_values: 1,
                        max_values: maxValues
                    }]
                }
            ]
        }]
    };
}

function buildBanRoleModifyCard(roles, guild) {
    const options = buildRoleOptions(roles, guild);

    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 10, content: '# Modifier un r\u00f4le ban' },
                { type: 14, divider: true },
                { type: 10, content: '> Choisissez un r\u00f4le d\u00e9j\u00e0 autoris\u00e9 \u00e0 la commande ban pour modifier sa limite de bans par temps donn\u00e9' },
                { type: 14, divider: true },
                {
                    type: 1,
                    components: [{
                        type: 3,
                        custom_id: 'limits_ban_role_modify',
                        placeholder: 'Choisir un r\u00f4le',
                        options,
                        min_values: 1,
                        max_values: 1
                    }]
                }
            ]
        }]
    };
}

function buildRoleRemoveCard(title, customId, roles, guild) {
    const options = buildRoleOptions(roles, guild);

    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 10, content: `# ${title}` },
                { type: 14, divider: true },
                {
                    type: 1,
                    components: [{
                        type: 3,
                        custom_id: customId,
                        placeholder: 'Choisir des r\u00f4les',
                        options,
                        min_values: 1,
                        max_values: Math.min(options.length, 25)
                    }]
                }
            ]
        }]
    };
}

function buildLimitPromptCard(roleId, actionLabel) {
    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 10, content: `# ${actionLabel}` },
                { type: 14, divider: true },
                { type: 10, content: '> \u00c9crivez la limite de bans pour le r\u00f4le en un temps donn\u00e9' },
                { type: 14, divider: true },
                { type: 10, content: '> *Exemple : `5 30` pour `5` bans maximum par `30 minutes`*' },
                { type: 14, divider: true }
            ]
        }]
    };
}

function parseLimitInput(content) {
    const parts = content.trim().split(/\s+/);
    if (parts.length < 2) return null;
    const limit = parseInt(parts[0], 10);
    const windowMinutes = parseInt(parts[1], 10);
    if (!Number.isInteger(limit) || !Number.isInteger(windowMinutes)) return null;
    if (limit <= 0 || windowMinutes <= 0) return null;
    return { limit, windowMinutes };
}

function showTemporaryCard(message, payload, card) {
    const panel = buildMainCard(message.guild);

    if (payload.messageId) {
        message.channel.messages.fetch(payload.messageId)
            .then((panelMessage) => {
                panelMessage.edit({ ...card, allowedMentions: { parse: [] } }).catch(() => {});
                setTimeout(() => {
                    panelMessage.edit({ ...panel, allowedMentions: { parse: [] } }).catch(() => {});
                }, 3000);
            })
            .catch(() => {
                message.channel.send({ ...card, allowedMentions: { parse: [] } }).catch(() => {});
                setTimeout(() => {
                    message.channel.send({ ...panel, allowedMentions: { parse: [] } }).catch(() => {});
                }, 3000);
            });
        return;
    }

    message.channel.send({ ...card, allowedMentions: { parse: [] } }).catch(() => {});
    setTimeout(() => {
        message.channel.send({ ...panel, allowedMentions: { parse: [] } }).catch(() => {});
    }, 3000);
}

function restorePanel(message, payload) {
    const panel = buildMainCard(message.guild);

    if (payload.messageId) {
        message.channel.messages.fetch(payload.messageId)
            .then((panelMessage) => panelMessage.edit({ ...panel, allowedMentions: { parse: [] } }).catch(() => {}))
            .catch(() => {
                message.channel.send({ ...panel, allowedMentions: { parse: [] } }).catch(() => {});
            });
        return;
    }

    message.channel.send({ ...panel, allowedMentions: { parse: [] } }).catch(() => {});
}

function handleAwaiting(message) {
    const key = `${message.author.id}:${message.channel.id}`;
    if (!awaitingLimits.has(key)) return false;

    const payload = awaitingLimits.get(key);
    awaitingLimits.delete(key);
    message.delete().catch(() => {});

    if (payload.type === 'clear') {
        const value = parseInt(message.content.trim(), 10);
        if (!Number.isInteger(value) || value <= 0) {
            showTemporaryCard(message, payload, noCard('Format invalide, *exemple : 100*'));
            return true;
        }

        const guildId = String(message.guild.id);
        ensureConfig(guildId);
        data.otherConfig[guildId].clearLimit = value;
        saveOtherConfig();
        restorePanel(message, payload);
        return true;
    }

    const parsed = parseLimitInput(message.content);
    if (!parsed) {
        showTemporaryCard(message, payload, noCard('Format invalide, *exemple : 3 60*'));
        return true;
    }

    const guildId = String(message.guild.id);
    ensureConfig(guildId);

    if (payload.type === 'ban') {
        data.otherConfig[guildId].banRoles[payload.roleId] = parsed;
        saveOtherConfig();
        restorePanel(message, payload);
        return true;
    }

    if (payload.type === 'sanction_general') {
        data.otherConfig[guildId].sanctionLimits[payload.commandName].general = parsed;
        saveOtherConfig();
        restorePanel(message, payload);
        return true;
    }

    if (payload.type === 'sanction_role') {
        data.otherConfig[guildId].sanctionLimits[payload.commandName].roles[payload.roleId] = parsed;
        saveOtherConfig();
        restorePanel(message, payload);
        return true;
    }

    return false;
}

module.exports = {
    name: 'limits',
    handleAwaiting,
    async executePrefix(message) {
        if (!hasPermissionForCommand(message.member, 'limits')) {
            return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const card = buildMainCard(message.guild);
        const reply = await message.reply({ ...card, allowedMentions: { parse: [] }, mentionRepliedUser: false });
        limitsOwners.set(reply.id, message.author.id);
        return reply;
    },
    async handleMenu(interaction) {
        const ownerId = limitsOwners.get(interaction.message.id)
          || interaction.message.interaction?.user?.id
          || interaction.user.id;
        if (ownerId && interaction.user.id !== ownerId) {
            return interaction.reply({ content: "<:non:1519424807580733635> Vous n'\u00eates pas l'auteur de cette commande", flags: 64, allowedMentions: { parse: [] } });
        }
        if (!hasPermissionForCommand(interaction.member, 'limits')) {
            return interaction.reply({ content: "<:non:1519424807580733635> Vous n'avez pas la permission", flags: 64, allowedMentions: { parse: [] } });
        }

        const guildId = String(interaction.guild.id);
        ensureConfig(guildId);
        const cfg = data.otherConfig[guildId];

        if (interaction.isStringSelectMenu()) {
            const action = interaction.values[0];

            if (interaction.customId === 'limits_ban_action') {
                if (action === 'add') {
                    return updateSafe(interaction, buildRoleSelectCard('Ajouter un r\u00f4le ban', 'limits_ban_role_add'));
                }
                if (action === 'modify') {
                    if (!Object.keys(cfg.banRoles).length) {
                        return updateSafe(interaction, { ...noCard('Aucun r\u00f4le configur\u00e9'), components: [] });
                    }
                    const roles = Object.keys(cfg.banRoles);
                    return updateSafe(interaction, buildBanRoleModifyCard(roles, interaction.guild));
                }
                if (action === 'remove') {
                    const roles = Object.keys(cfg.banRoles);
                    if (!roles.length) {
                        return updateSafe(interaction, { ...noCard('Aucun r\u00f4le configur\u00e9'), components: [] });
                    }
                    return updateSafe(interaction, buildRoleRemoveCard('Supprimer des r\u00f4les ban', 'limits_ban_role_remove', roles, interaction.guild));
                }
            }

            if (interaction.customId === 'limits_clear_categories_action') {
                if (action === 'add') {
                    return updateSafe(interaction, buildCategorySelectCard('Ajouter une cat\u00e9gorie clear', 'limits_clear_categories_add', 25, '> S\u00e9lectionnez une ou plusieurs cat\u00e9gories autoris\u00e9es'));
                }
                if (action === 'remove') {
                    const options = cfg.clearCategories.map((id) => ({
                        label: (interaction.guild.channels.cache.get(id) && interaction.guild.channels.cache.get(id).name) || id,
                        value: id
                    })).slice(0, 25);

                    if (!options.length) {
                        return updateSafe(interaction, { ...noCard('Aucune cat\u00e9gorie configur\u00e9e'), components: [] });
                    }

                    return updateSafe(interaction, {
                        flags: 32768,
                        components: [{
                            type: 17,
                            components: [
                                { type: 10, content: '# Supprimer des cat\u00e9gories clear' },
                                { type: 14, divider: true },
                                {
                                    type: 1,
                                    components: [{
                                        type: 3,
                                        custom_id: 'limits_clear_categories_remove',
                                        placeholder: 'Choisir des cat\u00e9gories',
                                        options,
                                        min_values: 1,
                                        max_values: Math.min(options.length, 25)
                                    }]
                                }
                            ]
                        }]
                    });
                }
            }

            if (interaction.customId === 'limits_clear_channels_action') {
                if (action === 'add') {
                    return updateSafe(interaction, buildChannelSelectCard('Ajouter un salon autoris\u00e9 clear', 'limits_clear_channels_add', 25, '> S\u00e9lectionnez un ou plusieurs salons autoris\u00e9s'));
                }
                if (action === 'remove') {
                    const options = cfg.clearChannels.map((id) => ({
                        label: (interaction.guild.channels.cache.get(id) && interaction.guild.channels.cache.get(id).name) || id,
                        value: id
                    })).slice(0, 25);

                    if (!options.length) {
                        return updateSafe(interaction, { ...noCard('Aucun salon autoris\u00e9 configur\u00e9'), components: [] });
                    }

                    return updateSafe(interaction, {
                        flags: 32768,
                        components: [{
                            type: 17,
                            components: [
                                { type: 10, content: '# Supprimer des salons autoris\u00e9s clear' },
                                { type: 14, divider: true },
                                {
                                    type: 1,
                                    components: [{
                                        type: 3,
                                        custom_id: 'limits_clear_channels_remove',
                                        placeholder: 'Choisir des salons',
                                        options,
                                        min_values: 1,
                                        max_values: Math.min(options.length, 25)
                                    }]
                                }
                            ]
                        }]
                    });
                }
            }

            if (interaction.customId === 'limits_clear_protected_action') {
                if (action === 'add') {
                    return updateSafe(interaction, buildChannelSelectCard('Ajouter un salon prot\u00e9g\u00e9 clear', 'limits_clear_protected_add', 25, '> S\u00e9lectionnez un ou plusieurs salons prot\u00e9g\u00e9s'));
                }
                if (action === 'remove') {
                    const options = cfg.clearProtected.map((id) => ({
                        label: (interaction.guild.channels.cache.get(id) && interaction.guild.channels.cache.get(id).name) || id,
                        value: id
                    })).slice(0, 25);

                    if (!options.length) {
                        return updateSafe(interaction, { ...noCard('Aucun salon prot\u00e9g\u00e9 configur\u00e9'), components: [] });
                    }

                    return updateSafe(interaction, {
                        flags: 32768,
                        components: [{
                            type: 17,
                            components: [
                                { type: 10, content: '# Supprimer des salons prot\u00e9g\u00e9s clear' },
                                { type: 14, divider: true },
                                {
                                    type: 1,
                                    components: [{
                                        type: 3,
                                        custom_id: 'limits_clear_protected_remove',
                                        placeholder: 'Choisir des salons',
                                        options,
                                        min_values: 1,
                                        max_values: Math.min(options.length, 25)
                                    }]
                                }
                            ]
                        }]
                    });
                }
            }

            if (interaction.customId === 'limits_clear_limit_action') {
                if (action === 'modify') {
                    awaitingLimits.set(`${interaction.user.id}:${interaction.channel.id}`, { type: 'clear', messageId: interaction.message.id });
                    return updateSafe(interaction, buildClearLimitPromptCard('Modifier la limite clear'));
                }
                if (action === 'reset') {
                    cfg.clearLimit = 100;
                    saveOtherConfig();
                    return updateSafe(interaction, buildMainCard(interaction.guild));
                }
            }

            if (interaction.customId === 'limits_sanctions_command') {
                return updateSafe(interaction, buildSanctionActionCard(action));
            }

            if (interaction.customId.startsWith('limits_sanction_action_')) {
                const commandName = interaction.customId.split('_')[3];

                if (action === 'general') {
                    awaitingLimits.set(`${interaction.user.id}:${interaction.channel.id}`, {
                        type: 'sanction_general',
                        commandName,
                        messageId: interaction.message.id
                    });
                    return updateSafe(interaction, buildTextLimitPromptCard(
                        `Modifier la limite g\u00e9n\u00e9rale ${commandName}`,
                        `\u00c9crivez la nouvelle limite g\u00e9n\u00e9rale pour \`${commandName}\``,
                        `*Exemple : \`5 30\` pour \`5\` ${commandName} maximum par \`30 minutes\`*`
                    ));
                }

                if (action === 'roles') {
                    const commandConfig = getSanctionConfig(guildId, commandName);
                    return updateSafe(interaction, buildSanctionRoleActionCard(commandName, Object.keys(commandConfig.roles).length > 0));
                }
            }

            if (interaction.customId.startsWith('limits_sanction_roles_action_')) {
                const commandName = interaction.customId.split('_')[4];
                const commandConfig = getSanctionConfig(guildId, commandName);
                const roleIds = Object.keys(commandConfig.roles);

                if (action === 'add') {
                    return updateSafe(interaction, buildRoleSelectCard(`Ajouter un r\u00f4le sp\u00e9cial ${commandName}`, `limits_sanction_role_add_${commandName}`));
                }

                if (action === 'modify') {
                    if (!roleIds.length) {
                        return updateSafe(interaction, { ...noCard('Aucun r\u00f4le configur\u00e9'), components: [] });
                    }
                    return updateSafe(interaction, buildSanctionRoleModifyCard(commandName, roleIds, interaction.guild));
                }

                if (action === 'remove') {
                    if (!roleIds.length) {
                        return updateSafe(interaction, { ...noCard('Aucun r\u00f4le configur\u00e9'), components: [] });
                    }
                    return updateSafe(interaction, buildRoleRemoveCard(`Supprimer des r\u00f4les sp\u00e9ciaux ${commandName}`, `limits_sanction_role_remove_${commandName}`, roleIds, interaction.guild));
                }
            }
        }

        if (interaction.isRoleSelectMenu()) {
            if (interaction.customId === 'limits_ban_role_add') {
                const roleId = interaction.values[0];
                awaitingLimits.set(`${interaction.user.id}:${interaction.channel.id}`, { type: 'ban', roleId, messageId: interaction.message.id });
                return updateSafe(interaction, buildLimitPromptCard(roleId, 'Ajouter un r\u00f4le ban'));
            }

            if (interaction.customId.startsWith('limits_sanction_role_add_')) {
                const commandName = interaction.customId.split('_')[4];
                const roleId = interaction.values[0];
                awaitingLimits.set(`${interaction.user.id}:${interaction.channel.id}`, {
                    type: 'sanction_role',
                    commandName,
                    roleId,
                    messageId: interaction.message.id
                });
                return updateSafe(interaction, buildTextLimitPromptCard(
                    `Ajouter un r\u00f4le sp\u00e9cial ${commandName}`,
                    `\u00c9crivez la limite sp\u00e9ciale pour ce r\u00f4le sur \`${commandName}\``,
                    `*Exemple : \`5 30\` pour \`5\` ${commandName} maximum par \`30 minutes\`*`
                ));
            }
        }

        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'limits_ban_role_modify') {
                const roleId = interaction.values[0];
                awaitingLimits.set(`${interaction.user.id}:${interaction.channel.id}`, { type: 'ban', roleId, messageId: interaction.message.id });
                return updateSafe(interaction, buildLimitPromptCard(roleId, 'Modifier un r\u00f4le ban'));
            }

            if (interaction.customId === 'limits_ban_role_remove') {
                const roleIds = interaction.values || [];
                roleIds.forEach((roleId) => delete cfg.banRoles[roleId]);
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'limits_clear_categories_remove') {
                const ids = interaction.values || [];
                cfg.clearCategories = cfg.clearCategories.filter((id) => !ids.includes(id));
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'limits_clear_channels_remove') {
                const ids = interaction.values || [];
                cfg.clearChannels = cfg.clearChannels.filter((id) => !ids.includes(id));
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'limits_clear_protected_remove') {
                const ids = interaction.values || [];
                cfg.clearProtected = cfg.clearProtected.filter((id) => !ids.includes(id));
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId.startsWith('limits_sanction_role_modify_')) {
                const commandName = interaction.customId.split('_')[4];
                const roleId = interaction.values[0];
                awaitingLimits.set(`${interaction.user.id}:${interaction.channel.id}`, {
                    type: 'sanction_role',
                    commandName,
                    roleId,
                    messageId: interaction.message.id
                });
                return updateSafe(interaction, buildTextLimitPromptCard(
                    `Modifier un r\u00f4le sp\u00e9cial ${commandName}`,
                    `\u00c9crivez la limite sp\u00e9ciale pour ce r\u00f4le sur \`${commandName}\``,
                    `*Exemple : \`5 30\` pour \`5\` ${commandName} maximum par \`30 minutes\`*`
                ));
            }

            if (interaction.customId.startsWith('limits_sanction_role_remove_')) {
                const commandName = interaction.customId.split('_')[4];
                const roleIds = interaction.values || [];
                roleIds.forEach((roleId) => delete cfg.sanctionLimits[commandName].roles[roleId]);
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }
        }

        if (interaction.isChannelSelectMenu()) {
            const channelIds = interaction.values || [];

            if (interaction.customId === 'limits_clear_categories_add') {
                channelIds.forEach((id) => {
                    if (!cfg.clearCategories.includes(id)) cfg.clearCategories.push(id);
                });
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'limits_clear_channels_add') {
                channelIds.forEach((id) => {
                    if (!cfg.clearChannels.includes(id)) cfg.clearChannels.push(id);
                });
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'limits_clear_protected_add') {
                channelIds.forEach((id) => {
                    if (!cfg.clearProtected.includes(id)) cfg.clearProtected.push(id);
                });
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }
        }
    }
};
