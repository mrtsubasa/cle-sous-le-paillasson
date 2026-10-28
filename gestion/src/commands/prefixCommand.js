const fs = require('node:fs');
const path = require('node:path');
const { buildExecutionFailedPayload, buildNoticePayload } = require('../utils/components');

function getConfigPath() {
  const storageId = String(process.env.BOT_STORAGE_ID || '').trim();
  if (storageId) {
    return path.resolve(__dirname, '..', '..', '..', '..', 'BotRuntimes', storageId, 'config.json');
  }

  const cwd = path.resolve(process.cwd());
  if (cwd.split(path.sep).includes('BotRuntimes')) return path.join(cwd, 'config.json');
  throw new Error('Le runtime du bot gestion est introuvable.');
}

function savePrefix(prefix) {
  const configPath = getConfigPath();
  const raw = fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
  const config = JSON.parse(raw);
  config.prefix = prefix;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

async function runPrefixCommand(message, args, context) {
  if (!context.accessStore?.canUseAdminCommands?.(message.guild.id, message.author.id)) {
    await message.channel.send(
      buildExecutionFailedPayload('Commande reservee au sys, aux owners et aux buyers.')
    );
    return;
  }

  const currentPrefix = String(context.config.prefix);
  const nextPrefix = String(args[0] || '').trim();

  if (!nextPrefix) {
    await message.channel.send(
      buildExecutionFailedPayload(`Format: \`${currentPrefix}prefix <nouveau_prefixe>\``)
    );
    return;
  }

  if (/\s/.test(nextPrefix) || nextPrefix.length > 5) {
    await message.channel.send(
      buildExecutionFailedPayload('Le prefixe doit contenir entre 1 et 5 caracteres, sans espace.')
    );
    return;
  }

  if (nextPrefix === currentPrefix) {
    await message.channel.send(buildExecutionFailedPayload(`Le prefixe est deja \`${nextPrefix}\`.`));
    return;
  }

  savePrefix(nextPrefix);
  context.config.prefix = nextPrefix;

  await context.logger?.log?.(
    message.guild,
    '# Prefix modifie',
    `> Avant: \`${currentPrefix}\`\n> Apres: \`${nextPrefix}\`\n> Auteur: <@${message.author.id}>`
  ).catch(() => {});

  await message.channel.send(
    buildNoticePayload({
      title: '# Prefix modifie',
      body: `> Ancien prefixe: \`${currentPrefix}\`\n> Nouveau prefixe: \`${nextPrefix}\``
    })
  );
}

module.exports = { runPrefixCommand };
