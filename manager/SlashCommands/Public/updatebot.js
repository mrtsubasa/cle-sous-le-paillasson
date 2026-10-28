const config = require('../../config.json');
const Discord = require('discord.js');
const buildPanel = require('../../Utils/buildPanel');
const buildExpiredPanel = require('../../Utils/buildExpiredPanel');
const path = require('path');
const { scheduleExpiration } = require('../../Utils/expirationScheduler');
const parseDurationInput = require('../../Utils/parseDuration');
const { readJsonConfig } = require('../../Utils/tokenVault');
const { syncClientRoleForUsers } = require('../../Utils/clientRoleManager');
const { getInstanceStatus, startInstance, stopInstance } = require('../../Utils/managerApi');
const { getLogChannelId } = require('../../Utils/logChannels');

function buildReply(title, lines) {
  return buildPanel(title, lines);
}

function buildExpirationMessage(botId, botName) {
  return buildExpiredPanel(botId, botName);
}

function getBotIndex(botId) {
  return `./BotRuntimes/${botId}/index.js`;
}

function getBotStorageId(row) {
  return row?.folder || row?.botId;
}

function getCurrentOwnerId(storageId, fallbackOwnerId) {
  const configPath = path.join(__dirname, '../../BotRuntimes', storageId, 'config.json');
  const botConfig = readJsonConfig(configPath, { migrateToken: false });
  return botConfig?.ownerId || fallbackOwnerId || null;
}

async function replyError(message, title, description) {
  return message.editReply({
    components: [buildReply(title, [description])],
    allowedMentions: { parse: [] },
    flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
  });
}

function buildSuccessMessage(botId, botName, botType, restarted) {
  return buildReply('# Renouvellement effectué', [
    `> **Bot:** <@${botId}> (\`${botId}\`)`,
    `> **Template:** \`${botType}\``,
    restarted ? '> *Le bot a été relancé automatiquement*' : '> *Le bot a été démarré automatiquement*',
  ]);
}

