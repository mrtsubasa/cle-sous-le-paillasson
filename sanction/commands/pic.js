function buildPicCard(user) {
  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 10, content: `# ${user.tag}` },
        { type: 12, items: [{ media: { url: user.displayAvatarURL({ size: 1024, extension: 'png' }) } }] }
      ]
    }]
  };
}

function buildServerCard(guild) {
  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 10, content: `# ${guild.name}` },
        { type: 12, items: [{ media: { url: guild.iconURL({ size: 1024, extension: 'png' }) } }] }
      ]
    }]
  };
}

module.exports = {
  name: 'pic',
  async executePrefix(message, args) {
    const wantsServer = args[0] && args[0].toLowerCase() === 'server';
    if (wantsServer) {
      const iconUrl = message.guild.iconURL({ size: 1024, extension: 'png' });
      if (!iconUrl) {
        return message.reply({ content: 'Ce serveur n\'a pas de photo', allowedMentions: { parse: [] }, mentionRepliedUser: false });
      }
      const card = buildServerCard(message.guild);
      return message.reply({ ...card, allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    let target = message.mentions.users.first();

    const repliedMessageId = message.reference?.messageId;
    if (!target && repliedMessageId) {
      const replied = await message.channel.messages.fetch(repliedMessageId).catch(() => null);
      if (replied) target = replied.author;
    }

    if (!target && args[0]) {
      const id = args[0].replace(/[<@!>]/g, '');
      target = await message.client.users.fetch(id).catch(() => null);
    }

    if (!target) target = message.author;

    const card = buildPicCard(target);
    return message.reply({ ...card, allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }
};
