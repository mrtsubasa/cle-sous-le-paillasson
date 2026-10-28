const Discord = require('discord.js');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags
} = Discord;

exports.help = {
  name: 'clearinv',
  aliases: ["clear"],
  type: 'wl',
  description: 'Supprime un nombre d\'invitations',
};

exports.run = async (bot, message, args) => {

  if (!bot.functions.checkPerm(bot, message, 'wl')) return;

  const guild = message.guild;
  if (!guild) return;

  if (!message.member.permissions.has(
    Discord.PermissionsBitField.Flags.ManageGuild
  )) {
    return message.reply("> Permission MANAGE_GUILD requise");
  }

  const number = parseInt(args[0]);
  if (!number || number <= 0) {
    return message.reply("> Indique un nombre valide\nExemple : `!clearinv 5`");
  }

  try {

    const invites = await guild.invites.fetch();

    if (!invites.size) {
      return message.reply("> Aucune invitation trouvée");
    }

    const invitesToDelete = [...invites.values()].slice(0, number);

    let deleted = 0;

    for (const invite of invitesToDelete) {
      try {
        await invite.delete();
        deleted++;
      } catch (err) {
        console.log("Erreur suppression invite :", err);
      }
    }


    const container = new ContainerBuilder();

    container.addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small)
    );

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# Invitations supprimées\n\n` +
        `> Nombre demandé : **${number}**\n` +
        `> Supprimées : **${deleted}**`
      )
    );

    container.addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small)
    );

    return message.reply({
      flags: MessageFlags.IsComponentsV2,
      components: [container]
    });

  } catch (err) {
    console.error(err);
    message.reply("> Erreur lors de la suppression des invitations");
  }
};