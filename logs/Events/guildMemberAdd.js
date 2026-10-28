const Discord = require('discord.js');
const { getMemberLogTarget } = require('../Utils/logsGuildConfig');

function buildJoinLog(member) {
  const timestamp = Math.floor(Date.now() / 1000);

  return new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `<:voicejoin:1510330412071915620> ${member} a rejoint le serveur !`,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

module.exports = {
  name: 'guildMemberAdd',
  async execute(member, bot) {
    if (!member?.guild) return;

    const target = getMemberLogTarget(bot, member.guild.id, 'join');
    if (!target) return;

    const destinationGuild = bot.guilds.cache.get(target.secondaryGuildId)
      || await bot.guilds.fetch(target.secondaryGuildId).catch(() => null);
    if (!destinationGuild) return;

    const logChannel = destinationGuild.channels.cache.get(target.channelId)
      || await destinationGuild.channels.fetch(target.channelId).catch(() => null);
    if (!logChannel?.isTextBased?.()) return;

    await logChannel.send({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [buildJoinLog(member)],
      allowedMentions: { parse: [] },
    }).catch((error) => {
      console.error(`Erreur log join serveur : ${error?.message || error}`);
    });
  },
};
