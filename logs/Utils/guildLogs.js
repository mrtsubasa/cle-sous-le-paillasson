const Discord = require('discord.js');
const { getGuildLogTarget } = require('./logsGuildConfig');

const VERIFICATION_LEVELS = {
  [Discord.GuildVerificationLevel.None]: 'Aucune',
  [Discord.GuildVerificationLevel.Low]: 'Faible',
  [Discord.GuildVerificationLevel.Medium]: 'Moyenne',
  [Discord.GuildVerificationLevel.High]: 'Élevée',
  [Discord.GuildVerificationLevel.VeryHigh]: 'Très élevée',
};

const EXPLICIT_FILTERS = {
  [Discord.GuildExplicitContentFilter.Disabled]: 'Désactivé',
  [Discord.GuildExplicitContentFilter.MembersWithoutRoles]: 'Membres sans rôle',
  [Discord.GuildExplicitContentFilter.AllMembers]: 'Tous les membres',
};

const DEFAULT_NOTIFICATIONS = {
  [Discord.GuildDefaultMessageNotifications.AllMessages]: 'Tous les messages',
  [Discord.GuildDefaultMessageNotifications.OnlyMentions]: 'Mentions uniquement',
};

const MFA_LEVELS = {
  [Discord.GuildMFALevel.None]: 'Aucun',
  [Discord.GuildMFALevel.Elevated]: 'Élevé',
};

const NSFW_LEVELS = {
  [Discord.GuildNSFWLevel.Default]: 'Défaut',
  [Discord.GuildNSFWLevel.Explicit]: 'Explicite',
  [Discord.GuildNSFWLevel.Safe]: 'Safe',
  [Discord.GuildNSFWLevel.AgeRestricted]: 'Age restricted',
};

const PREMIUM_TIERS = {
  [Discord.GuildPremiumTier.None]: 'Aucun',
  [Discord.GuildPremiumTier.Tier1]: 'Tier 1',
  [Discord.GuildPremiumTier.Tier2]: 'Tier 2',
  [Discord.GuildPremiumTier.Tier3]: 'Tier 3',
};

const IGNORED_AUTO_FEATURE_CHANGES = new Set([
  'SOUNDBOARD',
]);

