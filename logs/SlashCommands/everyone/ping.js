const Discord = require('discord.js');

module.exports = {
    name: 'ping',
    description: 'Displays Discord API latency',
    dm_permission: true,
    perm: 'everyone',

    run: async (bot, interaction, args, config) => {
        const panel = new Discord.ContainerBuilder()
          .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent('# Bot Latency'),
          )
          .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent(`> *Discord Api: \`${bot.ws.ping}\` ms.*`),
          )
          .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true));

        return interaction.reply({ 
           flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
            components: [panel] 
        });
    }
};
