const Discord = require('discord.js');

exports.help = {
  name: 'logs',
  aliases: [],
  type: 'owner',
  description: 'permet d\'activer ou de désactiver les logs',
}
exports.run = async (bot, message, args, config) => {
    if(!bot.functions.checkPerm(bot, message, 'owner')) return
    const req = bot.functions.checkBot(bot, message.guild.id)

    const channel = message.mentions.channels.first()  || message.guild.channels.cache.find(r => r.id === args[0]) || message.channel;
    if(!channel && args[0] !== 'off') {
        const allah = new Discord.ContainerBuilder()
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`> Aucun salon trouvé ${args[0] ? `pour : ${args[0]}` : ""}`))
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))

        return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [allah] })
    }

    await bot.db.prepare(`UPDATE guilds SET logs = @data WHERE id = @id`).run({ data: channel?.id ? channel.id : 'off', id: message.guild.id });

    if(args[0] == 'off') {
        const detraquer = new Discord.ContainerBuilder()
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`> Les logs ont été désactivés`))
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
        return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [detraquer] })
    } else {
        const sexuelle = new Discord.ContainerBuilder()
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`> Les logs ont été activé sur ${channel} (${channel.id})`))
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))

        return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [sexuelle] })
    }
}
