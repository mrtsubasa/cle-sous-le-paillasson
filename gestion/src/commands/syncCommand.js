const { ChannelType } = require('discord.js');
const { buildExecutionFailedPayload, buildNoticePayload } = require('../utils/components');

function resolveCategory(message, args) {
  const raw = String(args[0] || '').trim();
  const guild = message.guild;

  if (!raw) {
    const parent = message.channel?.parent;
    if (parent && parent.type === ChannelType.GuildCategory) return parent;
    return null;
  }

  const mention = raw.match(/^<#(\d+)>$/);
  const id = mention ? mention[1] : raw;
  if (!/^\d+$/.test(id)) return null;

  const channel = guild.channels.cache.get(id);
  if (!channel || channel.type !== ChannelType.GuildCategory) return null;
  return channel;
}

async function runSyncCommand(message, args, context) {
  if (!message.guild) return;

  const isOwner = context.accessStore.isOwner(message.guild.id, message.author.id);
  const isSys = context.accessStore.isSys(message.author.id);

  if (!isOwner && !isSys) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys.'));
    return;
  }

  const category = resolveCategory(message, args);
  if (!category) {
    await message.channel.send(buildExecutionFailedPayload('Categorie introuvable. Utilisez +sync <id categorie> dans la categorie cible.'));
    return;
  }

  const children = message.guild.channels.cache.filter((ch) => ch.parentId === category.id);
  if (!children.size) {
    await message.channel.send(buildExecutionFailedPayload('Aucun salon dans cette categorie.'));
    return;
  }

  let synced = 0;
  let failed = 0;

  for (const [, channel] of children) {
    if (!channel.permissionOverwrites || channel.id === category.id) continue;

    try {
      await channel.permissionOverwrites.set(
        category.permissionOverwrites.cache,
        `+sync execute par ${message.author.tag} (${message.author.id})`
      );
      synced++;
    } catch {
      failed++;
    }
  }

  await message.channel.send(
    buildNoticePayload({
      title: '# Sync categorie',
      body: `> Categorie: <#${category.id}>\n> Salons synchronises: ${synced}\n> Echecs: ${failed}`
    })
  );

  await context.logger.log(
    message.guild,
    '# Moderation',
    `> Action: sync\n> Categorie: <#${category.id}>\n> Salons synchronises: ${synced}\n> Echecs: ${failed}\n> Auteur: <@${message.author.id}>`
  ).catch(() => null);
}

module.exports = { runSyncCommand };
