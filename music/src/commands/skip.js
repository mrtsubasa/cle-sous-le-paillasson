const {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const { refreshPanel } = require("../core/panel-actions");
const { buildErrorContainer } = require("../core/response-utils");

function buildSkipContainer(hasNext) {
  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(hasNext ? "# **Morceau suivant**" : "# **Aucun morceau suivant**"),
      new TextDisplayBuilder().setContent(hasNext ? "> La lecture passe au prochain morceau." : "> Il n'y a pas d'autre morceau dans la file."),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(hasNext ? "> Le lecteur continue normalement." : "> Ajoute un morceau avec `/play` pour continuer."),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  buildSkipContainer,
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Passe au morceau suivant."),
  async execute(interaction, ctx) {
    const player = ctx.pool.getPlayer(interaction.guildId, interaction.member?.voice?.channel?.id || null);
    if (!player) {
      return interaction.reply(
        buildErrorContainer(
          "> Aucun lecteur actif",
          "> Aucune musique n'est en cours dans ce salon.",
          "> Lance une musique avec `/play` pour créer une lecture.",
        ),
      );
    }

    const hasNext = Boolean(player?.queue?.size || player?.queue?.length);
    if (!hasNext) {
      return interaction.reply({
        ...buildSkipContainer(false),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    await player.skip();
    await interaction.reply({
      ...buildSkipContainer(hasNext),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    await refreshPanel(ctx.client, ctx.pool, interaction.guildId);
  },
};
