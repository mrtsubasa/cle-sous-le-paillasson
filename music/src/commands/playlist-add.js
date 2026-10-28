const { SlashCommandBuilder } = require("discord.js");
const {
  buildPlaylistContainer,
  loadPlaylists,
  normalizeName,
  normalizePlaylistRecord,
  resolveTrackSummary,
  savePlaylists,
} = require("../core/playlist-utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("playlist-add")
    .setDescription("Ajoute un morceau à une playlist.")
    .addStringOption((option) =>
      option
        .setName("nom")
        .setDescription("Nom de la playlist")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Lien ou recherche du morceau")
        .setRequired(true),
    ),
  async execute(interaction, ctx) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const playlistName = normalizeName(interaction.options.getString("nom", true));
    const query = normalizeName(interaction.options.getString("query", true));
    const playlists = await loadPlaylists();

    playlists[guildId] ||= {};
    playlists[guildId][userId] ||= {};

    const playlist = playlists[guildId][userId][playlistName];
    if (!playlist) {
      return interaction.reply(buildPlaylistContainer("> Playlist introuvable", `> La playlist **${playlistName}** n'existe pas.`));
    }

    const summary = await resolveTrackSummary(
      ctx.pool,
      query,
      interaction.user,
      guildId,
      interaction.member?.voice?.channel?.id || null,
    );
    const entry = {
      query,
      title: summary.title || query,
      source: summary.source || "unknown",
      addedAt: Date.now(),
    };

    playlist.tracks.push(entry);
    playlists[guildId][userId][playlistName] = normalizePlaylistRecord(playlist, playlistName);
    await savePlaylists(playlists);

    return interaction.reply(
      buildPlaylistContainer(
        "> Morceau ajouté",
        `> **${entry.title}** a été ajouté à la playlist **${playlistName}**.`,
      ),
    );
  },
};
