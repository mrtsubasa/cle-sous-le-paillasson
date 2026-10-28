const Discord = require('discord.js');

exports.help = {
  name: 'stats',
  aliases: [],
  type: 'everyone',
  description: 'Affiche le nombre de membres en vocal',
};

exports.run = async (bot, message) => {
  const members = message.guild.members.cache;

  const voiceMembers = members.filter(m => m.voice.channel).size;

  await message.channel.send(
    `Il y a actuellement \`\`${voiceMembers}\`\` membres en vocal sur ${message.guild.name} !`
  );
};