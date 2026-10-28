const Discord = require('discord.js');
const { loadRuntimeConfig } = require('../../../Utils/runtimeContext');
const config = loadRuntimeConfig();

function getDefaultPrefix() {
    return typeof config.prefix === 'string' && config.prefix.trim()
        ? config.prefix.trim()
        : '$';
}

function checkBot(bot) {
    let req = bot.db.prepare('SELECT * FROM bot WHERE id = ?').get(bot.user.id);
    if (!req) bot.db.exec(`INSERT INTO bot (id) VALUES ('${bot.user.id}')`);
    req = bot.db.prepare('SELECT * FROM bot WHERE id = ?').get(bot.user.id);
    return req;
}

function ensureGuildRow(bot, guildId) {
    if (!guildId) return null;

    let req = bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
    if (!req) {
        const defaultBuyers = Array.isArray(config.buyers)
            ? config.buyers.map((id) => String(id))
            : [String(config.buyers || '')];

        bot.db.prepare('INSERT INTO guilds (id, buyers) VALUES (?, ?)').run(guildId, JSON.stringify(defaultBuyers));
        req = bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
    } else if (req.buyers == null) {
        const defaultBuyers = Array.isArray(config.buyers)
            ? config.buyers.map((id) => String(id))
            : [String(config.buyers || '')];

        bot.db.prepare('UPDATE guilds SET buyers = ? WHERE id = ?').run(JSON.stringify(defaultBuyers), guildId);
        req = bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
    }

    return req;
}

function getGuildData(bot, guildId) {
    const guildRow = ensureGuildRow(bot, guildId) || {};
    const botRow = checkBot(bot) || {};

    return {
        ...botRow,
        ...guildRow,
    };
}

function checkbot(bot) {
    return checkBot(bot);
}

function checkGuild(bot, guildId) {
    return ensureGuildRow(bot, guildId);
}

function getGuildPrefix(bot, guildId) {
    const fallbackPrefix = getDefaultPrefix();
    if (!guildId) return fallbackPrefix;

    const req = getGuildData(bot, guildId);
    const prefix = typeof req?.prefix === 'string' ? req.prefix.trim() : '';
    return prefix || fallbackPrefix;
}

function setGuildPrefix(bot, guildId, prefix) {
    checkGuild(bot, guildId);
    bot.db.prepare('UPDATE guilds SET prefix = ? WHERE id = ?').run(prefix, guildId);
    return prefix;
}

function getGuildVoiceStats(bot, guildId) {
    const guild = checkGuild(bot, guildId);
    return {
        channelId: guild?.voiceStatsChannel || null,
        enabled: String(guild?.voiceStatsEnabled || '0') === '1',
        peak: Number.isFinite(Number(guild?.voiceStatsPeak)) ? Number(guild.voiceStatsPeak) : 0,
        step: Number.isFinite(Number(guild?.voiceStatsStep)) && Number(guild.voiceStatsStep) > 0
            ? Math.max(1, Math.floor(Number(guild.voiceStatsStep)))
            : 5,
    };
}

function setGuildVoiceStats(bot, guildId, data) {
    checkGuild(bot, guildId);
    const current = getGuildVoiceStats(bot, guildId);
    const enabled = data?.enabled ? '1' : '0';
    const channelId = data?.channelId || null;
    const peak = Number.isFinite(Number(data?.peak)) ? Number(data.peak) : 0;
    const step = Number.isFinite(Number(data?.step)) && Number(data.step) > 0
        ? Math.max(1, Math.floor(Number(data.step)))
        : current.step;

    bot.db.prepare(
        'UPDATE guilds SET voiceStatsChannel = ?, voiceStatsEnabled = ?, voiceStatsPeak = ?, voiceStatsStep = ? WHERE id = ?',
    ).run(channelId, enabled, peak, step, guildId);

    return { channelId, enabled: enabled === '1', peak, step };
}

