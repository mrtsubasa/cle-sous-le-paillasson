const { SlashCommandBuilder } = require("discord.js");
const {
  buildPlaylistContainer,
  getPlaylistChoices,
  getUserPlaylists,
  loadPlaylists,
  normalizeName,
  normalizePlaylistRecord,
  savePlaylists,
} = require("../core/playlist-utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("playlist-remove")
    .setDescription("Retire un morceau d'une playlist.")
    .addStringOption((option) =>
      option
        .setName("nom")
        .setDescription("Nom de la playlist")
        .setAutocomplete(true)
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("index")
        .setDescription("Numéro du morceau à supprimer")
        .setRequired(true),
    ),
  autocomplete(interaction, playlists) {
    const focused = interaction.options.getFocused(true);
    if (focused?.name !== "nom") return [];
    return getPlaylistChoices(playlists, interaction.guildId, interaction.user.id, focused.value);
  },
  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const playlistName = normalizeName(interaction.options.getString("nom", true));
    const index = interaction.options.getInteger("index", true);
    const playlists = await loadPlaylists();

    playlists[guildId] ||= {};
    playlists[guildId][userId] ||= {};

    const playlist = getUserPlaylists(playlists, guildId, userId)[playlistName];
    if (!playlist) {
      return interaction.reply(buildPlaylistContainer("> Playlist introuvable", `> La playlist **${playlistName}** n'existe pas.`));
    }

    const safeIndex = index - 1;
    if (safeIndex < 0 || safeIndex >= playlist.tracks.length) {
      return interaction.reply(buildPlaylistContainer("> Index invalide", `> Le morceau **${index}** n'existe pas dans **${playlistName}**.`));
    }

    const removed = playlist.tracks.splice(safeIndex, 1)[0];
    playlists[guildId][userId][playlistName] = normalizePlaylistRecord(playlist, playlistName);
    await savePlaylists(playlists);

    return interaction.reply(
      buildPlaylistContainer(
        "> Morceau supprimé",
        `> **${removed?.title || removed?.query || "Morceau"}** a été retiré de **${playlistName}**.`,
      ),
    );
  },
};
