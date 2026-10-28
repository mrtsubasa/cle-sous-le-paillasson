const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SlashCommandBuilder,
  ThumbnailBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const { createCanvas, loadImage } = require("canvas");
const { detectInputSource, queueTrack } = require("../core/music");
const { refreshPanel } = require("../core/panel-actions");
const { buildErrorContainer, buildTextContainer } = require("../core/response-utils");

function formatDuration(ms) {
  if (!ms || Number.isNaN(ms)) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours > 0) parts.push(String(hours).padStart(2, "0"));
  parts.push(String(minutes).padStart(2, "0"));
  parts.push(String(seconds).padStart(2, "0"));
  return parts.join(":");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildControlRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("nowplaying:pause")
      .setEmoji("⏯️")
      .setLabel("Pause")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("nowplaying:skip")
      .setEmoji("⏭️")
      .setLabel("Skip")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("nowplaying:stop")
      .setEmoji("⏹️")
      .setLabel("Stop")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("nowplaying:queue")
      .setEmoji("📜")
      .setLabel("Queue")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

function detectSourceLabel(query, track, player) {
  const source = `${track?.sourceName || ""}`.toLowerCase();
  const input = `${query || ""}`.toLowerCase();
  const forcedSource = `${player?.data?.get("requestedSource") || ""}`.toLowerCase();
  const inputSource = detectInputSource(query);

  if (forcedSource === "spotify" || inputSource === "spotify") {
    return { label: "spotify", canvasColor: "#1DB954", accentColor: 0x1db954 };
  }

  if (forcedSource === "youtube" || inputSource === "youtube" || input.includes("youtube.com") || input.includes("youtu.be") || source.includes("youtube")) {
    return { label: "youtube", canvasColor: "#FF0000", accentColor: 0xff0000 };
  }

  if (forcedSource === "soundcloud" || inputSource === "soundcloud" || input.includes("soundcloud.com") || source.includes("soundcloud")) {
    return { label: "soundcloud", canvasColor: "#FF5500", accentColor: 0xff5500 };
  }
  if (forcedSource === "deezer" || inputSource === "deezer" || input.includes("deezer.com") || source.includes("deezer")) {
    return { label: "deezer", canvasColor: "#7A2CFF", accentColor: 0x7a2cff };
  }

  return { label: track?.sourceName || "music", canvasColor: "#5865F2", accentColor: 0x5865f2 };
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawText(ctx, text, x, y, maxWidth, lineHeight, options = {}) {
  const words = `${text}`.split(/\s+/);
  let line = "";
  let offsetY = 0;
  const lines = [];

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const testWidth = ctx.measureText(testLine).width;
    if (testWidth > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }

  if (line) lines.push(line);

  for (const currentLine of lines.slice(0, options.maxLines || lines.length)) {
    ctx.fillText(currentLine, x, y + offsetY);
    offsetY += lineHeight;
  }
}

async function loadArtwork(url) {
  if (!url) return null;
  try {
    return await loadImage(url);
  } catch {
    return null;
  }
}

async function fetchArtworkBuffer(url) {
  if (!url) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

async function renderArtworkImage({ requesterTag, botLabel, player, track, query, result, artworkUrl, artworkBuffer }) {
  const source = detectSourceLabel(query, track, player);
  const canvas = createCanvas(1024, 360);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, "#0c0d14");
  bg.addColorStop(1, "#141625");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#171a2a";
  roundRect(ctx, 18, 18, 988, 324, 26);
  ctx.fill();

  const artX = 38;
  const artY = 38;
  const artSize = 248;
  const artwork = await loadArtwork(artworkBuffer || artworkUrl || track?.thumbnail || null);

  if (artwork) {
    ctx.save();
    roundRect(ctx, artX, artY, artSize, artSize, 22);
    ctx.clip();
    const scale = Math.max(artSize / artwork.width, artSize / artwork.height);
    const w = artwork.width * scale;
    const h = artwork.height * scale;
    const dx = artX + (artSize - w) / 2;
    const dy = artY + (artSize - h) / 2;
    ctx.drawImage(artwork, dx, dy, w, h);
    ctx.restore();
  } else {
    const fallback = ctx.createLinearGradient(artX, artY, artX + artSize, artY + artSize);
    fallback.addColorStop(0, "#1db954");
    fallback.addColorStop(1, "#5865f2");
    ctx.fillStyle = fallback;
    roundRect(ctx, artX, artY, artSize, artSize, 22);
    ctx.fill();
  }

  const rightX = 308;
  const panelW = 654;
  const titleBarH = 54;
  const artistBarH = 54;
  const barY = 52;

  ctx.fillStyle = "#21253b";
  roundRect(ctx, rightX, barY, panelW, titleBarH, 18);
  ctx.fill();
  roundRect(ctx, rightX, barY + 72, panelW, artistBarH, 18);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 28px sans-serif";
  ctx.textBaseline = "middle";
  drawText(
    ctx,
    result?.type === "PLAYLIST" ? "Playlist ajoutée" : (track?.title || "Titre inconnu"),
    rightX + 24,
    barY + titleBarH / 2,
    panelW - 48,
    34,
    { maxLines: 1 },
  );

  ctx.fillStyle = "#d1d5db";
  ctx.font = "500 22px sans-serif";
  drawText(
    ctx,
    result?.type === "PLAYLIST" ? (result.playlistName || "Playlist") : (track?.author || "Artiste inconnu"),
    rightX + 24,
    barY + 72 + artistBarH / 2,
    panelW - 48,
    28,
    { maxLines: 1 },
  );

  const currentPosition = player?.position || track?.position || 0;
  const duration = track?.length || 0;
  const progressX = rightX;
  const progressY = 184;
  const progressW = panelW;

  ctx.fillStyle = "#24283d";
  roundRect(ctx, progressX, progressY, progressW, 14, 7);
  ctx.fill();

  const ratio = duration > 0 ? clamp(currentPosition / duration, 0, 1) : 0;
  const fillW = Math.max(16, Math.round(progressW * ratio));
  ctx.fillStyle = source.canvasColor;
  roundRect(ctx, progressX, progressY, fillW, 14, 7);
  ctx.fill();

  ctx.fillStyle = "#aeb4c8";
  ctx.font = "500 18px sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(formatDuration(currentPosition), progressX, progressY + 24);
  const totalWidth = ctx.measureText(formatDuration(duration)).width;
  ctx.fillText(formatDuration(duration), progressX + progressW - totalWidth, progressY + 24);

  const pillLabel = source.label;
  const pillW = Math.max(92, ctx.measureText(pillLabel).width + 30);
  const pillY = 250;
  ctx.fillStyle = "#2b2f45";
  roundRect(ctx, rightX, pillY, pillW, 40, 18);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 19px sans-serif";
  ctx.textBaseline = "middle";
  const pillTextW = ctx.measureText(pillLabel).width;
  ctx.fillText(pillLabel, rightX + (pillW - pillTextW) / 2, pillY + 20);

  ctx.fillStyle = "#ffffff";
  ctx.font = "500 18px sans-serif";
  const requesterLabel = requesterTag || "Inconnu";
  const requesterWidth = ctx.measureText(requesterLabel).width;
  ctx.fillText(requesterLabel, rightX + panelW - requesterWidth, pillY + 20);

  ctx.fillStyle = "#95a0b8";
  ctx.font = "500 16px sans-serif";
  ctx.fillText(
    result?.type === "PLAYLIST"
      ? `Ajout de ${result.tracks.length} morceaux par ${botLabel || "le bot"}`
      : `Ajouté à la file par ${botLabel || "le bot"}`,
    rightX,
    308,
  );

  return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "now-playing.png" });
}