function parseList(value) {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function parseObject(value) {
    try {
        const parsed = JSON.parse(value || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function hasId(list, userId) {
    return Array.isArray(list) && list.some((entry) => {
        if (entry == null) return false;
        if (typeof entry === 'string' || typeof entry === 'number') {
            return String(entry) === String(userId);
        }
        return String(entry.id || '') === String(userId);
    });
}

function getGuildAccessLists(bot, guildId) {
    const guild = getGuildData(bot, guildId);
    return {
        owner: parseList(guild?.owner),
        sys: parseList(guild?.sys),
        wl: parseList(guild?.wl),
        buyers: parseList(guild?.buyers),
    };
}

function normalizeCafardList(list) {
    return Array.isArray(list)
        ? list.filter((entry) => entry && typeof entry === 'object' && entry.id)
        : [];
}

function normalizeLaisseList(list) {
    return Array.isArray(list)
        ? list.filter((entry) => entry && typeof entry === 'object' && entry.id)
        : [];
}

function getGuildCafardLists(bot, guildId) {
    const guild = checkGuild(bot, guildId);
    return parseObject(guild?.cafard);
}

function getGuildCafardList(bot, guildId, ownerId) {
    const lists = getGuildCafardLists(bot, guildId);
    return normalizeCafardList(lists[String(ownerId)]);
}

function getGuildCafardOwner(bot, guildId, memberId) {
    const lists = getGuildCafardLists(bot, guildId);

    for (const [ownerId, list] of Object.entries(lists)) {
        if (!Array.isArray(list)) continue;
        if (list.some((entry) => entry?.id === memberId)) {
            return ownerId;
        }
    }

    return null;
}

function setGuildCafardList(bot, guildId, ownerId, list) {
    checkGuild(bot, guildId);
    const lists = getGuildCafardLists(bot, guildId);
    lists[String(ownerId)] = normalizeCafardList(list);

    bot.db.prepare('UPDATE guilds SET cafard = ? WHERE id = ?').run(JSON.stringify(lists), guildId);
    return lists[String(ownerId)];
}

function clearGuildCafardList(bot, guildId, ownerId) {
    return setGuildCafardList(bot, guildId, ownerId, []);
}

function getGuildLaisseLists(bot, guildId) {
    const guild = checkGuild(bot, guildId);
    return parseObject(guild?.laisse);
}

function getGuildLaisseList(bot, guildId, ownerId) {
    const lists = getGuildLaisseLists(bot, guildId);
    return normalizeLaisseList(lists[String(ownerId)]);
}

function setGuildLaisseList(bot, guildId, ownerId, list) {
    checkGuild(bot, guildId);
    const lists = getGuildLaisseLists(bot, guildId);
    lists[String(ownerId)] = normalizeLaisseList(list);

    bot.db.prepare('UPDATE guilds SET laisse = ? WHERE id = ?').run(JSON.stringify(lists), guildId);
    return lists[String(ownerId)];
}

function clearGuildLaisseList(bot, guildId, ownerId) {
    return setGuildLaisseList(bot, guildId, ownerId, []);
}

function getGuildLaisseOwner(bot, guildId, memberId) {
    const lists = getGuildLaisseLists(bot, guildId);

    for (const [ownerId, list] of Object.entries(lists)) {
        if (!Array.isArray(list)) continue;
        if (list.some((entry) => entry?.id === memberId)) {
            return ownerId;
        }
    }

    return null;
}

function removeGuildLaisseMember(bot, guildId, memberId) {
    const lists = getGuildLaisseLists(bot, guildId);
    let removedOwnerId = null;

    for (const [ownerId, list] of Object.entries(lists)) {
        if (!Array.isArray(list) || !list.length) continue;

        const nextList = list.filter((entry) => entry?.id !== memberId);
        if (nextList.length === list.length) continue;

        lists[ownerId] = normalizeLaisseList(nextList);
        removedOwnerId = ownerId;
        break;
    }

    if (removedOwnerId) {
        bot.db.prepare('UPDATE guilds SET laisse = ? WHERE id = ?').run(JSON.stringify(lists), guildId);
    }

    return removedOwnerId;
}

function normalizeTempVocalChannels(channels) {
    if (!channels || typeof channels !== 'object' || Array.isArray(channels)) return {};

    const normalized = {};

    for (const [channelId, entry] of Object.entries(channels)) {
        if (!entry || typeof entry !== 'object') continue;
        if (!entry.ownerId) continue;

        normalized[String(channelId)] = {
            ownerId: String(entry.ownerId),
            createdAt: Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : Date.now(),
            panelMessageId: entry.panelMessageId ? String(entry.panelMessageId) : null,
        };
    }

    return normalized;
}

function normalizeTempVocalConfig(config) {
    const input = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
    return {
        enabled: Boolean(input.enabled),
        triggerId: input.triggerId || null,
        categoryId: input.categoryId || null,
        limit: Number.isFinite(Number(input.limit)) ? Math.max(0, Math.floor(Number(input.limit))) : 0,
        nameTemplate: typeof input.nameTemplate === 'string' && input.nameTemplate.trim()
            ? input.nameTemplate.trim()
            : 'Temp vocal {displayName}',
        channels: normalizeTempVocalChannels(input.channels),
    };
}

function formatTempVocalName(template, member) {
    const raw = typeof template === 'string' && template.trim()
        ? template.trim()
        : 'Temp vocal {displayName}';

    return raw
        .replaceAll('{username}', member.user.username)
        .replaceAll('{displayName}', member.displayName)
        .replaceAll('{globalName}', member.user.globalName || member.user.username)
        .replaceAll('{id}', member.id)
        .slice(0, 100);
}

function buildTempVocalOwnerPanel(channel, owner, voiceChannel) {
    const voiceId = String(voiceChannel.id);
    const guildIcon = voiceChannel.guild?.iconURL({ size: 256, forceStatic: false }) || 'https://i.imgur.com/839VA94.png';
    const ownerAvatar = owner.displayAvatarURL?.({ size: 256 }) || owner.avatarURL?.({ size: 256 }) || guildIcon;
    const bot = voiceChannel.client;
    const guild = voiceChannel.guild;
    const entry = getGuildTempVocalChannelEntry(bot, guild.id, voiceChannel.id);
    const addedIds = guild ? getTempVocalAddedMemberIds(bot, guild, voiceChannel, owner.id) : [];
    const addedSummary = `> Total : \`${addedIds.length}\` membre(s) ajouté(s)`;
    const privacyState = voiceChannel.permissionOverwrites.cache.get(guild.roles.everyone.id)?.deny?.has(Discord.PermissionFlagsBits.ViewChannel)
        ? 'Masqué'
        : 'Visible';
    const lockState = voiceChannel.permissionOverwrites.cache.get(guild.roles.everyone.id)?.deny?.has(Discord.PermissionFlagsBits.Connect)
        ? 'Verrouillé'
        : 'Ouvert';
    const limitLabel = voiceChannel.userLimit ? `${voiceChannel.userLimit}` : 'Aucune';
    const memberCount = voiceChannel.members?.size || 0;
    const createdAt = Number.isFinite(Number(entry?.createdAt)) ? Number(entry.createdAt) : null;
    const createdLabel = createdAt
        ? `<t:${Math.floor(createdAt / 1000)}:R>`
        : 'Inconnu';

    return new Discord.ContainerBuilder()
        .addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent('# Contrôle du vocal temporaire'),
        )
        .addSeparatorComponents(
            new Discord.SeparatorBuilder()
                .setSpacing(Discord.SeparatorSpacingSize.Small)
                .setDivider(true),
        )
        .addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent(
                '> Configure ton vocal temporaire en quelques clics: verrouillage, visibilité, accès et gestion des membres.',
            ),
        )
        .addSeparatorComponents(
            new Discord.SeparatorBuilder()
                .setSpacing(Discord.SeparatorSpacingSize.Small)
                .setDivider(true),
        )
        .addSectionComponents(
            new Discord.SectionBuilder()
                .addTextDisplayComponents(
                    new Discord.TextDisplayBuilder().setContent(
                        `### Vue rapide\n> **Propriétaire :** <@${owner.id}>\n> **Salon :** <#${voiceChannel.id}>\n> **Nom :** \`${voiceChannel.name}\`\n> **Limite :** \`${limitLabel}\`\n> **Visibilité :** \`${privacyState}\`\n> **Verrouillage :** \`${lockState}\``,
                    ),
                )
                .setThumbnailAccessory(
                    new Discord.ThumbnailBuilder({
                        media: {
                            url: ownerAvatar,
                        },
                    }),
                ),
        )
        .addSeparatorComponents(
            new Discord.SeparatorBuilder()
                .setSpacing(Discord.SeparatorSpacingSize.Small)
                .setDivider(true),
        )
        .addSectionComponents(
            new Discord.SectionBuilder()
                .addTextDisplayComponents(
                    new Discord.TextDisplayBuilder().setContent(
                        `### En direct\n> **Membres présents :** \`${memberCount}\`\n> **Membres ajoutés :** \`${addedIds.length}\`\n> **Créé depuis :** ${createdLabel}\n> **ID du salon :** \`${voiceChannel.id}\``,
                    ),
                )
                .setThumbnailAccessory(
                    new Discord.ThumbnailBuilder({
                        media: {
                            url: guildIcon,
                        },
                    }),
                ),
        )
        .addSeparatorComponents(
            new Discord.SeparatorBuilder()
                .setSpacing(Discord.SeparatorSpacingSize.Small)
                .setDivider(true),
        )
        .addActionRowComponents(
            new Discord.ActionRowBuilder().addComponents(
                new Discord.ButtonBuilder()
                    .setCustomId(`tempvocal:${voiceId}:lock`)
                    .setLabel('Verrouiller')
                    .setStyle(Discord.ButtonStyle.Secondary),
                new Discord.ButtonBuilder()
                    .setCustomId(`tempvocal:${voiceId}:unlock`)
                    .setLabel('Déverrouiller')
                    .setStyle(Discord.ButtonStyle.Secondary),
                new Discord.ButtonBuilder()
                    .setCustomId(`tempvocal:${voiceId}:hide`)
                    .setLabel('Masquer')
                    .setStyle(Discord.ButtonStyle.Secondary),
                new Discord.ButtonBuilder()
                    .setCustomId(`tempvocal:${voiceId}:show`)
                    .setLabel('Afficher')
                    .setStyle(Discord.ButtonStyle.Secondary),
            ),
        )
        .addSeparatorComponents(
            new Discord.SeparatorBuilder()
                .setSpacing(Discord.SeparatorSpacingSize.Small)
                .setDivider(true),
        )
        .addActionRowComponents(
            new Discord.ActionRowBuilder().addComponents(
                new Discord.ButtonBuilder()
                    .setCustomId(`tempvocal:${voiceId}:rename`)
                    .setLabel('Renommer')
                    .setStyle(Discord.ButtonStyle.Secondary),
                new Discord.ButtonBuilder()
                    .setCustomId(`tempvocal:${voiceId}:limit`)
                    .setLabel('Limite')
                    .setStyle(Discord.ButtonStyle.Secondary),
                new Discord.ButtonBuilder()
                    .setCustomId(`tempvocal:${voiceId}:add`)
                    .setLabel('Ajouter')
                    .setStyle(Discord.ButtonStyle.Secondary),
                new Discord.ButtonBuilder()
                    .setCustomId(`tempvocal:${voiceId}:remove`)
                    .setLabel('Retirer')
                    .setStyle(Discord.ButtonStyle.Secondary),
            ),
        )
        .addSeparatorComponents(
            new Discord.SeparatorBuilder()
                .setSpacing(Discord.SeparatorSpacingSize.Small)
                .setDivider(true),
        )
        .addActionRowComponents(
            new Discord.ActionRowBuilder().addComponents(
                new Discord.ButtonBuilder()
                    .setCustomId(`tempvocal:${voiceId}:invite`)
                    .setLabel('Inviter')
                    .setStyle(Discord.ButtonStyle.Secondary),
                new Discord.ButtonBuilder()
                    .setCustomId(`tempvocal:${voiceId}:members`)
                    .setLabel('Liste des membres')
                    .setStyle(Discord.ButtonStyle.Secondary),
                new Discord.ButtonBuilder()
                    .setCustomId(`tempvocal:${voiceId}:expel`)
                    .setLabel('Expulser')
                    .setStyle(Discord.ButtonStyle.Secondary),
                new Discord.ButtonBuilder()
                    .setCustomId(`tempvocal:${voiceId}:transfer`)
                    .setLabel('Transférer')
                    .setStyle(Discord.ButtonStyle.Secondary),
            ),
        )
        .addSeparatorComponents(
            new Discord.SeparatorBuilder()
                .setSpacing(Discord.SeparatorSpacingSize.Small)
                .setDivider(true),
        )
        .addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent('> Gestion rapide du salon vocal temporaire'),
        );
}

function buildTempVocalAddedMembersPanel(bot, guild, voiceChannel, ownerId, page = 0) {
    const owner = guild.members.cache.get(ownerId) || null;
    const avatar = owner?.user?.displayAvatarURL?.({ size: 256 })
        || owner?.displayAvatarURL?.({ size: 256 })
        || guild.iconURL?.({ size: 256, forceStatic: false })
        || 'https://i.imgur.com/839VA94.png';
    const addedIds = getTempVocalAddedMemberIds(bot, guild, voiceChannel, ownerId);
    const perPage = 8;
    const totalPages = Math.max(1, Math.ceil(addedIds.length / perPage));
    const safePage = Math.min(Math.max(0, Number(page) || 0), totalPages - 1);
    const pageItems = addedIds.slice(safePage * perPage, (safePage + 1) * perPage);
    const list = pageItems.length
        ? pageItems.map((id, index) => `${safePage * perPage + index + 1}. <@${id}> \`${id}\``).join('\n')
        : 'Aucun membre ajouté';
    const hasMultiplePages = totalPages > 1;

    return new Discord.ContainerBuilder()
        .addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent('# Liste des membres ajoutés'),
        )
        .addSeparatorComponents(
            new Discord.SeparatorBuilder()
                .setSpacing(Discord.SeparatorSpacingSize.Small)
                .setDivider(true),
        )
        .addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent(
                `> Vocal : <#${voiceChannel.id}>\n> Total : \`${addedIds.length}\` membre(s)\n> Page : \`${safePage + 1}/${totalPages}\``,
            ),
        )
        .addSeparatorComponents(
            new Discord.SeparatorBuilder()
                .setSpacing(Discord.SeparatorSpacingSize.Small)
                .setDivider(true),
        )
        .addSectionComponents(
            new Discord.SectionBuilder()
                .addTextDisplayComponents(
                    new Discord.TextDisplayBuilder().setContent(list),
                )
                .setThumbnailAccessory(
                    new Discord.ThumbnailBuilder({
                        media: {
                            url: avatar,
                        },
                    }),
                ),
        )
        .addSeparatorComponents(
            new Discord.SeparatorBuilder()
                .setSpacing(Discord.SeparatorSpacingSize.Small)
                .setDivider(true),
        )
        .addActionRowComponents(
            new Discord.ActionRowBuilder().addComponents(
                new Discord.ButtonBuilder()
                    .setCustomId(`tempvocal:${voiceChannel.id}:membersPrev:${safePage}`)
                    .setLabel('Précédent')
                    .setStyle(Discord.ButtonStyle.Secondary)
                    .setDisabled(!hasMultiplePages || safePage <= 0),
                new Discord.ButtonBuilder()
                    .setCustomId(`tempvocal:${voiceChannel.id}:membersNext:${safePage}`)
                    .setLabel('Suivant')
                    .setStyle(Discord.ButtonStyle.Secondary)
                    .setDisabled(!hasMultiplePages || safePage >= totalPages - 1),
            ),
        )
        .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true));
}

