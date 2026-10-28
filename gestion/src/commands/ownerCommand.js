const { ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SeparatorSpacingSize } = require('discord.js');
const { buildExecutionFailedPayload } = require('../utils/components');

async function runOwnerCommand(message, args, context) {
  const rawTarget = String(args[0] || '').trim();
  const targetId = extractUserId(rawTarget);

  if (!rawTarget) {
    await message.channel.send(buildOwnersListPayload(context, message.guild.id));
    return;
  }

  if (!targetId) {
    await message.channel.send(buildExecutionFailedPayload('Format invalide. Utilisez `+owner @user` ou `+owner userId`.'));
    return;
  }

  if (context.accessStore.isSys(targetId)) {
    await message.channel.send(buildExecutionFailedPayload('Le compte sys est deja privilegie.'));
    return;
  }

  const currentOwners = context.accessStore.getOwnerUserIds(message.guild.id);
  const alreadyOwner = currentOwners.includes(targetId);
  const updatedOwners = alreadyOwner
    ? currentOwners.filter((id) => id !== targetId)
    : [...currentOwners, targetId];

  context.accessStore.setOwnerUserIds(message.guild.id, updatedOwners);

  const actionText = alreadyOwner ? 'retire des owners' : 'ajoute aux owners';
  await context.logger.log(
    message.guild,
    '# Owners',
    `> Action: ${actionText}\n> Cible: <@${targetId}>\n> Auteur: <@${message.author.id}>`
  );

  await message.channel.send(buildOwnerUpdatePayload(targetId, alreadyOwner, context, message.guild.id));
}

function buildOwnersListPayload(context, guildId) {
  const owners = context.accessStore.getOwnerUserIds(guildId);
  const lines = owners.length
    ? owners.map((id) => `> \`${id}\` - <@${id}>`).join('\n')
    : '> `aucun` - Aucun owner configure';

  const container = new ContainerBuilder()
    .addTextDisplayComponents((text) => text.setContent('## Owners'))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent('> Vous avez acces aux owners ci-dessous sur le bot'))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(lines));

  const quickLinks = buildQuickLinkButtons(resolveQuickLinks(context, guildId), guildId);
  if (quickLinks.length) {
    container.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
    container.addActionRowComponents((row) => row.setComponents(...quickLinks));
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false }
  };
}

function buildOwnerUpdatePayload(targetId, wasOwner, context, guildId) {
  const statusLine = wasOwner
    ? `> <@${targetId}> A ete retire de la liste owner`
    : `> <@${targetId}> A ete ajoute a la liste owner`;
  const ownersCount = context.accessStore.getOwnerUserIds(guildId).length;

  const container = new ContainerBuilder()
    .addTextDisplayComponents((text) => text.setContent('## Owners'))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(statusLine))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(`> Total owners: \`${ownersCount}\``));

  const quickLinks = buildQuickLinkButtons(resolveQuickLinks(context, guildId), guildId);
  if (quickLinks.length) {
    container.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
    container.addActionRowComponents((row) => row.setComponents(...quickLinks));
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false }
  };
}

function extractUserId(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  const mentionMatch = raw.match(/^<@!?(\d+)>$/);
  if (mentionMatch) return mentionMatch[1];
  if (/^\d+$/.test(raw)) return raw;
  return null;
}

module.exports = { runOwnerCommand };

function resolveQuickLinks(context, guildId) {
  const guildLinks = context.accessStore.getGuildQuickLinks(guildId);
  if (guildLinks.length) return guildLinks;
  return Array.isArray(context.config.quickLinks) ? context.config.quickLinks : [];
}

function buildQuickLinkButtons(quickLinks, guildId) {
  if (!Array.isArray(quickLinks) || !quickLinks.length) return [];

  return quickLinks
    .slice(0, 5)
    .map((link) => {
      const label = String(link.label || '').trim();
      if (!label) return null;

      if (link.type === 'url' && typeof link.url === 'string') {
        return new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(link.url);
      }

      if (link.type === 'channel' && /^\d+$/.test(String(link.channelId || '')) && guildId) {
        const url = `https://discord.com/channels/${guildId}/${link.channelId}`;
        return new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url);
      }

      return null;
    })
    .filter(Boolean);
}
