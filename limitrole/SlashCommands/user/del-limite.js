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

async function sendLog(bot, interaction, role, oldLimit) {
  const logChannelId = getConfiguredLogChannelId(bot, interaction.guild.id, 'del_limite_logs');
  const logChannel = logChannelId ? interaction.guild?.channels.cache.get(logChannelId) : null;
  if (!logChannel?.isTextBased?.()) return;

  const unixTimestamp = Math.floor(Date.now() / 1000);
  const thumb = new Discord.ThumbnailBuilder({
    media: { url: interaction.user.displayAvatarURL({ size: 64 }) },
  });

  const section = new Discord.SectionBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `> ↳ User : <@${interaction.user.id}> **${interaction.user.username}** (\`${interaction.user.id}\`)\n`
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

module.exports = {
  name: 'del-limite',
  description: 'Supprime la limite de rôles pour un rôle spécifique',
  dm_permission: false,
  perm: 'owner',
  options: [
    {
      name: 'role',
      type: 8,
      description: 'Le rôle pour lequel supprimer la limite',
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

    const role = interaction.options.getRole('role', true);
    const oldLimit = getRoleLimitRecord(bot, interaction.guild.id, role.id)?.limit_value ?? null;
    removeRoleLimit(bot, interaction.guild.id, role.id);

    await interaction.reply(buildResponse(
      '# Limite de Rôle Supprimée',
      `> La limite de rôles pour **\`${role.name}\`** a été supprimée`,
    ));

    await sendLog(bot, interaction, role, oldLimit);
  },
};
