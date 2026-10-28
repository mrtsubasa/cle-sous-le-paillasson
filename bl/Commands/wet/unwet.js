const Discord = require('discord.js');

exports.help = {
  name: 'unwet',
  aliases: [],
  type: 'sys',
  description: 'Supprime un membre de la liste Wet',
}

exports.run = async (bot, message, args, config) => {

    if (!bot.functions.checkPerm(bot, message, 'sys')) return;

    const req = bot.functions.checkBot(bot, message.guild.id);
    let data = JSON.parse(req.wet || "[]");

    let user = await bot.users.fetch(
        message.mentions.users.first()?.id || args[0]
    ).catch(() => false);

    if (!user && args[0] !== 'all') {

        return message.reply({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [
                new Discord.ContainerBuilder()
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(
                        new Discord.TextDisplayBuilder()
                            .setContent(`> Aucun membre trouvé ${args[0] ? `pour : ${args[0]}` : ""}`)
                    )
                    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
            ]
        });
    }

    if (args[0] === "all") {

        data = [];

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
            .setContent(`# UnWet (ALL)`)
    )
.addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(
        new Discord.TextDisplayBuilder()
            .setContent(`> Auteur : <@${message.author.id}> (${message.author.id})\n> Action : UnWet All\n> Date : <t:${Math.floor(Date.now() / 1000)}:F>`)
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
                            .setContent(`> La liste des wet a été vidée !`)
                    )
                    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
            ]
        });
    }

    if (user) {

        const entry = data.find(u => u.id === user.id);

        if (!entry) {
            return message.reply({
                flags: Discord.MessageFlags.IsComponentsV2,
                components: [
                    new Discord.ContainerBuilder()
                    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                        .addTextDisplayComponents(
                            new Discord.TextDisplayBuilder()
                                .setContent(`> ${user} n'est pas wet`)
                        )
                        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                ]
            });
        }

        if (entry.author !== message.author.id) {
            return message.reply({
                flags: Discord.MessageFlags.IsComponentsV2,
                components: [
                    new Discord.ContainerBuilder()
                    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                        .addTextDisplayComponents(
                            new Discord.TextDisplayBuilder()
                                .setContent(`> Seul l'auteur du wet peut le retirer`)
                        )
                        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                ]
            });
        }

data = data.filter(u => u.id !== user.id);

await bot.db.prepare(
    `UPDATE guilds SET wet = @data WHERE id = @id`
).run({
    data: JSON.stringify(data),
    id: message.guild.id
});

await message.guild.bans.remove(user.id).catch(() => false);

const logsContainer = new Discord.ContainerBuilder()
.addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(
        new Discord.TextDisplayBuilder()
            .setContent(`# UnWet retiré`)
    )
.addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(
        new Discord.TextDisplayBuilder()
            .setContent(`> Membre : ${user} (${user.id})\n> Auteur : <@${message.author.id}> (${message.author.id})\n> Action : UnWet\n> Date : <t:${Math.floor(Date.now() / 1000)}:F>`)
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
                            .setContent(`> ${user} n'est plus wet`)
                    )
                    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
            ]
        });
    }
};
