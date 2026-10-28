const fs = require("fs");
const path = require("path");
const {
  Client,
  Collection,
  ActivityType,
  GatewayIntentBits,
  Events,
  InteractionType,
  ActionRowBuilder,
  ContainerBuilder,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  SectionBuilder,
  SeparatorBuilder,
  ThumbnailBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const config = require("./core/config");
const { createBotPool } = require("./core/bot-pool");
const { ensurePlayer, handlePlayerEnd, toggleLoop } = require("./core/music");
const { ensurePanelForGuild, loadCachedPanels, panelCache, refreshPanel } = require("./core/panel-actions");
const { applySavedProfile } = require("./core/bot-profile");
const { buildNowPlayingPayload, fetchArtworkBuffer } = require("./commands/play");
const { buildSkipContainer } = require("./commands/skip");
const { deployCommands } = require("./deploy-commands");
const {
  buildEphemeralTextContainer,
  buildBotBusyContainer,
  buildHelpContainer,
  buildObtainBotContainer,
  buildJoinBotContainer,
  buildTextContainer,
} = require("./core/response-utils");
const { loginManagedBot } = require("../../../Utils/botApiBootstrap");

function setupAntiCrash() {
  process.on("unhandledRejection", (reason) => {
    console.error("[AntiCrash] Rejet de promesse non géré:", reason);
  });

  process.on("uncaughtException", (error) => {
    console.error("[AntiCrash] Exception non gérée:", error);
  });
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const commands = new Collection();

function getRuntimeEnvPath() {
  const storageId = String(process.env.BOT_STORAGE_ID || "").trim();
  if (storageId) {
    return path.resolve(__dirname, "../../../BotRuntimes", storageId, ".env");
  }

  const cwd = path.resolve(process.cwd());
  if (cwd.split(path.sep).includes("BotRuntimes")) {
    return path.join(cwd, ".env");
  }

  return path.resolve(__dirname, "..", ".env");
}

function writeEnvValue(key, value) {
  const envPath = getRuntimeEnvPath();
  const lines = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf8").split(/\r?\n/)
    : [];
  let found = false;

  const nextLines = lines.map((line) => {
    const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/);
    if (!match || match[2] !== key) return line;

    found = true;
    return `${match[1]}${key}${match[3]}${value || ""}`;
  });

  if (!found) nextLines.push(`${key}=${value || ""}`);
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, `${nextLines.join("\n").replace(/\n+$/g, "")}\n`);
}

async function ensureGuildIdFromControlClient() {
  const panelChannel = config.panelChannelId
    ? client.channels.cache.get(config.panelChannelId)
      || await client.channels.fetch(config.panelChannelId).catch(() => null)
    : null;
  const configuredGuild = config.guildId
    ? client.guilds.cache.get(config.guildId)
      || await client.guilds.fetch(config.guildId).catch(() => null)
    : null;
  const guild = panelChannel?.guild || configuredGuild || client.guilds.cache.first() || null;
  if (!guild) {
    console.warn("[Config] GUILD_ID vide et aucun serveur détecté pour le bot de contrôle.");
    return null;
  }

  if (config.guildId !== guild.id) {
    config.guildId = guild.id;
    writeEnvValue("GUILD_ID", guild.id);
    console.log(`[Config] GUILD_ID détecté automatiquement: ${guild.id}`);
  }
  return guild.id;
}

function loadCommands() {
  const commandsPath = path.join(__dirname, "commands");
  const files = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));

  for (const file of files) {
    const command = require(path.join(commandsPath, file));
    commands.set(command.data.name, command);
  }
}

setupAntiCrash();

function getPlayer(interaction) {
  const voiceId = interaction.member?.voice?.channel?.id || null;
  return client.pool?.getPlayer(interaction.guildId, voiceId) || null;
}

