const Discord = require('discord.js');
const { getAutoModerationLogTarget } = require('./logsGuildConfig');

const AUTO_MODERATION_META = {
  action_execution: { icon: '🛡️', title: 'Action AutoMod exécutée' },
  rule_create: { icon: '✅', title: 'Règle AutoMod créée' },
  rule_delete: { icon: '<:ee:1434328162426294436>', title: 'Règle AutoMod supprimée' },
  rule_update: { icon: '📝', title: 'Règle AutoMod modifiée' },
};

const TRIGGER_TYPES = {
  [Discord.AutoModerationRuleTriggerType.Keyword]: 'Mot-clé',
  [Discord.AutoModerationRuleTriggerType.Spam]: 'Spam',
  [Discord.AutoModerationRuleTriggerType.KeywordPreset]: 'Mot-clé prédéfini',
  [Discord.AutoModerationRuleTriggerType.MentionSpam]: 'Spam mentions',
  [Discord.AutoModerationRuleTriggerType.MemberProfile]: 'Profil membre',
};

const EVENT_TYPES = {
  [Discord.AutoModerationRuleEventType.MessageSend]: 'Envoi de message',
  [Discord.AutoModerationRuleEventType.MemberUpdate]: 'Modification membre',
};

const ACTION_TYPES = {
  [Discord.AutoModerationActionType.BlockMessage]: 'Bloquer le message',
  [Discord.AutoModerationActionType.SendAlertMessage]: 'Envoyer une alerte',
  [Discord.AutoModerationActionType.Timeout]: 'Timeout',
  [Discord.AutoModerationActionType.BlockMemberInteraction]: 'Bloquer interaction membre',
};

