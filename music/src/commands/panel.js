const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  ChannelType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const { ensurePanelForGuild, panelCache } = require("../core/panel-actions");

function getEnvPath() {
  const storageId = String(process.env.BOT_STORAGE_ID || "").trim();
  if (storageId) {
    return path.resolve(__dirname, "../../../../BotRuntimes", storageId, ".env");
  }

  const cwd = path.resolve(process.cwd());
  if (cwd.split(path.sep).includes("BotRuntimes")) {
    return path.join(cwd, ".env");
  }

  return path.resolve(__dirname, "../..", ".env");
}

function buildReply(title, message, accentColor = 0x5865f2) {
  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# **${title}**`),
      new TextDisplayBuilder().setContent(message),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

function readEnvLines() {
  const envPath = getEnvPath();
  if (!fs.existsSync(envPath)) return [];
  return fs.readFileSync(envPath, "utf8").split(/\r?\n/);
}

function writeEnvUpdates(updates) {
  const envPath = getEnvPath();
  const sourceLines = readEnvLines();
  const seen = new Set();
  const nextLines = sourceLines.map((line) => {
    const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/);
    if (!match) return line;

    const key = match[2];
    if (!Object.prototype.hasOwnProperty.call(updates, key)) return line;

    seen.add(key);
    return `${match[1]}${key}${match[3]}${updates[key] || ""}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (seen.has(key)) continue;
    nextLines.push(`${key}=${value || ""}`);
  }

  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, `${nextLines.join("\n").replace(/\n+$/g, "")}\n`);
}

function setPanelChannel(ctx, channelId, guildId = null) {
  const nextChannelId = channelId ? String(channelId) : "";
  const nextGuildId = guildId ? String(guildId) : null;
  writeEnvUpdates({
    PANEL_CHANNEL_ID: nextChannelId,
    ...(nextGuildId ? { GUILD_ID: nextGuildId } : {}),
  });
  if (ctx?.config) {
    ctx.config.panelChannelId = nextChannelId || null;
    if (nextGuildId) ctx.config.guildId = nextGuildId;
  }
}

function buildConfigPanel(ctx, title = "> Configuration panel") {
  const channelId = ctx?.config?.panelChannelId || null;
  const channelLine = channelId ? `> Salon configuré: <#${channelId}> (\`${channelId}\`)` : "> Aucun salon configuré.";
  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# **${title}**`),
      new TextDisplayBuilder().setContent(`${channelLine}\n> Utilise un bouton pour modifier \`PANEL_CHANNEL_ID\`.`),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("panel_config_here")
          .setLabel("Ce salon")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("panel_config_id")
          .setLabel("Entrer ID")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("panel_config_clear")
          .setLabel("Vider")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!channelId),
      ),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

function buildChannelModal(currentChannelId = "") {
  return new ModalBuilder()
    .setCustomId("panel_config_modal")
    .setTitle("Configurer le salon panel")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("PANEL_CHANNEL_ID")
        .setDescription("Colle l'ID du salon texte.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("panel_channel_id")
            .setStyle(TextInputStyle.Short)
            .setValue(currentChannelId || "")
            .setRequired(true),
        ),
    );
}

async function resolveTargetChannel(interaction, ctx) {
  const selectedChannel = interaction.options.getChannel("channel");
  if (selectedChannel) return selectedChannel;

  const configuredChannelId = ctx.config.panelChannelId;
  if (!configuredChannelId) return null;

  return interaction.guild.channels.fetch(configuredChannelId).catch(() => null);
}

async function deletePreviousPanel(client, guildId) {
  const cached = panelCache.get(guildId);
  if (!cached?.channelId || !cached?.messageId) return;

  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const previousChannel = await guild.channels.fetch(cached.channelId).catch(() => null);
  if (!previousChannel || !previousChannel.isTextBased()) return;

  const previousMessage = await previousChannel.messages.fetch(cached.messageId).catch(() => null);
  if (!previousMessage) return;

  await previousMessage.delete().catch(() => null);
}

async function configureAndSendPanel(interaction, ctx, channel) {
  const previousPanel = panelCache.get(interaction.guildId);
  setPanelChannel(ctx, channel.id, interaction.guildId);

  if (previousPanel?.channelId && previousPanel.channelId !== channel.id) {
    await deletePreviousPanel(ctx.client, interaction.guildId);
    panelCache.delete(interaction.guildId);
  }

  const updated = await ensurePanelForGuild(
    ctx.client,
    ctx.pool,
    interaction.guildId,
    channel.id,
  );
  if (!updated) {
    throw new Error("Impossible de mettre à jour le panel dans ce salon.");
  }

  return panelCache.get(interaction.guildId) || null;
}

async function isGuildOwner(interaction) {
  if (!interaction.guild) return false;
  if (interaction.guild.ownerId) {
    return interaction.guild.ownerId === interaction.user.id;
  }

  const guild = await interaction.guild.fetch().catch(() => null);
  return guild?.ownerId === interaction.user.id;
}

