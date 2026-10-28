const Discord = require('discord.js');

exports.help = {
  name: 'blinfo',
  aliases: [],
  type: 'wl',
  description: 'permet de voir les informations sur un membre blacklist',
}
exports.run = async (bot, message, args, config) => {
    if(!bot.functions.checkPerm(bot, message, 'wl')) return

    const req = bot.functions.checkBot(bot, message.guild.id)
    let data = JSON.parse(req.bl)

    let user = await bot.users.fetch(message.mentions.users.first()?.id || args[0]).catch(() => false);
    if (!user) {
        const embed = new Discord.ContainerBuilder()
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))

        .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`> Aucun membre trouvé ${args[0] ? `pour : ${args[0]}` : ""}`))
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))

        return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [embed] })
    }

    if(!data.filter(u => u.id == user.id)[0]) {
        const embed = new Discord.ContainerBuilder()
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`> ${user} n'est pas blacklist`))
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))

        return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [embed] })
    }

    let userReq = data.filter(u => u.id == user.id)[0]

    const embed = new Discord.ContainerBuilder()
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`# Information du blacklist`))
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`→ Membre : ${user} (${user.id})\n→ Auteur : <@${userReq.author}> (${userReq.author})\n→ Raison : ${userReq.reason || 'Aucune Raison'}\n→ Date : <t:${Math.floor(userReq.time / 1000)}:F>`))
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))

    return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [embed] })
}
