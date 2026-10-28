const { MessageFlags, SlashCommandBuilder } = require("discord.js");
const {
  buildPlaylistContainer,
  getPlaylistChoices,
  getUserPlaylists,
  loadPlaylists,
  normalizeName,
  queuePlaylistEntries,
} = require("../core/playlist-utils");
const {
  buildNowPlayingPayload,
  buildQueueAddedPayload,
  fetchArtworkBuffer,
} = require("./play");
const { ensurePlayer } = require("../core/music");
const { refreshPanel } = require("../core/panel-actions");
const { buildErrorContainer } = require("../core/response-utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("playlist-play")
    .setDescription("Joue une playlist.")
    .addStringOption((option) =>
      option
        .setName("nom")
        .setDescription("Nom de la playlist")
        .setAutocomplete(true)
        .setRequired(true),
    ),
  autocomplete(interaction, playlists) {
    const focused = interaction.options.getFocused(true);
    if (focused?.name !== "nom") return [];
    return getPlaylistChoices(playlists, interaction.guildId, interaction.user.id, focused.value);
  },
  async execute(interaction, ctx) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const playlistName = normalizeName(interaction.options.getString("nom", true));
    const playlists = await loadPlaylists();

    playlists[guildId] ||= {};
    playlists[guildId][userId] ||= {};

    const playlist = getUserPlaylists(playlists, guildId, userId)[playlistName];
    if (!playlist) {
      return interaction.reply(buildPlaylistContainer("> Playlist introuvable", `> La playlist **${playlistName}** n'existe pas.`));
    }

    if (!playlist.tracks.length) {
      return interaction.reply(buildPlaylistContainer("> Playlist vide", `> La playlist **${playlistName}** ne contient aucun morceau.`));
    }

    const playerBefore = ctx.pool.getPlayer(interaction.guildId, interaction.member?.voice?.channel?.id || null);
    const wasPlayingBefore = Boolean(playerBefore?.playing || playerBefore?.paused);
    await interaction.deferReply();

    try {
      const { bot, player } = await ensurePlayer(ctx.pool, interaction);
      const { queuedTracks } = await queuePlaylistEntries(player, bot, interaction.user, playlist.tracks);
      const firstTrack = queuedTracks[0] || null;

      if (!firstTrack) {
        await interaction.editReply(
          buildErrorContainer(
            "> Aucun morceau trouvé",
            "> Aucun morceau de la playlist n'a pu être résolu.",
            "> Vérifie que les liens de la playlist sont valides.",
          ),
        );
        return;
      }

      const playlistResult = {
        type: "PLAYLIST",
        playlistName,
        tracks: queuedTracks,
      };

      if (wasPlayingBefore) {
        await interaction.editReply(
          buildQueueAddedPayload({
            requesterTag: interaction.user.tag,
            botLabel: bot?.label || null,
            player,
            track: firstTrack,
            query: firstTrack.uri || firstTrack.realUri || firstTrack.title || playlistName,
            result: playlistResult,
          }),
        );
      } else {
        const artworkUrl = firstTrack.thumbnail || player.data.get("currentArtwork") || null;
        const artworkBuffer = artworkUrl ? await fetchArtworkBuffer(artworkUrl) : null;
        const payload = await buildNowPlayingPayload({
          requesterTag: interaction.user.tag,
          botLabel: bot?.label || null,
          player,
          track: firstTrack,
          query: firstTrack.uri || firstTrack.realUri || firstTrack.title || playlistName,
          result: playlistResult,
          artworkUrl,
          artworkBuffer,
        });

        const message = await interaction.editReply(payload);
        if (message?.id && player) {
          player.data.set("nowPlayingMessageId", message.id);
          player.data.set("nowPlayingChannelId", interaction.channelId);
          player.data.set("nowPlayingRequester", interaction.user.tag);
          player.data.set("nowPlayingBot", bot?.label || null);
          player.data.set("currentTrack", firstTrack);
          player.data.set("currentArtwork", artworkUrl || player.data.get("currentArtwork") || null);
          player.data.set("lastArtwork", artworkUrl || player.data.get("lastArtwork") || null);
          if (artworkBuffer) {
            player.data.set("currentArtworkBuffer", artworkBuffer);
            player.data.set("lastArtworkBuffer", artworkBuffer);
          }
        }
      }

      await refreshPanel(ctx.client, ctx.pool, interaction.guildId);
      return;
    } catch (error) {
      console.error("Impossible de lancer la playlist:", error);
      await interaction.editReply(
        buildErrorContainer(
          "> Erreur",
          error.message || "> Impossible de lancer la playlist pour le moment.",
          "> Réessaie dans un instant.",
        ),
      );
    }
  },
};
