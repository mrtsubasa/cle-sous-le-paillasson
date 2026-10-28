const Discord = require('discord.js');
const { listRoleLimits } = require('../../Utils/roleLimit');

const ITEMS_PER_PAGE = 10;

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

function buildPage(rows, guild, page) {
  const pageTotal = Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE));
  const currentPage = Math.min(Math.max(page, 1), pageTotal);
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageRows = rows.slice(start, start + ITEMS_PER_PAGE);

  const lines = pageRows.map((row) => {
    const role = guild.roles.cache.get(row.role_id);
    const roleLabel = role ? `<@&${role.id}> **${role.name}**` : `**Rôle supprimé** (\`${row.role_id}\`)`;
    return `> ${roleLabel} : **\`${row.limit_value}\`**`;
  });

  const content = lines.length
    ? lines.join('\n')
    : '> Aucune limite définie pour les rôles dans ce serveur';

  const container = new Discord.ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`# Limites des Rôles | Page ${currentPage}/${pageTotal}`),
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
          .setCustomId('show-limite:prev')
          .setLabel('Précédent')
          .setStyle(Discord.ButtonStyle.Secondary)
          .setDisabled(currentPage <= 1),
        new Discord.ButtonBuilder()
          .setCustomId('show-limite:next')
          .setLabel('Suivant')
          .setStyle(Discord.ButtonStyle.Secondary)
          .setDisabled(currentPage >= pageTotal),
      ),
    );
  }

  return {
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  name: 'show-limite',
  description: 'Affiche la liste de tous les rôles avec leurs limites',
  dm_permission: false,
  perm: 'wl',

  run: async (bot, interaction) => {
    if (!bot.functions.checkPerm(bot, interaction, 'wl')) {
      return interaction.reply(buildResponse(
        '# Utilisateur non autorisé',
        '> Vous n\'êtes pas autorisé à exécuter cette commande',
      ));
    }

    const rows = listRoleLimits(bot, interaction.guild.id);

    let currentPage = 1;
    await interaction.reply(buildPage(rows, interaction.guild, currentPage));

    if (rows.length <= ITEMS_PER_PAGE) return;

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ time: 300000 });

    collector.on('collect', async (component) => {
      if (component.user.id !== interaction.user.id) return;
      if (!component.isButton()) return;
      if (component.customId !== 'show-limite:prev' && component.customId !== 'show-limite:next') return;

      if (component.customId === 'show-limite:prev') currentPage -= 1;
      if (component.customId === 'show-limite:next') currentPage += 1;

      await component.update(buildPage(rows, interaction.guild, currentPage));
    });
  },
};
