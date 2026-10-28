const { data, saveAllowedChannel, saveLogs, saveMutedRole } = require('../utils/state');
const { hasPermissionForCommand } = require('../utils/permissions');
const { noCard, permissionCard } = require('../utils/cards');

const configOwners = new Map();

const EMOJIS = {
    add: { id: '1462902411965235427', name: 'add' },
    minus: { id: '1462902378016542924', name: 'moins' },
    refresh: { id: '1462902476641665164', name: 'refresh' }
};

const MUTE_PERMISSIONS = {
    SendMessages: false,
    Speak: false,
    AddReactions: false,
    Connect: false,
    SendMessagesInThreads: false,
    CreatePublicThreads: false,
    CreatePrivateThreads: false
};

function buildAllowedMenu(hasAllowed) {
    if (!hasAllowed) {
        return {
            type: 1,
            components: [{
                type: 3,
                custom_id: 'config_allowed_action',
                placeholder: 'Choisir une action',
                options: [
                    { label: 'D\u00e9finir un salon autoris\u00e9', value: 'set_allowed', emoji: EMOJIS.add }
                ]
            }]
        };
    }

    return {
        type: 1,
        components: [{
            type: 3,
            custom_id: 'config_allowed_action',
            placeholder: 'Choisir une action',
            options: [
                { label: 'Modifier le salon autoris\u00e9', value: 'set_allowed', emoji: EMOJIS.refresh },
                { label: 'Supprimer le salon autoris\u00e9', value: 'reset_allowed', emoji: EMOJIS.minus }
            ]
        }]
    };
}

function buildLogsMenu(hasLogs) {
    if (!hasLogs) {
        return {
            type: 1,
            components: [{
                type: 3,
                custom_id: 'config_logs_action',
                placeholder: 'Choisir une action',
                options: [
                    { label: 'D\u00e9finir un salon logs', value: 'set_logs', emoji: EMOJIS.add }
                ]
            }]
        };
    }

    return {
        type: 1,
        components: [{
            type: 3,
            custom_id: 'config_logs_action',
            placeholder: 'Choisir une action',
            options: [
                { label: 'Modifier le salon logs', value: 'set_logs', emoji: EMOJIS.refresh },
                { label: 'Supprimer le salon logs', value: 'reset_logs', emoji: EMOJIS.minus }
            ]
        }]
    };
}

function buildMuteMenu(canCreate) {
    if (canCreate) {
        return {
            type: 1,
            components: [{
                type: 3,
                custom_id: 'config_mute_action',
                placeholder: 'Choisir une action',
                options: [
                    { label : 'Cr\u00e9er le r\u00f4le mute', value: 'create_mute', emoji: EMOJIS.add }
                ]
            }]
        };
    }

    return {
        type: 1,
        components: [{
            type: 3,
            custom_id: 'config_mute_action',
            placeholder: 'Choisir une action',
            options: [
                { label: 'Modifier le r\u00f4le mute', value: 'set_mute', emoji: EMOJIS.refresh },
                { label: 'Supprimer le r\u00f4le mute', value: 'reset_mute', emoji: EMOJIS.minus }
            ]
        }]
    };
}

function buildMainCard(guild) {
    const guildId = String(guild.id);
    const allowedChannelId = data.allowedChannel[guildId];
    const logsChannelId = data.logs[guildId];
    const mutedRoleId = data.mutedRole[guildId];

    const configuredMutedRole = mutedRoleId ? guild.roles.cache.get(mutedRoleId) : null;
    const hasMutedRole = !!configuredMutedRole;

    const allowedChannel = allowedChannelId ? `<#${allowedChannelId}>` : 'Tous les salons';
    const logsChannel = logsChannelId ? `<#${logsChannelId}>` : 'Non configur\u00e9';
    const mutedRole = configuredMutedRole ? `<@&${configuredMutedRole.id}>` : 'Non configur\u00e9';

    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 10, content: '# Panel config' },
                { type: 10, content: '> Voici le panel pour configurer \`3 fondements\` du bot sanctions' },
                { type: 14, divider: true },
                { type: 10, content: `## Salon autoris\u00e9\n> Le __salon autoris\u00e9__ est l'unique salon o\u00f9 les membres pourront appliquer les sanctions en utilisant les commandes. Si un membre essaie de faire une commande dans un autre salon que celui-l\u00e0, \u00e7a ne marchera pas\n\n**Salon :** ${allowedChannel}` },
                buildAllowedMenu(!!allowedChannelId),
                { type: 14, divider: true },
                { type: 10, content: `## R\u00f4le mute\n> Le __r\u00f4le mute__ est le r\u00f4le qui emp\u00eache d'\u00e9crire et de parler dans tous les salons\n\n**R\u00f4le :** ${mutedRole}` },
                buildMuteMenu(!hasMutedRole),
                { type: 14, divider: true },
                { type: 10, content: `## Salon logs\n> Dans le __salon logs__ seront envoy\u00e9s tous les logs de toutes les actions effectu\u00e9es avec le bot\n\n**Salon :** ${logsChannel}` },
                buildLogsMenu(!!logsChannelId),
                { type: 14, divider: true }
            ]
        }]
    };
}

function buildChannelSelectCard(title, customId) {
    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 10, content: `# ${title}` },
                { type: 14, divider: true },
                { type: 10, content: '> S\u00e9lectionnez un salon du serveur' },
                { type: 14, divider: true },
                {
                    type: 1,
                    components: [{
                        type: 8,
                        custom_id: customId,
                        placeholder: 'S\u00e9lectionner un salon',
                        channel_types: [0]
                    }]
                }
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
                { type: 10, content: '> S\u00e9lectionnez un r\u00f4le du serveur' },
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

