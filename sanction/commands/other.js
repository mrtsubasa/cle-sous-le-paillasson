const { data, saveOtherConfig } = require('../utils/state');
const { hasPermissionForCommand } = require('../utils/permissions');
const { noCard, permissionCard, createCard } = require('../utils/cards');

const otherOwners = new Map();

const EMOJIS = {
    add: { id: '1462902411965235427', name: 'add' },
    minus: { id: '1462902378016542924', name: 'moins' },
    refresh: { id: '1462902476641665164', name: 'refresh' }
};

const awaitingLimits = new Map();

function updateSafe(interaction, payload) {
    return interaction.update({ ...payload, allowedMentions: { parse: [] } });
}

function ensureConfig(guildId) {
    if (!data.otherConfig[guildId]) {
        data.otherConfig[guildId] = {};
    }

    const cfg = data.otherConfig[guildId];
    if (!cfg.banRoles) cfg.banRoles = {};
    if (!Array.isArray(cfg.lockCategories)) cfg.lockCategories = [];
    if (!Array.isArray(cfg.lockChannels)) cfg.lockChannels = [];
    if (!Array.isArray(cfg.lockProtected)) cfg.lockProtected = [];
    if (!Array.isArray(cfg.hideCategories)) cfg.hideCategories = [];
    if (!Array.isArray(cfg.hideChannels)) cfg.hideChannels = [];
    if (!Array.isArray(cfg.hideProtected)) cfg.hideProtected = [];
    if (!Array.isArray(cfg.renewCategories)) cfg.renewCategories = [];
    if (!Array.isArray(cfg.renewProtected)) cfg.renewProtected = [];
    if (!Array.isArray(cfg.clearCategories)) cfg.clearCategories = [];
    if (!Array.isArray(cfg.clearChannels)) cfg.clearChannels = [];
    if (!Array.isArray(cfg.clearProtected)) cfg.clearProtected = [];
    if (!Number.isInteger(cfg.clearLimit)) cfg.clearLimit = 100;
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
            custom_id: 'other_ban_action',
            placeholder: 'Choisir une action',
            options
        }]
    };
}

function buildLockChannelMenu(hasChannels) {
    const options = [{ label: 'Ajouter un salon autoris\u00e9', value: 'add', emoji: EMOJIS.add }];
    if (hasChannels) {
        options.push({ label: 'Supprimer un salon autoris\u00e9', value: 'remove', emoji: EMOJIS.minus });
    }
    return {
        type: 1,
        components: [{
            type: 3,
            custom_id: 'other_lock_channels_action',
            placeholder: 'Choisir une action',
            options
        }]
    };
}

function buildLockCategoryMenu(hasCategories) {
    const options = [{ label: 'Ajouter une cat\u00e9gorie', value: 'add', emoji: EMOJIS.add }];
    if (hasCategories) {
        options.push({ label: 'Supprimer une cat\u00e9gorie', value: 'remove', emoji: EMOJIS.minus });
    }
    return {
        type: 1,
        components: [{
            type: 3,
            custom_id: 'other_lock_categories_action',
            placeholder: 'Choisir une action',
            options
        }]
    };
}

function buildLockProtectedMenu(hasProtected) {
    const options = [{ label: 'Ajouter un salon prot\u00e9g\u00e9', value: 'add', emoji: EMOJIS.add }];
    if (hasProtected) {
        options.push({ label: 'Supprimer un salon prot\u00e9g\u00e9', value: 'remove', emoji: EMOJIS.minus });
    }
    return {
        type: 1,
        components: [{
            type: 3,
            custom_id: 'other_lock_protected_action',
            placeholder: 'Choisir une action',
            options
        }]
    };
}

function buildHideChannelMenu(hasChannels) {
    const options = [{ label: 'Ajouter un salon autoris\u00e9', value: 'add', emoji: EMOJIS.add }];
    if (hasChannels) {
        options.push({ label: 'Supprimer un salon autoris\u00e9', value: 'remove', emoji: EMOJIS.minus });
    }
    return {
        type: 1,
        components: [{
            type: 3,
            custom_id: 'other_hide_channels_action',
            placeholder: 'Choisir une action',
            options
        }]
    };
}

