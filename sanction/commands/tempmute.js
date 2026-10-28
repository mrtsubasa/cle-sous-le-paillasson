const { SlashCommandBuilder } = require('discord.js');
const { durations } = require('../utils/durations');
const { data, tempMutes, saveWarns, saveTempMutes } = require('../utils/state');
const { isProtected, isOwnerMember, isSystem, hasPermissionForCommand } = require('../utils/permissions');
const { yesCard, noCard, permissionCard } = require('../utils/cards');
const { checkCommandLimit, formatWaitTime } = require('../utils/rateLimit');
const { scheduleUnmute, getMuteKey } = require('../utils/muteManager');
const { logAction } = require('../utils/logAction');
const { resolveMember } = require('../utils/resolvers');

const MENU_TIMEOUT = 180000;
const tempmutePanels = new Map();

function getMutedRole(guild) {
    const guildId = String(guild.id);
    const roleId = data.mutedRole[guildId];
    if (roleId) {
        const role = guild.roles.cache.get(roleId);
        if (role) return role;
    }
    return guild.roles.cache.find((role) => role.name === 'Muted');
}

function parseShortDuration(input, maxMinutes) {
    if (!input) return null;
    const match = String(input).trim().match(/^(\d+)([smh])$/i);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    if (!value || Number.isNaN(value)) return null;

    const unit = match[2].toLowerCase();
    let minutes = value;
    if (unit === 's') minutes = value / 60;
    if (unit === 'h') minutes = value * 60;

    if (minutes <= 0) return null;
    if (maxMinutes && minutes > maxMinutes) {
        return { error: 'max' };
    }

    return {
        minutes,
        ms: minutes * 60 * 1000,
        label: `${value}${unit}`
    };
}

function getReasonOptions() {
    return Object.entries(durations).map(([label, minutes]) => ({
        label: String(label).slice(0, 100),
        description: `${minutes} minutes`.slice(0, 100),
        value: `${label}::${minutes}`.slice(0, 100)
    }));
}

function parseReasonSelection(selected) {
    const raw = String(selected || '');
    const separatorIndex = raw.lastIndexOf('::');
    if (separatorIndex === -1) return null;

    const label = raw.slice(0, separatorIndex);
    const minutes = parseInt(raw.slice(separatorIndex + 2), 10);
    if (!label || Number.isNaN(minutes)) return null;

    return [label, minutes];
}

function buildReasonCard(memberId, disabled = false) {
    return {
        flags: 32768,
        components: [{
            type: 17,
            components: [
                { type: 14, divider: true },
                { type: 10, content: `> Choisissez une raison pour tempmute <@${memberId}>` },
                { type: 14, divider: true },
                {
                    type: 1,
                    components: [{
                        type: 3,
                        custom_id: 'tempmute_reason',
                        placeholder: 'Choisir une raison',
                        min_values: 1,
                        max_values: 1,
                        disabled,
                        options: getReasonOptions()
                    }]
                }
            ]
        }]
    };
}

function buildExpiredReasonCard(memberId) {
    return buildReasonCard(memberId, true);
}

function getTargetErrorCard(guild, actorUser, actorMember, member) {
    if (member.id === actorUser.id) {
        return noCard('Tu ne peux pas te tempmute toi-m\u00eame');
    }

    if (member.roles.highest.position >= actorMember.roles.highest.position && actorUser.id !== guild.ownerId) {
        return noCard('Ce membre a un r\u00f4le \u00e9gal ou sup\u00e9rieur au tien');
    }

    if (isProtected(guild.id, member.id, member)) {
        if (!isOwnerMember(guild.id, actorUser.id, actorMember)) {
            return noCard("Ce membre est prot\u00e9g\u00e9 et vous n'avez pas le droit de le sanctionner");
        }
        if (isSystem(guild.id, member.id, member)) {
            return noCard('Ce membre est un syst\u00e8me. M\u00eame les owners ne peuvent pas le sanctionner');
        }
    }

    const mutedRole = getMutedRole(guild);
    if (!mutedRole) {
        return noCard("Le r\u00f4le tempmute n'est pas configur\u00e9");
    }

    if (member.roles.cache.has(mutedRole.id)) {
        return noCard('Ce membre est d\u00e9j\u00e0 tempmute');
    }

    return null;
}

