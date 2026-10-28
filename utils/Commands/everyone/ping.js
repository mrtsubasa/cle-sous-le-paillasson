const Discord = require('discord.js');


exports.help = {
  name: 'ping',
  aliases: ["ping", "zizi"],
  type: 'everyone',
  description: 'permet de voir la latence du bot',
}
exports.run = async (bot, message, args, config) => {

    const zizi = new Discord.ContainerBuilder()
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`# Bot Latency`))
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`> **Discord Api: \`${bot.ws.ping}\` ms**`))
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))

    await message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [zizi]});
}