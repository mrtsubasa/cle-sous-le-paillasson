const Discord = require('discord.js');
const { getConfiguredLogChannelId } = require('../../Utils/logChannels');
const { getRoleLimitRecord, removeRoleLimit } = require('../../Utils/roleLimit');

function buildResponse(title, content) {
  return {
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [
      new Discord.ContainerBuilder()
        .setAccentColor(0x2b2d31)
        .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(title))
        .addSeparatorComponents(
          new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
        )
        .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(content)),
    ],
    allowedMentions: { parse: [] },
  };
}

async function sendLog(bot, message, role, oldLimit) {
  const logChannelId = getConfiguredLogChannelId(bot, message.guild.id, 'del_limite_logs');
  const logChannel = logChannelId ? message.guild?.channels.cache.get(logChannelId) : null;
  if (!logChannel?.isTextBased?.()) return;

  const unixTimestamp = Math.floor(Date.now() / 1000);
  const thumb = new Discord.ThumbnailBuilder({
    media: { url: message.author.displayAvatarURL({ size: 64 }) },
  });

  const section = new Discord.SectionBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `> ↳ User : <@${message.author.id}> **${message.author.username}** (\`${message.author.id}\`)\n`
        + `> ↳ Rôle : <@&${role.id}> **${role.name}** (\`${role.id}\`)\n`
        + `> ↳ Ancienne Limite : \`${oldLimit ?? 'Aucune'}\`\n`
        + `> ↳ Action : Limite supprimée\n`
        + `> ↳ Date : <t:${unixTimestamp}:F>`,
      ),
    )
    .setThumbnailAccessory(thumb);

  const container = new Discord.ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('# __Limite Supprimée__'))
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addSectionComponents(section)
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    );

  await logChannel.send({
    components: [container],
    flags: Discord.MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}

exports.help = {
  name: 'del-limite',
  aliases: [],
  type: 'owner',
  description: 'Supprime la limite de rôles pour un rôle spécifique',
};

exports.run = async (bot, message, args) => {
  if (!message.guild) return;
  if (!bot.functions.checkPerm(bot, message, 'owner')) return;

  const role =
    message.mentions.roles.first()
    || message.guild.roles.cache.get(args[0])
    || null;

  if (!role) {
    return message.reply(buildResponse(
      '# Rôle invalide',
      '> Utilise une mention de rôle ou un ID de rôle',
    ));
  }

  const oldLimit = getRoleLimitRecord(bot, message.guild.id, role.id)?.limit_value ?? null;
  removeRoleLimit(bot, message.guild.id, role.id);

  await message.reply(buildResponse(
    '# Limite de Rôle Supprimée',
    `> La limite de rôles pour **\`${role.name}\`** a été supprimée`,
  ));

  await sendLog(bot, message, role, oldLimit);
};
