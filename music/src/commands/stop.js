const {
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SlashCommandBuilder,
  ThumbnailBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const { refreshPanel } = require("../core/panel-actions");
const { buildErrorContainer } = require("../core/response-utils");

function buildStopContainer(player) {
  const track = player?.data?.get("currentTrack") || player?.queue?.current || player?.current || null;
  const title = track?.title || "Titre inconnu";
  const author = track?.author || "Artiste inconnu";
  const requester = player?.data?.get("nowPlayingRequester")
    || track?.requester?.tag
    || track?.requester?.username
    || "Inconnu";
  const source = `${track?.sourceName || "music"}`.toLowerCase();
  const botLabel = player?.data?.get("nowPlayingBot") || "Musique";

  const container = new ContainerBuilder()
    .setAccentColor(0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# **Lecture stoppée**"),
      new TextDisplayBuilder().setContent("> Le salon vocal a été quitté et la lecture est arrêtée."),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1));

  const section = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`**Dernier titre**: ${title}`),
    new TextDisplayBuilder().setContent(`**Artiste**: ${author}`),
    new TextDisplayBuilder().setContent(`**Source**: ${source}`),
  );

  if (track?.thumbnail) {
    section.setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(track.thumbnail)
        .setDescription(title),
    );
  }

  container
    .addSectionComponents(section)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Demandeur**: ${requester}`),
      new TextDisplayBuilder().setContent(`**Bot**: ${botLabel}`),
      new TextDisplayBuilder().setContent("> Relance `/play` pour recommencer une lecture."),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Arrête la musique et quitte le salon."),
  async execute(interaction, ctx) {
    const voiceId = interaction.member?.voice?.channel?.id || null;
    const player = ctx.pool.getPlayer(interaction.guildId, voiceId);
    if (!player) {
      return interaction.reply(
        buildErrorContainer(
          "> Aucun lecteur actif",
          "> Aucune musique n'est en cours dans ce salon.",
          "> Lance une musique avec `/play` avant d'utiliser `/stop`.",
        ),
      );
    }

    await player.destroy();
    ctx.pool.releaseGuild(interaction.guildId, voiceId);
    await interaction.reply(buildStopContainer(player));
    await refreshPanel(ctx.client, ctx.pool, interaction.guildId);
  },
};
