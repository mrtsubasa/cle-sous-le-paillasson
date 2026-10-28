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

function buildResumeContainer(player) {
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
    .setAccentColor(0x57f287)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# **Lecture reprise**"),
      new TextDisplayBuilder().setContent("> La musique a été relancée."),
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
      new TextDisplayBuilder().setContent(`**Demandeur**: ${requester}`),
      new TextDisplayBuilder().setContent(`**Bot**: ${botLabel}`),
      new TextDisplayBuilder().setContent("> Tu peux aussi remettre en pause avec `/pause`."),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

function buildAlreadyPlayingContainer(player) {
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
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# **Déjà en lecture**"),
      new TextDisplayBuilder().setContent("> La musique joue déjà, rien à reprendre."),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Titre**: ${title}`),
      new TextDisplayBuilder().setContent(`**Artiste**: ${author}`),
      new TextDisplayBuilder().setContent(`**Source**: ${source}`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Demandeur**: ${requester}`),
      new TextDisplayBuilder().setContent(`**Bot**: ${botLabel}`),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Reprend la musique."),
  async execute(interaction, ctx) {
    const player = ctx.pool.getPlayer(interaction.guildId, interaction.member?.voice?.channel?.id || null);
    if (!player) {
      return interaction.reply(
        buildErrorContainer(
          "> Aucun lecteur actif",
          "> Aucune musique n'est en cours dans ce salon.",
          "> Lance une musique avec `/play` ou clique sur **Obtenir un bot** pour démarrer.",
        ),
      );
    }

    if (!player.paused) {
      return interaction.reply(buildAlreadyPlayingContainer(player));
    }

    await player.pause(false);
    await interaction.reply(buildResumeContainer(player));
    await refreshPanel(ctx.client, ctx.pool, interaction.guildId);
  },
};
