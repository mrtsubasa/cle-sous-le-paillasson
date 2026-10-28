const REASON_HIDE = '+hide (owner)';
const REASON_UNHIDE = '+unhide (owner)';

function resolveTargetChannel(message, args) {
  const guild = message.guild;
  if (!args.length) return message.channel;

  const raw = String(args[0] || '').trim();
  const mention = raw.match(/^<#(\d+)>$/);
  if (mention) {
    const channel = guild.channels.cache.get(mention[1]);
    return channel && channel.permissionOverwrites ? channel : null;
  }
  if (/^\d+$/.test(raw)) {
    const channel = guild.channels.cache.get(raw);
    return channel && channel.permissionOverwrites ? channel : null;
  }

  const fromMention = message.mentions.channels.first();
  if (fromMention && fromMention.guild?.id === guild.id && fromMention.permissionOverwrites) {
    return fromMention;
  }

  const name = raw.replace(/^#/, '').toLowerCase();
  return guild.channels.cache.find((channel) => channel.name && channel.name.toLowerCase() === name && channel.permissionOverwrites) || null;
}

async function runHideChannelCommand(message, args, context) {
  const reply = (text) => message.channel.send({ content: text, allowedMentions: { parse: [], repliedUser: false } });

  const target = resolveTargetChannel(message, args);
  if (!target) {
    await reply('Salon introuvable. Utilisez `+hide`, `+hide #salon` ou `+hide <id>`.');
    return;
  }

  try {
    const everyoneId = message.guild.roles.everyone.id;
    await target.permissionOverwrites.edit(everyoneId, { ViewChannel: false }, { reason: REASON_HIDE });
  } catch {
    await reply(`Impossible de masquer le salon <#${target.id}> (permissions du bot ou du salon).`);
    return;
  }

  await reply(`Le salon <#${target.id}> a bien ete hide.`);

  await context.logger
    .log(message.guild, '# Hide salon', `> Salon: <#${target.id}>\n> Auteur: <@${message.author.id}>`)
    .catch(() => null);
}

async function runUnhideChannelCommand(message, args, context) {
  const reply = (text) => message.channel.send({ content: text, allowedMentions: { parse: [], repliedUser: false } });

  const target = resolveTargetChannel(message, args);
  if (!target) {
    await reply('Salon introuvable. Utilisez `+unhide`, `+unhide #salon` ou `+unhide <id>`.');
    return;
  }

  try {
    const everyoneId = message.guild.roles.everyone.id;
    await target.permissionOverwrites.edit(everyoneId, { ViewChannel: null }, { reason: REASON_UNHIDE });
  } catch {
    await reply(`Impossible de rendre visible le salon <#${target.id}> (permissions du bot ou du salon).`);
    return;
  }

  await reply(`Le salon <#${target.id}> a bien ete unhide.`);

  await context.logger
    .log(message.guild, '# Unhide salon', `> Salon: <#${target.id}>\n> Auteur: <@${message.author.id}>`)
    .catch(() => null);
}

module.exports = { runHideChannelCommand, runUnhideChannelCommand };