function buildTempVocalInvitePanel(inviter, guild, voiceChannel) {
    const voiceUrl = `https://discord.com/channels/${guild.id}/${voiceChannel.id}`;
    const inviterAvatar = inviter.displayAvatarURL?.({ size: 256 }) || inviter.avatarURL?.({ size: 256 }) || guild.iconURL?.({ size: 256, forceStatic: false }) || 'https://i.imgur.com/839VA94.png';

    return new Discord.ContainerBuilder()
        .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent('# Invitation a rejoindre une vocal'),
        )
        .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
        .addSectionComponents(
            new Discord.SectionBuilder()
                .addTextDisplayComponents(
                    new Discord.TextDisplayBuilder().setContent(
                        `### Rejoindre le salon\n> <@${inviter.id}> souhaite que tu rejoignes sa vocal privee\n> Serveur : \`${guild.name}\`\n> Salon : <#${voiceChannel.id}>`,
                    ),
                )
                .setThumbnailAccessory(
                    new Discord.ThumbnailBuilder({
                        media: {
                            url: inviterAvatar,
                        },
                    }),
                )
                .setButtonAccessory(
                    new Discord.ButtonBuilder()
                        .setStyle(Discord.ButtonStyle.Link)
                        .setLabel('Ouvrir la vocal')
                        .setURL(voiceUrl),
                ),
        )
        .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent('> Invitation envoyee automatiquement depuis le temp vocal.'),
        );
}

