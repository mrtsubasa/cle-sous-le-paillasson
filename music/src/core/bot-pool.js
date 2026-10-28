const { ActivityType, Client, GatewayIntentBits } = require("discord.js");
const { Connectors } = require("shoukaku");
const { Kazagumo } = require("kazagumo");
const Spotify = require("kazagumo-spotify");
const { applySavedProfile, readProfileState } = require("./bot-profile");

function createLavalinkNodes(config) {
  return [
    {
      name: "main",
      url: `${config.lavalink.host}:${config.lavalink.port}`,
      auth: config.lavalink.password,
      secure: config.lavalink.secure,
    },
  ];
}

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

function createMusicBot(token, index, config) {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  });

  const inferredUserId = inferDiscordIdFromToken(token);
  const bot = {
    id: index,
    token,
    label: `@Music${index + 1}`,
    mention: inferredUserId ? `<@${inferredUserId}>` : `@Music${index + 1}`,
    client,
    kazagumo: null,
    ready: false,
    assignedGuildId: null,
    isPrimary: false,
    userId: inferredUserId,
  };

  console.log(`[Lavalink] ${bot.label}: connexion au node ${config.lavalink.host}:${config.lavalink.port}...`);

  bot.kazagumo = new Kazagumo(
    {
      defaultSearchEngine: "youtube",
      plugins: config.spotify.clientId && config.spotify.clientSecret
        ? [
            new Spotify({
              clientId: config.spotify.clientId,
              clientSecret: config.spotify.clientSecret,
              searchMarket: config.spotify.searchMarket || "US",
            }),
          ]
        : [],
      send: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
      },
    },
    new Connectors.DiscordJS(client),
    createLavalinkNodes(config),
  );

  bot.kazagumo.shoukaku.on("ready", (name) => {
    console.log(`[Lavalink] ${bot.label}: node ${name} connecté.`);
  });

  bot.kazagumo.shoukaku.on("reconnecting", (name, tries) => {
    console.warn(`[Lavalink] ${bot.label}: node ${name} reconnexion en cours (tentative ${tries}).`);
  });

  client.once("clientReady", () => {
    bot.ready = true;
    bot.userId = client.user?.id || null;
    bot.mention = bot.userId ? `<@${bot.userId}>` : bot.label;
    const savedProfile = readProfileState(`music:${index}`);
    if (savedProfile) {
      applySavedProfile(client, `music:${index}`).catch((error) => {
        console.error(`[Profile] Impossible d'appliquer le profil de ${bot.label}:`, error);
      });
    } else {
      client.user?.setPresence({
        status: "idle",
        activities: [
          {
            name: `la musique #${index + 1}`,
            type: ActivityType.Listening,
          },
        ],
      });
    }
    console.log(`${bot.label} connecté.`);
  });

  bot.kazagumo.shoukaku.on("error", (name, error) => {
    console.error(`[Lavalink] ${bot.label}: node ${name} erreur.`, error);
  });

  bot.kazagumo.shoukaku.on("close", (name, code, reason) => {
    console.warn(`[Lavalink] ${bot.label}: node ${name} fermé (${code}) ${reason || "sans raison"}`);
  });

  client.login(token);

  return bot;
}

