const { KazagumoTrack } = require("kazagumo");

function detectInputSource(query) {
  const input = `${query || ""}`.trim().toLowerCase();

  if (/open\.spotify\.com|spotify\.com/.test(input)) return "spotify";
  if (/youtube\.com|youtu\.be|music\.youtube\.com/.test(input)) return "youtube";
  if (/soundcloud\.com/.test(input)) return "soundcloud";
  if (/deezer\.com/.test(input)) return "deezer";
  return "unknown";
}

function resolveTracks(bot, query, requester) {
  const source = detectInputSource(query);
  const options = { requester };

  if (source === "spotify") {
    options.engine = "spotify";
  }

  return bot.kazagumo.search(query, options);
}

async function ensureBotForGuild(pool, guildId, voiceId) {
  const bot = pool.allocateBot(guildId, voiceId);
  if (!bot) {
    throw new Error("> Aucun bot libre n'est disponible pour le moment.");
  }

  if (!bot.ready) {
    throw new Error("> Le bot musique choisi n'est pas encore prêt.");
  }

  return bot;
}

async function ensurePlayer(pool, interaction) {
  const memberVoice = interaction.member?.voice?.channel;
  if (!memberVoice) {
    throw new Error("> Tu dois être dans un salon vocal.");
  }

  const bot = await ensureBotForGuild(pool, interaction.guildId, memberVoice.id);
  let player = bot.kazagumo.players.get(interaction.guildId);

  if (!player) {
    player = await bot.kazagumo.createPlayer({
      guildId: interaction.guildId,
      textId: interaction.channelId,
      voiceId: memberVoice.id,
      volume: 80,
    });
    player.data.set("loopMode", "off");
  } else {
    if (player.textId !== interaction.channelId) {
      player.setTextChannel(interaction.channelId);
    }
    if (player.voiceId !== memberVoice.id) {
      await player.setVoiceChannel(memberVoice.id);
    }
  }

  return { bot, player };
}

async function queueTrack(pool, interaction, query) {
  const { bot, player } = await ensurePlayer(pool, interaction);
  const source = detectInputSource(query);
  player.data.set("requestedSource", source);

  const result = await resolveTracks(bot, query, interaction.user);

  if (!result?.tracks?.length) {
    if (source === "spotify") {
      throw new Error("> Ce lien Spotify n'est pas résolu par ton node Lavalink. Active le support Spotify/LavaSrc pour jouer le bon morceau.");
    }

    return { bot, player, result: null };
  }

  if (result.type === "PLAYLIST") {
    player.queue.add(result.tracks);
  } else {
    player.queue.add(result.tracks[0]);
  }

  if (!player.playing && !player.paused) {
    await player.play();
  }

  return { bot, player, result };
}

async function toggleLoop(player) {
  const current = player.data.get("loopMode") || "off";
  const next = current === "off" ? "track" : current === "track" ? "queue" : "off";
  player.data.set("loopMode", next);

  if (next === "queue") {
    player.data.set("loopSnapshot", Array.from(player.queue));
  } else {
    player.data.delete("loopSnapshot");
  }

  return next;
}

async function handlePlayerEnd(player, track) {
  const endedTrack = track || player.data.get("currentTrack") || null;
  const loopMode = player.data.get("loopMode") || "off";

  if (loopMode === "track" && endedTrack) {
    await player.play(endedTrack);
    return true;
  }

  if (loopMode === "queue" && player.queue.length === 0) {
    const snapshot = player.data.get("loopSnapshot") || [];
    if (snapshot.length > 0) {
      player.queue.add(snapshot);
      await player.play();
      return true;
    }
  }

  return false;
}

function forceTrack(bot, guildId, track, requester) {
  const player = bot.kazagumo.players.get(guildId);
  if (!player) return null;
  return player.play(new KazagumoTrack(track.getRaw(), requester));
}

module.exports = {
  ensurePlayer,
  forceTrack,
  handlePlayerEnd,
  detectInputSource,
  queueTrack,
  resolveTracks,
  toggleLoop,
};