function buildHideCategoryMenu(hasCategories) {
    const options = [{ label: 'Ajouter une cat\u00e9gorie', value: 'add', emoji: EMOJIS.add }];
    if (hasCategories) {
        options.push({ label: 'Supprimer une cat\u00e9gorie', value: 'remove', emoji: EMOJIS.minus });
    }
    return {
        type: 1,
        components: [{
            type: 3,
            custom_id: 'other_hide_categories_action',
            placeholder: 'Choisir une action',
            options
        }]
    };
}

function buildHideProtectedMenu(hasProtected) {
    const options = [{ label: 'Ajouter un salon prot\u00e9g\u00e9', value: 'add', emoji: EMOJIS.add }];
    if (hasProtected) {
        options.push({ label: 'Supprimer un salon prot\u00e9g\u00e9', value: 'remove', emoji: EMOJIS.minus });
    }
    return {
        type: 1,
        components: [{
            type: 3,
            custom_id: 'other_hide_protected_action',
            placeholder: 'Choisir une action',
            options
        }]
    };
}

function buildRenewCategoryMenu(hasCategories) {
    const options = [{ label: 'Ajouter une cat\u00e9gorie', value: 'add', emoji: EMOJIS.add }];
    if (hasCategories) {
        options.push({ label: 'Supprimer une cat\u00e9gorie', value: 'remove', emoji: EMOJIS.minus });
    }
    return {
        type: 1,
        components: [{
            type: 3,
            custom_id: 'other_renew_categories_action',
            placeholder: 'Choisir une action',
            options
        }]
    };
}

function buildRenewProtectedMenu(hasProtected) {
    const options = [{ label: 'Ajouter un salon prot\u00e9g\u00e9', value: 'add', emoji: EMOJIS.add }];
    if (hasProtected) {
        options.push({ label: 'Supprimer un salon prot\u00e9g\u00e9', value: 'remove', emoji: EMOJIS.minus });
    }
    return {
        type: 1,
        components: [{
            type: 3,
            custom_id: 'other_renew_protected_action',
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
            custom_id: 'other_clear_limit_action',
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
            custom_id: 'other_clear_channels_action',
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
            custom_id: 'other_clear_categories_action',
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
            custom_id: 'other_clear_protected_action',
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
                { type: 10, content: `> ### \u00c9crivez la nouvelle limite de suppression de messages maximale pour une commande clear` },
                { type: 14, divider: true }
            ]
        }]
    };
}

