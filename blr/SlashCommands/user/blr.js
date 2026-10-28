const Discord = require('discord.js');
const { getConfiguredLogChannelId } = require('../../Utils/logChannels');
const {
  addBlacklist,
  getBlacklistBlockReason,
  getBlacklist,
  isBuyer,
  isBlacklisted,
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

function formatReason(reason) {
  const value = typeof reason === 'string' ? reason.trim() : '';
  return value || 'Aucune raison';
}

function buildBlockMessage(reason) {
  switch (reason) {
    case 'self':
      return '> Tu ne peux pas te BLR toi-même';
    case 'buyer':
      return '> Ce membre est un buyer, tu ne peux pas le BLR';
    case 'owner':
      return '> Ce membre est un owner, tu ne peux pas le BLR';
    case 'sys':
      return '> Ce membre est un sys, tu ne peux pas le BLR';
    default:
      return '> Tu ne peux pas BLR ce membre';
  }
}

function getExistingBlacklistEntry(rows, userId) {
  return rows.find((row) => String(row?.id ?? row) === String(userId)) || null;
}

async function stripMemberRoles(guild, userId) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return false;

  const botHighestRolePosition = guild.members.me?.roles.highest.position ?? 0;
  const removableRoles = member.roles.cache.filter((role) =>
    role.id !== guild.id && role.position < botHighestRolePosition
  );

  if (!removableRoles.size) return false;

  await member.roles.remove(removableRoles, 'Membre BLR');
  return true;
}

async function sendActionLog(bot, guild, user, moderator, actionKey, reason) {
  const channelId = getConfiguredLogChannelId(bot, guild.id, actionKey);
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel?.isTextBased?.()) return;

  const unixTimestamp = Math.floor(Date.now() / 1000);
  const isAdd = actionKey === 'blr_add_logs';
  const title = isAdd ? '# BLR' : '# UNBLR';
  const actionLabel = isAdd ? 'BLR' : 'UNBLR';

  const container = new Discord.ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(title))
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `> ↳ Membre : <@${user.id}> **${user.username}** (\`${user.id}\`)\n`
        + `> ↳ Modérateur : <@${moderator.id}> **${moderator.username}** (\`${moderator.id}\`)\n`
        + `> ↳ Action : ${actionLabel}\n`
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

module.exports = {
  name: 'blr',
  description: 'Gere la BLR du serveur',
  dm_permission: false,
  perm: 'owner',
  options: [
    {
      name: 'user',
      type: 6,
      description: 'Utilisateur a ajouter ou retirer de la BLR',
      required: false,
    },
    {
      name: 'reason',
      type: 3,
      description: 'Raison du BLR',
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
    const reason = interaction.options.getString('reason');

    if (!user) {
      return interaction.reply(buildResponse(
        '# Utilisateur manquant',
        '> Mets un `user` pour ajouter quelqu’un à la BLR.\n> Pour voir la liste, utilise `/blrlist`.',
      ));
    }

    const blockReason = getBlacklistBlockReason(bot, interaction.guild.id, user.id, interaction.user.id);
    if (blockReason) {
      return interaction.reply(buildResponse(
        '# Utilisateur protégé',
        buildBlockMessage(blockReason),
      ));
    }

    const hasReason = typeof reason === 'string' && reason.trim().length > 0;
    const currentlyBlacklisted = isBlacklisted(bot, interaction.guild.id, user.id);

    if (!hasReason) {
      return interaction.reply(buildResponse(
        '# Raison manquante',
        '> Utilise `/unblr` pour retirer un membre de la BLR.',
      ));
    }

    const existingEntry = getExistingBlacklistEntry(getBlacklist(bot, interaction.guild.id), user.id);
    if (existingEntry) {
      return interaction.reply(buildResponse(
        '# Déjà en BLR',
        `> <@${user.id}> est déjà dans la BLR.\n> Raison actuelle : **${formatReason(existingEntry.reason)}**`,
      ));
    }

    const result = addBlacklist(bot, interaction.guild.id, user.id, reason, interaction.user.id, interaction.user.id);
    if (result?.skipped) {
      return interaction.reply(buildResponse(
        '# Utilisateur protégé',
        buildBlockMessage(getBlacklistBlockReason(bot, interaction.guild.id, user.id, interaction.user.id)),
      ));
    }

    if (!isBuyer(user.id)) {
      await stripMemberRoles(interaction.guild, user.id);
    }
    await sendActionLog(bot, interaction.guild, user, interaction.user, 'blr_add_logs', reason.trim());

    return interaction.reply(buildResponse(
      currentlyBlacklisted ? '# BLR mise à jour' : '# Membre BLR',
      `> <@${user.id}> a été ajouté à la BLR.\n> Raison : **${reason.trim()}**`,
    ));
  },
};