async function canManageMusicPanel(interaction, ctx) {
  if (!interaction.guild) return false;

  const buyerId = ctx?.config?.buyerId || null;
  if (buyerId && interaction.user.id === buyerId) {
    return true;
  }

  return isGuildOwner(interaction);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Gère le panneau musique.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("send")
        .setDescription("Envoie ou remplace le panel dans un salon texte.")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Salon texte du panel")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("config")
        .setDescription("Configure le salon par défaut du panel.")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Salon texte à enregistrer dans PANEL_CHANNEL_ID")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        ),
    ),

  async execute(interaction, ctx) {
    const subcommand = interaction.options.getSubcommand();
    if (!["send", "config"].includes(subcommand)) {
      return interaction.reply(
        buildReply("> Sous-commande inconnue", "Cette sous-commande n'existe pas.", 0xed4245),
      );
    }

    if (!(await canManageMusicPanel(interaction, ctx))) {
      return interaction.reply(
        buildReply(
          "> Accès refusé",
          "> Seul le propriétaire du serveur ou le buyer peut utiliser cette commande.",
          0xed4245,
        ),
      );
    }

    if (subcommand === "config") {
      const selectedChannel = interaction.options.getChannel("channel");
      if (selectedChannel) {
        try {
          await configureAndSendPanel(interaction, ctx, selectedChannel);
          return interaction.reply(buildConfigPanel(ctx, "> Salon enregistré et panel envoyé"));
        } catch (error) {
          console.error("Impossible de configurer le salon panel:", error);
          return interaction.reply(buildReply("> Erreur", error?.message || "> Impossible d'envoyer le panel.", 0xed4245));
        }
      }

      return interaction.reply(buildConfigPanel(ctx));
    }

    const channel = await resolveTargetChannel(interaction, ctx);
    if (!channel || !channel.isTextBased()) {
      return interaction.reply(
        buildReply(
          "> Salon invalide",
          "> Indique un salon texte valide ou renseigne `PANEL_CHANNEL_ID`.",
          0xed4245,
        ),
      );
    }

    try {
      const panel = await configureAndSendPanel(interaction, ctx, channel);

      return interaction.reply(
        buildReply(
          "> Panel envoyé",
          `> Le panel a été mis à jour dans ${channel}. Message : **${panel?.messageId || "inconnu"}**.`,
        ),
      );
    } catch (error) {
      console.error("Impossible d'envoyer le panel:", error);
      return interaction.reply(
        buildReply(
          "> Erreur",
          error?.message || "> Impossible d'envoyer le panel pour le moment.",
          0xed4245,
        ),
      );
    }
  },

  async handleComponent(interaction, ctx) {
    if (!interaction.isButton()) return false;
    if (!["panel_config_here", "panel_config_id", "panel_config_clear"].includes(interaction.customId)) return false;

    if (!(await canManageMusicPanel(interaction, ctx))) {
      await interaction.reply(
        buildReply(
          "> Accès refusé",
          "> Seul le propriétaire du serveur ou le buyer peut configurer le panel.",
          0xed4245,
        ),
      );
      return true;
    }

    if (interaction.customId === "panel_config_id") {
      await interaction.showModal(buildChannelModal(ctx?.config?.panelChannelId || ""));
      return true;
    }

    if (interaction.customId === "panel_config_clear") {
      setPanelChannel(ctx, "");
      const payload = buildConfigPanel(ctx, "> Salon panel vidé");
      delete payload.flags;
      await interaction.update(payload);
      return true;
    }

    if (!interaction.channel?.isTextBased()) {
      await interaction.reply(buildReply("> Salon invalide", "> Cette interaction doit être utilisée dans un salon texte.", 0xed4245));
      return true;
    }

    try {
      await configureAndSendPanel(interaction, ctx, interaction.channel);
    } catch (error) {
      console.error("Impossible de configurer le salon panel:", error);
      await interaction.reply(buildReply("> Erreur", error?.message || "> Impossible d'envoyer le panel.", 0xed4245));
      return true;
    }

    const payload = buildConfigPanel(ctx, "> Salon enregistré et panel envoyé");
    delete payload.flags;
    await interaction.update(payload);
    return true;
  },

  async handleModal(interaction, ctx) {
    if (!interaction.isModalSubmit() || interaction.customId !== "panel_config_modal") return false;

    if (!(await canManageMusicPanel(interaction, ctx))) {
      await interaction.reply(
        buildReply(
          "> Accès refusé",
          "> Seul le propriétaire du serveur ou le buyer peut configurer le panel.",
          0xed4245,
        ),
      );
      return true;
    }

    const channelId = interaction.fields.getTextInputValue("panel_channel_id")?.trim();
    if (!/^\d{17,20}$/.test(channelId)) {
      await interaction.reply(buildReply("> ID invalide", "> Colle un ID de salon Discord valide.", 0xed4245));
      return true;
    }

    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      await interaction.reply(buildReply("> Salon introuvable", "> Le salon indiqué est introuvable ou n'est pas un salon texte.", 0xed4245));
      return true;
    }

    try {
      await configureAndSendPanel(interaction, ctx, channel);
    } catch (error) {
      console.error("Impossible de configurer le salon panel:", error);
      await interaction.reply(buildReply("> Erreur", error?.message || "> Impossible d'envoyer le panel.", 0xed4245));
      return true;
    }

    const payload = buildConfigPanel(ctx, "> Salon enregistré et panel envoyé");
    delete payload.flags;
    await interaction.update(payload);
    return true;
  },
};