function buildMainCard(guild) {
    const guildId = String(guild.id);
    ensureConfig(guildId);
    const cfg = data.otherConfig[guildId];

    const lockCategories = cfg.lockCategories.length ? cfg.lockCategories.map((id) => `<#${id}>`).join(', ') : 'Aucune cat\u00e9gorie';

    const lockChannels = cfg.lockChannels.length ? cfg.lockChannels.map((id) => `<#${id}>`).join(', ') : 'Aucun salon';

    const lockProtected = cfg.lockProtected.length ? cfg.lockProtected.map((id) => `<#${id}>`).join(', ') : 'Aucun salon';

    const hideCategories = cfg.hideCategories.length ? cfg.hideCategories.map((id) => `<#${id}>`).join(', ') : 'Aucune cat\u00e9gorie';

    const hideChannels = cfg.hideChannels.length ? cfg.hideChannels.map((id) => `<#${id}>`).join(', ') : 'Aucun salon';

    const hideProtected = cfg.hideProtected.length ? cfg.hideProtected.map((id) => `<#${id}>`).join(', ') : 'Aucun salon';

    const renewCategories = cfg.renewCategories.length ? cfg.renewCategories.map((id) => `<#${id}>`).join(', ') : 'Aucune cat\u00e9gorie';

    const renewProtected = cfg.renewProtected.length ? cfg.renewProtected.map((id) => `<#${id}>`).join(', ') : 'Aucun salon';

    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 10, content: '# Panel other\n> Voici le panel pour g\u00e9rer les \`3\` commandes dangereuses du bot : `lock`, `hide` et `renew`' },
                { type: 14, divider: true },
                { type: 10, content: '## Lock\n> Vous pouvez configurer les `salons autoris\u00e9s` et les `salons prot\u00e9g\u00e9s` pour la commande lock. Les membres ayant acc\u00e8s \u00e0 la commande pourront seulement lock et unlock les salons autoris\u00e9s et ne pourront pas lock les salons prot\u00e9g\u00e9s' },
                { type: 10, content: `**Cat\u00e9gories autoris\u00e9es :** ${lockCategories}` },
                buildLockCategoryMenu(cfg.lockCategories.length > 0),
                { type: 10, content: `**Salons autoris\u00e9s :** ${lockChannels}` },
                buildLockChannelMenu(cfg.lockChannels.length > 0),
                { type: 10, content: `**Salons prot\u00e9g\u00e9s :** ${lockProtected}` },
                buildLockProtectedMenu(cfg.lockProtected.length > 0),
                { type: 14, divider: true },
                { type: 10, content: '## Hide\n> Vous pouvez configurer les `salons autoris\u00e9s` et les `salons prot\u00e9g\u00e9s` pour les commandes hide et unhide. Les membres ayant acc\u00e8s \u00e0 la commande pourront seulement hide et unhide les salons autoris\u00e9s et ne pourront pas hide les salons prot\u00e9g\u00e9s' },
                { type: 10, content: `**Cat\u00e9gories autoris\u00e9es :** ${hideCategories}` },
                buildHideCategoryMenu(cfg.hideCategories.length > 0),
                { type: 10, content: `**Salons autoris\u00e9s :** ${hideChannels}` },
                buildHideChannelMenu(cfg.hideChannels.length > 0),
                { type: 10, content: `**Salons prot\u00e9g\u00e9s :** ${hideProtected}` },
                buildHideProtectedMenu(cfg.hideProtected.length > 0),
                { type: 14, divider: true },
                { type: 10, content: '## Renew\n> Vous pouvez configurer les `cat\u00e9gories autoris\u00e9es` et les `salons prot\u00e9g\u00e9s` pour la commande renew. Les membres ayant acc\u00e8s \u00e0 la commande pourront renew les salons des cat\u00e9gories autoris\u00e9es mais pas les salons prot\u00e9g\u00e9s (m\u00eame s\'ils se trouvent dans les cat\u00e9gories autoris\u00e9es)' },
                { type: 10, content: `**Cat\u00e9gories autoris\u00e9es :** ${renewCategories}` },
                buildRenewCategoryMenu(cfg.renewCategories.length > 0),
                { type: 10, content: `**Salons prot\u00e9g\u00e9s :** ${renewProtected}` },
                buildRenewProtectedMenu(cfg.renewProtected.length > 0),
                { type: 14, divider: true },
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
    const options = roles.map((roleId) => {
        const role = guild.roles.cache.get(roleId);
        return {
            label: role ? role.name : roleId,
            value: roleId,
            description: `ID : ${roleId}`
        };
    }).slice(0, 25);

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
                        custom_id: 'other_ban_role_modify',
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
    const options = roles.map((roleId) => {
        const role = guild.roles.cache.get(roleId);
        return {
            label: role ? role.name : roleId,
            value: roleId,
            description: `ID : ${roleId}`
        };
    }).slice(0, 25);

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
                { type: 10, content: `# ${actionLabel}\n> La limite de ban est choisie par \`nombre de bans / minutes\`. Donc vous pouvez \u00e9crire par exemple \`5 30\` pour \`5\` bans maximum par \`30 minutes\`` },
                { type: 14, divider: true },
                { type: 10, content: `### \u00c9crivez la limite de bans pour le r\u00f4le en un temps donn\u00e9 ` },
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

