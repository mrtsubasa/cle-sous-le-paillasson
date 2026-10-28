const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

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
    isEncryptedToken: () => false,
  };
}

const { decryptToken } = loadTokenVault();

function inferDiscordIdFromToken(token) {
  const firstPart = String(token || "").trim().split(".")[0];
  if (!firstPart) return null;

  try {
    const decoded = Buffer.from(firstPart, "base64").toString("utf8").trim();
    return /^\d{17,20}$/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function toBool(value, fallback = false) {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function collectMusicTokens() {
  const tokens = [];

  for (let index = 1; index <= 20; index += 1) {
    const token = process.env[`MUSIC_TOKEN_${index}`];
    if (token && token.trim()) {
      tokens.push(token.trim());
    }
  }

  return [...new Set(tokens.map((token) => decryptToken(token)).filter(Boolean))];
}

const controlToken = decryptToken(process.env.CONTROL_TOKEN || null);

const config = {
  token: controlToken,
  controlToken,
  musicTokens: collectMusicTokens(),
  clientId: process.env.CLIENT_ID || inferDiscordIdFromToken(controlToken),
  guildId: process.env.GUILD_ID || null,
  buyerId: process.env.BUYER_ID || null,
  panelChannelId: process.env.PANEL_CHANNEL_ID || null,
  supportUrl: process.env.SUPPORT_URL || process.env.BOT_SUPPORT_URL || null,
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID || null,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || null,
    searchMarket: process.env.SPOTIFY_SEARCH_MARKET || "US",
  },
  lavalink: {
    host: process.env.LAVALINK_HOST || null,
    port: Number(process.env.LAVALINK_PORT || 25569),
    password: process.env.LAVALINK_PASSWORD || null,
    secure: toBool(process.env.LAVALINK_SECURE, false),
  },
};

module.exports = config;