function cleanInline(value, fallback = 'Aucun') {
  const text = String(value ?? fallback).replace(/`/g, "'").trim();
  return text || fallback;
}

function truncate(value, max = 140) {
  const text = cleanInline(value);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function formatUserWithId(user) {
  return user?.id ? `<@${user.id}> (\`${user.id}\`)` : 'Utilisateur inconnu (`inconnu`)';
}

function formatBool(value) {
  return value ? 'Oui' : 'Non';
}

function formatChannel(guild, channelId) {
  if (!channelId) return 'Aucun';
  const channel = guild?.channels?.cache?.get(channelId);
  return channel ? `#${cleanInline(channel.name)} (${channel.id})` : channelId;
}

function formatOwner(guild, ownerId) {
  if (!ownerId) return 'Aucun';
  const member = guild?.members?.cache?.get(ownerId);
  return member?.user ? `${member.user.tag || member.user.username} (${ownerId})` : ownerId;
}

function assetUrl(guild, type) {
  const options = { extension: 'png', size: 1024 };
  if (type === 'icon') return guild?.iconURL?.(options) || 'Aucun';
  if (type === 'banner') return guild?.bannerURL?.(options) || 'Aucun';
  if (type === 'splash') return guild?.splashURL?.(options) || 'Aucun';
  if (type === 'discoverySplash') return guild?.discoverySplashURL?.(options) || 'Aucun';
  return 'Aucun';
}

function formatFeatures(features) {
  const list = [...(features || [])].sort();
  return list.length ? list.join(', ') : 'Aucun';
}

function featureDiff(oldFeatures, newFeatures) {
  const oldSet = new Set(oldFeatures || []);
  const newSet = new Set(newFeatures || []);
  const added = [...newSet].filter((feature) => !oldSet.has(feature) && !IGNORED_AUTO_FEATURE_CHANGES.has(feature));
  const removed = [...oldSet].filter((feature) => !newSet.has(feature) && !IGNORED_AUTO_FEATURE_CHANGES.has(feature));
  const parts = [];

  if (added.length) parts.push(`ajoutées: ${added.join(', ')}`);
  if (removed.length) parts.push(`retirées: ${removed.join(', ')}`);

  return parts.length ? parts.join(' / ') : null;
}

function addChange(changes, label, before, after) {
  if (before === after) return;
  changes.push(`  - ${label} : \`${truncate(before)}\` -> \`${truncate(after)}\``);
}

function addRawChange(changes, label, before, after) {
  if (before === after) return;
  changes.push(`  - ${label} : ${before} -> ${after}`);
}

function getChanges(oldGuild, newGuild) {
  const changes = [];

  addChange(changes, 'Nom', oldGuild.name, newGuild.name);
  addChange(changes, 'Description', oldGuild.description, newGuild.description);
  addChange(changes, 'Owner', formatOwner(oldGuild, oldGuild.ownerId), formatOwner(newGuild, newGuild.ownerId));
  addChange(changes, 'Vérification', VERIFICATION_LEVELS[oldGuild.verificationLevel], VERIFICATION_LEVELS[newGuild.verificationLevel]);
  addChange(changes, 'Filtre contenu explicite', EXPLICIT_FILTERS[oldGuild.explicitContentFilter], EXPLICIT_FILTERS[newGuild.explicitContentFilter]);
  addChange(changes, 'Notifications par défaut', DEFAULT_NOTIFICATIONS[oldGuild.defaultMessageNotifications], DEFAULT_NOTIFICATIONS[newGuild.defaultMessageNotifications]);
  addChange(changes, 'MFA', MFA_LEVELS[oldGuild.mfaLevel], MFA_LEVELS[newGuild.mfaLevel]);
  addChange(changes, 'NSFW', NSFW_LEVELS[oldGuild.nsfwLevel], NSFW_LEVELS[newGuild.nsfwLevel]);
  addChange(changes, 'Niveau boost', PREMIUM_TIERS[oldGuild.premiumTier], PREMIUM_TIERS[newGuild.premiumTier]);
  addChange(changes, 'Boosts', oldGuild.premiumSubscriptionCount ?? 0, newGuild.premiumSubscriptionCount ?? 0);
  addChange(changes, 'Locale', oldGuild.preferredLocale, newGuild.preferredLocale);
  addChange(changes, 'Vanity URL', oldGuild.vanityURLCode, newGuild.vanityURLCode);
  addChange(changes, 'AFK salon', formatChannel(oldGuild, oldGuild.afkChannelId), formatChannel(newGuild, newGuild.afkChannelId));
  addChange(changes, 'AFK timeout', oldGuild.afkTimeout, newGuild.afkTimeout);
  addChange(changes, 'Salon système', formatChannel(oldGuild, oldGuild.systemChannelId), formatChannel(newGuild, newGuild.systemChannelId));
  addChange(changes, 'Salon règles', formatChannel(oldGuild, oldGuild.rulesChannelId), formatChannel(newGuild, newGuild.rulesChannelId));
  addChange(changes, 'Salon updates', formatChannel(oldGuild, oldGuild.publicUpdatesChannelId), formatChannel(newGuild, newGuild.publicUpdatesChannelId));
  addChange(changes, 'Salon safety alerts', formatChannel(oldGuild, oldGuild.safetyAlertsChannelId), formatChannel(newGuild, newGuild.safetyAlertsChannelId));
  addChange(changes, 'Widget activé', formatBool(oldGuild.widgetEnabled), formatBool(newGuild.widgetEnabled));
  addChange(changes, 'Salon widget', formatChannel(oldGuild, oldGuild.widgetChannelId), formatChannel(newGuild, newGuild.widgetChannelId));
  addChange(changes, 'Barre progression boosts', formatBool(oldGuild.premiumProgressBarEnabled), formatBool(newGuild.premiumProgressBarEnabled));
  addChange(changes, 'Maximum membres', oldGuild.maximumMembers, newGuild.maximumMembers);
  addChange(changes, 'Maximum présences', oldGuild.maximumPresences, newGuild.maximumPresences);
  addChange(changes, 'Flags salon système', oldGuild.systemChannelFlags?.bitfield ?? 0, newGuild.systemChannelFlags?.bitfield ?? 0);

  addRawChange(changes, 'Icône', `\`${truncate(assetUrl(oldGuild, 'icon'))}\``, `\`${truncate(assetUrl(newGuild, 'icon'))}\``);
  addRawChange(changes, 'Bannière', `\`${truncate(assetUrl(oldGuild, 'banner'))}\``, `\`${truncate(assetUrl(newGuild, 'banner'))}\``);
  addRawChange(changes, 'Splash', `\`${truncate(assetUrl(oldGuild, 'splash'))}\``, `\`${truncate(assetUrl(newGuild, 'splash'))}\``);
  addRawChange(changes, 'Discovery splash', `\`${truncate(assetUrl(oldGuild, 'discoverySplash'))}\``, `\`${truncate(assetUrl(newGuild, 'discoverySplash'))}\``);

  if (formatFeatures(oldGuild.features) !== formatFeatures(newGuild.features)) {
    const featuresChange = featureDiff(oldGuild.features, newGuild.features);
    if (featuresChange) {
      changes.push(`  - Features : \`${truncate(featuresChange, 300)}\``);
    }
  }

  return changes;
}

async function getLogChannel(bot, target) {
  const destinationGuild = bot.guilds.cache.get(target.secondaryGuildId)
    || await bot.guilds.fetch(target.secondaryGuildId).catch(() => null);
  if (!destinationGuild) return null;

  const logChannel = destinationGuild.channels.cache.get(target.channelId)
    || await destinationGuild.channels.fetch(target.channelId).catch(() => null);

  return logChannel?.isTextBased?.() ? logChannel : null;
}

function chunkLines(lines, maxLength = 1800) {
  const chunks = [];
  let current = '';

  for (const line of lines) {
    if ((current + line + '\n').length > maxLength && current) {
      chunks.push(current.trimEnd());
      current = '';
    }

    current += `${line}\n`;
  }

  if (current.trim()) chunks.push(current.trimEnd());
  return chunks;
}

function buildGuildUpdateLog(data, changes) {
  const timestamp = Math.floor(Date.now() / 1000);
  const chunks = chunkLines(changes);
  const container = new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `📝 **Modification du serveur !**\n\n`
        + `- Auteur :\n  - ${formatUserWithId(data.executor)}\n\n`
        + `- Serveur :\n`
        + `  - Nom : \`${cleanInline(data.guild?.name, 'Serveur inconnu')}\`\n`
        + `  - ID : \`${data.guild?.id || 'inconnu'}\`\n\n`
        + `- Changements :`,
      ),
    );

  for (const chunk of chunks) {
    container.addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(chunk),
    );
  }

  return container
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

