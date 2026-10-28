const Discord = require('discord.js');
const { getSoundboardLogTarget } = require('./logsGuildConfig');

const SOUNDBOARD_META = {
  create: { icon: '✅', title: 'Son soundboard créé', auditType: Discord.AuditLogEvent.SoundboardSoundCreate },
  delete: { icon: '<:ee:1434328162426294436>', title: 'Son soundboard supprimé', auditType: Discord.AuditLogEvent.SoundboardSoundDelete },
  update: { icon: '📝', title: 'Son soundboard modifié', auditType: Discord.AuditLogEvent.SoundboardSoundUpdate },
  sounds_update: { icon: '📝', title: 'Liste des sons soundboard mise à jour' },
  sounds: { icon: '🔊', title: 'Sons soundboard reçus' },
};

function cleanInline(value, fallback = 'Aucun') {
  const text = String(value ?? fallback).replace(/`/g, "'").trim();
  return text || fallback;
}

function truncate(value, max = 180) {
  const text = cleanInline(value);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function formatUserWithId(user) {
  return user?.id ? `<@${user.id}> (\`${user.id}\`)` : 'Utilisateur inconnu (`inconnu`)';
}

function soundId(sound) {
  return sound?.soundId || sound?.id || 'inconnu';
}

function soundUrl(sound) {
  if (sound?.url) return sound.url;
  const id = soundId(sound);
  return id !== 'inconnu' ? `https://cdn.discordapp.com/soundboard-sounds/${id}` : '';
}

function soundEmoji(sound) {
  if (sound?.emoji) return `${sound.emoji}`;
  const raw = sound?._emoji;
  if (raw?.id) return `<:${raw.name || 'emoji'}:${raw.id}>`;
  if (raw?.name) return raw.name;
  return 'Aucun';
}

function soundInfo(sound) {
  return `  - Nom : \`${cleanInline(sound?.name, 'Son inconnu')}\`\n`
    + `  - ID : \`${soundId(sound)}\`\n`
    + `  - URL : \`${truncate(soundUrl(sound) || 'Aucune', 260)}\`\n`
    + `  - Emoji : ${soundEmoji(sound)}\n`
    + `  - Volume : \`${sound?.volume ?? 'inconnu'}\`\n`
    + `  - Disponible : \`${sound?.available ? 'Oui' : 'Non'}\`\n`
    + `  - Créateur : ${formatUserWithId(sound?.user)}\n`
    + `  - Serveur : \`${sound?.guild?.name || sound?.guildId || 'inconnu'}\``;
}

function getChanges(oldSound, newSound) {
  const changes = [];

  if (oldSound?.name !== newSound?.name) {
    changes.push(`  - Nom : \`${cleanInline(oldSound?.name)}\` -> \`${cleanInline(newSound?.name)}\``);
  }

  if (oldSound?.volume !== newSound?.volume) {
    changes.push(`  - Volume : \`${oldSound?.volume ?? 'inconnu'}\` -> \`${newSound?.volume ?? 'inconnu'}\``);
  }

  if (oldSound?.available !== newSound?.available) {
    changes.push(`  - Disponible : \`${oldSound?.available ? 'Oui' : 'Non'}\` -> \`${newSound?.available ? 'Oui' : 'Non'}\``);
  }

  if (soundEmoji(oldSound) !== soundEmoji(newSound)) {
    changes.push(`  - Emoji : \`${cleanInline(soundEmoji(oldSound))}\` -> \`${cleanInline(soundEmoji(newSound))}\``);
  }

  return changes.length ? changes.join('\n') : '  - Aucun changement détecté';
}

function soundsList(sounds) {
  const values = [...(sounds?.values?.() || [])];
  if (!values.length) return '  - Aucun son';

  return values.slice(0, 20).map((sound) => (
    `  - \`${cleanInline(sound.name, 'Son inconnu')}\` (${soundId(sound)}) - ${soundEmoji(sound)}`
  )).join('\n') + (values.length > 20 ? `\n  - ... +${values.length - 20} autres sons` : '');
}

async function getLogChannel(bot, target) {
  const destinationGuild = bot.guilds.cache.get(target.secondaryGuildId)
    || await bot.guilds.fetch(target.secondaryGuildId).catch(() => null);
  if (!destinationGuild) return null;

  const logChannel = destinationGuild.channels.cache.get(target.channelId)
    || await destinationGuild.channels.fetch(target.channelId).catch(() => null);

  return logChannel?.isTextBased?.() ? logChannel : null;
}

function safeAudioFilename(sound) {
  const baseName = cleanInline(sound?.name, `sound-${soundId(sound)}`)
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || `sound-${soundId(sound)}`;
  return `${baseName}.ogg`;
}

async function createSoundAttachment(sound) {
  const url = soundUrl(sound);
  if (!url || typeof fetch !== 'function') return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (!buffer.length || buffer.length > 24 * 1024 * 1024) return null;

    const name = safeAudioFilename(sound);
    return {
      name,
      attachment: new Discord.AttachmentBuilder(buffer, {
        name,
        description: `Audio soundboard ${cleanInline(sound?.name, soundId(sound))}`,
      }),
    };
  } catch {
    return null;
  }
}

async function createSoundAttachments(sounds, limit = 5) {
  const values = [...(sounds?.values?.() || [])].slice(0, limit);
  const results = await Promise.all(values.map((sound) => createSoundAttachment(sound)));
  return results.filter(Boolean);
}

function addAudioFiles(container, audioFiles) {
  for (const file of audioFiles) {
    container.addFileComponents(
      new Discord.FileBuilder().setURL(`attachment://${file.name}`),
    );
  }
}

function buildSoundboardSoundLog(action, data, audioFiles = []) {
  const meta = SOUNDBOARD_META[action] || SOUNDBOARD_META.update;
  const timestamp = Math.floor(Date.now() / 1000);
  const changes = action === 'update' ? `\n\n- Changements :\n${getChanges(data.oldSound, data.sound)}` : '';
  const container = new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `${meta.icon} **${meta.title} !**\n\n`
        + `- Auteur :\n  - ${formatUserWithId(data.executor || data.sound?.user)}\n\n`
        + `- Son :\n${soundInfo(data.sound)}${changes}`,
      ),
    );

  addAudioFiles(container, audioFiles);

  return container
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