async function sendTempVocalOwnerPanel(channel, owner, voiceChannel) {
    if (!channel?.send) return false;

    const payload = {
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [buildTempVocalOwnerPanel(channel, owner, voiceChannel)],
        allowedMentions: { parse: [] },
    };

    try {
        const sent = await channel.send(payload);
        return sent;
    } catch {
        return false;
    }
}

async function sendTempVocalInvite(user, inviter, guild, voiceChannel) {
    if (!user?.send) return false;

    const payload = {
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [buildTempVocalInvitePanel(inviter, guild, voiceChannel)],
        allowedMentions: { parse: [] },
    };

    try {
        const sent = await user.send(payload);
        return sent;
    } catch {
        return false;
    }
}

async function syncTempVocalOwnerPanel(bot, guild, voiceChannel, owner) {
    if (!guild || !voiceChannel || !owner) return null;

    const entry = getGuildTempVocalChannelEntry(bot, guild.id, voiceChannel.id);
    if (!entry) return null;

    const payload = {
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [buildTempVocalOwnerPanel(voiceChannel, owner, voiceChannel)],
        allowedMentions: { parse: [] },
    };

    if (entry.panelMessageId) {
        const existing = await voiceChannel.messages.fetch(entry.panelMessageId).catch(() => null);
        if (existing) {
            await existing.edit(payload).catch(() => null);
            return existing;
        }
    }

    const sent = await sendTempVocalOwnerPanel(voiceChannel, owner, voiceChannel);
    if (sent?.id) {
        await updateGuildTempVocalChannel(bot, guild.id, voiceChannel.id, {
            panelMessageId: sent.id,
        });
    }

    return sent;
}

