const REASON_LOCK = '+lock (owner/sys)';
const REASON_UNLOCK = '+unlock (owner/sys)';

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

async function runLockCommand(message, args, context) {
  const reply = (text) => message.channel.send({ content: text, allowedMentions: { parse: [], repliedUser: false } });

  const target = resolveTargetChannel(message, args);
  if (!target) {
    await reply('Salon introuvable. Utilisez `+lock`, `+lock #salon` ou `+lock <id>`.');
    return;
  }

  try {
    const everyoneId = message.guild.roles.everyone.id;
    await target.permissionOverwrites.edit(everyoneId, { SendMessages: false }, { reason: REASON_LOCK });
  } catch {
    await reply(`Impossible de lock le salon <#${target.id}> (permissions du bot ou du salon).`);
    return;
  }

  await reply(`Le salon <#${target.id}> a bien ete lock.`);

  await context.logger
    .log(message.guild, '# Lock salon', `> Salon: <#${target.id}>\n> Auteur: <@${message.author.id}>`)
    .catch(() => null);
}

async function runUnlockCommand(message, args, context) {
  const reply = (text) => message.channel.send({ content: text, allowedMentions: { parse: [], repliedUser: false } });

  const target = resolveTargetChannel(message, args);
  if (!target) {
    await reply('Salon introuvable. Utilisez `+unlock`, `+unlock #salon` ou `+unlock <id>`.');
    return;
  }

  try {
    const everyoneId = message.guild.roles.everyone.id;
    await target.permissionOverwrites.edit(everyoneId, { SendMessages: null }, { reason: REASON_UNLOCK });
  } catch {
    await reply(`Impossible de unlock le salon <#${target.id}> (permissions du bot ou du salon).`);
    return;
  }

  await reply(`Le salon <#${target.id}> a bien ete unlock.`);

  await context.logger
    .log(message.guild, '# Unlock salon', `> Salon: <#${target.id}>\n> Auteur: <@${message.author.id}>`)
    .catch(() => null);
}

module.exports = { runLockCommand, runUnlockCommand };
