const {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const { refreshPanel } = require("../core/panel-actions");

function buildLeaveContainer() {
  const container = new ContainerBuilder()
    .setAccentColor(0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# **Bot parti**"),
      new TextDisplayBuilder().setContent("> Le bot a quitté le salon vocal."),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

function buildErrorContainer(message) {
  const container = new ContainerBuilder()
    .setAccentColor(0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# **Aucun lecteur actif**"),
      new TextDisplayBuilder().setContent(message),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Fait quitter le bot du salon vocal."),
  async execute(interaction, ctx) {
    const voiceId = interaction.member?.voice?.channel?.id || null;
    const player = ctx.pool.getPlayer(interaction.guildId, voiceId)
      || ctx.pool.getGuildView(interaction.guildId)?.player
      || null;

    if (!player) {
      return interaction.reply(buildErrorContainer("> Aucun bot n'est connecté dans ce serveur."));
    }

    try {
      await player.destroy().catch(() => null);
      ctx.pool.releaseGuild(interaction.guildId, voiceId);
      await interaction.reply(buildLeaveContainer());
      await refreshPanel(ctx.client, ctx.pool, interaction.guildId);
    } catch (error) {
      console.error("Impossible de faire quitter le bot:", error);
      await interaction.reply(buildErrorContainer(error?.message || "> Impossible de faire quitter le bot pour le moment."));
    }
  },
};
