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

function formatDuration(ms) {
  if (!ms || Number.isNaN(ms)) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function buildPauseContainer(player) {
  const track = player?.data?.get("currentTrack") || player?.queue?.current || player?.current || null;
  const title = track?.title || "Titre inconnu";
  const author = track?.author || "Artiste inconnu";
  const requester = player?.data?.get("nowPlayingRequester")
    || track?.requester?.tag
    || track?.requester?.username
    || "Inconnu";
  const source = `${track?.sourceName || "music"}`.toLowerCase();
  const duration = track?.length || 0;
  const position = player?.position || track?.position || 0;
  const progress = duration > 0 ? Math.min(100, Math.max(0, Math.round((position / duration) * 100))) : 0;
  const queueSize = Number(player?.queue?.size || player?.queue?.length || 0) || 0;
  const botLabel = player?.data?.get("nowPlayingBot") || "Musique";

  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# **Lecture en pause**"),
      new TextDisplayBuilder().setContent("> La musique est mise en pause."),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1));

  const section = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`**Titre**: ${title}`),
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
      new TextDisplayBuilder().setContent(`**Progression**: ${progress}% (${formatDuration(position)} / ${formatDuration(duration)})`),
      new TextDisplayBuilder().setContent(`**File**: ${queueSize} son${queueSize > 1 ? "s" : ""} en attente`),
      new TextDisplayBuilder().setContent(`**Bot**: ${botLabel}`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Demandeur**: ${requester}`),
      new TextDisplayBuilder().setContent("> Tu peux relancer la lecture avec `/resume`."),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pause")
    .setDescription("Met la musique en pause."),
  async execute(interaction, ctx) {
    const player = ctx.pool.getPlayer(interaction.guildId, interaction.member?.voice?.channel?.id || null);
    if (!player) {
      return interaction.reply(
        buildErrorContainer(
          "> Aucun lecteur actif",
          "> Aucune musique n'est en cours dans ce salon.",
          "> Lance une musique avec `/play` pour commencer une lecture.",
        ),
      );
    }

    await player.pause(true);
    await interaction.reply({ ...buildPauseContainer(player), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    await refreshPanel(ctx.client, ctx.pool, interaction.guildId);
  },
};
