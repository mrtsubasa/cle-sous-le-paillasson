const {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const { refreshPanel } = require("../core/panel-actions");
const { buildErrorContainer } = require("../core/response-utils");

function buildVolumeContainer(title, message, accentColor = 0x5865f2) {
  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# **${title}**`),
      new TextDisplayBuilder().setContent(message),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Change le volume de la musique.")
    .addIntegerOption((option) =>
      option
        .setName("valeur")
        .setDescription("Volume en pourcentage (0 à 100)")
        .setMinValue(0)
        .setMaxValue(100)
        .setRequired(true),
    ),
  async execute(interaction, ctx) {
    const voiceId = interaction.member?.voice?.channel?.id || null;
    const player = ctx.pool.getPlayer(interaction.guildId, voiceId);
    if (!player) {
      return interaction.reply(
        buildErrorContainer(
          "> Aucun lecteur actif",
          "> Aucune musique n'est en cours dans ce salon.",
          "> Lance une musique avec `/play` avant de changer le volume.",
        ),
      );
    }

    const volume = interaction.options.getInteger("valeur", true);

    try {
      await player.setVolume(volume);
      await interaction.reply(
        buildVolumeContainer(
          "> Volume modifié",
          `> Le volume a été réglé sur **${volume}%**.`,
        ),
      );
      await refreshPanel(ctx.client, ctx.pool, interaction.guildId);
    } catch (error) {
      console.error("Impossible de changer le volume:", error);
      await interaction.reply(
        buildErrorContainer(
          "> Erreur",
          error?.message || "> Impossible de changer le volume pour le moment.",
          "> Réessaie dans un instant.",
          0xed4245,
        ),
      );
    }
  },
};
