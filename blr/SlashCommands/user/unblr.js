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
        + `> ↳ Action : Retiré de la blr\n`
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

module.exports = {
  name: 'unblr',
  description: 'Retire un membre de la BLR',
  dm_permission: false,
  perm: 'owner',
  options: [
    {
      name: 'user',
      type: 6,
      description: 'Utilisateur a retirer de la BLR',
      required: false,
    },
    {
      name: 'reason',
      type: 3,
      description: 'Raison du retrait',
      required: false,
    },
  ],

  run: async (bot, interaction) => {
    if (!bot.functions.checkPerm(bot, interaction, 'owner')) {
      return interaction.reply(buildResponse(
        '# Utilisateur non autorisé',
        '> Vous n\'êtes pas autorisé à exécuter cette commande',
      ));
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || '';

    if (!user) {
      const rows = getBlacklist(bot, interaction.guild.id);
      if (!rows.length) {
        return interaction.reply(buildResponse(
          '# Aucune action',
          '> Personne n\'est actuellement dans la BLR.',
        ));
      }

      for (const row of rows) {
        removeBlacklist(bot, interaction.guild.id, row.id);
      }

      await sendBulkActionLog(bot, interaction.guild, interaction.user, rows);

      return interaction.reply(buildResponse(
        '# BLR supprimée',
        `> La BLR a été retirée pour **${rows.length}** membre(s).`,
      ));
    }

    if (!isBlacklisted(bot, interaction.guild.id, user.id)) {
      return interaction.reply(buildResponse(
      '# Aucune action',
      '> Ce membre n\'est pas dans la BLR.',
      ));
    }

    removeBlacklist(bot, interaction.guild.id, user.id);
    await sendActionLog(bot, interaction.guild, user, interaction.user, reason.trim());

    return interaction.reply(buildResponse(
    '# Membre retiré de la BLR',
    `> <@${user.id}> a été retiré de la BLR.`,
    ));
  },
};
