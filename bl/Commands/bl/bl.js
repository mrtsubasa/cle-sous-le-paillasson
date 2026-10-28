const Discord = require('discord.js');

exports.help = {
    name: 'bl',
    aliases: [],
    type: 'wl',
    description: 'Permet de voir ou d\'ajouter un membre à la liste des blacklists',
}

const ownerBlCooldown = new Map();
const wlBlCooldown = new Map();
const sysBlCooldown = new Map();

exports.run = async (bot, message, args, config) => {
    if (!bot.functions.checkPerm(bot, message, 'wl')) return;
    const req = bot.functions.checkBot(bot, message.guild.id);
    let data = JSON.parse(req.bl);

    let user = await bot.users.fetch(message.mentions.users.first()?.id || args[0]).catch(() => false);

    if (!user && !args[0]) {
        let page = 1, nb = 1;
        const botsDescription = data.length !== 0 ? data.map((m) => {
            const description = `${nb}) <@${m.id}> (${m.id})\n⤷ Auteur : <@${m.author}> (${m.author})\n⤷ Raison : ${m.reason || 'Aucune raison'}\n⤷ Date : <t:${Math.floor(m.time / 1000)}:F>`;
            nb++;
            return description;
        }) : ['> Aucun utilisateur blacklist'];

        const pageTotal = Math.ceil(botsDescription.length / 5);

        const allEmbed = (page) => {
            const start = (page - 1) * 5;
            const end = page * 5;
            const currentIndependentUser = botsDescription.slice(start, end);

            const button1 = new Discord.ButtonBuilder()
                .setLabel('<')
                .setStyle(Discord.ButtonStyle.Secondary)
                .setCustomId('pageBefore')
                .setDisabled(page == 1);

            const button3 = new Discord.ButtonBuilder()
                .setLabel('>')
                .setStyle(Discord.ButtonStyle.Secondary)
                .setCustomId('pageAfter')
                .setDisabled(pageTotal == 1 || pageTotal == page);

            const embed = new Discord.ContainerBuilder()
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`# Blacklist (**${data.length}**)`))
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(currentIndependentUser.join('\n\n')))
                .addActionRowComponents(new Discord.ActionRowBuilder().addComponents(button1, button3));

            return embed;
        };

        const msg = await message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [allEmbed(page)] });

        const collector = msg.createMessageComponentCollector({ time: 180000 });

        collector.on('collect', async (i) => {
            collector.resetTimer();
            if (i.user.id !== message.author.id) return;
            if (i.customId == 'pageBefore') {
                if (page > 1) {
                    page--;
                    await i.update({ flags: Discord.MessageFlags.IsComponentsV2, components: [allEmbed(page)] });
                }
            } else if (i.customId == 'pageAfter') {
                page++;
                await i.update({ flags: Discord.MessageFlags.IsComponentsV2, components: [allEmbed(page)] });
            }
        });
    } else {

        let dataNobl = JSON.parse(req.nobl);

        if (!user) {
            const embed = new Discord.ContainerBuilder()
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`Aucun membre trouvé ${args[0] ? `pour : ${args[0]}` : ""}`))
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
            return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [embed] });
        }

        if (user.id === message.author.id) {
            const embed = new Discord.ContainerBuilder()
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`> Tu peu pas te bl toi même <@${user.id}>`))
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));

            return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [embed] });
        }

        let owners = JSON.parse(req.owner || "[]");
        let sys = JSON.parse(req.sys || "[]");
        let wl = JSON.parse(req.wl || "[]");
        let buyers = config.buyers || config.buyer || [];
        let limits = bot.functions.getCommandLimits(req);
        const hasUser = (list, id) => Array.isArray(list) && list.some((entry) => {
            if (entry && typeof entry === 'object') return entry.id === id;
            return entry === id;
        });

        if (
            hasUser(owners, user.id) ||
            hasUser(sys, user.id) ||
            hasUser(wl, user.id) ||
            hasUser(buyers, user.id)
        ) {
            const embed = new Discord.ContainerBuilder()
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`> Je n'ai pas les permissions nécessaires pour bl <@${user.id}>`))
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));

            return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [embed] });
        }

        if (hasUser(dataNobl, user.id)) {
            const embed = new Discord.ContainerBuilder()
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`${user} est dans la liste des nobl`))
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
            return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [embed] });
        }

        if (data.find(d => d.id === user.id)) {
            const embed = new Discord.ContainerBuilder()
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`${user} est déjà blacklist`))
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
            return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [embed] });
        }

        let reason = args[1] ? args.slice(1).join(' ') : null;
        if (!reason) {
            const embed = new Discord.ContainerBuilder()
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`Met une raison enculer !!`))
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
            return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [embed] });
        }

        const now = Date.now();

        if (hasUser(owners, message.author.id)) {
            const cooldown = ownerBlCooldown.get(message.author.id) || { count: 0, time: now };

            if (now - cooldown.time >= 3600000) {
                cooldown.count = 0;
                cooldown.time = now;
            }

            cooldown.count++;

            if (cooldown.count > limits.bl.owner) {
                return message.reply({
                    flags: Discord.MessageFlags.IsComponentsV2,
                    components: [
                        new Discord.ContainerBuilder()
                            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                            .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`> Tu as dépassé la limite de ${limits.bl.owner} blacklist / heure`))
                            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                    ]
                });
            }

            ownerBlCooldown.set(message.author.id, cooldown);
        }

        else if (hasUser(sys, message.author.id)) {
            const cooldown = sysBlCooldown.get(message.author.id) || { count: 0, time: now };

            if (now - cooldown.time >= 3600000) {
                cooldown.count = 0;
                cooldown.time = now;
            }

            cooldown.count++;

            if (cooldown.count > limits.bl.sys) {
                return message.reply({
                    flags: Discord.MessageFlags.IsComponentsV2,
                    components: [
                        new Discord.ContainerBuilder()
                            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                            .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`> Tu as dépassé la limite de ${limits.bl.sys} blacklist / heure`))
                            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                    ]
                });
            }

            sysBlCooldown.set(message.author.id, cooldown);
        }

        else if (hasUser(wl, message.author.id)) {
            const cooldown = wlBlCooldown.get(message.author.id) || { count: 0, time: now };

            if (now - cooldown.time >= 3600000) {
                cooldown.count = 0;
                cooldown.time = now;
            }

            cooldown.count++;

            if (cooldown.count > limits.bl.wl) {
                return message.reply({
                    flags: Discord.MessageFlags.IsComponentsV2,
                    components: [
                        new Discord.ContainerBuilder()
                            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                            .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`> Tu as dépassé la limite de ${limits.bl.wl} blacklist / heure`))
                            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                    ]
                });
            }

            wlBlCooldown.set(message.author.id, cooldown);
        }

        const json = {
            author: message.author.id,
            id: user.id,
            reason: reason,
            time: Date.now()
        };

        data.push(json);

        await bot.db.prepare(`UPDATE guilds SET bl = @data WHERE id = @id`).run({
            data: JSON.stringify(data),
            id: message.guild.id
        });

await message.guild.bans.create(user.id, { reason: reason }).catch(() => false);

const logsContainer = new Discord.ContainerBuilder()
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(
        new Discord.TextDisplayBuilder()
            .setContent(`# Blacklist ajouté`)
    )
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(
        new Discord.TextDisplayBuilder()
            .setContent(`> Membre : ${user} (${user.id})\n> Auteur : <@${message.author.id}> (${message.author.id})\n> Raison : ${reason}\n> Date : <t:${Math.floor(Date.now() / 1000)}:F>`)
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
                    .setContent(`> ${user} est maintenant blacklist pour la raison: ${reason}`)
            )
            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    ]
});
    }
}
