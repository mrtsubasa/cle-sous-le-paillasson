const Discord = require('discord.js');
const { getGuildPrefix } = require('../Utils/bot');

module.exports = {
  name: 'messageCreate',
  async execute(message, bot, config) {
    try {
      if (!message.guild || message.author.bot) return;
      const guildPrefix = getGuildPrefix(bot, message.guild.id);

      const sendPrefixEmbed = () => {
        const cucu = new Discord.ContainerBuilder()
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`# Prefix`))
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`> Le prefix du bot est \`${guildPrefix}\``))
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
        
                return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [cucu] })
            }

      if (message.content.startsWith(`<@${bot.user.id}>`)) {
        const args = message.content.slice(`<@${bot.user.id}>`.length).trim().split(/ +/);
        const commandName = args.shift()?.toLowerCase();

        if (!commandName) {
          return sendPrefixEmbed();
        }

        const commandFile = bot.commands.get(commandName);
        if (!commandFile) {
          return sendPrefixEmbed();
        }

        await commandFile.run(bot, message, args, config);
      } else if (message.content.startsWith(guildPrefix)) {
        const args = message.content.slice(guildPrefix.length).trim().split(/ +/);
        const commandName = args.shift()?.toLowerCase();

        const commandFile = bot.commands.get(commandName);
        if (!commandFile) return;

        await commandFile.run(bot, message, args, config);
      }
    } catch (e) {
      console.log(e);
    }
  },
};