function getGuildTempVocal(bot, guildId) {
    const guild = checkGuild(bot, guildId);
    return normalizeTempVocalConfig(parseObject(guild?.tempvocal));
}

function setGuildTempVocal(bot, guildId, config) {
    checkGuild(bot, guildId);
    const nextConfig = normalizeTempVocalConfig(config);
    bot.db.prepare('UPDATE guilds SET tempvocal = ? WHERE id = ?').run(JSON.stringify(nextConfig), guildId);
    return nextConfig;
}

function getGuildTempVocalChannelOwner(bot, guildId, channelId) {
    const config = getGuildTempVocal(bot, guildId);
    return config.channels[String(channelId)]?.ownerId || null;
}

function getGuildTempVocalChannelEntry(bot, guildId, channelId) {
    const config = getGuildTempVocal(bot, guildId);
    return config.channels[String(channelId)] || null;
}

function getGuildTempVocalAccessMemberIds(bot, guildId, ownerId) {
    const guild = checkGuild(bot, guildId);
    const accessIds = new Set([String(ownerId)]);

    for (const list of [guild?.owner, guild?.sys, guild?.wl]) {
        for (const entry of parseList(list)) {
            if (entry?.id) accessIds.add(String(entry.id));
        }
    }

    return [...accessIds];
}

