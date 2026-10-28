const Discord = require('discord.js');
const { getThreadLogTarget } = require('./logsGuildConfig');

const THREAD_LOG_META = {
  create: { icon: '✅', title: 'Thread créé' },
  delete: { icon: '<:ee:1434328162426294436>', title: 'Thread supprimé' },
  update: { icon: '📝', title: 'Thread modifié' },
  member_update: { icon: '👤', title: 'Membre du thread modifié' },
  members_update: { icon: '👥', title: 'Membres du thread mis à jour' },
  list_sync: { icon: '🔄', title: 'Threads synchronisés' },
};

const THREAD_TYPE_NAMES = {
  [Discord.ChannelType.AnnouncementThread]: 'Thread annonce',
  [Discord.ChannelType.PublicThread]: 'Thread public',
  [Discord.ChannelType.PrivateThread]: 'Thread privé',
};

function cleanInline(value, fallback = 'Aucun') {
  const text = String(value ?? fallback).replace(/`/g, "'").trim();
  return text || fallback;
}

function formatUserWithId(user) {
  return user?.id ? `<@${user.id}> (\`${user.id}\`)` : 'Utilisateur inconnu (`inconnu`)';
}

function formatBool(value) {
  return value ? 'Oui' : 'Non';
}

function formatThread(thread) {
  if (!thread) return 'Thread inconnu';
  return thread.id && thread.guild?.channels?.cache?.has(thread.id)
    ? `<#${thread.id}> (\`${cleanInline(thread.name, 'Thread inconnu')}\`)`
    : `\`${cleanInline(thread.name, 'Thread inconnu')}\` (\`${thread.id || 'inconnu'}\`)`;
}

function formatParent(thread) {
  const parent = thread?.parent || thread?.guild?.channels?.cache?.get(thread?.parentId);
  if (parent?.id) return `<#${parent.id}> (\`${cleanInline(parent.name, 'Salon inconnu')}\`)`;
  return thread?.parentId ? `<#${thread.parentId}>` : 'Aucun';
}

function formatThreadType(thread) {
  return THREAD_TYPE_NAMES[thread?.type] || `Type ${thread?.type ?? 'inconnu'}`;
}

function formatMember(member) {
  const userId = member?.id || member?.userId;
  return userId ? `<@${userId}> (\`${userId}\`)` : 'Utilisateur inconnu (`inconnu`)';
}

function collectionValues(value) {
  if (!value) return [];
  if (typeof value.values === 'function') return [...value.values()];
  if (Array.isArray(value)) return value;
  return [];
}

function formatMemberList(value, max = 10) {
  const list = collectionValues(value);
  if (!list.length) return '  - `Aucun`';

  const shown = list.slice(0, max).map((member) => `  - ${formatMember(member)}`);
  if (list.length > max) shown.push(`  - ... +${list.length - max}`);
  return shown.join('\n');
}

function threadInfo(thread) {
  return `  - Nom : \`${cleanInline(thread?.name, 'Thread inconnu')}\`\n`
    + `  - ID : \`${thread?.id || 'inconnu'}\`\n`
    + `  - Thread : ${formatThread(thread)}\n`
    + `  - Parent : ${formatParent(thread)}\n`
    + `  - Type : \`${formatThreadType(thread)}\`\n`
    + `  - Archivé : \`${formatBool(thread?.archived)}\`\n`
    + `  - Verrouillé : \`${formatBool(thread?.locked)}\`\n`
    + `  - Auto archive : \`${thread?.autoArchiveDuration || 'inconnue'} minutes\`\n`
    + `  - Membres approximatifs : \`${thread?.memberCount ?? 'inconnu'}\`\n`
    + `  - Messages approximatifs : \`${thread?.messageCount ?? 'inconnu'}\``;
}

function getThreadChanges(oldThread, newThread) {
  const changes = [];

  if (oldThread.name !== newThread.name) {
    changes.push(`  - Nom : \`${cleanInline(oldThread.name, 'Thread inconnu')}\` -> \`${cleanInline(newThread.name, 'Thread inconnu')}\``);
  }

  if (oldThread.archived !== newThread.archived) {
    changes.push(`  - Archivé : \`${formatBool(oldThread.archived)}\` -> \`${formatBool(newThread.archived)}\``);
  }

  if (oldThread.locked !== newThread.locked) {
    changes.push(`  - Verrouillé : \`${formatBool(oldThread.locked)}\` -> \`${formatBool(newThread.locked)}\``);
  }

  if (oldThread.autoArchiveDuration !== newThread.autoArchiveDuration) {
    changes.push(`  - Auto archive : \`${oldThread.autoArchiveDuration || 'inconnue'} minutes\` -> \`${newThread.autoArchiveDuration || 'inconnue'} minutes\``);
  }

  if (oldThread.rateLimitPerUser !== newThread.rateLimitPerUser) {
    changes.push(`  - Slowmode : \`${oldThread.rateLimitPerUser || 0}s\` -> \`${newThread.rateLimitPerUser || 0}s\``);
  }

  if (oldThread.parentId !== newThread.parentId) {
    changes.push(`  - Parent : ${formatParent(oldThread)} -> ${formatParent(newThread)}`);
  }

  return changes.length ? changes.join('\n') : '';
}

function getThreadMemberChanges(oldMember, newMember) {
  const changes = [];

  if (oldMember.flags?.bitfield !== newMember.flags?.bitfield) {
    changes.push(`  - Flags : \`${oldMember.flags?.bitfield ?? 0}\` -> \`${newMember.flags?.bitfield ?? 0}\``);
  }

  if (oldMember.joinedTimestamp !== newMember.joinedTimestamp) {
    const before = oldMember.joinedTimestamp ? `<t:${Math.floor(oldMember.joinedTimestamp / 1000)}:f>` : '`inconnu`';
    const after = newMember.joinedTimestamp ? `<t:${Math.floor(newMember.joinedTimestamp / 1000)}:f>` : '`inconnu`';
    changes.push(`  - Rejoint le : ${before} -> ${after}`);
  }

  return changes.length ? changes.join('\n') : '  - Aucun changement détaillé';
}

async function getLogChannel(bot, target) {
  const destinationGuild = bot.guilds.cache.get(target.secondaryGuildId)
    || await bot.guilds.fetch(target.secondaryGuildId).catch(() => null);
  if (!destinationGuild) return null;

  const logChannel = destinationGuild.channels.cache.get(target.channelId)
    || await destinationGuild.channels.fetch(target.channelId).catch(() => null);

  return logChannel?.isTextBased?.() ? logChannel : null;
}

function buildThreadLog(action, data) {
  const timestamp = Math.floor(Date.now() / 1000);
  const meta = THREAD_LOG_META[action] || THREAD_LOG_META.update;
  const thread = data.thread || data.newThread || data.oldThread;
  let extra = '';

  if (action === 'update') {
    const changes = getThreadChanges(data.oldThread, data.newThread);
    extra = changes ? `\n\n- Changements :\n${changes}` : '';
  }

  if (action === 'member_update') {
    extra = `\n\n- Membre :\n  - ${formatMember(data.newMember)}\n\n- Changements :\n${getThreadMemberChanges(data.oldMember, data.newMember)}`;
  }

  if (action === 'members_update') {
    extra = `\n\n- Membres ajoutés :\n${formatMemberList(data.addedMembers)}\n\n- Membres retirés :\n${formatMemberList(data.removedMembers)}`;
  }

  if (action === 'list_sync') {
    extra = `\n\n- Threads synchronisés : \`${collectionValues(data.threads).length}\`\n${formatThreadList(data.threads)}`;
  }

  return new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `${meta.icon} **${meta.title} !**\n\n`
        + `- Auteur :\n  - ${formatUserWithId(data.executor)}\n\n`
        + `- Thread :\n${threadInfo(thread)}${extra}`,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

function formatThreadList(threads) {
  const list = collectionValues(threads);
  if (!list.length) return '  - `Aucun`';

  return list.slice(0, 10).map((thread) => `  - ${formatThread(thread)}`).join('\n')
    + (list.length > 10 ? `\n  - ... +${list.length - 10}` : '');
}

async function sendThreadLog(bot, sourceGuildId, action, data) {
  const target = getThreadLogTarget(bot, sourceGuildId, action);
  if (!target) return;

  if (action === 'update' && !getThreadChanges(data.oldThread, data.newThread)) return;

  const logChannel = await getLogChannel(bot, target);
  if (!logChannel) return;

  await logChannel.send({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildThreadLog(action, data)],
    allowedMentions: { parse: [] },
  }).catch((error) => {
    console.error(`Erreur log thread ${action} : ${error?.message || error}`);
  });
}

module.exports = {
  sendThreadLog,
};
