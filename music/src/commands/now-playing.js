const { MessageFlags, SlashCommandBuilder } = require("discord.js");
const { buildNowPlayingPayload } = require("./play");
const { buildEphemeralTextContainer } = require("../core/response-utils");

function clearNowPlayingPreviewTicker(player) {
  const interval = player?.data?.get("nowPlayingPreviewTicker");
  if (interval) clearInterval(interval);
  player?.data?.delete("nowPlayingPreviewTicker");
}

function isUnknownMessageError(error) {
  return error?.code === 10008 || error?.status === 404 || /Unknown Message/i.test(error?.message || "");
}

function stopNowPlayingPreview(player) {
  clearNowPlayingPreviewTicker(player);
}

function buildCrashContainer(message) {
  return buildEphemeralTextContainer("Erreur", message);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("now-playing")
    .setDescription("Affiche la musique en cours de lecture."),
  async execute(interaction, ctx) {
    const voiceId = interaction.member?.voice?.channel?.id || null;
    const player = ctx.pool.getPlayer(interaction.guildId, voiceId);
    if (!player) {
      await interaction.reply(buildEphemeralTextContainer("> Aucun lecteur actif", "> Aucun lecteur actif."));
      return;
    }

    const track = player.data.get("currentTrack") || player.queue?.current || player.current || null;
    if (!track) {
      await interaction.reply(buildEphemeralTextContainer("> Aucun lecteur actif", "> Aucun lecteur actif."));
      return;
    }

    clearNowPlayingPreviewTicker(player);

    const render = async () => buildNowPlayingPayload({
      requesterTag: player.data.get("nowPlayingRequester") || interaction.user.tag,
      botLabel: player.data.get("nowPlayingBot") || null,
      player,
      track,
      artworkUrl: player.data.get("currentArtwork") || player.data.get("lastArtwork") || track?.thumbnail || null,
      artworkBuffer: player.data.get("currentArtworkBuffer") || player.data.get("lastArtworkBuffer") || null,
      query: track?.uri || track?.realUri || "",
      result: { type: "TRACK", tracks: [track] },
      hideControls: true,
    });

    try {
      await interaction.reply({
        ...await render(),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error("Impossible d'afficher /now-playing:", error);
      clearNowPlayingPreviewTicker(player);
      await interaction.reply(buildCrashContainer("> Impossible d'afficher la carte maintenant. Réessaie dans un instant."));
      return;
    }

    const replyMessage = await interaction.fetchReply().catch(() => null);
    if (!replyMessage) {
      clearNowPlayingPreviewTicker(player);
      return;
    }

    const interval = setInterval(async () => {
      try {
        const currentTrack = player.data.get("currentTrack") || player.queue?.current || player.current || null;
        if (!currentTrack) {
          stopNowPlayingPreview(player);
          return;
        }

        await replyMessage.edit(await buildNowPlayingPayload({
          requesterTag: player.data.get("nowPlayingRequester") || interaction.user.tag,
          botLabel: player.data.get("nowPlayingBot") || null,
          player,
          track: currentTrack,
          artworkUrl: player.data.get("currentArtwork") || player.data.get("lastArtwork") || currentTrack?.thumbnail || null,
          artworkBuffer: player.data.get("currentArtworkBuffer") || player.data.get("lastArtworkBuffer") || null,
          query: currentTrack?.uri || currentTrack?.realUri || "",
          result: { type: "TRACK", tracks: [currentTrack] },
          hideControls: true,
        }));
      } catch (error) {
        if (isUnknownMessageError(error)) {
          stopNowPlayingPreview(player);
          return;
        }

        console.error("Impossible de rafraîchir /now-playing:", error);
        stopNowPlayingPreview(player);
      }
    }, 2000);

    player.data.set("nowPlayingPreviewTicker", interval);
  },
};