async function executeTempmuteAction(guild, actorUser, actorMember, member, reason, durationMinutes, durationText, client) {
    const limit = checkCommandLimit(guild.id, actorUser.id, 'tempmute', actorMember);
    if (!limit.allowed) {
        const remainingMs = limit.remaining || 0;
        return { ok: false, card: noCard(`Vous avez atteint la limite maximale, revenez ${formatWaitTime(remainingMs)}`) };
    }

    const targetErrorCard = getTargetErrorCard(guild, actorUser, actorMember, member);
    if (targetErrorCard) {
        return { ok: false, card: targetErrorCard };
    }

    const mutedRole = getMutedRole(guild);

    try {
        await member.roles.add(mutedRole, reason);
    } catch {
        return { ok: false, card: noCard("Je n'ai pas la permission de tempmute ce membre") };
    }

    const endTime = new Date(Date.now() + durationMinutes * 60 * 1000);
    tempMutes.set(getMuteKey(guild.id, member.id), {
        duration: durationMinutes,
        endTime: endTime.toISOString(),
        reason,
        moderator: actorUser.id
    });

    const guildKey = String(guild.id);
    const userKey = String(member.id);
    if (!data.tempMutes[guildKey]) data.tempMutes[guildKey] = {};
    data.tempMutes[guildKey][userKey] = {
        duration: durationMinutes,
        endTime: endTime.toISOString(),
        reason,
        moderator: actorUser.id
    };
    saveTempMutes();
    scheduleUnmute(client, guild.id, member.id, durationMinutes);

    try {
        await member.send({
            ...yesCard(`Tu as \u00e9t\u00e9 tempmute sur **${guild.name}** **\`${durationText}\`** pour **\`${reason}\`**\n\nSi tu souhaites contester ta sanction, ouvre un ticket`)
        });
    } catch {
    }

    if (!data.warns[guildKey]) data.warns[guildKey] = {};
    if (!data.warns[guildKey][userKey]) data.warns[guildKey][userKey] = [];

    data.warns[guildKey][userKey].push({
        id: data.warns[guildKey][userKey].length + 1,
        moderator: String(actorUser.id),
        reason: `Tempmute : ${reason} (${durationText})`,
        date: new Date().toISOString()
    });
    saveWarns();

    await logAction(guild, 'Tempmute', actorUser, member, reason, `${durationText}`);
    return { ok: true, card: yesCard(`${member} a \u00e9t\u00e9 tempmute **\`${durationText}\`** pour **\`${reason}\`**`) };
}

function registerPanel(reply, authorId, memberId) {
    tempmutePanels.set(reply.id, {
        authorId: String(authorId),
        memberId: String(memberId),
        createdAt: Date.now()
    });
}

function expirePanel(reply, memberId) {
    setTimeout(async () => {
        const panel = tempmutePanels.get(reply.id);
        if (!panel) return;

        try {
            await reply.edit({ ...buildExpiredReasonCard(memberId), allowedMentions: { parse: [] } });
        } catch {
        }

        tempmutePanels.delete(reply.id);
    }, MENU_TIMEOUT);
}

