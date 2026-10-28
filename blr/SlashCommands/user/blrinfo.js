const Discord = require('discord.js');
const { getBlacklist } = require('../../Utils/blacklist');

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

function formatText(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

function formatUserLabel(guild, userId) {
  const member = guild.members.cache.get(userId);
  if (member?.user) {
    return `<@${member.id}> \`${member.user.username}\` (\`${member.id}\`)`;
  }

  const user = guild.client.users.cache.get(userId);
  if (user) {
    return `<@${user.id}> \`${user.username}\` (\`${user.id}\`)`;
  }

  return `<@${userId}> (\`${userId}\`)`;
}

function findBlacklistEntry(rows, userId) {
  return rows.find((row) => String(row?.id ?? row) === String(userId)) || null;
}

function buildInfoCard(guild, target, entry) {
  const authorLabel = entry.addedBy ? formatUserLabel(guild, entry.addedBy) : 'Inconnu';
  const victimLabel = formatUserLabel(guild, target.id);
  const reason = formatText(entry.reason, 'Aucune raison');
  const addedAt = entry.addedAt ? `<t:${Math.floor(Number(entry.addedAt) / 1000)}:F>` : 'Inconnue';

  const container = new Discord.ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`> 👁️ Info BLR ${formatUserLabel(guild, target.id)}`),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `- Auteur :\n`
        + `> Ajouté par : ${authorLabel}\n`
        + `> Identifiant : \`${entry.addedBy || 'Inconnu'}\``,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `- Victime :\n`
        + `> ${victimLabel}\n`
        + `> Nom d'utilisateur : \`${target.username}\`\n`
        + `> Identifiant : \`${target.id}\`\n`,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `- Informations :\n`
        + `> Raison : \`${reason}\`\n`
        + `> Date : ${addedAt}`,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    );

  return {
    flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
    components: [container],
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  name: 'blrinfo',
  description: 'Affiche les informations BLR d\'un membre',
  dm_permission: false,
  perm: 'owner',
  options: [
    {
      name: 'user',
      type: 6,
      description: 'Utilisateur dont tu veux voir les informations BLR',
      required: true,
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
    const rows = getBlacklist(bot, interaction.guild.id);
    const entry = findBlacklistEntry(rows, user.id);

    if (!entry) {
      return interaction.reply(buildResponse(
        '# BLR introuvable',
        `> <@${user.id}> n\'est pas dans la BLR.`,
      ));
    }

    return interaction.reply(buildInfoCard(interaction.guild, user, entry));
  },
};
