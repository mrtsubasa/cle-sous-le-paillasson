const Discord = require('discord.js');
const { getConfiguredLogChannelId } = require('../../Utils/logChannels');
const {
  getBlacklist,
  isBlacklisted,
  removeBlacklist,
} = require('../../Utils/blacklist');

function buildResponse(title, content) {
  return {
    flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
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

async function sendActionLog(bot, guild, user, moderator, reason) {
  const channelId = getConfiguredLogChannelId(bot, guild.id, 'blr_remove_logs');
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel?.isTextBased?.()) return;

  const unixTimestamp = Math.floor(Date.now() / 1000);
  const container = new Discord.ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('# UNBLR'))
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `> ↳ Membre : <@${user.id}> **${user.username}** (\`${user.id}\`)\n`
        + `> ↳ Modérateur : <@${moderator.id}> **${moderator.username}** (\`${moderator.id}\`)\n`
        + `> ↳ Action : Retiré de la BLR\n`
        + `> ↳ Raison : ${reason || 'Aucune raison'}\n`
        + `> ↳ Date : <t:${unixTimestamp}:F>`,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    );

  await channel.send({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: { parse: [] },
  });
}

async function sendBulkActionLog(bot, guild, moderator, users) {
  const channelId = getConfiguredLogChannelId(bot, guild.id, 'blr_remove_logs');
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel?.isTextBased?.()) return;

  const unixTimestamp = Math.floor(Date.now() / 1000);
  const preview = users.slice(0, 10).map((user) => `<@${user.id}> (\`${user.id}\`)`).join('\n') || '> Aucun';
  const extraCount = users.length > 10 ? `\n> ... et ${users.length - 10} autre(s)` : '';

  const container = new Discord.ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('# UNBLR'))
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `> ↳ Modérateur : <@${moderator.id}> **${moderator.username}** (\`${moderator.id}\`)\n`
        + `> ↳ Action : Retrait de toute la BLR\n`
        + `> ↳ Membres retirés : \`${users.length}\`\n`
        + `> ↳ Liste :\n${preview}${extraCount}\n`
        + `> ↳ Date : <t:${unixTimestamp}:F>`,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    );

  await channel.send({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: { parse: [] },
  });
}

exports.help = {
  name: 'unblr',
  aliases: [],
  type: 'owner',
  description: 'Retire un membre de la BLR',
};

exports.run = async (bot, message, args) => {
  if (!message.guild) return;
  if (!bot.functions.checkPerm(bot, message, 'owner')) return;

  const rawUserId = args?.[0] || '';
  const userId = rawUserId.replace(/[<@!>]/g, '') || null;
  const reason = args?.slice(1).join(' ').trim() || '';

  if (!userId) {
    const rows = getBlacklist(bot, message.guild.id);
    if (!rows.length) {
      return message.reply(buildResponse(
        '# Aucune action',
        '> Personne n\'est actuellement dans la BLR.',
      ));
    }

    for (const row of rows) {
      removeBlacklist(bot, message.guild.id, row.id);
    }

    await sendBulkActionLog(bot, message.guild, message.author, rows);

    return message.reply(buildResponse(
      '# BLR supprimée',
      `> La BLR a été retirée pour **${rows.length}** membre(s).`,
    ));
  }

  const user = await bot.users.fetch(userId).catch(() => null);
  if (!user) {
    return message.reply(buildResponse(
      '# Utilisateur introuvable',
      '> Je ne trouve pas cet utilisateur.',
    ));
  }

  if (!isBlacklisted(bot, message.guild.id, user.id)) {
    return message.reply(buildResponse(
      '# Aucune action',
      '> Ce membre n\'est pas dans la BLR.',
    ));
  }

  removeBlacklist(bot, message.guild.id, user.id);
  await sendActionLog(bot, message.guild, user, message.author, reason);

  return message.reply(buildResponse(
    '# Membre retiré de la BLR',
    `> <@${user.id}> a été retiré de la BLR.`,
  ));
};
