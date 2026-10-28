const Discord = require('discord.js');
const { getBlacklist } = require('../../Utils/blacklist');

const ITEMS_PER_PAGE = 10;

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

function formatUserLabel(guild, userId) {
  const member = guild.members.cache.get(userId);
  if (member?.user) {
    return `<@${member.id}> **${member.user.username}** (\`${member.id}\`)`;
  }

  const user = guild.client.users.cache.get(userId);
  if (user) {
    return `<@${user.id}> **${user.username}** (\`${user.id}\`)`;
  }

  return `<@${userId}> (\`${userId}\`)`;
}

function buildPage(rows, guild, page) {
  const pageTotal = Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE));
  const currentPage = Math.min(Math.max(page, 1), pageTotal);
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageRows = rows.slice(start, start + ITEMS_PER_PAGE);

  const lines = pageRows.map((row, index) => {
    const userLabel = formatUserLabel(guild, row.id);
    const addedBy = row.addedBy ? formatUserLabel(guild, row.addedBy) : 'Inconnu';
    return `> ${start + index + 1}. ${userLabel} (\`${row.id}\`)`
      + `\n> ↳ Raison : ${formatReason(row.reason)}`
      + `\n> ↳ Ajouté par : ${addedBy}`;
  });

  const content = lines.length
    ? lines.join('\n\n')
    : '> Aucune personne BLR sur ce serveur';

  const container = new Discord.ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`# BLR List | Page ${currentPage}/${pageTotal}`),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(content))
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    );

  if (rows.length > ITEMS_PER_PAGE) {
    container.addActionRowComponents(
      new Discord.ActionRowBuilder().addComponents(
        new Discord.ButtonBuilder()
          .setCustomId('blrlist:prev')
          .setLabel('Précédent')
          .setStyle(Discord.ButtonStyle.Secondary)
          .setDisabled(currentPage <= 1),
        new Discord.ButtonBuilder()
          .setCustomId('blrlist:next')
          .setLabel('Suivant')
          .setStyle(Discord.ButtonStyle.Secondary)
          .setDisabled(currentPage >= pageTotal),
      ),
    );
  }

  return {
    flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
    components: [container],
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  name: 'blrlist',
  description: 'Affiche la liste des membres BLR',
  dm_permission: false,
  perm: 'owner',

  run: async (bot, interaction) => {
    if (!bot.functions.checkPerm(bot, interaction, 'owner')) {
      return interaction.reply(buildResponse(
        '# Utilisateur non autorisé',
        '> Vous n\'êtes pas autorisé à exécuter cette commande',
      ));
    }

    const rows = getBlacklist(bot, interaction.guild.id);
    let currentPage = 1;
    await interaction.reply(buildPage(rows, interaction.guild, currentPage));

    if (rows.length <= ITEMS_PER_PAGE) return;

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ time: 300000 });

    collector.on('collect', async (component) => {
      if (component.user.id !== interaction.user.id) return;
      if (!component.isButton()) return;
      if (component.customId !== 'blrlist:prev' && component.customId !== 'blrlist:next') return;

      if (component.customId === 'blrlist:prev') currentPage -= 1;
      if (component.customId === 'blrlist:next') currentPage += 1;

      await component.update(buildPage(rows, interaction.guild, currentPage));
    });
  },
};