function buildNowPlayingPayload(options) {
  return renderArtworkImage(options).then((imageAttachment) => {
    const source = detectSourceLabel(options.query, options.track, options.player);
    const ended = Boolean(options.ended);
    const title = options.result?.type === "PLAYLIST"
      ? "Playlist ajoutée"
      : (ended ? "Lecture terminée" : (options.track?.title || "Titre inconnu"));
    const subtitle = options.result?.type === "PLAYLIST"
      ? (options.result.playlistName || "Playlist")
      : (options.track?.author || "Artiste inconnu");
    const duration = options.track?.length || 0;
    const currentPosition = ended ? duration : (options.player?.position || options.track?.position || 0);
    const isActive = !ended && Boolean(options.track && (options.player?.playing || options.player?.paused || options.player?.queue?.current));

    if (ended) {
      const container = new ContainerBuilder()
        .setAccentColor(0x5865f2)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent("# **Lecture terminée**"),
          new TextDisplayBuilder().setContent("> Aucun morceau n'est en cours."),
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent("> Les boutons sont désactivés tant qu'il n'y a plus de musique."),
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
        .addActionRowComponents(buildControlRow(true));

      return {
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      };
    }

    const container = new ContainerBuilder()
      .setAccentColor(source.accentColor)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`# **${title}**`),
        new TextDisplayBuilder().setContent(subtitle),
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1));

    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL("attachment://now-playing.png")
          .setDescription(`${formatDuration(currentPosition)} / ${formatDuration(duration)}`),
      ),
    );

    container
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**Source**: ${source.label}`),
        new TextDisplayBuilder().setContent(`**Demandeur**: ${options.requesterTag || "Inconnu"}`),
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
    if (!options.hideControls) {
      container.addActionRowComponents(buildControlRow(!isActive));
    }

    return {
      files: [imageAttachment],
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    };
  });
}

function buildQueueAddedPayload({ track, result, requesterTag, botLabel, player, query }) {
  const source = detectSourceLabel(query, track, player);
  const currentTitle = track?.title || "Titre inconnu";
  const currentAuthor = track?.author || "Artiste inconnu";
  const currentThumbnail = track?.thumbnail || null;
  const addedCount = result?.type === "PLAYLIST" ? result.tracks.length : 1;

  const container = new ContainerBuilder().setAccentColor(source.accentColor);

  const section = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent("# **Ajout à la queue**"),
    new TextDisplayBuilder().setContent(`**${currentTitle}** - ${currentAuthor}`),
    new TextDisplayBuilder().setContent(`Source: **${source.label}** | Ajouté par: **${requesterTag || "Inconnu"}** | Bot: **${botLabel || "Musique"}**`),
  );

  if (currentThumbnail) {
    section.setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(currentThumbnail)
        .setDescription(currentTitle),
    );
  }

  container.addSectionComponents(section);
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1));

  if (result?.type === "PLAYLIST") {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`> **${addedCount} morceaux** ont été ajoutés à la file.`),
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("> Le morceau a été ajouté à la file."),
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function buildInactivePlaybackPayload() {
  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# **Lecture terminée**"),
      new TextDisplayBuilder().setContent("> Aucun morceau n'est en cours."),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("> Les boutons sont désactivés tant qu'il n'y a plus de musique."),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
    .addActionRowComponents(buildControlRow(true));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function buildQueueContainer(player, page = 0) {
  const current = player?.current || player?.queue?.current || null;
  const queueItems = Array.isArray(player?.queue) ? player.queue : [];
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(queueItems.length / pageSize));
  const safePage = Math.min(Math.max(Number(page) || 0, 0), totalPages - 1);
  const start = safePage * pageSize;
  const pageItems = queueItems.slice(start, start + pageSize);
  const currentRequester = current?.requester?.tag || current?.requester?.username || "Inconnu";
  const currentThumbnail = current?.thumbnail || null;

  const container = new ContainerBuilder().setAccentColor(0x5865f2);
  const currentSection = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent("# **File de lecture**"),
    new TextDisplayBuilder().setContent(
      current ? `En cours: **${current.title}**` : "> Aucun morceau en cours.",
    ),
    new TextDisplayBuilder().setContent(
      current ? `**Demandé par**: ${currentRequester}` : "> Lance une musique avec `/play` pour remplir la file.",
    ),
  );

  if (currentThumbnail) {
    currentSection.setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(currentThumbnail)
        .setDescription(current?.title || "> Morceau en cours"),
    );
  }

  container.addSectionComponents(currentSection);
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1));

  if (pageItems.length) {
    const lines = pageItems.map((track, index) => {
      const requester = track?.requester?.tag || track?.requester?.username || "Inconnu";
      return `${String(start + index + 1).padStart(2, "0")}. ${track.title} - ${requester}`;
    }).join("\n");

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Prochaines pistes** (${safePage + 1}/${totalPages})`),
      new TextDisplayBuilder().setContent(lines),
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("> La file est vide."),
    );
  }

  const components = [container];
  if (totalPages > 1) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`queuepage:${Math.max(safePage - 1, 0)}`)
          .setLabel("Prev")
          .setEmoji("⬅️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage === 0),
        new ButtonBuilder()
          .setCustomId(`queuepage:${Math.min(safePage + 1, totalPages - 1)}`)
          .setLabel("Next")
          .setEmoji("➡️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage >= totalPages - 1),
      ),
    );
  }

  return {
    components,
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Joue une musique via Lavalink.")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Lien ou recherche YouTube / Spotify")
        .setRequired(true),
    ),
  buildNowPlayingPayload,
  buildQueueContainer,
  buildQueueAddedPayload,
  buildInactivePlaybackPayload,
  fetchArtworkBuffer,
  async execute(interaction, ctx) {
    const query = interaction.options.getString("query", true);
    const playerBefore = ctx.pool.getPlayer(interaction.guildId, interaction.member?.voice?.channel?.id || null);
    const wasPlayingBefore = Boolean(playerBefore?.playing || playerBefore?.paused);
    await interaction.deferReply({
      ...(wasPlayingBefore ? { flags: MessageFlags.Ephemeral } : {}),
    });

    try {
      const { bot, player, result } = await queueTrack(ctx.pool, interaction, query);

      if (!result) {
        return interaction.editReply(
          buildErrorContainer(
            "> Aucun résultat trouvé",
            "> Aucun résultat trouvé pour cette recherche.",
            "> Vérifie ton lien ou essaie une autre recherche.",
          ),
        );
      }

      const track = result.tracks[0] || null;
      if (wasPlayingBefore) {
        await interaction.editReply(
          buildQueueAddedPayload({
            requesterTag: interaction.user.tag,
            botLabel: bot?.label || null,
            player,
            track,
            query,
            result,
          }),
        );
      } else {
        const payload = await buildNowPlayingPayload({
          requesterTag: interaction.user.tag,
          botLabel: bot?.label || null,
          player,
          track,
          query,
          result,
        });

        let message;
        try {
          message = await interaction.editReply(payload);
        } catch (error) {
          console.error("Carte now playing invalide, fallback texte:", error);
          message = await interaction.editReply(
            buildTextContainer(
              "> Lecture lancée",
              `> **${track?.title || "Titre inconnu"}** (${detectSourceLabel(query, track).label})`,
            ),
          );
        }

      if (message?.id && player) {
        player.data.set("nowPlayingMessageId", message.id);
        player.data.set("nowPlayingChannelId", interaction.channelId);
        player.data.set("nowPlayingRequester", interaction.user.tag);
        player.data.set("nowPlayingBot", bot?.label || null);
        player.data.set("currentArtwork", track?.thumbnail || player.data.get("currentArtwork") || null);
        player.data.set("lastArtwork", track?.thumbnail || player.data.get("lastArtwork") || null);
        const artworkBuffer = await fetchArtworkBuffer(track?.thumbnail || null);
        if (artworkBuffer) {
          player.data.set("currentArtworkBuffer", artworkBuffer);
          player.data.set("lastArtworkBuffer", artworkBuffer);
        }
      }
      }

      await refreshPanel(ctx.client, ctx.pool, interaction.guildId);
    } catch (error) {
      await interaction.editReply(
        buildErrorContainer(
          "> Erreur",
          error.message || "> Impossible de lancer la musique.",
          "> Réessaie dans un instant.",
        ),
      );
    }
  },
};
