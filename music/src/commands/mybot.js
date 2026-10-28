const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
  escapeMarkdown,
} = require("discord.js");

const API_BASE = process.env.BOTS_API_URL || "http://127.0.0.1:3000";
const API_KEY = process.env.BOTS_API_KEY || "";
const PAGE_SIZE = 5;

function getAuthorizeLink(botId) {
  return `https://discord.com/api/oauth2/authorize?client_id=${botId}&permissions=8&scope=bot%20applications.commands`;
}

function formatTime(bot) {
  const unix = Number(bot.time) || Math.floor(Date.now() / 1000);
  return bot.expired ? "expiré" : `<t:${unix}:R>`;
}

function formatBotLine(bot, index) {
  const name = escapeMarkdown(bot.name || bot.botId);
  const type = escapeMarkdown(bot.type || "inconnu");

  return `\`${index}.\` [**\`${name}\`**](${getAuthorizeLink(bot.botId)}) (\`${type}\`) : ${formatTime(bot)}`;
}

async function fetchMyBots(ownerId) {
  const url = new URL("/bots/list", API_BASE);
  url.searchParams.set("ownerId", ownerId);
  url.searchParams.set("page", "1");
  url.searchParams.set("limit", "100");

  const response = await fetch(url, {
    headers: API_KEY ? { "x-api-key": API_KEY } : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`API indisponible (${response.status}): ${text || response.statusText}`);
  }

  const payload = await response.json();
  return payload?.data || [];
}

function buildContainer(authorName, botRows, pageIndex, totalPages) {
  const start = (pageIndex - 1) * PAGE_SIZE;
  const pageRows = botRows.slice(start, start + PAGE_SIZE);
  const lines = pageRows.length
    ? pageRows.map((row, index) => formatBotLine(row, start + index + 1)).join("\n")
    : "> Aucun bot trouvé.";

  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# **Bots de ${escapeMarkdown(authorName)}**`),
      new TextDisplayBuilder().setContent("> Voici la liste de tes bots personnels."),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(lines),
    );

  if (totalPages > 1) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("mybot_prev")
          .setLabel("⬅")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageIndex <= 1),
        new ButtonBuilder()
          .setCustomId("mybot_next")
          .setLabel("➡")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageIndex >= totalPages),
      ),
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mybot")
    .setDescription("Affiche la liste de tes bots.")
    .setDMPermission(true),

  async execute(interaction) {
    try {
      const rows = await fetchMyBots(interaction.user.id);

      if (!rows.length) {
        const container = new ContainerBuilder()
          .setAccentColor(0x5865f2)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("# **Aucun bot trouvé**"),
            new TextDisplayBuilder().setContent("> Tu n'as aucun bot modifiable pour le moment."),
          );

        return interaction.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { parse: [] },
        });
      }

      const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      let page = 1;

      const initial = buildContainer(interaction.user.username, rows, page, totalPages);
      await interaction.reply(initial);
      const reply = await interaction.fetchReply();

      if (totalPages <= 1) {
        return reply;
      }

      const collector = reply.createMessageComponentCollector({
        filter: (componentInteraction) =>
          componentInteraction.user.id === interaction.user.id &&
          (componentInteraction.customId === "mybot_prev" || componentInteraction.customId === "mybot_next"),
      });

      collector.on("collect", async (componentInteraction) => {
        if (componentInteraction.customId === "mybot_prev") {
          page = Math.max(1, page - 1);
        } else {
          page = Math.min(totalPages, page + 1);
        }

        await componentInteraction.deferUpdate().catch(() => null);
        const view = buildContainer(interaction.user.username, rows, page, totalPages);
        return reply.edit(view).catch(() => null);
      });

      return reply;
    } catch (error) {
      const container = new ContainerBuilder()
        .setAccentColor(0xed4245)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent("# **Erreur API**"),
          new TextDisplayBuilder().setContent(`> ${error?.message || "Impossible de charger tes bots."}`),
        );

      return interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
    }
  },
};
