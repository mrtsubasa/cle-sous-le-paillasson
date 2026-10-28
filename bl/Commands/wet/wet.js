const Discord = require('discord.js');

exports.help = {
  name: 'wet',
  aliases: [],
  type: 'sys',
  description: 'Permet de voir ou d\'ajouter un membre à la liste Wet',
}

exports.run = async (bot, message, args, config) => {

    if (!bot.functions.checkPerm(bot, message, 'sys')) return;

    const req = bot.functions.checkBot(bot, message.guild.id);
    let data = JSON.parse(req.wet || "[]");

    let user = await bot.users.fetch(
        message.mentions.users.first()?.id || args[0]
    ).catch(() => false);

    const reason = args.slice(1).join(" ");

    if (!user) {

        let page = 1, nb = 1;

        const botsDescription = data.length !== 0 ? data.map((m) => {

            const description =
                `${nb}) <@${m.id}> (${m.id})\n` +
                `⤷ Auteur : <@${m.author}> (${m.author})\n` +
                `⤷ Raison : ${m.reason || "Aucune"}`;

            nb++;
            return description;

        }) : ['> Aucun utilisateur wet'];

        const pageTotal = Math.ceil(botsDescription.length / 5);

        const allEmbed = (page) => {

            const start = (page - 1) * 5;
            const end = page * 5;
            const current = botsDescription.slice(start, end);

            const button1 = new Discord.ButtonBuilder()
                .setLabel('<')
                .setStyle(Discord.ButtonStyle.Secondary)
                .setCustomId('pageBefore')
                .setDisabled(page == 1);

            const button2 = new Discord.ButtonBuilder()
                .setLabel('>')
                .setStyle(Discord.ButtonStyle.Secondary)
                .setCustomId('pageAfter')
                .setDisabled(pageTotal == 1 || pageTotal == page);

            return new Discord.ContainerBuilder()
                .addSeparatorComponents(
                    new Discord.SeparatorBuilder()
                        .setSpacing(Discord.SeparatorSpacingSize.Small)
                        .setDivider(true)
                )
                .addTextDisplayComponents(
                    new Discord.TextDisplayBuilder()
                        .setContent(`# Liste des Wet`)
                )
                .addSeparatorComponents(
                    new Discord.SeparatorBuilder()
                        .setSpacing(Discord.SeparatorSpacingSize.Small)
                        .setDivider(true)
                )
                .addTextDisplayComponents(
                    new Discord.TextDisplayBuilder()
                        .setContent(current.join('\n\n'))
                )
                .addActionRowComponents(
                    new Discord.ActionRowBuilder().addComponents(button1, button2)
                );
        };

        const msg = await message.reply({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [allEmbed(page)]
        });

        const collector = msg.createMessageComponentCollector({ time: 180000 });

        collector.on('collect', async (i) => {

            collector.resetTimer();

            if (i.user.id !== message.author.id) return;

            if (i.customId === "pageBefore" && page > 1) {
                page--;
                await i.update({
                    flags: Discord.MessageFlags.IsComponentsV2,
                    components: [allEmbed(page)]
                });
            }

            if (i.customId === "pageAfter") {
                page++;
                await i.update({
                    flags: Discord.MessageFlags.IsComponentsV2,
                    components: [allEmbed(page)]
                });
            }
        });

        return;
    }

    if (!user) {

        const bougnoul = new Discord.ContainerBuilder()
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder()
                    .setContent(`> Aucun membre trouvé ${args[0] ? `pour : ${args[0]}` : ""}`)
            )
            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));

        return message.reply({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [bougnoul]
        });
    }

    if (user.id === message.author.id) {
        return message.reply({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [
                new Discord.ContainerBuilder()
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(
                        new Discord.TextDisplayBuilder()
                            .setContent(`> Tu peu pas te wet toi même <@${user.id}>`)
                    )
                    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
            ]
        });
    }

    let owners = JSON.parse(req.owner || "[]");
    let sys = JSON.parse(req.sys || "[]");
    let buyers = config.buyers || config.buyer || [];
    const hasUser = (list, id) => Array.isArray(list) && list.some((entry) => {
        if (entry && typeof entry === 'object') return entry.id === id;
        return entry === id;
    });

    if (
        hasUser(owners, user.id) ||
        hasUser(sys, user.id) ||
        hasUser(buyers, user.id)
    ) {
        return message.reply({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [
                new Discord.ContainerBuilder()
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(
                        new Discord.TextDisplayBuilder()
                            .setContent(`> Je n'ai pas les permissions nécessaires pour wet <@${user.id}>`)
                    )
                    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
            ]
        });
    }

    if (!reason || reason.length < 3) {
        return message.reply({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [
                new Discord.ContainerBuilder()
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(
                        new Discord.TextDisplayBuilder()
                            .setContent("> Met une raison fdp")
                    )
                    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
            ]
        });
    }
    

if (data.some(u => u.id === user.id)) {

    const niquelesjuif = new Discord.ContainerBuilder()
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
            new Discord.TextDisplayBuilder()
                .setContent(`> ${user} est déjà wet`)
        )
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));

    return message.reply({
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [niquelesjuif]
    });
}

await message.guild.bans.create(user.id, {
    reason: reason
}).catch(() => false);

const json = {
    author: message.author.id,
    id: user.id,
    reason: reason,
    time: Date.now()
};

data.push(json);

    await bot.db.prepare(
    `UPDATE guilds SET wet = @data WHERE id = @id`
).run({
    data: JSON.stringify(data),
    id: message.guild.id
});

const logsContainer = new Discord.ContainerBuilder()
.addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(
        new Discord.TextDisplayBuilder()
            .setContent(`# Wet ajouté`)
    )
.addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(
        new Discord.TextDisplayBuilder()
            .setContent(`> Membre :  ${user} (${user.id})\n> Auteur : <@${message.author.id}> (${message.author.id})\n> Raison : ${reason}\n> Date : <t:${Math.floor(Date.now() / 1000)}:F>`)
    )
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));

const channel = bot.channels.cache.get(req.logs);
if (channel) {
    channel.send({
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [logsContainer],
        allowedMentions: { parse: [] }
    });
}

    return message.reply({
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [
            new Discord.ContainerBuilder()
            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(
                    new Discord.TextDisplayBuilder()
                        .setContent(`> ${user} est maintenant wet pour la raison : ${reason}`)
                )
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
        ]
    });
};
