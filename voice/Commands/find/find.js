const Discord = require('discord.js');

exports.help = {
  name: 'find',
  aliases: [],
  type: 'wl',
  description: 'Indique dans quel salon vocal se trouve un membre',
};

exports.run = async (bot, message, args) => {
  if (!bot.functions.checkPerm(bot, message, 'wl')) return;

  if (!args[0]) {
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('> Veuillez entrer la mention ou l’ID du membre !')
      )
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      );

    return message.reply({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [bite],
      allowedMentions: { parse: [] }
    });
  }

  const member =
    message.mentions.members.first() ||
    message.guild.members.cache.get(args[0]) ||
    message.guild.members.cache.find(
      m => m.user.username.toLowerCase() === args.join(" ").toLowerCase()
    );


  if (!member) {
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('> Membre introuvable dans ce serveur !')
      )
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      );

    return message.reply({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [bite],
      allowedMentions: { parse: [] }
    });
  }

  const safeMention = `<@${member.id}>`;
  const bite = new Discord.ContainerBuilder()
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        member.voice.channel
          ? `> ${safeMention} est actuellement dans le salon vocal <#${member.voice.channel.id}> !`
          : `> ${safeMention} n'est pas en vocal`
      )
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
    );

  await message.reply({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [bite],
    allowedMentions: { parse: [] }
  });
};