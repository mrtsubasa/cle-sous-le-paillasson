const Discord = require('discord.js');
const { getGuildPrefix } = require('../Utils/bot.js');

module.exports = {
  name: 'messageCreate',
  async execute(message, bot, config) {
    try {
      if (!message.guild || message.author.bot) return;
      const prefix = getGuildPrefix(bot, message.guild.id);
      bot.badwordCache ??= new Map();
      const mentionPrefix = `<@${bot.user.id}>`;
      const mentionPrefixAlt = `<@!${bot.user.id}>`;
      const isCommandMessage =
        message.content.startsWith(prefix) ||
        message.content.startsWith(mentionPrefix) ||
        message.content.startsWith(mentionPrefixAlt);

      let badwords = bot.badwordCache.get(message.guild.id);
      if (!badwords) {
        const req = bot.functions.ensureGuildRow(bot, message.guild.id);
        badwords = JSON.parse(req?.badword || '[]')
          .map(word => String(word || '').trim().toLowerCase())
          .filter(Boolean);
        bot.badwordCache.set(message.guild.id, badwords);
      }

      const bypassBadwordFilter =
        bot.functions.checkPerm(bot, message, 'wl') ||
        bot.functions.checkPerm(bot, message, 'sys');

      if (badwords.length && message.content && !bypassBadwordFilter && !isCommandMessage) {
        const content = message.content.toLowerCase();
        const hit = badwords.find(word => content.includes(word));

        if (hit) {
          void message.delete().catch(() => {});
          return;
        }
      }

      const sendPrefixEmbed = () => {
        const cucu = new Discord.ContainerBuilder()
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`# Prefix`))
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
                .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`> Le prefix du bot est \`${prefix}\``))
                .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
        
                return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [cucu] })
            }

      if (message.content.startsWith(mentionPrefix) || message.content.startsWith(mentionPrefixAlt)) {
        const usedPrefix = message.content.startsWith(mentionPrefixAlt) ? mentionPrefixAlt : mentionPrefix;
        const args = message.content.slice(usedPrefix.length).trim().split(/ +/);
        const commandName = args.shift()?.toLowerCase();

        if (!commandName) return sendPrefixEmbed();

        const commandFile = bot.commands.get(commandName);
        if (!commandFile) return sendPrefixEmbed();

        if (message.mentions.members.size > 0) {
          args.shift(); 
        }

        await commandFile.run(bot, message, args, config);

      } else if (message.content.startsWith(prefix)) {
        const args = message.content.slice(prefix.length).trim().split(/ +/);
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
