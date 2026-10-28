const Discord = require('discord.js');

exports.help = {
  name: 'unbl',
  aliases: [],
  type: 'wl',
  description: 'Permet de supprimer un membre de la blacklist'
}

exports.run = async (bot, message, args, config) => {
    if (!bot.functions.checkPerm(bot, message, 'wl')) return;

    const req = bot.functions.checkBot(bot, message.guild.id);
    let data = JSON.parse(req.bl);

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

        if (!data.find(u => u.id === user.id)) {
            const embed = new Discord.ContainerBuilder()
            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(
                    new Discord.TextDisplayBuilder()
                        .setContent(`> ${user} n'est pas blacklist`)
                )
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));

            return message.reply({
                flags: Discord.MessageFlags.IsComponentsV2,
                components: [embed]
            });
        }

        data = data.filter(u => u.id !== user.id);

        await bot.db.prepare(
            `UPDATE guilds SET bl = @data WHERE id = @id`
        ).run({
            data: JSON.stringify(data),
            id: message.guild.id
        });

        try {
            await message.guild.members.unban(user.id);
        } catch (e) {}

        const logsContainer = new Discord.ContainerBuilder()
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(
                new Discord.TextDisplayBuilder()
                    .setContent(`# Blacklist supprimé`)
            )
            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder()
                    .setContent(`> Membre : ${user} (${user.id})\n> Auteur : ${message.author} (${message.author.id})\n> Date : <t:${Math.floor(Date.now() / 1000)}:F>`)
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

        const embed = new Discord.ContainerBuilder()
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder()
                    .setContent(`> ${user} n'est plus blacklist`)
            )
            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));

        return message.reply({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [embed]
        });
    }

    else {

        data = [];

        await bot.db.prepare(
            `UPDATE guilds SET bl = @data WHERE id = @id`
        ).run({
            data: JSON.stringify(data),
            id: message.guild.id
        });

        const bans = await message.guild.bans.fetch();
        for (const ban of bans.values()) {
            await message.guild.members.unban(ban.user.id).catch(() => {});
        }

        const logsContainer = new Discord.ContainerBuilder()
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                    .addTextDisplayComponents(
                new Discord.TextDisplayBuilder()
                    .setContent(`# Blacklist All Vidée`)
            )
            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder()
                    .setContent(`> Auteur : ${message.author} (${message.author.id})\n> Action : Suppression complète de la blacklist\n> Date : <t:${Math.floor(Date.now() / 1000)}:F>`)
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

        const embed = new Discord.ContainerBuilder()
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder()
                    .setContent(`> La blacklist a été vidée`)
            )
            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));

        return message.reply({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [embed]
        });
    }
}
