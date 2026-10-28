const { ContainerBuilder, MessageFlags, SeparatorSpacingSize } = require('discord.js');
const { buildExecutionFailedPayload } = require('../utils/components');

const emojiCreationLimits = new Map();

function cleanOldLimits() {
  const anHourAgo = Date.now() - 3600000;
  for (const [key, timestamp] of emojiCreationLimits) {
    if (timestamp < anHourAgo) {
      emojiCreationLimits.delete(key);
    }
  }
}

async function runCreateCommand(message, args, context) {
  if (!message.guild || message.author.bot) return;

  const canManageCommands = context.accessStore.canUseAdminCommands(message.guild.id, message.author.id);
  if (!canManageCommands) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee au sys/owners/buyers.'));
    return;
  }

  const rawInput = args.join(' ');
  if (!rawInput) {
    await message.channel.send(
      buildExecutionFailedPayload('Veuillez fournir un ou plusieurs emojis (ex: `+create <a:emoji:id> <:emoji:id>`).')
    );
    return;
  }

  const emojiRegex = /<(a)?:\w+:(\d+)>/g;
  const matches = [...rawInput.matchAll(emojiRegex)];
  if (matches.length === 0) {
    await message.channel.send(buildExecutionFailedPayload('Aucun emoji valide trouve.'));
    return;
  }

  await message.channel.sendTyping();

  const results = {
    added: [],
    failed: 0
  };

  cleanOldLimits();

  const guildLimitKey = message.guild.id;
  let timestamps = emojiCreationLimits.get(guildLimitKey) || [];
  timestamps = timestamps.filter((timestamp) => timestamp > Date.now() - 3600000);

  for (const match of matches) {
    if (timestamps.length >= 50) {
      results.failed += 1;
      continue;
    }

    const isAnimated = Boolean(match[1]);
    const emojiId = match[2];
    const emojiExt = isAnimated ? 'gif' : 'png';
    const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${emojiExt}`;

    const fullTag = match[0];
    const nameMatch = fullTag.match(/<(a)?:(\w+):(\d+)>/);
    const originalName = nameMatch ? nameMatch[2] : 'emoji';
    const newName = `1_${originalName}`;

    try {
      const createdEmoji = await message.guild.emojis.create({
        attachment: emojiUrl,
        name: newName
      });
      results.added.push(createdEmoji.toString());
      timestamps.push(Date.now());
    } catch (error) {
      console.error('Failed to create emoji:', error);
      results.failed += 1;
    }
  }

  emojiCreationLimits.set(guildLimitKey, timestamps);

  const addedText = results.added.length > 0 ? results.added.join(' ') : 'Aucun';

  const container = new ContainerBuilder()
    .addTextDisplayComponents((text) => text.setContent(`<:oui:1519424733618110504> Vous avez reussis a ajoutes : ${addedText}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(`<:non:1519424807580733635> Vous avez fail : ${results.failed}`));

  await message.channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false }
  });
}

module.exports = { runCreateCommand };
