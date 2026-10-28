const Discord = require('discord.js');

exports.help = {
    name: 'mynobl',
    aliases: [],
    type: 'owner',
    description: 'Affiche les utilisateurs nobl par une personne',
}

exports.run = async (bot, message, args, config) => {
    if (!bot.functions.checkPerm(bot, message, 'owner')) return;

    const req = bot.functions.checkBot(bot, message.guild.id);
    let data = JSON.parse(req.nobl || "[]");
    
    let target = await bot.users.fetch(
        message.mentions.users.first()?.id || args[0] || message.author.id
    ).catch(() => null);

    if (!target) {
        const embed = new Discord.ContainerBuilder()
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder()
                    .setContent(`> Utilisateur introuvable`)
            )
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true));

        return message.reply({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [embed]
        });
    }

    const userNobl = data.filter(d => d.author === target.id);

    let page = 1;
    const perPage = 5;
    const pageTotal = Math.ceil(userNobl.length / perPage) || 1;

    const buildEmbed = (page) => {
        const start = (page - 1) * perPage;
        const end = start + perPage;

        const list = userNobl.slice(start, end).map((m, i) => {
            return `> **${start + i + 1})** <@${m.id}> (${m.id})\n> Raison : ${m.reason || "Aucune"}`;
        });

        return new Discord.ContainerBuilder()
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder()
                    .setContent(`# Nobl de ${target.username} (**${userNobl.length}**)`)
            )
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder()
                    .setContent(list.length ? list.join("\n\n") : "> Aucun nobl effectué")
            )
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
            .addActionRowComponents(
                new Discord.ActionRowBuilder().addComponents(
                    new Discord.ButtonBuilder()
                        .setCustomId("pageBefore")
                        .setLabel("<")
                        .setStyle(Discord.ButtonStyle.Secondary)
                        .setDisabled(page === 1),

                    new Discord.ButtonBuilder()
                        .setCustomId("pageAfter")
                        .setLabel(">")
                        .setStyle(Discord.ButtonStyle.Secondary)
                        .setDisabled(page === pageTotal)
                )
            )
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true));
    };

    const msg = await message.reply({
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [buildEmbed(page)]
    });

    if (userNobl.length <= perPage) return;

    const collector = msg.createMessageComponentCollector({ time: 180000 });

    collector.on("collect", async (i) => {
        if (i.user.id !== message.author.id) return;

        if (i.customId === "pageBefore" && page > 1) page--;
        if (i.customId === "pageAfter" && page < pageTotal) page++;

        await i.update({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [buildEmbed(page)]
        });
    });
};