function handleAwaiting(message) {
    const key = `${message.author.id}:${message.channel.id}`;
    if (!awaitingLimits.has(key)) return false;

    const payload = awaitingLimits.get(key);

    if (payload.type === 'clear') {
        const value = parseInt(message.content.trim(), 10);
        if (!Number.isInteger(value) || value <= 0) {
            message.delete().catch(() => {});
            const errorCard = noCard('Format invalide, exemple : 100');
            const panel = buildMainCard(message.guild);

            awaitingLimits.delete(key);
            if (payload.messageId) {
                message.channel.messages.fetch(payload.messageId)
                    .then((panelMessage) => {
                        panelMessage.edit({ ...errorCard, allowedMentions: { parse: [] } });
                        setTimeout(() => {
                            panelMessage.edit({ ...panel, allowedMentions: { parse: [] } }).catch(() => {});
                        }, 3000);
                    })
                    .catch(() => {
                        message.channel.send({ ...errorCard, allowedMentions: { parse: [] } });
                        setTimeout(() => {
                            message.channel.send({ ...panel, allowedMentions: { parse: [] } });
                        }, 3000);
                    });
            } else {
                message.channel.send({ ...errorCard, allowedMentions: { parse: [] } });
                setTimeout(() => {
                    message.channel.send({ ...panel, allowedMentions: { parse: [] } });
                }, 3000);
            }
            return true;
        }

        const guildId = String(message.guild.id);
        ensureConfig(guildId);
        data.otherConfig[guildId].clearLimit = value;
        saveOtherConfig();
        awaitingLimits.delete(key);

        message.delete().catch(() => {});
        const panel = buildMainCard(message.guild);
        if (payload.messageId) {
            message.channel.messages.fetch(payload.messageId) ?.then((panelMessage) => panelMessage.edit({ ...panel, allowedMentions : { parse: [] } }))
                .catch(() => {
                    message.channel.send({ ...panel, allowedMentions: { parse: [] } });
                });
        } else {
            message.channel.send({ ...panel, allowedMentions: { parse: [] } });
        }
        return true;
    }

    const parsed = parseLimitInput(message.content);
    if (!parsed) {
        message.delete().catch(() => {});
        const errorCard = noCard('Format invalide, exemple : 3 60');
        const panel = buildMainCard(message.guild);

        awaitingLimits.delete(key);
        if (payload.messageId) {
            message.channel.messages.fetch(payload.messageId)
                .then((panelMessage) => {
                    panelMessage.edit({ ...errorCard, allowedMentions: { parse: [] } });
                    setTimeout(() => {
                        panelMessage.edit({ ...panel, allowedMentions: { parse: [] } }).catch(() => {});
                    }, 3000);
                })
                .catch(() => {
                    message.channel.send({ ...errorCard, allowedMentions: { parse: [] } });
                    setTimeout(() => {
                        message.channel.send({ ...panel, allowedMentions: { parse: [] } });
                    }, 3000);
                });
        } else {
            message.channel.send({ ...errorCard, allowedMentions: { parse: [] } });
            setTimeout(() => {
                message.channel.send({ ...panel, allowedMentions: { parse: [] } });
            }, 3000);
        }
        return true;
    }

    const guildId = String(message.guild.id);
    ensureConfig(guildId);
    data.otherConfig[guildId].banRoles[payload.roleId] = parsed;
    saveOtherConfig();
    awaitingLimits.delete(key);

    message.delete().catch(() => {});
    const panel = buildMainCard(message.guild);
    if (payload.messageId) {
        message.channel.messages.fetch(payload.messageId) ?.then((panelMessage) => panelMessage.edit({ ...panel, allowedMentions : { parse: [] } }))
            .catch(() => {
                message.channel.send({ ...panel, allowedMentions: { parse: [] } });
            });
    } else {
        message.channel.send({ ...panel, allowedMentions: { parse: [] } });
    }
    return true;
}

