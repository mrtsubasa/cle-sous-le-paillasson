const Discord = require('discord.js');
const { getConfiguredLogChannelId } = require('../../Utils/logChannels');
const { getRoleLimit, setRoleLimit } = require('../../Utils/roleLimit');

function buildResponse(title, content) {
  return {
    components: [
      new Discord.ContainerBuilder()
        .setAccentColor(0x2b2d31)
        .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(title))
        .addSeparatorComponents(
          new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
        )
        .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(content)),
    ],
    flags: Discord.MessageFlags.Ephemeral | Discord.MessageFlags.IsComponentsV2,
  };
}

async function sendLog(bot, message, role, oldLimit, limit) {
  const logChannelId = getConfiguredLogChannelId(bot, message.guild.id, 'role_limit_logs');
  const logChannel = logChannelId ? message.guild?.channels.cache.get(logChannelId) : null;
  if (!logChannel?.isTextBased?.()) return;

  const unixTimestamp = Math.floor(Date.now() / 1000);
  const container = new Discord.ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('# __Limite Role__'))
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `> ↳ User : <@${message.author.id}> **${message.author.username}** (\`${message.author.id}\`)\n`
        + `> ↳ Rôle : <@&${role.id}> **${role.name}** (\`${role.id}\`)\n`
        + `> ↳ Ancienne Limite : \`${oldLimit ?? 'Aucune'}\`\n`
        + `> ↳ Nouvelle Limite : \`${limit}\`\n`
        + `> ↳ Date : <t:${unixTimestamp}:F>`,
      ),
    )
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
  name: 'add-limite',
  aliases: ['addlimite', 'limiteadd'],
  type: 'owner',
  description: 'Définit une limite de rôles pour un rôle spécifique',
};

exports.run = async (bot, message, args) => {
  if (!message.guild) return;
  if (!bot.functions.checkPerm(bot, message, 'owner')) return;

  const role =
    message.mentions.roles.first()
    || message.guild.roles.cache.get(args[0])
    || null;
  const limit = Number(args[1]);

  if (!role) {
    return message.reply(buildResponse(
      '# Rôle invalide',
      '> Tu dois fournir un rôle valide.',
    ));
  }

  if (!Number.isFinite(limit) || limit < 0) {
    return message.reply(buildResponse(
      '# Limite invalide',
      '> La limite doit être supérieure ou égale à `0`.',
    ));
  }

  const oldLimit = getRoleLimit(bot, message.guild.id, role.id);
  await setRoleLimit(bot, message.guild.id, role.id, limit, message.author.id);

  await message.reply(buildResponse(
    '# Limite de Rôle Définie',
    `> La limite de rôles pour **\`${role.name}\`** a été définie à **\`${limit}\`**`,
  ));

  await sendLog(bot, message, role, oldLimit, limit);
};