async function handleEmptyVoiceChannel(bot, guildId) {
  const guild = client.guilds.cache.get(guildId) || await bot.client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return false;

  const selfMember = guild.members.me || null;
  const voiceChannel = selfMember?.voice?.channel || null;
  if (!voiceChannel) return false;

  const humanMembers = voiceChannel.members.filter((member) => !member.user.bot);
  if (humanMembers.size > 0) return false;

  const player = bot.kazagumo.players.get(guildId) || null;
  if (player) {
    await player.destroy().catch(() => null);
  } else {
    await selfMember.voice.setChannel(null).catch(() => null);
  }

  client.pool.releaseGuild(guildId, voiceChannel.id);
  await refreshPanel(client, client.pool, guildId);
  return true;
}

function setupBotVoiceCleanup(bot) {
  bot.client.on("voiceStateUpdate", async (oldState, newState) => {
    try {
      const botUserId = bot.userId || bot.client.user?.id || null;
      const guildId = oldState.guild?.id || newState.guild?.id || null;
      if (!guildId) return;

      if (botUserId && (oldState.id === botUserId || newState.id === botUserId)) {
        const oldChannelId = oldState.channelId || null;
        const newChannelId = newState.channelId || null;
        if (oldChannelId && !newChannelId) {
          const player = bot.kazagumo.players.get(guildId) || null;
          if (player) {
            await player.destroy().catch(() => null);
          }
          client.pool.releaseGuild(guildId, oldChannelId);
          await refreshPanel(client, client.pool, guildId);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
      await handleEmptyVoiceChannel(bot, guildId);
    } catch (error) {
      console.error("[Panel] Impossible de gérer le vocal:", error);
    }
  });
}

function getRosterWithGuildNames() {
  return client.pool.roster().map((bot) => ({
    ...bot,
    assignedGuildName: bot.assignedGuildId
      ? client.guilds.cache.get(bot.assignedGuildId)?.name || bot.assignedGuildId
      : null,
    voiceChannelName: bot.voiceChannelName || null,
  }));
}

function buildNoPlayerContainer() {
  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# **Aucun lecteur actif**"),
      new TextDisplayBuilder().setContent("> Aucune musique n'est en cours dans ce salon."),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("> Lance une musique avec `/play` ou clique sur **Obtenir un bot** pour démarrer."),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function formatDuration(ms) {
  if (!ms || Number.isNaN(ms)) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function buildPlaybackStateContainer(player, state) {
  const track = player?.data?.get("currentTrack") || player?.queue?.current || player?.current || null;
  const title = track?.title || "Titre inconnu";
  const author = track?.author || "Artiste inconnu";
  const requester = player?.data?.get("nowPlayingRequester")
    || track?.requester?.tag
    || track?.requester?.username
    || "Inconnu";
  const source = `${track?.sourceName || "music"}`.toLowerCase();
  const duration = track?.length || 0;
  const position = player?.position || track?.position || 0;
  const progress = duration > 0 ? Math.min(100, Math.max(0, Math.round((position / duration) * 100))) : 0;
  const paused = state === "pause";
  const headline = paused ? "Lecture en pause" : "Lecture reprise";
  const subtitle = paused ? "La musique est mise en pause." : "La musique reprend normalement.";

  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# **${headline}**`),
      new TextDisplayBuilder().setContent(subtitle),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1));

  const section = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`**Titre**: ${title}`),
    new TextDisplayBuilder().setContent(`**Artiste**: ${author}`),
    new TextDisplayBuilder().setContent(`**Source**: ${source}`),
  );

  if (track?.thumbnail) {
    section.setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(track.thumbnail)
        .setDescription(title),
    );
  }

  container
    .addSectionComponents(section)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Progression**: ${progress}% (${formatDuration(position)} / ${formatDuration(duration)})`),
      new TextDisplayBuilder().setContent(`**Demandeur**: ${requester}`),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function buildPreviousContainer(hasPrevious) {
  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(hasPrevious ? "# **Morceau précédent**" : "# **Aucun morceau précédent**"),
      new TextDisplayBuilder().setContent(hasPrevious ? "> La lecture revient au morceau précédent." : "Il n'y a pas de morceau précédent dans l'historique."),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(hasPrevious ? "> Le lecteur a bien changé de morceau." : "Laisse la lecture continuer ou ajoute un morceau avec `/play`."),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function buildQueueContainer(player) {
  const current = player?.current || player?.queue?.current || null;
  const upcoming = Array.isArray(player?.queue) ? player.queue.slice(0, 10) : [];
  const container = new ContainerBuilder().setAccentColor(0x5865f2);
  const currentRequester = current?.requester?.tag || current?.requester?.username || "Inconnu";
  const currentThumbnail = current?.thumbnail || null;
  const currentSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# **File de lecture**"),
      new TextDisplayBuilder().setContent(
        current
          ? `En cours: **${current.title}**`
          : "Aucun morceau en cours.",
      ),
      new TextDisplayBuilder().setContent(
        current ? `**Demandé par**: ${currentRequester}` : "> Lance une musique avec `/play` pour remplir la file.",
      ),
    );

  if (currentThumbnail) {
    currentSection.setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(currentThumbnail)
        .setDescription(current?.title || "Morceau en cours"),
    );
  }

  container.addSectionComponents(currentSection);

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1));

  if (upcoming.length) {
    const lines = upcoming.slice(0, 5).map((track, index) => {
      const requester = track?.requester?.tag || track?.requester?.username || "Inconnu";
      return `${String(index + 1).padStart(2, "0")}. ${track.title} - ${requester}`;
    });

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("**Prochaines pistes**"),
      new TextDisplayBuilder().setContent(lines.join("\n")),
    );

    if (upcoming.length >= 3) {
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1));
      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("nowplaying:pause")
            .setLabel(player?.paused ? "Play" : "Pause")
            .setEmoji("⏯️")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("nowplaying:skip")
            .setLabel("Skip")
            .setEmoji("⏭️")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("nowplaying:stop")
            .setLabel("Stop")
            .setEmoji("⏹️")
            .setStyle(ButtonStyle.Danger),
        ),
      );
    }
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("> La file est vide."),
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

async function refreshNowPlayingCard(player, guildId) {
  const channelId = player?.data?.get("nowPlayingChannelId");
  const messageId = player?.data?.get("nowPlayingMessageId");
  if (!channelId || !messageId) return false;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return false;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return false;

  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return false;

  const track = player.data.get("currentTrack") || player.queue?.current || player.current || null;
  if (!track) return false;
  const artworkUrl = player.data.get("currentArtwork") || player.data.get("lastArtwork") || track?.thumbnail || null;
  const artworkBuffer = player.data.get("currentArtworkBuffer") || player.data.get("lastArtworkBuffer") || null;

  const payload = await buildNowPlayingPayload({
    requesterTag: player.data.get("nowPlayingRequester") || message.author?.tag || "Inconnu",
    botLabel: player.data.get("nowPlayingBot") || null,
    player,
    track,
    artworkUrl,
    artworkBuffer,
    query: track?.uri || track?.realUri || "",
    result: { type: "TRACK", tracks: [track] },
  });

  try {
    await message.edit(payload);
    player.data.set("lastNowPlayingRefreshAt", Date.now());
  } catch (error) {
    console.error("Impossible de rafraîchir la carte now playing:", error);
    if (error?.code === 10008 || error?.status === 404) {
      clearNowPlayingTicker(player);
      clearNowPlayingCardState(player);
    }
    return false;
  }

  return true;
}

async function disableNowPlayingCard(player, guildId) {
  const channelId = player?.data?.get("nowPlayingChannelId");
  const messageId = player?.data?.get("nowPlayingMessageId");
  if (!channelId || !messageId) return false;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return false;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return false;

  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return false;

  const track = player.data.get("currentTrack") || player.data.get("lastTrack") || player.queue?.current || player.current || null;
  if (!track) return false;
  const artworkUrl = player.data.get("currentArtwork") || player.data.get("lastArtwork") || track?.thumbnail || null;
  const artworkBuffer = player.data.get("currentArtworkBuffer") || player.data.get("lastArtworkBuffer") || null;

  try {
    await message.edit(
      await buildNowPlayingPayload({
        requesterTag: player.data.get("nowPlayingRequester") || message.author?.tag || "Inconnu",
        botLabel: player.data.get("nowPlayingBot") || null,
        player,
        track,
        artworkUrl,
        artworkBuffer,
        query: track?.uri || track?.realUri || "",
        result: { type: "TRACK", tracks: [track] },
        ended: true,
      }),
    );
  } catch (error) {
    console.error("Impossible de désactiver la carte now playing:", error);
    if (error?.code === 10008 || error?.status === 404) {
      clearNowPlayingTicker(player);
      clearNowPlayingCardState(player);
    }
    return false;
  }

  return true;
}

function ensureNowPlayingTicker(player, guildId) {
  if (player.data.get("nowPlayingTicker")) return;

  const interval = setInterval(async () => {
    try {
      const lastRefreshAt = player.data.get("lastNowPlayingRefreshAt") || 0;
      if (Date.now() - lastRefreshAt < 5500) return;
      const refreshed = await refreshNowPlayingCard(player, guildId);
      if (!refreshed) {
        clearNowPlayingTicker(player);
        clearNowPlayingCardState(player);
      }
    } catch (error) {
      console.error(error);
      clearNowPlayingTicker(player);
      clearNowPlayingCardState(player);
    }
  }, 6000);

  player.data.set("nowPlayingTicker", interval);
}

function clearNowPlayingTicker(player) {
  const interval = player.data.get("nowPlayingTicker");
  if (interval) clearInterval(interval);
  player.data.delete("nowPlayingTicker");
}

function clearNowPlayingCardState(player) {
  if (!player) return;
  player.data.delete("nowPlayingMessageId");
  player.data.delete("nowPlayingChannelId");
  player.data.delete("lastNowPlayingRefreshAt");
}

client.once(Events.ClientReady, async () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
  await ensureGuildIdFromControlClient();
  client.user.setPresence({
    status: "idle",
    activities: [
      {
        name: "discord.gg/zix",
        type: ActivityType.Listening,
      },
    ],
  });
  await deployCommands(client.guilds.cache.keys()).catch((error) => {
    console.error("[Slash] Impossible de déployer les commandes:", error);
  });
  await applySavedProfile(client, "control").catch((error) => {
    console.error("[Profile] Impossible d'appliquer le profil du bot de contrôle:", error);
  });
  client.pool = createBotPool(config);
  await loadCachedPanels();

  for (const bot of client.pool.bots) {
    setupBotVoiceCleanup(bot);

    bot.client.once("clientReady", async () => {
      const restoredProfile = await applySavedProfile(bot.client, `music:${bot.id}`).catch((error) => {
        console.error(`[Profile] Impossible de réappliquer le profil de ${bot.label}:`, error);
        return null;
      });

      if (!restoredProfile) {
        bot.client.user?.setPresence({
          status: "idle",
          activities: [
            {
              name: "discord.gg/zix",
              type: ActivityType.Listening,
            },
          ],
        });
      }

      for (const guildId of panelCache.keys()) {
        await refreshPanel(client, client.pool, guildId);
      }
    });

    bot.kazagumo.on("playerStart", async (player, track) => {
      player.data.set("currentTrack", track);
      player.data.set("lastTrack", track);
      player.data.set(
        "nowPlayingRequester",
        track?.requester?.tag || track?.requester?.username || track?.requester || player.data.get("nowPlayingRequester") || "Inconnu",
      );
      player.data.set("currentArtwork", track?.thumbnail || player.data.get("currentArtwork") || null);
      player.data.set("lastArtwork", track?.thumbnail || player.data.get("lastArtwork") || null);
      const artworkBuffer = await fetchArtworkBuffer(track?.thumbnail || null);
      if (artworkBuffer) {
        player.data.set("currentArtworkBuffer", artworkBuffer);
        player.data.set("lastArtworkBuffer", artworkBuffer);
      }
      ensureNowPlayingTicker(player, player.guildId);
      await refreshNowPlayingCard(player, player.guildId);
      await refreshPanel(client, client.pool, player.guildId);
    });

    bot.kazagumo.on("playerEnd", async (player, track) => {
      player.data.set("lastTrack", track || player.data.get("currentTrack") || null);
      const artwork = track?.thumbnail || player.data.get("currentArtwork") || player.data.get("lastArtwork") || null;
      if (artwork) {
        player.data.set("lastArtwork", artwork);
      }
      const handled = await handlePlayerEnd(player, track);
      if (handled) return;
      await refreshPanel(client, client.pool, player.guildId);
    });

    bot.kazagumo.on("playerEmpty", async (player) => {
      player.data.set("loopMode", "off");
      player.data.delete("loopSnapshot");
      clearNowPlayingTicker(player);
      await disableNowPlayingCard(player, player.guildId);
      player.data.delete("nowPlayingMessageId");
      player.data.delete("nowPlayingChannelId");
      client.pool.releaseGuild(player.guildId, player.voiceId);
      await refreshPanel(client, client.pool, player.guildId);
      player.destroy();
    });
  }

  for (const guildId of panelCache.keys()) {
    await refreshPanel(client, client.pool, guildId);
  }

  if (config.guildId && config.panelChannelId) {
    await ensurePanelForGuild(client, client.pool, config.guildId, config.panelChannelId);
  } else if (config.panelChannelId) {
    console.warn("PANEL_CHANNEL_ID est défini, mais GUILD_ID manque. Le panel auto ne peut pas être envoyé sans guild cible.");
  }
});

client.on(Events.GuildCreate, async (guild) => {
  await deployCommands([guild.id]).catch((error) => {
    console.error(`[Slash] Impossible de déployer les commandes sur ${guild.id}:`, error);
  });
});

async function handleNowPlayingInteraction(interaction) {
  const player = getPlayer(interaction);
  if (!player) {
    await interaction.reply(buildEphemeralTextContainer("> Aucun lecteur actif", "> Aucun lecteur actif."));
    return true;
  }

  if (interaction.customId === "nowplaying:pause") {
    const wasPaused = player.paused;
    await player.pause(!player.paused);
    await interaction.reply({
      ...buildPlaybackStateContainer(player, wasPaused ? "resume" : "pause"),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    await refreshNowPlayingCard(player, interaction.guildId);
    await refreshPanel(client, client.pool, interaction.guildId);
    return true;
  }

  if (interaction.customId === "nowplaying:skip") {
    const hasNext = Boolean(player?.queue?.size || player?.queue?.length);
    if (!hasNext) {
      await interaction.reply({
        ...buildSkipContainer(false),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return true;
    }
    await player.skip();
    await interaction.reply({
      ...buildSkipContainer(hasNext),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    await refreshNowPlayingCard(player, interaction.guildId);
    await refreshPanel(client, client.pool, interaction.guildId);
    return true;
  }

  if (interaction.customId === "nowplaying:stop") {
    await player.destroy();
    client.pool.releaseGuild(interaction.guildId, interaction.member?.voice?.channel?.id || null);
    await interaction.reply(buildEphemeralTextContainer("> Lecture stoppée", "> Lecture stoppée."));
    await refreshPanel(client, client.pool, interaction.guildId);
    return true;
  }

  if (interaction.customId === "nowplaying:queue") {
    await interaction.reply({
      ...buildQueueContainer(player, 0),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return true;
  }

  if (interaction.customId.startsWith("queuepage:")) {
    const page = Number.parseInt(interaction.customId.split(":")[1], 10) || 0;
    await interaction.update(buildQueueContainer(player, page));
    return true;
  }

  return false;
}

client.on("interactionCreate", async (interaction) => {
  if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
    const command = commands.get(interaction.commandName);
    if (!command?.autocomplete) {
      await interaction.respond([]);
      return;
    }

    try {
      const playlists = await (async () => {
        const utils = require("./core/playlist-utils");
        return utils.loadPlaylists();
      })();
      const choices = await command.autocomplete(interaction, playlists, {
        client,
        pool: client.pool,
        config,
      });
      await interaction.respond(Array.isArray(choices) ? choices.slice(0, 25) : []);
    } catch (error) {
      console.error("Autocomplete playlist impossible:", error);
      if (!interaction.responded) {
        await interaction.respond([]);
      }
    }
    return;
  }

  if (interaction.isModalSubmit()) {
    const panelCommand = commands.get("panel");
    if (panelCommand?.handleModal) {
      try {
        if (await panelCommand.handleModal(interaction, {
          client,
          pool: client.pool,
          config,
        })) return;
      } catch (error) {
        console.error(error);
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(buildEphemeralTextContainer("> Erreur", "> Action impossible pour le moment."));
        } else {
          await interaction.reply(buildEphemeralTextContainer("> Erreur", "> Action impossible pour le moment."));
        }
        return;
      }
    }

    const musicTokensCommand = commands.get("music-tokens");
    if (musicTokensCommand?.handleModal) {
      try {
        if (await musicTokensCommand.handleModal(interaction, {
          client,
          pool: client.pool,
          config,
        })) return;
      } catch (error) {
        console.error(error);
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(buildEphemeralTextContainer("> Erreur", "> Action impossible pour le moment."));
        } else {
          await interaction.reply(buildEphemeralTextContainer("> Erreur", "> Action impossible pour le moment."));
        }
        return;
      }
    }
  }

  if (interaction.type === InteractionType.ApplicationCommand) {
    const command = commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction, {
        client,
        pool: client.pool,
        config,
      });
    } catch (error) {
      console.error(error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(buildEphemeralTextContainer("> Erreur", "> Une erreur est survenue."));
      } else {
        await interaction.reply(buildEphemeralTextContainer("> Erreur", "> Une erreur est survenue."));
      }
    }
    return;
  }

  if (!interaction.isButton()) return;

  const musicTokensCommand = commands.get("music-tokens");
  if (musicTokensCommand?.handleComponent) {
    try {
      if (await musicTokensCommand.handleComponent(interaction, {
        client,
        pool: client.pool,
        config,
      })) return;
    } catch (error) {
      console.error(error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(buildEphemeralTextContainer("> Erreur", "> Action impossible pour le moment."));
      } else {
        await interaction.reply(buildEphemeralTextContainer("> Erreur", "> Action impossible pour le moment."));
      }
      return;
    }
  }

  const panelCommand = commands.get("panel");
  if (panelCommand?.handleComponent) {
    try {
      if (await panelCommand.handleComponent(interaction, {
        client,
        pool: client.pool,
        config,
      })) return;
    } catch (error) {
      console.error(error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(buildEphemeralTextContainer("> Erreur", "> Action impossible pour le moment."));
      } else {
        await interaction.reply(buildEphemeralTextContainer("> Erreur", "> Action impossible pour le moment."));
      }
      return;
    }
  }

  if (interaction.customId.startsWith("nowplaying:")) {
    try {
      if (await handleNowPlayingInteraction(interaction)) return;
    } catch (error) {
      console.error(error);
      if (!interaction.replied) {
        await interaction.reply(buildEphemeralTextContainer("> Erreur", "> Action impossible pour le moment."));
      }
    }
    return;
  }

  const player = getPlayer(interaction);
  const memberVoice = interaction.member?.voice?.channel;

  function requireVoice() {
    if (memberVoice) return true;
    interaction.reply(buildEphemeralTextContainer("> Salon vocal requis", "> Tu dois être en vocal."));
    return false;
  }

  try {
    if (interaction.customId === "music:joinbot") {
      if (!requireVoice()) return;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const existingPlayer = getPlayer(interaction);
        await ensurePlayer(client.pool, interaction);
        await interaction.editReply(
          buildJoinBotContainer({
            alreadyConnected: Boolean(existingPlayer),
            voiceChannel: memberVoice ? memberVoice.toString() : null,
          }),
        );
        await refreshPanel(client, client.pool, interaction.guildId);
      } catch (error) {
        if (String(error?.message || "").includes("Aucun bot libre")) {
          await interaction.editReply(
            buildBotBusyContainer(getRosterWithGuildNames()),
          );
          return;
        }

        await interaction.editReply(
          buildTextContainer(
            "Erreur",
            error.message || "> Impossible de faire rejoindre un bot pour le moment.",
            0xed4245,
          ),
        );
      }
      return;
    }

    if (interaction.customId === "music:getbot") {
      await interaction.reply(buildObtainBotContainer());
      return;
    }

    if (interaction.customId === "music:help") {
      await interaction.reply(buildHelpContainer());
      return;
    }

    if (interaction.customId === "music:queue") {
      if (!requireVoice() || !player) {
        if (memberVoice && !player) {
          await interaction.reply({
            ...buildNoPlayerContainer(),
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
        }
        return;
      }

      await interaction.reply({
        ...buildQueueContainer(player),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.customId === "music:playpause") {
      if (!requireVoice() || !player) {
        if (memberVoice && !player) {
          await interaction.reply(buildEphemeralTextContainer("> Aucun lecteur actif", "> Aucun lecteur actif."));
        }
        return;
      }

      const wasPaused = player.paused;
      await player.pause(!player.paused);
      await interaction.reply({
        ...buildPlaybackStateContainer(player, wasPaused ? "resume" : "pause"),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      await refreshPanel(client, client.pool, interaction.guildId);
      return;
    }

    if (interaction.customId === "music:skip") {
      if (!requireVoice() || !player) {
        if (memberVoice && !player) {
          await interaction.reply(buildEphemeralTextContainer("> Aucun lecteur actif", "> Aucun lecteur actif."));
        }
        return;
      }
      const hasNext = Boolean(player?.queue?.size || player?.queue?.length);
      if (!hasNext) {
        await interaction.reply({
          ...buildSkipContainer(false),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        return;
      }
      await player.skip();
      await interaction.reply({
        ...buildSkipContainer(hasNext),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      await refreshNowPlayingCard(player, interaction.guildId);
      await refreshPanel(client, client.pool, interaction.guildId);
      return;
    }

    if (interaction.customId === "music:previous") {
      if (!requireVoice() || !player) {
        if (memberVoice && !player) {
          await interaction.reply(buildEphemeralTextContainer("> Aucun lecteur actif", "> Aucun lecteur actif."));
        }
        return;
      }
      const previous = player.getPrevious?.(true);
      if (!previous) {
        await interaction.reply({
          ...buildPreviousContainer(false),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
        return;
      }
      await player.play(previous);
      await interaction.reply({
        ...buildPreviousContainer(true),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      await refreshPanel(client, client.pool, interaction.guildId);
      return;
    }

    if (interaction.customId === "music:loop") {
      if (!requireVoice() || !player) {
        if (memberVoice && !player) {
          await interaction.reply(buildEphemeralTextContainer("> Aucun lecteur actif", "> Aucun lecteur actif."));
        }
        return;
      }
      const mode = await toggleLoop(player);
      await interaction.reply(buildEphemeralTextContainer("Mode loop", `Mode loop: **${mode}**`));
      await refreshPanel(client, client.pool, interaction.guildId);
      return;
    }
  } catch (error) {
    console.error(error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(buildEphemeralTextContainer("> Erreur", "> Action impossible pour le moment."));
    } else {
      await interaction.reply(buildEphemeralTextContainer("> Erreur", "> Action impossible pour le moment."));
    }
  }
});

loadCommands();

const storageId = process.env.BOT_STORAGE_ID
  || path.basename(path.dirname(__dirname));
loginManagedBot(client, storageId)
  .then(() => {
    console.log(`[!] — Logged in as ${client.user.tag} (${client.user.id})`);
  })
  .catch((error) => {
    console.error(error);
    console.log("\x1b[31m[!] — Please configure a valid bot token\x1b[0m");
  });
