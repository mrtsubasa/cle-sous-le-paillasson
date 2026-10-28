const { SlashCommandBuilder } = require('discord.js');
const { data, saveWarns } = require('../utils/state');
const { yesCard, noCard, permissionCard } = require('../utils/cards');
const { logAction } = require('../utils/logAction');
const { hasPermissionForCommand } = require('../utils/permissions');
const { resolveMember } = require('../utils/resolvers');

function reindexWarns(warns) {
    return warns.map((warn, index) => ({
        ...warn,
        id: index + 1
    }));
}

module.exports = {
    name: 'delsanctions',
    slashData: new SlashCommandBuilder()
        .setName('delsanctions')
        .setDescription("Retire une sanction sp\u00e9cifique ou toutes les sanctions d'un membre")
        .addUserOption((option) =>
            option
                .setName('membre')
                .setDescription('Le membre concern\u00e9')
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName('numero')
                .setDescription("Num\u00e9ro de la sanction \u00e0 retirer, ou 'all'")
                .setRequired(true)
        ),
    async executePrefix(message, args) {
        if (!hasPermissionForCommand(message.member, 'delsanctions')) {
            return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const member = await resolveMember(message, args[0]);
        if (!member) {
            return message.reply({ ...noCard('Membre non trouv\u00e9'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const numero = args[1];
        if (!numero) {
            return message.reply({ ...noCard('Utilisation : -delsanctions @membre <num\u00e9ro|all>'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const guildId = String(message.guild.id);
        const userId = String(member.id);
        if (!data.warns[guildId] || !data.warns[guildId][userId]) {
            return message.reply({ ...noCard("Ce membre n'a aucune sanction enregistr\u00e9e"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        if (numero.toLowerCase() === 'all') {
            const totalRemoved = data.warns[guildId][userId].length;
            data.warns[guildId][userId] = [];
            saveWarns();
            await message.reply({ ...yesCard(`Toutes les **\`${totalRemoved}\`** sanctions de ${member} ont \u00e9t\u00e9 supprim\u00e9es`), allowedMentions: { parse: [] }, mentionRepliedUser: false });
            await logAction(message.guild, 'Delsanctions', message.author, member, `${totalRemoved} sanctions supprim\u00e9es`);
            return;
        }

        const numeront = Number(numero);
        if (!Number.isInteger(numeront)) {
            return message.reply({ ...noCard("Le num\u00e9ro doit \u00eatre un entier ou 'all'"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const userWarns = data.warns[guildId][userId];
        const warnToRemove = userWarns.find((warn) => warn.id === numeront);
        if (!warnToRemove) {
            return message.reply({ ...noCard(`Aucune sanction avec le num\u00e9ro **\`#${numeront}\`** trouv\u00e9e`), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        data.warns[guildId][userId] = reindexWarns(userWarns.filter((warn) => warn.id !== numeront));
        saveWarns();
        await message.reply({ ...yesCard(`La sanction **\`#${numeront}\`** a \u00e9t\u00e9 retir\u00e9e \u00e0 ${member}`), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        await logAction(message.guild, 'Delsanctions', message.author, member, `Sanction #${numeront} retir\u00e9e`);
    },
    async executeSlash(interaction) {
        const member = interaction.options.getMember('membre');
        const number = interaction.options.getString('numero', true);

        const guildId = String(interaction.guild.id);
        const userId = String(member.id);
        if (!data.warns[guildId] || !data.warns[guildId][userId]) {
            return interaction.reply(noCard("Ce membre n'a aucune sanction enregistr\u00e9e"));
        }

        if (number.toLowerCase() === 'all') {
            const totalRemoved = data.warns[guildId][userId].length;
            data.warns[guildId][userId] = [];
            saveWarns();
            await interaction.reply(yesCard(`Toutes les **\`${totalRemoved}\`** sanctions de ${member} ont \u00e9t\u00e9 supprim\u00e9es`));
            await logAction(interaction.guild, 'Delsanctions', interaction.user, member, `${totalRemoved} sanctions supprim\u00e9es`);
            return;
        }

        const numberInt = Number(number);
        if (!Number.isInteger(numberInt)) {
            return interaction.reply(noCard("Le num\u00e9ro doit \u00eatre un entier ou 'all'"));
        }

        const userWarns = data.warns[guildId][userId];
        const warnToRemove = userWarns.find((warn) => warn.id === numberInt);
        if (!warnToRemove) {
            return interaction.reply(noCard(`Aucune sanction avec le num\u00e9ro **\`#${numberInt}\`** trouv\u00e9e`));
        }

        data.warns[guildId][userId] = reindexWarns(userWarns.filter((warn) => warn.id !== numberInt));
        saveWarns();
        await interaction.reply(yesCard(`La sanction **\`#${numberInt}\`** a \u00e9t\u00e9 retir\u00e9e \u00e0 ${member}`));
        await logAction(interaction.guild, 'Delsanctions', interaction.user, member, `Sanction #${numberInt} retir\u00e9e`);
    }
};

