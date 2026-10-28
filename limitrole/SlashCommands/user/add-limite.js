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

async function sendLog(bot, interaction, role, oldLimit, limit) {
  const logChannelId = getConfiguredLogChannelId(bot, interaction.guild.id, 'role_limit_logs');
  const logChannel = logChannelId ? interaction.guild?.channels.cache.get(logChannelId) : null;
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
        `> ↳ User : <@${interaction.user.id}> **${interaction.user.username}** (\`${interaction.user.id}\`)\n`
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

module.exports = {
  name: 'add-limite',
  description: 'Définit une limite de rôles pour un rôle spécifique',
  dm_permission: false,
  perm: 'owner',
  options: [
    {
      name: 'role',
      type: 8,
      description: 'Le rôle pour lequel définir une limite',
      required: true,
    },
    {
      name: 'limit',
      type: 4,
      description: 'La limite à définir pour le rôle',
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
    const limit = interaction.options.getInteger('limit', true);

    if (limit < 0) {
      return interaction.reply(buildResponse(
        '# Limite invalide',
        '> La limite doit être supérieure ou égale à `0`',
      ));
    }

    const oldLimit = getRoleLimit(bot, interaction.guild.id, role.id);
    await setRoleLimit(bot, interaction.guild.id, role.id, limit, interaction.user.id);

    await interaction.reply(buildResponse(
      '# Limite de Rôle Définie',
      `> La limite de rôles pour **\`${role.name}\`** a été définie à **\`${limit}\`**`,
    ));

    await sendLog(bot, interaction, role, oldLimit, limit);
  },
};
