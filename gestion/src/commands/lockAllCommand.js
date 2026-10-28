const { ChannelType } = require('discord.js');

async function runLockAllCommand(message, context) {
  const guild = message.guild;
  const reply = (text) =>
    message.channel.send({ content: text, allowedMentions: { parse: [], repliedUser: false } });

  const targetTypes = [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice,
    ChannelType.GuildForum
  ];
  const channels = guild.channels.cache.filter((c) => targetTypes.includes(c.type));

  if (!channels.size) {
    await reply('Aucun salon à lock dans ce serveur.');
    return;
  }

  const everyoneId = guild.roles.everyone.id;
  let successCount = 0;

  for (const [, channel] of channels) {
    if (!channel.permissionOverwrites) continue;
    try {
      await channel.permissionOverwrites.edit(
        everyoneId,
        { SendMessages: false },
        { reason: `+lockall déclenché par ${message.author.tag}` }
      );
      successCount++;
    } catch {
      // ignore
    }
  }

  await reply(`> Opération terminée. **${successCount}** salons ont été lock.`);

  await context.logger
    .log(
      guild,
      '# Lock global',
      `> Action: +lockall\n> Salons lock: ${successCount}\n> Auteur: <@${message.author.id}>`
    )
    .catch(() => null);
}

module.exports = { runLockAllCommand };