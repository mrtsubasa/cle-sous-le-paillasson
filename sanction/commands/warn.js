const { SlashCommandBuilder } = require('discord.js');
const { data, saveWarns } = require('../utils/state');
const { isProtected, isOwnerMember, isSystem, hasPermissionForCommand } = require('../utils/permissions');
const { yesCard, noCard, permissionCard } = require('../utils/cards');
const { checkCommandLimit, formatWaitTime } = require('../utils/rateLimit');
const { logAction } = require('../utils/logAction');
const { resolveMember } = require('../utils/resolvers');

module.exports = {
    name: 'warn',
    slashData: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Donne un avertissement \u00e0 un membre')
        .addUserOption((option) =>
            option
                .setName('membre')
                .setDescription('Le membre \u00e0 avertir')
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName('raison')
                .setDescription("Raison de l'avertissement")
                .setRequired(true)
        ),

    async executePrefix(message, args) {
        if (!hasPermissionForCommand(message.member, 'warn')) {
            return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const member = await resolveMember(message, args[0]);
        if (!member) {
            return message.reply({ ...noCard('Membre non trouv\u00e9'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const reason = args.slice(1).join(' ').trim();
        if (!reason) {
            return message.reply({ ...noCard('Utilisation : -warn @membre <raison>'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const limit = checkCommandLimit(message.guild.id, message.author.id, 'warn', message.member);
        if (!limit.allowed) {
            const remainingMs = limit.remaining || 0;
            return message.reply({ ...noCard(`Vous avez atteint la limite maximale, revenez ${formatWaitTime(remainingMs)}`), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        if (member.id === message.author.id) {
            return message.reply({ ...noCard("Tu ne peux pas t'avertir toi-m\u00eame"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        if (member.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
            return message.reply({ ...noCard('Ce membre a un r\u00f4le \u00e9gal ou sup\u00e9rieur au tien'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        if (isProtected(message.guild.id, member.id, member)) {
            if (!isOwnerMember(message.guild.id, message.author.id, message.member)) {
                return message.reply({ ...noCard("Ce membre est prot\u00e9g\u00e9 et vous n'avez pas le droit de le sanctionner"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
            }
            if (isSystem(message.guild.id, member.id, member)) {
                return message.reply({ ...noCard('Ce membre est un syst\u00e8me. M\u00eame les owners ne peuvent pas le sanctionner'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
            }
        }

        const guildId = String(message.guild.id);
        const userId = String(member.id);
        if (!data.warns[guildId]) data.warns[guildId] = {};
        if (!data.warns[guildId][userId]) data.warns[guildId][userId] = [];

        data.warns[guildId][userId].push({
            id: data.warns[guildId][userId].length + 1,
            moderator: String(message.author.id),
            reason,
            date: new Date().toISOString()
        });
        saveWarns();

        await message.reply({ ...yesCard(`${member} a re\u00e7u un avertissement : **\`${reason}\`**`), allowedMentions: { parse: [] }, mentionRepliedUser: false });

        try {
            await member.send({
                ...yesCard(`Tu as re\u00e7u un avertissement sur **${message.guild.name}**. Raison : **\`${reason}\`**`)
            });
        } catch {
        }

        await logAction(message.guild, 'Avertissement', message.author, member, reason);
    },

    async executeSlash(interaction) {
        const member = interaction.options.getMember('membre');
        const reason = interaction.options.getString('raison', true);

        const limit = checkCommandLimit(interaction.guild.id, interaction.user.id, 'warn', interaction.member);
        if (!limit.allowed) {
            const remainingMs = limit.remaining || 0;
            return interaction.reply({ ...noCard(`Vous avez atteint la limite maximale, revenez ${formatWaitTime(remainingMs)}`), ephemeral: true });
        }

        if (member.id === interaction.user.id) {
            return interaction.reply(noCard("Tu ne peux pas t'avertir toi-m\u00eame"));
        }

        if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply(noCard('Ce membre a un r\u00f4le \u00e9gal ou sup\u00e9rieur au tien'));
        }

        if (isProtected(interaction.guild.id, member.id, member)) {
            if (!isOwnerMember(interaction.guild.id, interaction.user.id, interaction.member)) {
                return interaction.reply(noCard("Ce membre est prot\u00e9g\u00e9 et vous n'avez pas le droit de le sanctionner"));
            }
            if (isSystem(interaction.guild.id, member.id, member)) {
                return interaction.reply(noCard('Ce membre est un syst\u00e8me. M\u00eame les owners ne peuvent pas le sanctionner'));
            }
        }

        const guildId = String(interaction.guild.id);
        const userId = String(member.id);
        if (!data.warns[guildId]) data.warns[guildId] = {};
        if (!data.warns[guildId][userId]) data.warns[guildId][userId] = [];

        data.warns[guildId][userId].push({
            id: data.warns[guildId][userId].length + 1,
            moderator: String(interaction.user.id),
            reason,
            date: new Date().toISOString()
        });
        saveWarns();

        await interaction.reply(yesCard(`${member} a re\u00e7u un avertissement : **\`${reason}\`**`));

        try {
            await member.send({
                ...yesCard(`Tu as re\u00e7u un avertissement sur **${interaction.guild.name}**. Raison : **\`${reason}\`**`)
            });
        } catch {
        }

        await logAction(interaction.guild, 'Avertissement', interaction.user, member, reason);
    }
};

