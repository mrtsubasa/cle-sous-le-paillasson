const fs = require("fs/promises");
const path = require("path");
const {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const { resolveTracks, detectInputSource } = require("./music");

const PLAYLISTS_PATH = path.join(__dirname, "..", "data", "playlists.json");

async function ensureStorageDir() {
  await fs.mkdir(path.dirname(PLAYLISTS_PATH), { recursive: true });
}

async function loadPlaylists() {
  try {
    const raw = await fs.readFile(PLAYLISTS_PATH, "utf8");
    return normalizePlaylists(JSON.parse(raw));
  } catch {
    return {};
  }
}

async function savePlaylists(playlists) {
  await ensureStorageDir();
  await fs.writeFile(PLAYLISTS_PATH, `${JSON.stringify(playlists, null, 2)}\n`, "utf8");
}

function normalizeName(name) {
  return `${name || ""}`.trim().replace(/\s+/g, " ");
}

function normalizePlaylistTrack(track) {
  if (!track) return null;
  if (typeof track === "string") {
    return {
      query: track,
      title: track,
      source: "unknown",
      addedAt: Date.now(),
    };
  }

  if (typeof track !== "object") return null;

  const query = `${track.query || track.url || track.title || ""}`.trim();
  if (!query) return null;

  return {
    query,
    title: `${track.title || query}`.trim(),
    source: `${track.source || detectInputSource(query) || "unknown"}`.toLowerCase(),
    addedAt: Number(track.addedAt) || Date.now(),
  };
}

function normalizePlaylistRecord(record, playlistName) {
  if (Array.isArray(record)) {
    return {
      name: playlistName,
      tracks: record.map(normalizePlaylistTrack).filter(Boolean),
    };
  }

  if (!record || typeof record !== "object") {
    return {
      name: playlistName,
      tracks: [],
    };
  }

  return {
    name: normalizeName(record.name || playlistName),
    tracks: Array.isArray(record.tracks) ? record.tracks.map(normalizePlaylistTrack).filter(Boolean) : [],
  };
}

function normalizePlaylists(playlists) {
  const output = {};

  for (const [guildId, guildPlaylists] of Object.entries(playlists || {})) {
    output[guildId] = {};
    for (const [userId, userPlaylists] of Object.entries(guildPlaylists || {})) {
      output[guildId][userId] = {};
      for (const [playlistName, record] of Object.entries(userPlaylists || {})) {
        output[guildId][userId][playlistName] = normalizePlaylistRecord(record, playlistName);
      }
    }
  }

  return output;
}

function getUserPlaylists(playlists, guildId, userId) {
  return playlists?.[guildId]?.[userId] || {};
}

function getPlaylistChoices(playlists, guildId, userId, focused = "") {
  const names = Object.keys(getUserPlaylists(playlists, guildId, userId));
  const query = `${focused || ""}`.trim().toLowerCase();

  return names
    .filter((name) => !query || name.toLowerCase().includes(query))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 25)
    .map((name) => ({ name, value: name }));
}

function buildPlaylistContainer(title, message) {
  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# **${title}**`),
      new TextDisplayBuilder().setContent(message),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

function buildPlaylistListContainer(playlists) {
  const names = Object.keys(playlists || {});
  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# **Tes playlists**"),
      new TextDisplayBuilder().setContent(names.length ? "> Voici les playlists enregistrées" : "Tu n'as encore aucune playlist."),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1));

  if (!names.length) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("> Crée-en une avec `/playlist-create`."),
    );
  } else {
    const lines = names
      .sort((a, b) => a.localeCompare(b))
      .map((name, index) => {
        const count = playlists[name]?.tracks?.length || 0;
        return `> ${String(index + 1).padStart(2, "0")}. ${name} - ${count} morceau${count > 1 ? "x" : ""}`;
      });

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(lines.join("\n")),
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

function buildPlaylistDetailsContainer(playlistName, playlist) {
  const tracks = Array.isArray(playlist?.tracks) ? playlist.tracks : [];
  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# **${playlistName}**`),
      new TextDisplayBuilder().setContent(tracks.length ? `> ${tracks.length} morceau${tracks.length > 1 ? "x" : ""} dans cette playlist.` : "Cette playlist est vide."),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1));

  if (tracks.length) {
    const lines = tracks.slice(0, 10).map((track, index) => {
      const source = track?.source || "unknown";
      return `${String(index + 1).padStart(2, "0")}. ${track?.title || track?.query || "Morceau"} - ${source}`;
    });
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(lines.join("\n")),
    );
    if (tracks.length > 10) {
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1));
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`> Et ${tracks.length - 10} morceau${tracks.length - 10 > 1 ? "x" : ""} de plus...`),
      );
    }
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("> Ajoute des morceaux avec `/playlist-add`."),
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

async function resolveTrackSummary(pool, query, requester, guildId = null, voiceId = null) {
  const bot = pool?.getBotForGuild?.(guildId, voiceId)
    || (guildId ? pool?.getGuildView?.(guildId)?.bot : null)
    || pool?.bots?.find((entry) => entry.ready) || null;
  if (!bot) {
    return {
      title: query,
      source: detectInputSource(query),
      query,
      tracks: [],
    };
  }

  const result = await resolveTracks(bot, query, requester).catch(() => null);
  if (!result?.tracks?.length) {
    return {
      title: query,
      source: detectInputSource(query),
      query,
      tracks: [],
    };
  }

  if (result.type === "PLAYLIST") {
    return {
      title: result.playlistName || query,
      source: detectInputSource(query),
      query,
      tracks: result.tracks.map((track) => ({
        query: track.uri || track.realUri || track.title || query,
        title: track.title || track.author || query,
        source: track.sourceName || detectInputSource(query),
      })),
    };
  }

  const track = result.tracks[0];
  return {
    title: track.title || query,
    source: track.sourceName || detectInputSource(query),
    query,
    tracks: [
      {
        query: track.uri || track.realUri || track.title || query,
        title: track.title || track.author || query,
        source: track.sourceName || detectInputSource(query),
      },
    ],
  };
}

async function queuePlaylistEntries(player, bot, requester, entries) {
  const queued = [];
  const skipped = [];
  const queuedTracks = [];

  for (const entry of entries) {
    try {
      const result = await resolveTracks(bot, entry.query, requester);
      if (!result?.tracks?.length) {
        skipped.push(entry.title || entry.query);
        continue;
      }

      if (result.type === "PLAYLIST") {
        player.queue.add(result.tracks);
        queued.push(...result.tracks.map((track) => track.title || entry.title || entry.query));
        queuedTracks.push(...result.tracks);
      } else {
        player.queue.add(result.tracks[0]);
        queued.push(result.tracks[0].title || entry.title || entry.query);
        queuedTracks.push(result.tracks[0]);
      }
    } catch {
      skipped.push(entry.title || entry.query);
    }
  }

  if (!player.playing && !player.paused && (player.queue?.length || player.queue?.size)) {
    await player.play();
  }

  return { queued, skipped, queuedTracks };
}

module.exports = {
  buildPlaylistContainer,
  buildPlaylistDetailsContainer,
  buildPlaylistListContainer,
  getPlaylistChoices,
  getUserPlaylists,
  loadPlaylists,
  normalizeName,
  normalizePlaylistRecord,
  normalizePlaylists,
  queuePlaylistEntries,
  resolveTrackSummary,
  savePlaylists,
};