async function applyTempVocalAccess(bot, guild, channel, ownerId, extraIds = []) {
    if (!guild || !channel) return false;

    const ids = new Set([
        ...getGuildTempVocalAccessMemberIds(bot, guild.id, ownerId),
        ...extraIds.filter(Boolean).map((id) => String(id)),
    ]);

    const results = await Promise.all([...ids].map(async (memberId) => {
        const member = guild.members.cache.get(memberId) || await guild.members.fetch(memberId).catch(() => null);
        if (!member) return false;

        await channel.permissionOverwrites.edit(member, {
            ViewChannel: true,
            Connect: true,
        }).catch(() => {});
        return true;
    }));

    return results.some(Boolean);
}

function getTempVocalAddedMemberIds(bot, guild, voiceChannel, ownerId) {
    if (!guild || !voiceChannel?.permissionOverwrites?.cache) return [];

    const autoAccessIds = new Set(getGuildTempVocalAccessMemberIds(bot, guild.id, ownerId));
    const addedIds = [];

    for (const [memberId, overwrite] of voiceChannel.permissionOverwrites.cache) {
        if (!overwrite || overwrite.type !== 1) continue;
        if (autoAccessIds.has(String(memberId))) continue;

        const allow = overwrite.allow || new Discord.PermissionsBitField();
        if (
            allow.has(Discord.PermissionFlagsBits.ViewChannel) ||
            allow.has(Discord.PermissionFlagsBits.Connect) ||
            allow.has(Discord.PermissionFlagsBits.Speak)
        ) {
            addedIds.push(String(memberId));
        }
    }

    return [...new Set(addedIds)];
}

function setGuildTempVocalChannel(bot, guildId, channelId, ownerId, meta = {}) {
    const config = getGuildTempVocal(bot, guildId);
    config.channels[String(channelId)] = {
        ownerId: String(ownerId),
        createdAt: Number.isFinite(Number(meta.createdAt)) ? Number(meta.createdAt) : Date.now(),
        panelMessageId: meta.panelMessageId ? String(meta.panelMessageId) : null,
    };
    return setGuildTempVocal(bot, guildId, config);
}

