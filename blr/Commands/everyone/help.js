const Discord = require('discord.js');
const { checkPerm, getGuildPrefix } = require('../../Utils/bot');

exports.help = {
  name: 'help',
  aliases: ["h"],
  type: 'everyone',
  description: 'permet de voir la liste des commandes',
}

exports.run = async (bot, message, args, config) => {
    const uniqueCommands = new Set();
    const prefix = message.guild ? getGuildPrefix(bot, message.guild.id) : config.prefix;
    bot.commands.forEach(cmd => {
        if (checkPerm(bot, message, cmd.help.type)) {
            uniqueCommands.add(`> \`${prefix}${cmd.help.name}\` : ${cmd.help.description}`);
        }
    });

    const commandsList = Array.from(uniqueCommands);

    const bite = new Discord.ContainerBuilder()
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`# Page d'aide\n> Permet de voir la liste des commandes en fonction de vos permissions sur le bot`))
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`# Commandes disponibles\n${commandsList.join('\n')}`))
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));

    await message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [bite]});
}