async function safeDefer(interaction) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
    }
}

function updateSafe(interaction, payload) {
    return interaction.update({ ...payload, allowedMentions: { parse: [] } });
}

function editSafe(interaction, payload) {
    return interaction.editReply({ ...payload, allowedMentions: { parse: [] } });
}

async function removeMuteOverwrites(guild, roleId) {
    if (!roleId) return;
    const role = guild.roles.cache.get(roleId);
    if (!role) return;

    for (const channel of guild.channels.cache.values()) {
        try {
            if (channel.permissionOverwrites.cache.has(roleId)) {
                await channel.permissionOverwrites.delete(roleId);
            }
        } catch {
        }
    }
}

async function applyMuteOverwrites(guild, role) {
    for (const channel of guild.channels.cache.values()) {
        try {
            await channel.permissionOverwrites.edit(role, MUTE_PERMISSIONS);
        } catch {
        }
    }
}

async function ensureMutedRole(guild) {
    const existing = guild.roles.cache.find((role) => role.name === 'Muted');
    if (existing) return existing;

    return guild.roles.create({ name: 'Muted', reason: 'Cr\u00e9ation automatique du r\u00f4le Muted' });
}

module.exports = {
    name: 'config',
    async executePrefix(message) {
        if (!hasPermissionForCommand(message.member, 'config')) {
            return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const card = buildMainCard(message.guild);
        const reply = await message.reply({ ...card, allowedMentions: { parse: [] }, mentionRepliedUser: false });
        configOwners.set(reply.id, message.author.id);
        return reply;
    },
    async handleMenu(interaction) {
        const ownerId = configOwners.get(interaction.message.id)
          || interaction.message.interaction?.user?.id
          || interaction.user.id;
        if (ownerId && interaction.user.id != ownerId) {
            return interaction.reply({ content: "<:non:1519424807580733635> Vous n'\u00eates pas l'auteur de cette commande", flags: 64, allowedMentions: { parse: [] } });
        }
        if (!hasPermissionForCommand(interaction.member, 'config')) {
            return interaction.reply({ content: "<:non:1519424807580733635> Vous n'avez pas la permission", flags: 64, allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        if (interaction.isStringSelectMenu()) {
            const action = interaction.values[0];
            const guildId = String(interaction.guild.id);

            if (interaction.customId === 'config_allowed_action') {
                if (action === 'set_allowed') {
                    return updateSafe(interaction, buildChannelSelectCard('Choisir le salon autoris\u00e9', 'config_allowed_channel'));
                }
                if (action === 'reset_allowed') {
                    if (data.allowedChannel[guildId]) {
                        delete data.allowedChannel[guildId];
                        saveAllowedChannel();
                    }
                    return updateSafe(interaction, buildMainCard(interaction.guild));
                }
            }

            if (interaction.customId === 'config_logs_action') {
                if (action === 'set_logs') {
                    return updateSafe(interaction, buildChannelSelectCard('Choisir le salon logs', 'config_logs_channel'));
                }
                if (action === 'reset_logs') {
                    if (data.logs[guildId]) {
                        delete data.logs[guildId];
                        saveLogs();
                    }
                    return updateSafe(interaction, buildMainCard(interaction.guild));
                }
            }

            if (interaction.customId === 'config_mute_action') {
                if (action === 'create_mute') {
                    await safeDefer(interaction);
                    const role = await ensureMutedRole(interaction.guild);
                    const previousRoleId = data.mutedRole[guildId];
                    if (previousRoleId && previousRoleId !== role.id) {
                        await removeMuteOverwrites(interaction.guild, previousRoleId);
                    }
                    data.mutedRole[guildId] = role.id;
                    saveMutedRole();
                    await applyMuteOverwrites(interaction.guild, role);
                    return editSafe(interaction, buildMainCard(interaction.guild));
                }
                if (action === 'set_mute') {
                    return updateSafe(interaction, buildRoleSelectCard('Choisir le r\u00f4le mute', 'config_mute_role'));
                }
                if (action === 'reset_mute') {
                    await safeDefer(interaction);
                    const previousRoleId = data.mutedRole[guildId];
                    if (previousRoleId) {
                        await removeMuteOverwrites(interaction.guild, previousRoleId);
                        delete data.mutedRole[guildId];
                        saveMutedRole();
                    }
                    return editSafe(interaction, buildMainCard(interaction.guild));
                }
            }
        }

        if (interaction.isChannelSelectMenu()) {
            const channelId = interaction.values[0];
            const guildId = String(interaction.guild.id);

            if (interaction.customId === 'config_allowed_channel') {
                data.allowedChannel[guildId] = channelId;
                saveAllowedChannel();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }

            if (interaction.customId === 'config_logs_channel') {
                data.logs[guildId] = channelId;
                saveLogs();
                return updateSafe(interaction, buildMainCard(interaction.guild));
            }
        }

        if (interaction.isRoleSelectMenu() && interaction.customId === 'config_mute_role') {
            await safeDefer(interaction);
            const roleId = interaction.values[0];
            const guildId = String(interaction.guild.id);
            const previousRoleId = data.mutedRole[guildId];

            if (previousRoleId && previousRoleId !== roleId) {
                await removeMuteOverwrites(interaction.guild, previousRoleId);
            }

            data.mutedRole[guildId] = roleId;
            saveMutedRole();
            const role = interaction.guild.roles.cache.get(roleId);
            if (role) {
                await applyMuteOverwrites(interaction.guild, role);
            }
            return editSafe(interaction, buildMainCard(interaction.guild));
        }
    }
};



