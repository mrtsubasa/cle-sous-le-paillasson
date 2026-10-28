const {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const { ensurePlayer } = require("../core/music");
const { refreshPanel } = require("../core/panel-actions");

function buildJoinContainer(alreadyConnected, voiceChannel) {
  const container = new ContainerBuilder()
    .setAccentColor(alreadyConnected ? 0x57f287 : 0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(alreadyConnected ? "# **Bot déjà connecté**" : "# **Bot rejoint**"),
      new TextDisplayBuilder().setContent(
        alreadyConnected
          ? "> Le bot est déjà dans ton salon vocal."
          : "> Le bot a rejoint ton salon vocal.",
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(voiceChannel ? `**Salon**: ${voiceChannel}` : "**Salon**: vocal"),
    );

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
      new TextDisplayBuilder().setContent("# **Erreur**"),
      new TextDisplayBuilder().setContent(message),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

function buildBusyContainer(voiceChannelId = null, voiceChannelName = null) {
  const container = new ContainerBuilder()
    .setAccentColor(0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# **Bot déjà utilisé**"),
      new TextDisplayBuilder().setContent("> Ce bot est déjà occupé sur ce serveur."),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        voiceChannelId
          ? `**Salon occupé**: <#${voiceChannelId}>${voiceChannelName ? ` \`#${voiceChannelName}\`` : ""}`
          : voiceChannelName
            ? `**Salon occupé**: \`#${voiceChannelName}\``
            : "**Salon occupé**: inconnu",
      ),
      new TextDisplayBuilder().setContent("> Attends qu'il soit libéré ou utilise un autre bot si tu en as plusieurs."),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("> Le bot se libère automatiquement quand le salon n'a plus personne."),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("Fait rejoindre le bot à ton salon vocal."),
  async execute(interaction, ctx) {
    const voiceChannel = interaction.member?.voice?.channel || null;
    if (!voiceChannel) {
      return interaction.reply(buildErrorContainer("> Tu dois être dans un salon vocal."));
    }

    const guildView = ctx.pool.getGuildView(interaction.guildId) || {};
    const existingBot = guildView.bot || null;
    const existingPlayer = guildView.player || null;

    if (existingBot && (existingBot.voiceChannelId || existingPlayer || existingBot.assignedGuildId === interaction.guildId)) {
      return interaction.reply(
        buildBusyContainer(existingBot.voiceChannelId || null, existingBot.voiceChannelName || null),
      );
    }

    try {
      await ensurePlayer(ctx.pool, interaction);
      await interaction.reply(
        buildJoinContainer(Boolean(existingPlayer && existingPlayer.voiceId === voiceChannel.id), voiceChannel.toString()),
      );
      await refreshPanel(ctx.client, ctx.pool, interaction.guildId);
    } catch (error) {
      console.error("Impossible de faire rejoindre le bot:", error);
      await interaction.reply(buildErrorContainer(error?.message || "> Impossible de faire rejoindre le bot pour le moment."));
    }
  },
};
