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
const { toggleLoop } = require("../core/music");

function buildLoopContainer(player, mode) {
  const labels = {
    off: {
      title: "Loop désactivé",
      description: "La file continue normalement",
      status: "Aucun morceau ne sera rejoué",
      hint: "Relance la commande pour activer le mode loop du morceau",
    },
    track: {
      title: "Loop morceau",
      description: "Le morceau en cours sera rejoué en boucle",
      status: "Le même titre revient à la fin",
      hint: "Relance la commande pour passer au mode loop de la file",
    },
    queue: {
      title: "Loop file",
      description: "Toute la file sera rejouée quand elle sera terminée",
      status: "Tous les morceaux reviennent au début",
      hint: "Relance la commande pour désactiver le loop",
    },
  };

  const info = labels[mode] || labels.off;
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
      new TextDisplayBuilder().setContent(`# **${info.title}**`),
      new TextDisplayBuilder().setContent(info.description),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
    ;

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
      new TextDisplayBuilder().setContent(`**État**: ${info.status}`),
      new TextDisplayBuilder().setContent(`**Demandeur**: ${requester}`),
      new TextDisplayBuilder().setContent(`**Bot**: ${botLabel}`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(info.hint),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

function buildNoPlayerContainer() {
  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# **Aucun lecteur actif**"),
      new TextDisplayBuilder().setContent("> Aucune musique n'est en cours dans ce salon."),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("> Lance une musique avec `/play` avant de changer le mode loop."),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("loop")
    .setDescription("Change le mode loop."),
  async execute(interaction, ctx) {
    const player = ctx.pool.getPlayer(interaction.guildId, interaction.member?.voice?.channel?.id || null);
    if (!player) return interaction.reply(buildNoPlayerContainer());

    const mode = await toggleLoop(player);
    await interaction.reply(buildLoopContainer(player, mode));
    await refreshPanel(ctx.client, ctx.pool, interaction.guildId);
  },
};
