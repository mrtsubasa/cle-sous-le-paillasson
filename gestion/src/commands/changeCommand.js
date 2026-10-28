const { buildExecutionFailedPayload, buildNoticePayload } = require('../utils/components');
const { CONFIGURABLE_COMMANDS, COMMAND_DESCRIPTIONS, OWNER_COMMANDS } = require('../constants/commands');

const VALID_PERMS = ['owner', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

function resolvePermLabel(perm) {
  return perm === 'owner' ? 'Owner' : `Permission ${perm}`;
}

async function runChangeCommand(message, args, context) {
  const isOwnerUser = context.accessStore?.isOwner?.(message.guild.id, message.author.id) === true;
  const isSys = context.accessStore?.isSys?.(message.author.id) === true;

  if (!isOwnerUser && !isSys) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys.'));
    return;
  }

  const cmdInput = String(args[0] || '').trim().toLowerCase().replace(/^\+/, '');
  const permInput = String(args[1] || '').trim().toLowerCase();

  // --- Validation de la commande ---
  if (!cmdInput) {
    await message.channel.send(
      buildExecutionFailedPayload(
        'Format invalide. Utilisation : `+change <commande> <permission>`\nPermissions disponibles : `owner`, `1` a `9`'
      )
    );
    return;
  }

  if (!CONFIGURABLE_COMMANDS.includes(cmdInput) && !OWNER_COMMANDS.includes(cmdInput)) {
    await message.channel.send(
      buildExecutionFailedPayload(`Commande \`+${cmdInput}\` introuvable dans les commandes configurables.`)
    );
    return;
  }

  // --- Validation de la permission cible ---
  if (!VALID_PERMS.includes(permInput)) {
    await message.channel.send(
      buildExecutionFailedPayload(
        `Permission \`${permInput}\` invalide.\nPermissions disponibles : \`owner\`, \`1\` a \`9\``
      )
    );
    return;
  }

  const guildId = message.guild.id;

  // --- Retirer la commande de toutes les permissions 1–9 existantes ---
  for (let i = 1; i <= 9; i++) {
    const key = String(i);
    const current = context.accessStore.getPermCommands(guildId, key) || [];
    if (current.includes(cmdInput)) {
      const updated = current.filter((c) => c !== cmdInput);
      context.accessStore.setPermCommands(guildId, key, updated);
    }
  }

  // --- Ajouter dans la permission cible ---
  let finalLocation;

  if (permInput === 'owner') {
    if (!OWNER_COMMANDS.includes(cmdInput)) {
      OWNER_COMMANDS.push(cmdInput);
    }
    finalLocation = 'owner';
  } else {
    const current = context.accessStore.getPermCommands(guildId, permInput) || [];
    if (!current.includes(cmdInput)) {
      context.accessStore.setPermCommands(guildId, permInput, [...current, cmdInput]);
    }
    finalLocation = permInput;
  }

  // --- Log ---
  await context.logger
    .log(
      message.guild,
      '# Change commande',
      `> Commande: \`+${cmdInput}\`\n> Nouvelle permission: \`${resolvePermLabel(finalLocation)}\`\n> Auteur: <@${message.author.id}>`
    )
    .catch(() => {});

  // --- Réponse ---
  await message.channel.send(
    buildNoticePayload({
      title: '# Commande mise a jour',
      body: `> \`+${cmdInput}\` a ete deplacee vers **${resolvePermLabel(finalLocation)}**.\n> Utilisez \`+helpall\` pour verifier.`
    })
  );
}

module.exports = { runChangeCommand };