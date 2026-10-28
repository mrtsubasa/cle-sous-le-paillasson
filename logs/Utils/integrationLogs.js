const Discord = require('discord.js');
const { getIntegrationLogTarget } = require('./logsGuildConfig');

const INTEGRATION_META = {
  create: { icon: '✅', title: 'Intégration créée' },
  delete: { icon: '<:ee:1434328162426294436>', title: 'Intégration supprimée' },
  update: { icon: '📝', title: 'Intégration modifiée' },
};

function cleanInline(value, fallback = 'Aucun') {
  const text = String(value ?? fallback).replace(/`/g, "'").trim();
  return text || fallback;
}

function truncate(value, max = 300) {
  const text = cleanInline(value);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function formatUserWithId(user) {
  return user?.id ? `<@${user.id}> (\`${user.id}\`)` : 'Utilisateur inconnu (`inconnu`)';
}

function integrationName(integration) {
  return cleanInline(integration?.name || integration?.application?.name || integration?.account?.name, 'Intégration inconnue');
}

function integrationInfo(integration, auditEntry) {
  const target = integration || auditEntry?.target || {};
  const account = target.account || {};
  const application = target.application || {};

  return `  - Nom : \`${integrationName(target)}\`\n`
    + `  - ID : \`${target.id || auditEntry?.targetId || 'inconnu'}\`\n`
    + `  - Type : \`${cleanInline(target.type, 'inconnu')}\`\n`
    + `  - Activée : \`${target.enabled == null ? 'inconnu' : (target.enabled ? 'Oui' : 'Non')}\`\n`
    + `  - Compte : \`${cleanInline(account.name || account.id, 'Aucun')}\`\n`
    + `  - Application : \`${cleanInline(application.name || application.id, 'Aucune')}\`\n`
    + `  - Rôle : ${target.role?.id ? `<@&${target.role.id}> (\`${target.role.id}\`)` : '`Aucun`'}\n`
    + `  - Synchro : \`${target.syncing == null ? 'inconnu' : (target.syncing ? 'Oui' : 'Non')}\`\n`
    + `  - Abonnés : \`${target.subscriberCount ?? 'inconnu'}\``;
}

function formatChanges(changes) {
  if (!changes?.length) return '  - `Aucun changement détaillé`';

  return changes.slice(0, 12).map((change) => {
    const before = change.old == null ? 'Aucun' : JSON.stringify(change.old);
    const after = change.new == null ? 'Aucun' : JSON.stringify(change.new);
    return `  - ${cleanInline(change.key, 'champ')} : \`${truncate(before, 120)}\` -> \`${truncate(after, 120)}\``;
  }).join('\n');
}

async function getLogChannel(bot, target) {
  const destinationGuild = bot.guilds.cache.get(target.secondaryGuildId)
    || await bot.guilds.fetch(target.secondaryGuildId).catch(() => null);
  if (!destinationGuild) return null;

  const logChannel = destinationGuild.channels.cache.get(target.channelId)
    || await destinationGuild.channels.fetch(target.channelId).catch(() => null);

  return logChannel?.isTextBased?.() ? logChannel : null;
}

function buildIntegrationLog(action, data) {
  const timestamp = Math.floor(Date.now() / 1000);
  const meta = INTEGRATION_META[action] || INTEGRATION_META.update;
  const changes = action === 'update' ? `\n\n- Changements :\n${formatChanges(data.auditEntry?.changes)}` : '';

  return new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `${meta.icon} **${meta.title} !**\n\n`
        + `- Auteur :\n  - ${formatUserWithId(data.executor)}\n\n`
        + `- Intégration :\n${integrationInfo(data.integration, data.auditEntry)}`
        + `\n\n- Raison : \`${cleanInline(data.auditEntry?.reason, 'Aucune')}\`${changes}`,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

async function sendIntegrationLog(bot, sourceGuildId, action, data) {
  const target = getIntegrationLogTarget(bot, sourceGuildId, action);
  if (!target) return;

  const logChannel = await getLogChannel(bot, target);
  if (!logChannel) return;

  await logChannel.send({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildIntegrationLog(action, data)],
    allowedMentions: { parse: [] },
  }).catch((error) => {
    console.error(`Erreur log integration ${action} : ${error?.message || error}`);
  });
}

module.exports = {
  sendIntegrationLog,
};
