const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
  escapeMarkdown,
} = require("discord.js");

function formatBotLine(bot, index) {
  const label = bot.mention && /^<@!?\d+>$/.test(bot.mention)
    ? bot.mention
    : bot.client?.user?.username || bot.label || `Music${index + 1}`;
  const state = bot.assignedGuildId
    ? bot.voiceChannelId
      ? `\`occupé sur\` <#${bot.voiceChannelId}>${bot.voiceChannelName ? ` \`#${bot.voiceChannelName}\`` : ""}`
      : bot.voiceChannelName
        ? `\`occupé sur\` \`#${bot.voiceChannelName}\``
        : `\`occupé sur\``
    : "`libre`";

  return `${String(index + 1).padStart(2, "0")}. ${label}  ${state}`;
}

function buildBotList(state = {}) {
  const bots = state.bots || [];
  return bots.length
    ? bots.map((bot, index) => formatBotLine(bot, index)).join("\n")
    : "> Aucun bot n'est disponible pour le moment.";
}

function buildActionRow(paused, loopMode) {
  const topRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("music:getbot")
      .setLabel("Obtenir un bot")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("music:joinbot")
      .setEmoji("🎧")
      .setLabel("Faire rejoindre un bot")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("music:help")
      .setEmoji("❓")
      .setLabel("Comment utiliser le bot ?")
      .setStyle(ButtonStyle.Primary),
  );

  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("music:previous")
      .setEmoji("⏮️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music:playpause")
      .setEmoji(paused ? "▶️" : "⏯️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music:skip")
      .setEmoji("⏭️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music:loop")
      .setEmoji(loopMode === "off" ? "🔁" : "♾️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music:queue")
      .setEmoji("📃")
      .setStyle(ButtonStyle.Secondary),
  );

  return [topRow, controlRow];
}

function buildPanelMessage(guild, state = {}) {
  const paused = Boolean(state.player?.paused);
  const loopMode = state.player?.data?.get("loopMode") || "off";
  const guildName = escapeMarkdown(guild?.name || "Serveur");

  const container = new ContainerBuilder()
    .setAccentColor(0x313338)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# **🌐 ${guildName} Musique**`),
      new TextDisplayBuilder().setContent("> Le panel est centralisé dans ce container pour une lecture plus propre."),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(buildBotList(state)),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("> Clique sur **Obtenir un bot** pour ouvrir la carte d’aide et rejoindre le support si besoin."),
      new TextDisplayBuilder().setContent("> Ensuite, utilise **Faire rejoindre un bot** pour le faire entrer dans ton vocal."),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1),
    )
    
  container.addActionRowComponents(...buildActionRow(paused, loopMode));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  buildPanelMessage,
};