module.exports = {
    name: 'tempmute',
    slashData: new SlashCommandBuilder()
        .setName('tempmute')
        .setDescription('Tempmute un membre')
        .addUserOption((option) =>
            option
                .setName('membre')
                .setDescription('Le membre \u00e0 tempmute')
                .setRequired(true)
        )
        .addStringOption((option) => {
            option
                .setName('duree')
                .setDescription('Choisis une raison et une dur\u00e9e')
                .setRequired(true);
            Object.entries(durations).forEach(([label, minutes]) => {
                option.addChoices({ name: `${label} - ${minutes}m`, value: `${label} - ${minutes}m` });
            });
            return option;
        }),
    async executePrefix(message, args, client) {
        if (!hasPermissionForCommand(message.member, 'tempmute')) {
            return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const member = await resolveMember(message, args[0]);
        if (!member) {
            return message.reply({ ...noCard('Membre non trouv\u00e9'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const durationInput = args[1];
        if (!durationInput) {
            const targetErrorCard = getTargetErrorCard(message.guild, message.author, message.member, member);
            if (targetErrorCard) {
                return message.reply({ ...targetErrorCard, allowedMentions: { parse: [] }, mentionRepliedUser: false });
            }

            const card = buildReasonCard(member.id);
            const reply = await message.reply({ ...card, allowedMentions: { parse: [] }, mentionRepliedUser: false });
            registerPanel(reply, message.author.id, member.id);
            expirePanel(reply, member.id);
            return reply;
        }

        const parsedDuration = parseShortDuration(durationInput, 60);
        if (!parsedDuration) {
            return message.reply({ ...noCard('Dur\u00e9e invalide, exemple : 10m, 30s, 1h'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }
        if (parsedDuration.error === 'max') {
            return message.reply({ ...noCard('La dur\u00e9e maximale est de **`1 heure`**'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const reason = args.slice(2).join(' ').trim() || 'Aucune raison';
        const result = await executeTempmuteAction(
            message.guild,
            message.author,
            message.member,
            member,
            reason,
            parsedDuration.minutes,
            parsedDuration.label,
            client
        );

        return message.reply({ ...result.card, allowedMentions: { parse: [] }, mentionRepliedUser: false });
    },
    async executeSlash(interaction, client) {
        const member = interaction.options.getMember('membre');
        const selected = interaction.options.getString('duree', true);

        const entry = Object.entries(durations).find(([label, minutes]) => `${label} - ${minutes}m` === selected);
        if (!entry) {
            return interaction.reply({ ...noCard('Dur\u00e9e invalide s\u00e9lectionn\u00e9e'), ephemeral: true });
        }

        const [reason, durationMinutes] = entry;
        const result = await executeTempmuteAction(
            interaction.guild,
            interaction.user,
            interaction.member,
            member,
            reason,
            durationMinutes,
            `${durationMinutes} minutes`,
            client
        );

        return interaction.reply({ ...result.card, ephemeral: !result.ok });
    },
    async handleMenu(interaction, client) {
        if (!interaction.isStringSelectMenu() || interaction.customId !== 'tempmute_reason') return;

        const panel = tempmutePanels.get(interaction.message.id);
        if (!panel) {
            return interaction.reply({
                content: 'Ce menu a expir\u00e9. Relance la commande',
                flags: 64,
                allowedMentions: { parse: [] }
            });
        }

        if (interaction.user.id !== panel.authorId) {
            return interaction.reply({
                content: "<:non:1519424807580733635> Vous n'\u00eates pas l'auteur de cette commande",
                flags: 64,
                allowedMentions: { parse: [] }
            });
        }

        if (!hasPermissionForCommand(interaction.member, 'tempmute')) {
            return interaction.reply({
                content: "<:non:1519424807580733635> Vous n'avez pas la permission",
                flags: 64,
                allowedMentions: { parse: [] }
            });
        }

        if (Date.now() - panel.createdAt > MENU_TIMEOUT) {
            tempmutePanels.delete(interaction.message.id);
            return interaction.update({ ...buildExpiredReasonCard(panel.memberId), allowedMentions: { parse: [] } });
        }

        const member = interaction.guild.members.cache.get(panel.memberId)
            || await interaction.guild.members.fetch(panel.memberId).catch(() => null);
        if (!member) {
            tempmutePanels.delete(interaction.message.id);
            return interaction.update({ ...noCard('Membre non trouv\u00e9'), allowedMentions: { parse: [] } });
        }

        const selected = String(interaction.values[0] || '');
        const entry = parseReasonSelection(selected);
        if (!entry) {
            tempmutePanels.delete(interaction.message.id);
            return interaction.update({ ...noCard('Dur\u00e9e invalide s\u00e9lectionn\u00e9e'), allowedMentions: { parse: [] } });
        }

        const [reason, durationMinutes] = entry;
        const result = await executeTempmuteAction(
            interaction.guild,
            interaction.user,
            interaction.member,
            member,
            reason,
            durationMinutes,
            `${durationMinutes} minutes`,
            client
        );

        tempmutePanels.delete(interaction.message.id);
        return interaction.update({ ...result.card, allowedMentions: { parse: [] } });
    }
};