module.exports = {
  name: 'updatebot',
  description: 'Permet de renouveler votre bot',
  permission: 'Aucune',
  dm: true,
  options: [
    {
      type: 'string',
      name: 'identifiant',
      description: "L'identifiant du bot à renouveler",
      required: true,
      autocomplete: false,
    },
    {
      type: 'string',
      name: 'key',
      description: 'La clé à utiliser',
      required: true,
      autocomplete: false,
    },
  ],

  async run(bot, message, args) {
    await message.deferReply({ flags: Discord.MessageFlags.Ephemeral }).catch(() => {});

    if (!config.owners.includes(message.author.id)) {
      return replyError(
        message,
        '# <:croix:1505270277796397146> Utilisateur non autorisé',
        '> *Vous n’êtes pas autorisé à utiliser cette commande*'
      );
    }

    const botId = args.getString('identifiant');
    const keyCode = args.getString('key');
    const keyRow = bot.db.prepare('SELECT * FROM cle WHERE code = ?').get(keyCode);

    if (!keyRow) {
      return replyError(message, '# <:croix:1505270277796397146> Clé invalide', "> *La clé fournie n'est pas valide*");
    }

    if (String(keyRow.use) !== 'false') {
      return replyError(message, '# <:croix:1505270277796397146> Clé utilisée', '> *La clé fournie est déjà utilisée*');
    }

    const durationMs = parseDurationInput(keyRow.day);
    if (durationMs === false) {
      return replyError(message, '# <:croix:1505270277796397146> Temps invalide', '> *La durée associée à la clé est invalide*');
    }

    const botRow = bot.db.prepare('SELECT * FROM bot WHERE botId = ?').get(botId);
    if (!botRow) {
      return replyError(
        message,
        '# <:croix:1505270277796397146> Bot non trouvé',
        `> *Le bot ${botId} n'a pas été trouvé. Créez-le avec \`/create\`*`
      );
    }

    const owner = await bot.users.fetch(botRow.ownerId).catch(() => null);
    if (!owner) {
      return replyError(
        message,
        '# <:croix:1505270277796397146> Propriétaire introuvable',
        '> *Impossible de retrouver le propriétaire de ce bot*'
      );
    }

    const botStorageId = getBotStorageId(botRow);
    const botName = (await bot.users.fetch(botId).catch(() => null))?.username;
    const started = (await getInstanceStatus(botStorageId).catch(() => ({ data: { running: false } })))?.data?.running || false;
    const addedSeconds = Math.floor(durationMs / 1000);
    const newTime = botRow.expired === 'true'
      ? Math.floor(Date.now() / 1000) + addedSeconds
      : Number(botRow.time) + addedSeconds;

    bot.db.prepare('UPDATE cle SET "use" = ? WHERE code = ?').run('true', keyCode);
    bot.db.prepare('UPDATE bot SET time = ?, expired = ?, reminderSent = ?, reminderSentAt = ? WHERE botId = ?').run(newTime, 'false', 'false', null, botId);

    const botConfigNow = readJsonConfig(path.join(__dirname, '../../BotRuntimes', botStorageId, 'config.json'), { migrateToken: false });
    const roleUserIdsNow = new Set([botRow.ownerId]);
    if (Array.isArray(botConfigNow?.buyers)) {
      for (const buyerId of botConfigNow.buyers) {
        if (buyerId) roleUserIdsNow.add(String(buyerId));
      }
    }
    if (Array.isArray(botConfigNow?.buyer)) {
      for (const buyerId of botConfigNow.buyer) {
        if (buyerId) roleUserIdsNow.add(String(buyerId));
      }
    }

    await syncClientRoleForUsers(bot, [...roleUserIdsNow]).catch((error) => {
      console.log(`[UPDATEBOT] Sync role client échouée pour ${botId}: ${error.message}`);
    });

    const updateLogChannelId = getLogChannelId('updateLogs', ['botActionLogs']);
    const updateLogChannel = updateLogChannelId ? bot.channels.cache.get(updateLogChannelId) : null;
    if (updateLogChannel) {
      const updateLog = buildReply('# Bot renouvelé', [
        `> **Bot:** <@${botId}> (\`${botId}\`)`,
        `> **Owner:** <@${owner.id}> (\`${owner.id}\`)`,
        `> **Type:** \`${botRow.type || 'inconnu'}\``,
        `> **Dossier:** \`${botStorageId}\``,
        `> **Durée ajoutée:** \`${keyRow.day}\``,
        `> **Statut:** ${started ? 'redémarré' : 'démarré'}`,
      ]);

      await updateLogChannel.send({
        components: [updateLog],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2,
      }).catch(() => {});
    }

    scheduleExpiration(bot, { ...botRow, time: newTime, expired: 'false' }, owner, async ({ storageId, row }) => {
      const currentOwnerId = getCurrentOwnerId(storageId, row?.ownerId);
      const currentOwnerUser = currentOwnerId
        ? await bot.users.fetch(currentOwnerId).catch(() => null)
        : null;

      await stopInstance(storageId).catch(() => {});
      console.log(`Bot ${botId} : clé expirée, process arrêté`);

      bot.db.prepare('UPDATE bot SET expired = ? WHERE botId = ?').run('true', botId);

      const botConfig = readJsonConfig(path.join(__dirname, '../../BotRuntimes', storageId, 'config.json'), { migrateToken: false });
      const roleUserIds = new Set([currentOwnerId || row?.ownerId || botRow.ownerId]);
      if (Array.isArray(botConfig?.buyers)) {
        for (const buyerId of botConfig.buyers) {
          if (buyerId) roleUserIds.add(String(buyerId));
        }
      }
      if (Array.isArray(botConfig?.buyer)) {
        for (const buyerId of botConfig.buyer) {
          if (buyerId) roleUserIds.add(String(buyerId));
        }
      }

      await syncClientRoleForUsers(bot, [...roleUserIds]).catch((error) => {
        console.log(`[UPDATEBOT] Sync role après expiration échouée pour ${botId}: ${error.message}`);
      });

      const expirationLogChannelId = getLogChannelId('expirationLogs', ['expiryReminderLogs']);
      const expirationLogChannel = expirationLogChannelId ? bot.channels.cache.get(expirationLogChannelId) : null;
      if (expirationLogChannel) {
        const expirationLog = buildReply('# Bot expiré', [
          `> **Bot:** <@${botId}> (\`${botId}\`)`,
          `> **Owner:** ${currentOwnerId ? `<@${currentOwnerId}> (\`${currentOwnerId}\`)` : '`Inconnu`'}`,
          `> **Type:** \`${botRow.type || 'inconnu'}\``,
          `> **Dossier:** \`${storageId}\``,
        ]);

        await expirationLogChannel.send({
          components: [expirationLog],
          allowedMentions: { parse: [] },
          flags: Discord.MessageFlags.IsComponentsV2,
        }).catch(() => {});
      }

      try {
        const dmTarget = currentOwnerUser || owner;
        if (!dmTarget) return;

        const dmLabel = dmTarget.tag || dmTarget.username ? `${dmTarget.username || dmTarget.tag} (${dmTarget.id})` : dmTarget.id;
        console.log(`[EXPIRE] DM expiration vers ${dmLabel} pour ${botId}`);
        await dmTarget.send({
          components: [buildExpirationMessage(botId, botName)],
          allowedMentions: { parse: [] },
          flags: Discord.MessageFlags.IsComponentsV2,
        });
      } catch (err) {
        console.log('Impossible de DM le user', err);
      }
    });

    if (!started) {
      const startError = await startInstance(botStorageId, { suppressLogs: true })
        .then(() => null)
        .catch((error) => {
          console.log(`[UPDATEBOT] Démarrage automatique échoué pour ${botStorageId}: ${error.message}`);
          return error;
        });

      if (startError) {
        return message.editReply({
          components: [buildReply('# Renouvellement effectué', [
            `> **Bot:** <@${botId}> (\`${botId}\`)`,
            `> **Template:** \`${botRow.type || 'inconnu'}\``,
            `> *Le renouvellement est enregistré, mais le démarrage automatique n'a pas pu être confirmé : \`${startError.message}\`*`,
          ])],
          allowedMentions: { parse: [] },
          flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
        });
      }

      return message.editReply({
        components: [buildSuccessMessage(botId, botName, botRow.type || 'inconnu', false)],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    return message.editReply({
      components: [buildSuccessMessage(botId, botName, botRow.type || 'inconnu', true)],
      allowedMentions: { parse: [] },
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
    });
  },
};
