const {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const { refreshPanel } = require("../core/panel-actions");

function buildShuffleContainer(count) {
  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# **File mélangée**"),
      new TextDisplayBuilder().setContent(`La file d'attente a été mélangée avec ${count} morceau${count > 1 ? "x" : ""}.`),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("Le morceau en cours n'a pas été touché."),
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
      new TextDisplayBuilder().setContent("Aucune musique n'est en cours dans ce salon."),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("Lance une musique avec `/play` avant de mélanger la file."),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("shuffle")
    .setDescription("Mélange la file d'attente."),
  async execute(interaction, ctx) {
    const player = ctx.pool.getPlayer(interaction.guildId, interaction.member?.voice?.channel?.id || null);
    if (!player) return interaction.reply(buildNoPlayerContainer());

    const current = player.data.get("currentTrack") || player.queue?.current || player.current || null;
    const queueItems = Array.isArray(player.queue) ? player.queue : [];

    if (!queueItems.length) {
      await interaction.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x5865f2)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent("# **File vide**"),
              new TextDisplayBuilder().setContent("> Il n'y a rien à mélanger."),
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent("> Ajoute des morceaux avec `/play` pour utiliser `/shuffle`."),
            ),
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }

    const shuffled = shuffleArray(queueItems);
    player.queue.splice(0, player.queue.length, ...shuffled);

    if (current) {
      player.data.set("currentTrack", current);
    }

    await interaction.reply(buildShuffleContainer(queueItems.length));
    await refreshPanel(ctx.client, ctx.pool, interaction.guildId);
  },
};