function buildSoundboardSoundsLog(action, data, audioFiles = []) {
  const meta = SOUNDBOARD_META[action] || SOUNDBOARD_META.sounds;
  const timestamp = Math.floor(Date.now() / 1000);
  const container = new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `${meta.icon} **${meta.title} !**\n\n`
        + `- Serveur :\n`
        + `  - Nom : \`${cleanInline(data.guild?.name, 'Serveur inconnu')}\`\n`
        + `  - ID : \`${data.guild?.id || 'inconnu'}\`\n\n`
        + `- Sons :\n${soundsList(data.sounds)}`,
      ),
    );

  addAudioFiles(container, audioFiles);

  return container
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

async function sendSoundboardLog(bot, sourceGuildId, action, data) {
  const target = getSoundboardLogTarget(bot, sourceGuildId, action);
  if (!target) return;

  const logChannel = await getLogChannel(bot, target);
  if (!logChannel) return;

  const isList = action === 'sounds' || action === 'sounds_update';
  const audioFile = isList ? null : await createSoundAttachment(data.sound);
  const audioFiles = isList
    ? await createSoundAttachments(data.sounds, 5)
    : [audioFile].filter(Boolean);

  const components = [
    isList
      ? buildSoundboardSoundsLog(action, data, audioFiles)
      : buildSoundboardSoundLog(action, data, audioFiles),
  ];

  await logChannel.send({
    flags: Discord.MessageFlags.IsComponentsV2,
    components,
    files: audioFiles.map((file) => file.attachment),
    allowedMentions: { parse: [] },
  }).catch((error) => {
    console.error(`Erreur log soundboard ${action} : ${error?.message || error}`);
  });
}

async function getSoundboardAuditEntry(guild, soundIdValue, action) {
  const meta = SOUNDBOARD_META[action];
  if (!meta?.auditType) return null;

  const logs = await guild.fetchAuditLogs({
    type: meta.auditType,
    limit: 6,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id || auditEntry.target?.soundId;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 12000;
    return targetId === soundIdValue && isRecent;
  }) || null;
}

module.exports = {
  getSoundboardAuditEntry,
  sendSoundboardLog,
};