function buildGuildUnavailableLog(guild) {
  const timestamp = Math.floor(Date.now() / 1000);

  return new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `⚠️ **Serveur indisponible !**\n\n`
        + `- Serveur :\n`
        + `  - Nom : \`${cleanInline(guild?.name, 'Serveur inconnu')}\`\n`
        + `  - ID : \`${guild?.id || 'inconnu'}\`\n`
        + `  - Disponible : \`Non\`\n\n`
        + `- Information :\n`
        + `  - Discord a marqué ce serveur comme indisponible. Ça peut arriver pendant une panne, une maintenance ou un souci de connexion avec la gateway.`,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

async function sendGuildUpdateLog(bot, sourceGuildId, data) {
  const target = getGuildLogTarget(bot, sourceGuildId, 'update');
  if (!target) return;

  const changes = getChanges(data.oldGuild, data.guild);
  if (!changes.length) return;

  const logChannel = await getLogChannel(bot, target);
  if (!logChannel) return;

  await logChannel.send({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildGuildUpdateLog(data, changes)],
    allowedMentions: { parse: [] },
  }).catch((error) => {
    console.error(`Erreur log guildUpdate : ${error?.message || error}`);
  });
}

async function sendGuildUnavailableLog(bot, sourceGuildId, guild) {
  const target = getGuildLogTarget(bot, sourceGuildId, 'unavailable');
  if (!target) return;

  const logChannel = await getLogChannel(bot, target);
  if (!logChannel) return;

  await logChannel.send({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildGuildUnavailableLog(guild)],
    allowedMentions: { parse: [] },
  }).catch((error) => {
    console.error(`Erreur log guildUnavailable : ${error?.message || error}`);
  });
}

module.exports = {
  sendGuildUnavailableLog,
  sendGuildUpdateLog,
};
