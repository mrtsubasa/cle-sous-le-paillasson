const Discord = require('discord.js');

exports.help = {
  name: 'unnobl',
  aliases: [],
  type: 'owner',
  description: 'Supprime un membre de la liste NoBL',
}

exports.run = async (bot, message, args, config) => {

    if (!bot.functions.checkPerm(bot, message, 'owner')) return;

    const req = bot.functions.checkBot(bot, message.guild.id);
    let data = JSON.parse(req.nobl);

    let user = await bot.users.fetch(
        message.mentions.users.first()?.id || args[0]
    ).catch(() => false);

    if (!user && args[0] !== 'all') {
        const embed = new Discord.ContainerBuilder()
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder()
                    .setContent(`> Aucun membre trouvé ${args[0] ? `pour : ${args[0]}` : ""}`)
            )
            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));

        return message.reply({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [embed]
        });
    }

    if (user) {

        const entry = data.find(u => u.id === user.id);

        if (!entry) {
            const embed = new Discord.ContainerBuilder()
            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(
                    new Discord.TextDisplayBuilder()
                        .setContent(`> ${user} n'est pas NoBl`)
                )
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));

            return message.reply({
                flags: Discord.MessageFlags.IsComponentsV2,
                components: [embed]
            });
        }

        if (entry.author !== message.author.id) {
            const embed = new Discord.ContainerBuilder()
            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(
                    new Discord.TextDisplayBuilder()
                        .setContent(`> Tu ne peux pas retirer ce NoBl car tu n'en es pas l'auteur`)
                )
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));

            return message.reply({
                flags: Discord.MessageFlags.IsComponentsV2,
                components: [embed]
            });
        }

        const logsContainer = new Discord.ContainerBuilder()
.addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(
        new Discord.TextDisplayBuilder()
            .setContent(`# UnNobl retiré`)
    )
.addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(
        new Discord.TextDisplayBuilder()
            .setContent(`> Membre : ${user} (${user.id})\n> Auteur : <@${message.author.id}> (${message.author.id})\n> Action : UnNoBL\n> Date : <t:${Math.floor(Date.now() / 1000)}:F>`)
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

        data = data.filter(u => u.id !== user.id);

        await message.guild.bans.remove(user.id).catch(() => false);

        await bot.db.prepare(
            `UPDATE guilds SET nobl = @data WHERE id = @id`
        ).run({
            data: JSON.stringify(data),
            id: message.guild.id
        });


        const embed = new Discord.ContainerBuilder()
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder()
                    .setContent(`> ${user} n'est plus NoBl`)
            )
            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));

        return message.reply({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [embed]
        });

    } else {

const logsContainer = new Discord.ContainerBuilder()
.addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(
        new Discord.TextDisplayBuilder()
            .setContent(`# UnNobl retiré (All)`)
    )
.addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(
        new Discord.TextDisplayBuilder()
            .setContent(`> Auteur : <@${message.author.id}> (${message.author.id})\n> Action : UnNoBL (tous)\n> Date : <t:${Math.floor(Date.now() / 1000)}:F>`)
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
        for (const entry of data) {
            await message.guild.bans.remove(entry.id).catch(() => false);
            await new Promise(r => setTimeout(r, 500));
        }

        data = [];

        await bot.db.prepare(
            `UPDATE guilds SET nobl = @data WHERE id = @id`
        ).run({
            data: JSON.stringify(data),
            id: message.guild.id
        });

        const embed = new Discord.ContainerBuilder()
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder()
                    .setContent(`> La liste des nobl a été vidée !`)
            )
            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));

        return message.reply({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [embed]
        });
    }
};
