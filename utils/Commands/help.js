const Discord = require('discord.js');
const { checkPerm, getGuildPrefix } = require('../Utils/bot.js');

exports.help = {
  name: 'help',
  aliases: ["h"],
  type: 'everyone',
  description: 'Permet de voir la liste des commandes',
};

exports.run = async (bot, message, args, config) => {
  let commandsList = [];
  const added = new Set();

  bot.commands.forEach(cmd => {
    if (!added.has(cmd.help.name) && checkPerm(bot, message, cmd.help.type)) {
      commandsList.push(`> \`${getGuildPrefix(bot, message.guild?.id)}${cmd.help.name}\` : ${cmd.help.description}`);
      added.add(cmd.help.name);
    }
  });

  if (!commandsList.length) {
    commandsList.push('> Aucune commande disponible');
  }

  const embed = new Discord.ContainerBuilder()
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`# Page d'aide\n> Permet de voir la liste des commandes en fonction de vos permissions sur le bot`))
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`# Commandes disponibles\n${commandsList.join('\n')}`))
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));

  await message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [embed] });
};