function createBotPool(config) {
  if (!config.musicTokens.length) {
    throw new Error("> MUSIC_TOKEN_1 est vide. Ajoute au moins un bot musique.");
  }

  const bots = config.musicTokens.map((token, index) => createMusicBot(token, index, config));
  const sessionToBot = new Map();
  const guildToSession = new Map();

  function getConnectedVoiceState(bot) {
    const guild = bot.client.guilds.cache.find((entry) => entry.members?.me?.voice?.channelId) || null;
    const voiceChannelId = guild?.members?.me?.voice?.channelId || null;
    const voiceChannelName = voiceChannelId
      ? guild?.channels?.cache?.get(voiceChannelId)?.name || voiceChannelId
      : null;

    return {
      guildId: guild?.id || null,
      voiceChannelId,
      voiceChannelName,
    };
  }

  function roster() {
    return bots.map((bot) => {
      const userId = bot.userId || bot.client.user?.id || null;
      const connectedVoice = getConnectedVoiceState(bot);
      const inferredGuildId = bot.assignedGuildId || connectedVoice.guildId || null;
      const player = [...bot.kazagumo.players.values()].find((entry) => entry.guildId === inferredGuildId) || null;
      return {
        id: bot.id,
        label: bot.label,
        userId,
        mention: userId ? `<@${userId}>` : bot.mention,
        ready: bot.ready,
        assignedGuildId: inferredGuildId,
        sessionKey: bot.sessionKey || null,
        busy: Boolean(inferredGuildId || bot.kazagumo.players.size > 0 || connectedVoice.guildId),
        hasPlayer: Boolean(player),
        voiceChannelId: connectedVoice.voiceChannelId,
        voiceChannelName: connectedVoice.voiceChannelName,
      };
    });
  }

  function getBotForSession(sessionKey) {
    const assignedId = sessionToBot.get(sessionKey);
    if (assignedId !== undefined) {
      const assigned = bots[assignedId];
      if (assigned) return assigned;
    }

    return bots.find((bot) => bot.sessionKey === sessionKey) || null;
  }

  function getSessionKey(guildId, voiceId) {
    if (!guildId) return null;
    return voiceId ? `${guildId}:${voiceId}` : guildToSession.get(guildId) || null;
  }

  function getPlayerRecord(guildId, voiceId = null) {
    const players = [];

    for (const bot of bots) {
      const player = bot.kazagumo.players.get(guildId) || null;
      if (!player) continue;

      const record = { bot, player };
      players.push(record);

      if (voiceId && player.voiceId === voiceId) {
        return record;
      }
    }

    if (!voiceId) return null;

    const sessionKey = getSessionKey(guildId, voiceId);
    if (sessionKey) {
      const sessionBot = getBotForSession(sessionKey);
      if (sessionBot) {
        const player = sessionBot.kazagumo.players.get(guildId) || null;
        if (player) return { bot: sessionBot, player };
      }
    }

    return null;
  }

  function getAnyPlayerRecord(guildId) {
    for (const bot of bots) {
      const player = bot.kazagumo.players.get(guildId) || null;
      if (player) {
        return { bot, player };
      }
    }
    return null;
  }

  function getBotForGuild(guildId, voiceId = null) {
    const sessionKey = getSessionKey(guildId, voiceId);
    if (sessionKey) {
      const bot = getBotForSession(sessionKey);
      if (bot) return bot;
    }

    const connectedBot = bots.find((bot) => {
      const connectedVoice = getConnectedVoiceState(bot);
      return connectedVoice.guildId === guildId && (!voiceId || connectedVoice.voiceChannelId === voiceId);
    }) || null;
    if (connectedBot) return connectedBot;

    const playerRecord = getPlayerRecord(guildId, voiceId);
    if (playerRecord) return playerRecord.bot;

    const anyPlayerRecord = getAnyPlayerRecord(guildId);
    if (anyPlayerRecord) return anyPlayerRecord.bot;

    return bots.find((bot) => bot.assignedGuildId === guildId) || null;
  }

  function getPlayer(guildId, voiceId = null) {
    const record = getPlayerRecord(guildId, voiceId);
    if (record) return record.player;

    const bot = getBotForGuild(guildId, voiceId);
    return bot?.kazagumo.players.get(guildId) || null;
  }

  function allocateBot(guildId, voiceId) {
    const sessionKey = getSessionKey(guildId, voiceId);
    if (!sessionKey) return null;

    const current = getBotForSession(sessionKey);
    if (current) {
      current.assignedGuildId = guildId;
      current.sessionKey = sessionKey;
      sessionToBot.set(sessionKey, current.id);
      guildToSession.set(guildId, sessionKey);
      return current;
    }

    const connectedBot = bots.find((bot) => {
      const connectedVoice = getConnectedVoiceState(bot);
      return connectedVoice.guildId === guildId && connectedVoice.voiceChannelId === voiceId;
    }) || null;
    if (connectedBot) {
      connectedBot.assignedGuildId = guildId;
      connectedBot.sessionKey = sessionKey;
      sessionToBot.set(sessionKey, connectedBot.id);
      guildToSession.set(guildId, sessionKey);
      return connectedBot;
    }

    const existingRecord = getPlayerRecord(guildId, voiceId);
    if (existingRecord) {
      const { bot } = existingRecord;
      bot.assignedGuildId = guildId;
      bot.sessionKey = sessionKey;
      sessionToBot.set(sessionKey, bot.id);
      guildToSession.set(guildId, sessionKey);
      return bot;
    }

    const anyPlayerRecord = getAnyPlayerRecord(guildId);
    if (anyPlayerRecord) {
      const { bot } = anyPlayerRecord;
      bot.assignedGuildId = guildId;
      bot.sessionKey = sessionKey;
      sessionToBot.set(sessionKey, bot.id);
      guildToSession.set(guildId, sessionKey);
      return bot;
    }

    const freeBot = bots.find((bot) => bot.ready && !bot.assignedGuildId && bot.kazagumo.players.size === 0);
    if (!freeBot) return null;

    freeBot.assignedGuildId = guildId;
    freeBot.sessionKey = sessionKey;
    sessionToBot.set(sessionKey, freeBot.id);
    guildToSession.set(guildId, sessionKey);
    console.log(`[Pool] ${freeBot.label} attribué à ${sessionKey}`);
    return freeBot;
  }

  function releaseSession(sessionKey) {
    const bot = getBotForSession(sessionKey);
    if (bot) {
      bot.assignedGuildId = null;
      bot.sessionKey = null;
    }
    sessionToBot.delete(sessionKey);
  }

  function releaseGuild(guildId, voiceId = null) {
    const sessionKey = getSessionKey(guildId, voiceId);
    if (!sessionKey) return;
    releaseSession(sessionKey);
    if (guildToSession.get(guildId) === sessionKey) {
      guildToSession.delete(guildId);
    }
  }

  function setGuildBot(guildId, bot) {
    const sessionKey = bot.sessionKey || guildToSession.get(guildId) || `${guildId}:default`;
    sessionToBot.set(sessionKey, bot.id);
    guildToSession.set(guildId, sessionKey);
    bot.assignedGuildId = guildId;
    bot.sessionKey = sessionKey;
  }

  function getGuildView(guildId) {
    const sessionKey = guildToSession.get(guildId) || null;
    const bot = sessionKey
      ? getBotForSession(sessionKey)
      : bots.find((entry) => entry.assignedGuildId === guildId || getConnectedVoiceState(entry).guildId === guildId) || null;
    const player = bot ? bot.kazagumo.players.get(guildId) || null : null;
    return {
      bot,
      player,
      bots: roster(),
    };
  }

  return {
    bots,
    allocateBot,
    getBotForGuild,
    getGuildView,
    getPlayer,
    getSessionKey,
    releaseGuild,
    releaseSession,
    roster,
    setGuildBot,
  };
}

module.exports = {
  createBotPool,
};