module.exports = {
    name: 'other',
    handleAwaiting,
    async executePrefix(message) {
        if (!hasPermissionForCommand(message.member, 'other')) {
            return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const card = buildMainCard(message.guild);
        const reply = await message.reply({ ...card, allowedMentions: { parse: [] }, mentionRepliedUser: false });
        otherOwners.set(reply.id, message.author.id);
        return reply;
    },
    async handleMenu(interaction) {
        const ownerId = otherOwners.get(interaction.message.id)
          || interaction.message.interaction?.user?.id
          || interaction.user.id;
        if (ownerId && interaction.user.id != ownerId) {
            return interaction.reply({ content: "<:non:1519424807580733635> Vous n'\u00eates pas l'auteur de cette commande", flags: 64, allowedMentions: { parse: [] } });
        }
        if (!hasPermissionForCommand(interaction.member, 'other')) {
            return interaction.reply({ content: "<:non:1519424807580733635> Vous n'avez pas la permission", flags: 64, allowedMentions: { parse: [] } });
        }

        const guildId = String(interaction.guild.id);
        ensureConfig(guildId);
        const cfg = data.otherConfig[guildId];

        if (interaction.isStringSelectMenu()) {
            const action = interaction.values[0];

            if (interaction.customId === 'other_ban_action') {
                if (action === 'add') {
                    return updateSafe(interaction, buildRoleSelectCard('Ajouter un r\u00f4le ban', 'other_ban_role_add'));
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
                    return updateSafe(interaction, buildRoleRemoveCard('Supprimer des r\u00f4les ban', 'other_ban_role_remove', roles, interaction.guild));
                }
            }

            if (interaction.customId === 'other_lock_channels_action') {
                if (action === 'add') {
                    return updateSafe(interaction, buildChannelSelectCard('Ajouter un salon autoris\u00e9 lock', 'other_lock_channels_add', 25, '> S\u00e9lectionnez un ou plusieurs salons autoris\u00e9s'));
                }
                if (action === 'remove') {
                    const options = cfg.lockChannels.map((id) => ({
                        label: interaction.guild.channels.cache.get(id).name || id,
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
                                { type: 10, content: '# Supprimer des salons autoris\u00e9s lock' },
                                { type: 14, divider: true },
                                {
                                    type: 1,
                                    components: [{
                                        type: 3,
                                        custom_id: 'other_lock_channels_remove',
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

            if (interaction.customId === 'other_lock_categories_action') {
                if (action === 'add') {
                    return updateSafe(interaction, buildCategorySelectCard('Ajouter une cat\u00e9gorie lock', 'other_lock_categories_add', 25, '> S\u00e9lectionnez une ou plusieurs cat\u00e9gories autoris\u00e9es'));
                }
                if (action === 'remove') {
                    const options = cfg.lockCategories.map((id) => ({
                        label: interaction.guild.channels.cache.get(id).name || id,
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
                                { type: 10, content: '# Supprimer des cat\u00e9gories lock' },
                                { type: 14, divider: true },
                                {
                                    type: 1,
                                    components: [{
                                        type: 3,
                                        custom_id: 'other_lock_categories_remove',
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

            if (interaction.customId === 'other_lock_protected_action') {
                if (action === 'add') {
                    return updateSafe(interaction, buildChannelSelectCard('Ajouter un salon prot\u00e9g\u00e9 lock', 'other_lock_protected_add', 25, '> S\u00e9lectionnez un ou plusieurs salons prot\u00e9g\u00e9s'));
                }
                if (action === 'remove') {
                    const options = cfg.lockProtected.map((id) => ({
                        label: interaction.guild.channels.cache.get(id).name || id,
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
                                { type: 10, content: '# Supprimer des salons prot\u00e9g\u00e9s lock' },
                                { type: 14, divider: true },
                                {
                                    type: 1,
                                    components: [{
                                        type: 3,
                                        custom_id: 'other_lock_protected_remove',
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

            if (interaction.customId === 'other_hide_channels_action') {
                if (action === 'add') {
                    return updateSafe(interaction, buildChannelSelectCard('Ajouter un salon autoris\u00e9 hide', 'other_hide_channels_add', 25, '> S\u00e9lectionnez un ou plusieurs salons autoris\u00e9s'));
                }
                if (action === 'remove') {
                    const options = cfg.hideChannels.map((id) => ({
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
                                { type: 10, content: '# Supprimer des salons autoris\u00e9s hide' },
                                { type: 14, divider: true },
                                {
                                    type: 1,
                                    components: [{
                                        type: 3,
                                        custom_id: 'other_hide_channels_remove',
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

            if (interaction.customId === 'other_hide_categories_action') {
                if (action === 'add') {
                    return updateSafe(interaction, buildCategorySelectCard('Ajouter une cat\u00e9gorie hide', 'other_hide_categories_add', 25, '> S\u00e9lectionnez une ou plusieurs cat\u00e9gories autoris\u00e9es'));
                }
                if (action === 'remove') {
                    const options = cfg.hideCategories.map((id) => ({
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
                                { type: 10, content: '# Supprimer des cat\u00e9gories hide' },
                                { type: 14, divider: true },
                                {
                                    type: 1,
                                    components: [{
                                        type: 3,
                                        custom_id: 'other_hide_categories_remove',
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

            if (interaction.customId === 'other_hide_protected_action') {
                if (action === 'add') {
                    return updateSafe(interaction, buildChannelSelectCard('Ajouter un salon prot\u00e9g\u00e9 hide', 'other_hide_protected_add', 25, '> S\u00e9lectionnez un ou plusieurs salons prot\u00e9g\u00e9s'));
                }
                if (action === 'remove') {
                    const options = cfg.hideProtected.map((id) => ({
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
                                { type: 10, content: '# Supprimer des salons prot\u00e9g\u00e9s hide' },
                                { type: 14, divider: true },
                                {
                                    type: 1,
                                    components: [{
                                        type: 3,
                                        custom_id: 'other_hide_protected_remove',
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

            if (interaction.customId === 'other_renew_categories_action') {
                if (action === 'add') {
                    return updateSafe(interaction, buildCategorySelectCard('Ajouter une cat\u00e9gorie renew', 'other_renew_categories_add', 25, '> S\u00e9lectionnez une ou plusieurs cat\u00e9gories autoris\u00e9es'));
                }
                if (action === 'remove') {
                    const options = cfg.renewCategories.map((id) => ({
                        label: interaction.guild.channels.cache.get(id).name || id,
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
                                { type: 10, content: '# Supprimer des cat\u00e9gories renew' },
                                { type: 14, divider: true },
                                {
                                    type: 1,
                                    components: [{
                                        type: 3,
                                        custom_id: 'other_renew_categories_remove',
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

            if (interaction.customId === 'other_clear_limit_action') {
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

            if (interaction.customId === 'other_clear_channels_action') {
                if (action === 'add') {
                    return updateSafe(interaction, buildChannelSelectCard('Ajouter un salon autoris\u00e9 clear', 'other_clear_channels_add', 25, '> S\u00e9lectionnez un ou plusieurs salons autoris\u00e9s'));
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
                                        custom_id: 'other_clear_channels_remove',
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

            if (interaction.customId === 'other_clear_categories_action') {
                if (action === 'add') {
                    return updateSafe(interaction, buildCategorySelectCard('Ajouter une cat\u00e9gorie clear', 'other_clear_categories_add', 25, '> S\u00e9lectionnez une ou plusieurs cat\u00e9gories autoris\u00e9es'));
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
                                        custom_id: 'other_clear_categories_remove',
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

            if (interaction.customId === 'other_clear_protected_action') {
                if (action === 'add') {
                    return updateSafe(interaction, buildChannelSelectCard('Ajouter un salon prot\u00e9g\u00e9 clear', 'other_clear_protected_add', 25, '> S\u00e9lectionnez un ou plusieurs salons prot\u00e9g\u00e9s'));
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
                                        custom_id: 'other_clear_protected_remove',
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

            if (interaction.customId === 'other_renew_protected_action') {
                if (action === 'add') {
                    return updateSafe(interaction, buildChannelSelectCard('Ajouter un salon prot\u00e9g\u00e9 renew', 'other_renew_protected_add', 25, '> S\u00e9lectionnez un ou plusieurs salons prot\u00e9g\u00e9s'));
                }
                if (action === 'remove') {
                    const options = cfg.renewProtected.map((id) => ({
                        label: interaction.guild.channels.cache.get(id).name || id,
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
                                { type: 10, content: '# Supprimer des salons prot\u00e9g\u00e9s renew' },
                                { type: 14, divider: true },
                                {
                                    type: 1,
                                    components: [{
                                        type: 3,
                                        custom_id: 'other_renew_protected_remove',
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
        }

        if (interaction.isRoleSelectMenu()) {
            if (interaction.customId === 'other_ban_role_add') {
                const roleId = interaction.values[0];
                awaitingLimits.set(`${interaction.user.id}:${interaction.channel.id}`, { type: 'ban', roleId, messageId: interaction.message.id });
                return updateSafe(interaction, buildLimitPromptCard(roleId, 'Ajouter un r\u00f4le ban'));
            }
        }

        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'other_ban_role_modify') {
                const roleId = interaction.values[0];
                awaitingLimits.set(`${interaction.user.id}:${interaction.channel.id}`, { type: 'ban', roleId, messageId: interaction.message.id });
                return updateSafe(interaction, buildLimitPromptCard(roleId, 'Modifier un r\u00f4le ban'));
            }

            if (interaction.customId === 'other_ban_role_remove') {

                const roleIds = interaction.values || [];
                roleIds.forEach((roleId) => delete cfg.banRoles[roleId]);
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'other_lock_categories_remove') {
                const ids = interaction.values || [];
                cfg.lockCategories = cfg.lockCategories.filter((id) => !ids.includes(id));
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'other_lock_channels_remove') {
                const ids = interaction.values || [];
                cfg.lockChannels = cfg.lockChannels.filter((id) => !ids.includes(id));
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'other_lock_protected_remove') {
                const ids = interaction.values || [];
                cfg.lockProtected = cfg.lockProtected.filter((id) => !ids.includes(id));
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'other_hide_categories_remove') {
                const ids = interaction.values || [];
                cfg.hideCategories = cfg.hideCategories.filter((id) => !ids.includes(id));
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'other_hide_channels_remove') {
                const ids = interaction.values || [];
                cfg.hideChannels = cfg.hideChannels.filter((id) => !ids.includes(id));
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'other_hide_protected_remove') {
                const ids = interaction.values || [];
                cfg.hideProtected = cfg.hideProtected.filter((id) => !ids.includes(id));
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'other_renew_categories_remove') {
                const ids = interaction.values || [];
                cfg.renewCategories = cfg.renewCategories.filter((id) => !ids.includes(id));
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'other_clear_categories_remove') {
                const ids = interaction.values || [];
                cfg.clearCategories = cfg.clearCategories.filter((id) => !ids.includes(id));
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'other_clear_channels_remove') {
                const ids = interaction.values || [];
                cfg.clearChannels = cfg.clearChannels.filter((id) => !ids.includes(id));
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'other_clear_protected_remove') {
                const ids = interaction.values || [];
                cfg.clearProtected = cfg.clearProtected.filter((id) => !ids.includes(id));
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'other_renew_protected_remove') {
                const ids = interaction.values || [];
                cfg.renewProtected = cfg.renewProtected.filter((id) => !ids.includes(id));
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }
        }

        if (interaction.isChannelSelectMenu()) {
            const channelIds = interaction.values || [];

            if (interaction.customId === 'other_lock_categories_add') {
                channelIds.forEach((id) => {
                    if (!cfg.lockCategories.includes(id)) cfg.lockCategories.push(id);
                });
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'other_lock_channels_add') {
                channelIds.forEach((id) => {
                    if (!cfg.lockChannels.includes(id)) cfg.lockChannels.push(id);
                });
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'other_lock_protected_add') {
                channelIds.forEach((id) => {
                    if (!cfg.lockProtected.includes(id)) cfg.lockProtected.push(id);
                });
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'other_hide_categories_add') {
                channelIds.forEach((id) => {
                    if (!cfg.hideCategories.includes(id)) cfg.hideCategories.push(id);
                });
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'other_hide_channels_add') {
                channelIds.forEach((id) => {
                    if (!cfg.hideChannels.includes(id)) cfg.hideChannels.push(id);
                });
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'other_hide_protected_add') {
                channelIds.forEach((id) => {
                    if (!cfg.hideProtected.includes(id)) cfg.hideProtected.push(id);
                });
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'other_renew_categories_add') {
                channelIds.forEach((id) => {
                    if (!cfg.renewCategories.includes(id)) cfg.renewCategories.push(id);
                });
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'other_clear_categories_add') {
                channelIds.forEach((id) => {
                    if (!cfg.clearCategories.includes(id)) cfg.clearCategories.push(id);
                });
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'other_clear_channels_add') {
                channelIds.forEach((id) => {
                    if (!cfg.clearChannels.includes(id)) cfg.clearChannels.push(id);
                });
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'other_clear_protected_add') {
                channelIds.forEach((id) => {
                    if (!cfg.clearProtected.includes(id)) cfg.clearProtected.push(id);
                });
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'other_renew_protected_add') {
                channelIds.forEach((id) => {
                    if (!cfg.renewProtected.includes(id)) cfg.renewProtected.push(id);
                });
                saveOtherConfig();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }
        }
    }
};

