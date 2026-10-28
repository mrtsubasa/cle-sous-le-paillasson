const fs = require("fs");
const path = require("path");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

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

function loadTokenVault() {
  const candidates = [
    path.resolve(__dirname, "../../../../Utils/tokenVault"),
    path.resolve(__dirname, "../../../Utils/tokenVault"),
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {}
  }

  return {
    decryptToken: (value) => value,
    encryptToken: (value) => value,
  };
}

const { decryptToken, encryptToken } = loadTokenVault();

function buildReply(title, message, accentColor = 0x2b2d31) {
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

function parseEnvValue(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value) return "";
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function escapeEnvValue(value) {
  const stringValue = value === undefined || value === null ? "" : String(value).trim();
  if (!stringValue) return "";
  if (/[\s"#=]/.test(stringValue)) {
    return `"${stringValue.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return stringValue;
}

function readEnvMap() {
  const map = new Map();
  for (const line of readEnvLines()) {
    const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/);
    if (!match) continue;
    map.set(match[2], parseEnvValue(match[4]));
  }
  return map;
}

function writeEnvUpdates(updates, removeKeys = []) {
  const envPath = getEnvPath();
  const sourceLines = readEnvLines();
  const seen = new Set();
  const removed = new Set(removeKeys);
  const nextLines = sourceLines.map((line) => {
    const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/);
    if (!match) return line;

    const key = match[2];
    if (removed.has(key)) return null;
    if (!Object.prototype.hasOwnProperty.call(updates, key)) return line;

    seen.add(key);
    return `${match[1]}${key}${match[3]}${escapeEnvValue(updates[key])}`;
  }).filter((line) => line !== null);

  for (const [key, value] of Object.entries(updates)) {
    if (seen.has(key)) continue;
    nextLines.push(`${key}=${escapeEnvValue(value)}`);
  }

  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, `${nextLines.join("\n").replace(/\n+$/g, "")}\n`);
}

function getSavedTokens() {
  const env = readEnvMap();
  return [1, 2, 3].map((index) => {
    const token = env.get(`MUSIC_TOKEN_${index}`);
    return token ? decryptToken(token) : "";
  });
}

function buildTokenPanel(title = "Configuration des bots musique") {
  const savedTokens = getSavedTokens();
  const configuredCount = savedTokens.filter(Boolean).length;
  const container = new ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# ${title}`),
      new TextDisplayBuilder().setContent(
        `> **${configuredCount}/3 bots configurés**\n> Les tokens enregistrés sont masqués et chiffrés dans le runtime.`,
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );

  savedTokens.forEach((token, index) => {
    const slot = index + 1;
    const configured = Boolean(token);
    container
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `### Bot musique ${slot}\n> **Variable :** \`MUSIC_TOKEN_${slot}\`\n> **État :** ${configured ? "Configuré" : "Non configuré"}\n> **Token :** ${maskToken(token)}`,
            ),
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId(`music_tokens_open:${slot}`)
              .setLabel(configured ? "Modifier" : "Configurer")
              .setStyle(configured ? ButtonStyle.Secondary : ButtonStyle.Secondary),
          ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
      );
  });

  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "> Les modifications sont enregistrées uniquement dans le `.env` de cette instance. Chaque token peut être supprimé séparément.",
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        ...savedTokens.map((token, index) =>
          new ButtonBuilder()
            .setCustomId(`music_tokens_clear:${index + 1}`)
            .setLabel(`Supprimer ${index + 1}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!token),
        ),
        new ButtonBuilder()
          .setCustomId("music_tokens_clear")
          .setLabel("Tout supprimer")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(configuredCount === 0),
      ),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

function buildTokenModal(slot) {
  return new ModalBuilder()
    .setCustomId(`music_tokens_modal:${slot}`)
    .setTitle(`Configurer MUSIC_TOKEN_${slot}`)
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(`MUSIC_TOKEN_${slot}`)
        .setDescription("Colle le nouveau token pour ce slot.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("music_token")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
    );
}

function saveMusicTokens(tokens) {
  const normalizedTokens = [0, 1, 2].map((index) => String(tokens[index] || "").trim());
  const encryptedTokens = normalizedTokens.map((token) => (token ? encryptToken(token) : ""));

  writeEnvUpdates({
    MUSIC_TOKEN_1: encryptedTokens[0] || "",
    MUSIC_TOKEN_2: encryptedTokens[1] || "",
    MUSIC_TOKEN_3: encryptedTokens[2] || "",
  }, ["MUSIC_TOKENS", "BOT_TOKENS"]);

  return normalizedTokens.filter(Boolean);
}

function saveMusicTokenSlot(slot, token) {
  const index = Number(slot) - 1;
  if (!Number.isInteger(index) || index < 0 || index > 2) {
    throw new Error("Slot MUSIC_TOKEN invalide.");
  }

  const savedTokens = getSavedTokens();
  const nextTokens = [0, 1, 2].map((_, currentIndex) => savedTokens[currentIndex] || "");
  nextTokens[index] = String(token || "").trim();
  return saveMusicTokens(nextTokens);
}

function clearMusicTokens() {
  writeEnvUpdates({
    MUSIC_TOKEN_1: "",
    MUSIC_TOKEN_2: "",
    MUSIC_TOKEN_3: "",
  }, ["MUSIC_TOKENS", "BOT_TOKENS"]);
}

function clearMusicTokenSlot(slot) {
  const index = Number(slot) - 1;
  if (!Number.isInteger(index) || index < 0 || index > 2) {
    throw new Error("Slot MUSIC_TOKEN invalide.");
  }

  const savedTokens = getSavedTokens();
  savedTokens[index] = "";
  return saveMusicTokens(savedTokens);
}

function maskToken(token) {
  const value = String(token || "").trim();
  if (!value) return "`vide`";

  const visibleLength = Math.max(4, Math.ceil(value.length / 2));
  return `\`${value.slice(0, visibleLength)}...\``;
}

function canConfigure(interaction, ctx) {
  const buyerId = ctx?.config?.buyerId || null;
  return Boolean(buyerId && interaction.user.id === buyerId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("music-tokens")
    .setDescription("Configure les bots musique secondaires.")
    .setDMPermission(false),

  async execute(interaction, ctx) {
    if (!(await canConfigure(interaction, ctx))) {
      return interaction.reply(
        buildReply(
          "> Accès refusé",
          "> Seul le buyer du bot peut configurer les tokens musique.",
          0xed4245,
        ),
      );
    }

    return interaction.reply(buildTokenPanel());
  },

  async handleComponent(interaction, ctx) {
    if (!interaction.isButton()) return false;
    if (!interaction.customId.startsWith("music_tokens_open:") && !interaction.customId.startsWith("music_tokens_clear")) return false;

    if (!(await canConfigure(interaction, ctx))) {
      await interaction.reply(
        buildReply(
          "> Accès refusé",
          "> Seul le buyer du bot peut configurer les tokens musique.",
          0xed4245,
        ),
      );
      return true;
    }

    if (interaction.customId.startsWith("music_tokens_open:")) {
      const slot = Number(interaction.customId.split(":")[1]);
      if (![1, 2, 3].includes(slot)) {
        await interaction.reply(buildReply("> Slot invalide", "> Ce bouton ne correspond à aucun token.", 0xed4245));
        return true;
      }

      await interaction.showModal(buildTokenModal(slot));
      return true;
    }

    const clearSlot = interaction.customId.match(/^music_tokens_clear:([1-3])$/)?.[1] || null;
    if (clearSlot) {
      clearMusicTokenSlot(clearSlot);
    } else {
      clearMusicTokens();
    }

    const payload = buildTokenPanel(
      clearSlot ? `Token du bot musique ${clearSlot} supprimé` : "Tokens musique supprimés",
    );
    delete payload.flags;
    await interaction.update(payload);
    return true;
  },

  async handleModal(interaction, ctx) {
    if (!interaction.isModalSubmit() || !interaction.customId.startsWith("music_tokens_modal:")) return false;

    if (!(await canConfigure(interaction, ctx))) {
      await interaction.reply(
        buildReply(
          "> Accès refusé",
          "> Seul le buyer du bot peut configurer les tokens musique.",
          0xed4245,
        ),
      );
      return true;
    }

    const slot = Number(interaction.customId.split(":")[1]);
    const token = interaction.fields.getTextInputValue("music_token")?.trim();

    saveMusicTokenSlot(slot, token);
    const payload = buildTokenPanel(`Bot musique ${slot} mis à jour`);
    delete payload.flags;
    await interaction.update(payload);
    return true;
  },
};