function updateGuildTempVocalChannel(bot, guildId, channelId, patch = {}) {
    const config = getGuildTempVocal(bot, guildId);
    const current = config.channels[String(channelId)];
    if (!current) return config;

    config.channels[String(channelId)] = {
        ...current,
        ...patch,
        ownerId: current.ownerId || (patch.ownerId ? String(patch.ownerId) : null),
        panelMessageId: Object.prototype.hasOwnProperty.call(patch, 'panelMessageId')
            ? (patch.panelMessageId ? String(patch.panelMessageId) : null)
            : (current.panelMessageId || null),
    };

    return setGuildTempVocal(bot, guildId, config);
}

function removeGuildTempVocalChannel(bot, guildId, channelId) {
    const config = getGuildTempVocal(bot, guildId);
    if (!config.channels[String(channelId)]) return config;
    delete config.channels[String(channelId)];
    return setGuildTempVocal(bot, guildId, config);
}

function isGuildPrivileged(bot, guildId, userId, type = 'owner') {
    const guild = getGuildData(bot, guildId);
    if (!guild) return false;
    const configuredBuyers = Array.isArray(config.buyers)
        ? config.buyers.map((id) => String(id))
        : [String(config.buyers || '')];
    const { owner, sys, wl, buyers } = getGuildAccessLists(bot, guildId);

    if (type === 'buyer') {
        return hasId(configuredBuyers, userId) || hasId(buyers, userId);
    }

    if (hasId(configuredBuyers, userId) || hasId(buyers, userId)) return true;
    if (guild.ownerId === String(userId)) return ['owner', 'sys', 'wl'].includes(type);

    if (type === 'owner') return hasId(owner, userId);
    if (type === 'sys') return hasId(owner, userId) || hasId(sys, userId);
    if (type === 'wl') return hasId(owner, userId) || hasId(sys, userId) || hasId(wl, userId);

    return false;
}

function checkPerm(bot, message, type) {
    const userId = message.author?.id || message.user?.id;
    const buyers = Array.isArray(config.buyers)
        ? config.buyers.map((id) => String(id))
        : [String(config.buyers || '')];

    if (type === 'everyone') return true;
    if (type === 'buyer') {
        if (!message.guild) return buyers.includes(String(userId));

        const { buyers: guildBuyers } = getGuildAccessLists(bot, message.guild.id);
        if (guildBuyers.length) return hasId(guildBuyers, userId);
        return buyers.includes(String(userId));
    }
    if (buyers.includes(String(userId))) return true;

    if (!message.guild) return false;

    if (message.guild.ownerId === userId) {
        return ['owner', 'sys', 'wl'].includes(type);
    }

    const { wl, owner, sys } = getGuildAccessLists(bot, message.guild.id);

    if (hasId(sys, userId)) return true;
    if (type === 'owner' && hasId(owner, userId)) return true;
    if (type === 'wl' && (hasId(owner, userId) || hasId(wl, userId))) return true;

    return false;
}

module.exports = {
    checkBot,
    checkbot,
    ensureGuildRow,
    checkGuild,
    getGuildData,
    getGuildPrefix,
    setGuildPrefix,
    getGuildVoiceStats,
    setGuildVoiceStats,
    getGuildCafardLists,
    getGuildCafardList,
    getGuildCafardOwner,
    setGuildCafardList,
    clearGuildCafardList,
    getGuildLaisseLists,
    getGuildLaisseList,
    setGuildLaisseList,
    clearGuildLaisseList,
    getGuildLaisseOwner,
    removeGuildLaisseMember,
    getGuildTempVocal,
    setGuildTempVocal,
    getGuildTempVocalChannelOwner,
    getGuildTempVocalChannelEntry,
    getGuildTempVocalAccessMemberIds,
    applyTempVocalAccess,
    getTempVocalAddedMemberIds,
    setGuildTempVocalChannel,
    updateGuildTempVocalChannel,
    removeGuildTempVocalChannel,
    formatTempVocalName,
    buildTempVocalOwnerPanel,
    buildTempVocalAddedMembersPanel,
    buildTempVocalInvitePanel,
    sendTempVocalOwnerPanel,
    sendTempVocalInvite,
    syncTempVocalOwnerPanel,
    isGuildPrivileged,
    checkPerm
};
