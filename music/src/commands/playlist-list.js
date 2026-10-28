const { SlashCommandBuilder } = require("discord.js");
const {
  buildPlaylistDetailsContainer,
  buildPlaylistListContainer,
  getPlaylistChoices,
  getUserPlaylists,
  loadPlaylists,
  normalizeName,
} = require("../core/playlist-utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("playlist-list")
    .setDescription("Affiche tes playlists.")
    .addStringOption((option) =>
      option
        .setName("nom")
        .setDescription("Nom de la playlist")
        .setAutocomplete(true)
        .setRequired(false),
    ),
  autocomplete(interaction, playlists) {
    const focused = interaction.options.getFocused(true);
    if (focused?.name !== "nom") return [];
    return getPlaylistChoices(playlists, interaction.guildId, interaction.user.id, focused.value);
  },
  async execute(interaction) {
    const playlists = await loadPlaylists();
    const guildPlaylists = getUserPlaylists(playlists, interaction.guildId, interaction.user.id);
    const selected = normalizeName(interaction.options.getString("nom", false));

    if (selected) {
      const playlist = guildPlaylists[selected];
      if (!playlist) {
        return interaction.reply(buildPlaylistListContainer(guildPlaylists));
      }
      return interaction.reply(buildPlaylistDetailsContainer(selected, playlist));
    }

    return interaction.reply(buildPlaylistListContainer(guildPlaylists));
  },
};
