const { SlashCommandBuilder } = require("discord.js");
const { buildPlaylistContainer, loadPlaylists, normalizeName, savePlaylists } = require("../core/playlist-utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("playlist-create")
    .setDescription("Crée une nouvelle playlist.")
    .addStringOption((option) =>
      option
        .setName("nom")
        .setDescription("Nom de la playlist")
        .setRequired(true),
    ),
  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const playlistName = normalizeName(interaction.options.getString("nom", true));

    if (!playlistName) {
      return interaction.reply(buildPlaylistContainer("> Nom invalide", "> Donne un nom valide pour ta playlist."));
    }

    const playlists = await loadPlaylists();
    playlists[guildId] ||= {};
    playlists[guildId][userId] ||= {};

    if (playlists[guildId][userId][playlistName]) {
      return interaction.reply(buildPlaylistContainer("> Playlist existante", `> La playlist **${playlistName}** existe déjà.`));
    }

    playlists[guildId][userId][playlistName] = {
      name: playlistName,
      tracks: [],
    };

    await savePlaylists(playlists);
    return interaction.reply(buildPlaylistContainer("> Playlist créée", `> La playlist **${playlistName}** a été créée et elle est vide pour le moment.`));
  },
};
