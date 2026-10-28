const Discord = require('discord.js');
const MEMBRES_PAR_PAGE = 10;

exports.help = {
    name: 'analyse',
    aliases: [],
    type: 'sys',
    description: 'Analyser les membres d\'un rôle avec pagination'
}

exports.run = async (bot, message) => {

    if (!bot.functions.checkPerm(bot, message, 'sys')) return;
    if (!message.guild) return;

    const args = message.content.split(' ').slice(1);
    if (!args[0]) return message.reply('> Mentionne un rôle ou son ID');

    const roleId = args[0].replace(/[<@&>]/g, '');
    const role = message.guild.roles.cache.get(roleId);
    if (!role) return message.reply('> Rôle introuvable');

    let membresArray = Array.from(
        message.guild.members.cache.filter(m => m.roles.cache.has(role.id)).values()
    );

    let page = 1;

    const sendEphemeral = async (interaction, content) => {
        const payload = {
            flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
            components: [
                new Discord.ContainerBuilder()
                    .addTextDisplayComponents(
                        new Discord.TextDisplayBuilder().setContent(content)
                    )
            ]
        };
        if (interaction.replied || interaction.deferred) {
            return interaction.followUp(payload);
        } else {
            return interaction.reply(payload);
        }
    };

    const buildPanel = (page) => {
        const pageTotal = Math.ceil(membresArray.length / MEMBRES_PAR_PAGE) || 1;
        const start = (page - 1) * MEMBRES_PAR_PAGE;
        const end = page * MEMBRES_PAR_PAGE;
        const membresPage = membresArray.slice(start, end);

        const enVocalCount = membresArray.filter(m => m.voice?.channel).length;

        const list = membresPage.map((member, i) => {
            const pseudo = member.user.username;
            const mention = `<@${member.id}>`;
            const enVocal = member.voice?.channel ? '<:vc:1488193340011712653>' : '<:pasenvc:1488193410908291192>';
            return `> ${start + i + 1}) ${pseudo} ${mention} – ${enVocal}`;
        }).join('\n') || '> Aucun membre';

        // Boutons de pagination
        const row = new Discord.ActionRowBuilder()
            .addComponents(
                new Discord.ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('<')
                    .setStyle(Discord.ButtonStyle.Secondary)
                    .setDisabled(page <= 1),
                new Discord.ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('>')
                    .setStyle(Discord.ButtonStyle.Secondary)
                    .setDisabled(page >= pageTotal)
            );

        return new Discord.ContainerBuilder()
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder().setContent(`# Analyse du rôle : ${role.name}`)
            )
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder().setContent(`> ${enVocalCount} / ${membresArray.length} membres en vocal\n> Page ${page}/${pageTotal}`)
            )
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder().setContent(list)
            )
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
            .addActionRowComponents(row)
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true));
    };

    const msg = await message.reply({
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [buildPanel(page)],
        allowedMentions: { parse: [] }
    });

    const collector = msg.createMessageComponentCollector({ time: 300000 });

    collector.on('collect', async (i) => {
        if (i.user.id !== message.author.id)
            return sendEphemeral(i, "> Pas pour toi !");

        const pageTotal = Math.ceil(membresArray.length / MEMBRES_PAR_PAGE) || 1;

        if (i.customId === 'prev' && page > 1) page--;
        if (i.customId === 'next' && page < pageTotal) page++;

        await i.update({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [buildPanel(page)],
            allowedMentions: { parse: [] }
        });
    });

    collector.on('end', () => {
        msg.edit({ components: [] }).catch(() => {});
    });
};