function cleanInline(value, fallback = 'Aucun') {
  const text = String(value ?? fallback).replace(/`/g, "'").trim();
  return text || fallback;
}

function truncate(value, max = 650) {
  const text = cleanInline(value);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function formatUserWithId(user) {
  return user?.id ? `<@${user.id}> (\`${user.id}\`)` : 'Utilisateur inconnu (`inconnu`)';
}

function formatUserId(userId) {
  return userId ? `<@${userId}> (\`${userId}\`)` : 'Utilisateur inconnu (`inconnu`)';
}

function formatChannel(guild, channelId) {
  if (!channelId) return 'Aucun';
  const channel = guild?.channels?.cache?.get(channelId);
  return channel?.id ? `<#${channel.id}> (\`${cleanInline(channel.name, 'Salon inconnu')}\`)` : `<#${channelId}>`;
}

function formatRoleList(roles) {
  const list = [...(roles?.values?.() || [])];
  if (!list.length) return '  - `Aucun`';
  return list.slice(0, 10).map((role) => `  - \`${cleanInline(role.name, 'Rôle inconnu')}\` (\`${role.id}\`)`).join('\n')
    + (list.length > 10 ? `\n  - ... +${list.length - 10}` : '');
}

function formatChannelList(channels) {
  const list = [...(channels?.values?.() || [])];
  if (!list.length) return '  - `Aucun`';
  return list.slice(0, 10).map((channel) => `  - <#${channel.id}> (\`${cleanInline(channel.name, 'Salon inconnu')}\`)`).join('\n')
    + (list.length > 10 ? `\n  - ... +${list.length - 10}` : '');
}

function formatAction(action, guild) {
  const meta = action?.metadata || {};
  const details = [];

  if (meta.channelId) details.push(`salon ${formatChannel(guild, meta.channelId)}`);
  if (meta.durationSeconds) details.push(`durée ${meta.durationSeconds}s`);
  if (meta.customMessage) details.push(`message "${truncate(meta.customMessage, 80)}"`);

  return `  - \`${ACTION_TYPES[action?.type] || `Type ${action?.type ?? 'inconnu'}`}\`${details.length ? ` (${details.join(', ')})` : ''}`;
}

function formatActions(actions, guild) {
  const list = Array.isArray(actions) ? actions : [];
  return list.length ? list.map((action) => formatAction(action, guild)).join('\n') : '  - `Aucune`';
}

function formatTriggerMetadata(metadata) {
  if (!metadata) return '  - `Aucune`';
  const lines = [];

  if (metadata.keywordFilter?.length) lines.push(`  - Mots-clés : \`${truncate(metadata.keywordFilter.join(', '), 250)}\``);
  if (metadata.regexPatterns?.length) lines.push(`  - Regex : \`${truncate(metadata.regexPatterns.join(', '), 250)}\``);
  if (metadata.presets?.length) lines.push(`  - Presets : \`${metadata.presets.join(', ')}\``);
  if (metadata.allowList?.length) lines.push(`  - Allowlist : \`${truncate(metadata.allowList.join(', '), 250)}\``);
  if (metadata.mentionTotalLimit != null) lines.push(`  - Limite mentions : \`${metadata.mentionTotalLimit}\``);
  if (metadata.mentionRaidProtectionEnabled != null) {
    lines.push(`  - Protection raid mentions : \`${metadata.mentionRaidProtectionEnabled ? 'Oui' : 'Non'}\``);
  }

  return lines.length ? lines.join('\n') : '  - `Aucune`';
}

function ruleInfo(rule) {
  return `  - Nom : \`${cleanInline(rule?.name, 'Règle inconnue')}\`\n`
    + `  - ID : \`${rule?.id || 'inconnu'}\`\n`
    + `  - Créateur : ${formatUserId(rule?.creatorId)}\n`
    + `  - Activée : \`${rule?.enabled ? 'Oui' : 'Non'}\`\n`
    + `  - Event : \`${EVENT_TYPES[rule?.eventType] || `Type ${rule?.eventType ?? 'inconnu'}`}\`\n`
    + `  - Trigger : \`${TRIGGER_TYPES[rule?.triggerType] || `Type ${rule?.triggerType ?? 'inconnu'}`}\``;
}

function getRuleChanges(oldRule, newRule) {
  if (!oldRule || !newRule) return '';
  const changes = [];

  if (oldRule.name !== newRule.name) {
    changes.push(`  - Nom : \`${cleanInline(oldRule.name)}\` -> \`${cleanInline(newRule.name)}\``);
  }
  if (oldRule.enabled !== newRule.enabled) {
    changes.push(`  - Activée : \`${oldRule.enabled ? 'Oui' : 'Non'}\` -> \`${newRule.enabled ? 'Oui' : 'Non'}\``);
  }
  if (oldRule.eventType !== newRule.eventType) {
    changes.push(`  - Event : \`${EVENT_TYPES[oldRule.eventType] || oldRule.eventType}\` -> \`${EVENT_TYPES[newRule.eventType] || newRule.eventType}\``);
  }
  if (oldRule.actions?.length !== newRule.actions?.length) {
    changes.push(`  - Nombre actions : \`${oldRule.actions?.length || 0}\` -> \`${newRule.actions?.length || 0}\``);
  }
  if (oldRule.exemptRoles?.size !== newRule.exemptRoles?.size) {
    changes.push(`  - Rôles exemptés : \`${oldRule.exemptRoles?.size || 0}\` -> \`${newRule.exemptRoles?.size || 0}\``);
  }
  if (oldRule.exemptChannels?.size !== newRule.exemptChannels?.size) {
    changes.push(`  - Salons exemptés : \`${oldRule.exemptChannels?.size || 0}\` -> \`${newRule.exemptChannels?.size || 0}\``);
  }

  return changes.join('\n');
}

async function getLogChannel(bot, target) {
  const destinationGuild = bot.guilds.cache.get(target.secondaryGuildId)
    || await bot.guilds.fetch(target.secondaryGuildId).catch(() => null);
  if (!destinationGuild) return null;

  const logChannel = destinationGuild.channels.cache.get(target.channelId)
    || await destinationGuild.channels.fetch(target.channelId).catch(() => null);

  return logChannel?.isTextBased?.() ? logChannel : null;
}

function buildExecutionLog(data) {
  const execution = data.execution;
  const guild = execution.guild;

  return `- Utilisateur :\n  - ${formatUserId(execution.userId)}\n\n`
    + `- Règle :\n`
    + `  - ID : \`${execution.ruleId || 'inconnu'}\`\n`
    + `  - Trigger : \`${TRIGGER_TYPES[execution.ruleTriggerType] || `Type ${execution.ruleTriggerType ?? 'inconnu'}`}\`\n\n`
    + `- Action :\n${formatActions([execution.action], guild)}\n\n`
    + `- Message :\n`
    + `  - Salon : ${formatChannel(guild, execution.channelId)}\n`
    + `  - Message ID : \`${execution.messageId || 'inconnu'}\`\n`
    + `  - Alerte ID : \`${execution.alertSystemMessageId || 'inconnu'}\`\n`
    + `  - Mot détecté : \`${cleanInline(execution.matchedKeyword, 'Aucun')}\`\n`
    + `  - Contenu détecté :\n\`\`\`\n${truncate(execution.matchedContent || execution.content || 'Aucun contenu')}\n\`\`\``;
}

function buildRuleLog(action, data) {
  const rule = data.rule || data.newRule || data.oldRule;
  const changes = action === 'rule_update' ? getRuleChanges(data.oldRule, data.newRule) : '';

  return `- Auteur :\n  - ${formatUserWithId(data.executor)}\n\n`
    + `- Règle :\n${ruleInfo(rule)}\n\n`
    + `- Actions :\n${formatActions(rule?.actions, rule?.guild)}\n\n`
    + `- Trigger metadata :\n${formatTriggerMetadata(rule?.triggerMetadata)}\n\n`
    + `- Rôles exemptés :\n${formatRoleList(rule?.exemptRoles)}\n\n`
    + `- Salons exemptés :\n${formatChannelList(rule?.exemptChannels)}`
    + (changes ? `\n\n- Changements :\n${changes}` : '');
}

function buildAutoModerationLog(action, data) {
  const timestamp = Math.floor(Date.now() / 1000);
  const meta = AUTO_MODERATION_META[action] || AUTO_MODERATION_META.action_execution;
  const body = action === 'action_execution' ? buildExecutionLog(data) : buildRuleLog(action, data);

  return new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `${meta.icon} **${meta.title} !**\n\n${body}`,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

async function sendAutoModerationLog(bot, sourceGuildId, action, data) {
  const target = getAutoModerationLogTarget(bot, sourceGuildId, action);
  if (!target) return;

  const logChannel = await getLogChannel(bot, target);
  if (!logChannel) return;

  await logChannel.send({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildAutoModerationLog(action, data)],
    allowedMentions: { parse: [] },
  }).catch((error) => {
    console.error(`Erreur log auto moderation ${action} : ${error?.message || error}`);
  });
}

module.exports = {
  sendAutoModerationLog,
};
