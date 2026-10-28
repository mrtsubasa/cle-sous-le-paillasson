const config = require('../../config.json');
const Discord = require('discord.js');
const fs = require('fs');
const path = require('path');
const buildPanel = require('../../Utils/buildPanel');
const buildExpiredPanel = require('../../Utils/buildExpiredPanel');
const { scheduleExpiration } = require('../../Utils/expirationScheduler');
const parseDurationInput = require('../../Utils/parseDuration');
const { encryptToken, readJsonConfig, writeJsonConfig } = require('../../Utils/tokenVault');
const { isMusicTemplate, ensureMusicConfigFile, syncMusicEnvFromConfig } = require('../../Utils/musicEnv');
const { syncClientRoleForUsers } = require('../../Utils/clientRoleManager');
const { hasAdminAccess } = require('../../Utils/adminAccess');
const { prepareBotRuntime, ensureRuntimeConfig } = require('../../Utils/templateRuntime');
const { getLogChannelId } = require('../../Utils/logChannels');
const { startInstance, stopInstance, getInstanceStatus } = require('../../Utils/managerApi');
const { autocompleteBotType } = require('../../Utils/botTypes');

function getBotStorageId(row) {
  return row?.folder || row?.botId;
}

function getBotDir(storageId) {
  return path.join(__dirname, '../../BotRuntimes', storageId || '');
}

function getTemplateDir(botType) {
  return path.join(__dirname, '../../BotsFolders', botType || '');
}

function generateFolderName(botId, botType) {
  return `${botId}_${botType}`;
}

function getUniqueFolderName(parentDir, baseName) {
  let candidate = baseName;
  let index = 1;

  while (fs.existsSync(path.join(parentDir, candidate))) {
    candidate = `${baseName}_${index}`;
    index += 1;
  }

  return candidate;
}

function getCurrentOwner(storageId, fallbackOwnerId) {
  const configPath = path.join(__dirname, '../../BotRuntimes', storageId, 'config.json');
  const botConfig = readJsonConfig(configPath, { migrateToken: false });
  return {
    botConfig,
    currentOwnerId: botConfig?.ownerId || fallbackOwnerId || null,
  };
}

function createBotFromTemplate(botStorageId, botType) {
  prepareBotRuntime(botStorageId, botType, { preserveRootFiles: new Set(['.env']) });
}

function updateBotCode(botStorageId, botType) {
  botsService.updateBotCode(botStorageId, botType);
}

async function writeBotConfig(storageId, botType, token, ownerId, botId = null) {
  const configPath = path.join(__dirname, '../../BotRuntimes', storageId, 'config.json');
  const isMusic = isMusicTemplate(botType);
  const patch = {
    token,
    ownerId,
    type: botType,
    folder: storageId,
  };
  if (botId) {
    patch.botId = botId;
    patch.clientId = botId;
  }

  const finalConfig = isMusic
    ? ensureMusicConfigFile(configPath, patch)
    : ensureRuntimeConfig(storageId, botType, patch);

  finalConfig.token = token;
  finalConfig.ownerId = ownerId;
  finalConfig.type = botType;
  finalConfig.folder = storageId;
  if (botId) {
    finalConfig.botId = botId;
    finalConfig.clientId = botId;
  }

  finalConfig.buyers = [ownerId];
  if (!Array.isArray(finalConfig.buyer)) finalConfig.buyer = [...finalConfig.buyers];
  else finalConfig.buyer = [ownerId];

  writeJsonConfig(configPath, finalConfig);
}

module.exports = {
  name: 'addbot',
  description: 'Permet aux admins de créer un bot sans clé',
  permission: 'Aucune',
  dm: true,
  autocomplete: autocompleteBotType,
  options: [
    {
      type: 'string',
      name: 'token',
      description: 'Le token du bot à créer',
      required: true,
      autocomplete: false,
    },
    {
      type: 'user',
      name: 'owner',
      description: 'L\'utilisateur propriétaire du bot',
      required: true,
      autocomplete: false,
    },
    {
      type: 'string',
      name: 'type',
      description: 'Le type du bot',
      required: true,
      autocomplete: true,
    },
    {
      type: 'string',
      name: 'duration',
      description: 'La durée du bot',
      required: true,
      autocomplete: false,
    },
  ],

  async run(bot, message, args) {
    await message.deferReply({ flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral }).catch(() => {});

    if (!hasAdminAccess(message)) {
      return message.editReply({
        components: [
          buildPanel('# <:croix:1505270277796397146> Utilisateur non autorisé', ['> *Vous n’êtes pas autorisé à utiliser cette commande*']),
        ],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const token = args.getString('token')?.trim();
    const ownerUser = args.getUser('owner');
    const botType = args.getString('type');
    const durationInput = args.getString('duration');
    const durationMs = parseDurationInput(durationInput);

    if (!token) {
      return message.editReply({
        components: [buildPanel('# <:croix:1505270277796397146> Token invalide', ['> *Veuillez fournir un token valide*'])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    if (durationMs === false) {
      return message.editReply({
        components: [buildPanel('# <:croix:1505270277796397146> Durée invalide', ['> *Veuillez fournir une durée valide*'])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const templateDir = getTemplateDir(botType);
    if (!fs.existsSync(templateDir)) {
      return message.editReply({
        components: [buildPanel('# <:croix:1505270277796397146> Type introuvable', [`> *Le type \`${botType}\` n'existe pas dans \`BotsFolders\`*`])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const loginClient = new Discord.Client({ intents: [] });
    const loginResult = await loginClient.login(token).catch(() => null);
    if (!loginResult) {
      loginClient.destroy();
      return message.editReply({
        components: [buildPanel('# <:croix:1505270277796397146> Token invalide', ['> *Le token fourni est invalide*'])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const botUser = loginClient.user;
    const botId = botUser.id;
    const botName = botUser.username;
    const ownerId = ownerUser.id;
    const destinationParentDirectory = path.join(__dirname, '../../BotRuntimes');
    const baseFolderName = generateFolderName(botId, botType);
    const storageId = getUniqueFolderName(destinationParentDirectory, baseFolderName);
    const existingBot = bot.db.prepare('SELECT * FROM bot WHERE botId = ?').get(botId);
    const previousOwnerId = existingBot?.ownerId || null;

    try {
      createBotFromTemplate(storageId, botType);
      await writeBotConfig(storageId, botType, token, ownerId, botId);
      syncMusicEnvFromConfig(storageId, botType, { token, ownerId, clientId: botId, botId });
    } catch (error) {
      loginClient.destroy();
      return message.editReply({
        components: [buildPanel('# <:croix:1505270277796397146> Création impossible', [`> *${error.message}*`])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const addedSeconds = Math.floor(durationMs / 1000);
    const newTime = Math.floor(Date.now() / 1000) + addedSeconds;

    if (existingBot) {
      bot.db.prepare(
        'UPDATE bot SET token = ?, type = ?, folder = ?, time = ?, starttime = ?, ownerId = ?, started = ?, expired = ?, reminderSent = ?, reminderSentAt = ? WHERE botId = ?'
      ).run(
        encryptToken(token),
        botType,
        storageId,
        newTime,
        durationInput,
        ownerId,
        'true',
        'false',
        'false',
        null,
        botId
      );
    } else {
      bot.db.prepare(
        'INSERT INTO bot (botId, token, type, folder, time, starttime, ownerId, started, expired, reminderSent, reminderSentAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        botId,
        encryptToken(token),
        botType,
        storageId,
        newTime,
        durationInput,
        ownerId,
        'true',
        'false',
        'false',
        null
      );
    }

    const owner = await bot.users.fetch(ownerId).catch(() => ({ id: ownerId, username: ownerId }));
    const started = (await getInstanceStatus(storageId).catch(() => ({ data: { running: false } })))?.data?.running || false;
    let startError = null;

    if (!started) {
      await startInstance(storageId, { suppressLogs: true }).catch((error) => {
        startError = error;
        console.log(`[ADDBOT] Démarrage automatique échoué pour ${storageId}: ${error.message}`);
      });
    }

    await syncClientRoleForUsers(bot, [previousOwnerId, ownerId]).catch((error) => {
      console.log(`[ADDBOT] Sync role client échouée pour ${ownerId}: ${error.message}`);
    });

    const addBotLogChannelId = getLogChannelId('addBotLogs', ['createLogs', 'botCreateLogs', 'botActionLogs']);
    const addBotLogChannel = addBotLogChannelId ? bot.channels.cache.get(addBotLogChannelId) : null;
    if (addBotLogChannel) {
      const addBotLog = buildPanel('# Bot ajouté', [
        `> **Bot:** <@${botId}> (\`${botId}\`)`,
        `> **Owner:** <@${ownerId}> (\`${ownerId}\`)`,
        `> **Type:** \`${botType}\``,
        `> **Dossier:** \`${storageId}\``,
        `> **Durée:** \`${durationInput}\``,
        `> **Statut:** ${started ? 'déjà lancé' : startError ? 'créé, lancement non confirmé' : 'démarré'}`,
      ]);

      await addBotLogChannel.send({
        components: [addBotLog],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2,
      }).catch(() => {});
    }

    scheduleExpiration(bot, { botId, folder: storageId, time: newTime, expired: 'false' }, owner, async ({ storageId: targetStorageId, row: freshRow }) => {
      const { botConfig, currentOwnerId } = getCurrentOwner(targetStorageId, freshRow?.ownerId || ownerId);
      const currentOwnerUser = currentOwnerId ? await bot.users.fetch(currentOwnerId).catch(() => null) : null;

      await stopInstance(targetStorageId).catch(() => {});

      bot.db.prepare('UPDATE bot SET expired = ? WHERE botId = ?').run('true', botId);

      const roleUserIds = new Set([currentOwnerId]);
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
        console.log(`[ADDBOT] Sync role après expiration échouée pour ${botId}: ${error.message}`);
      });

      const expirationLogChannelId = getLogChannelId('expirationLogs', ['expiryReminderLogs']);
      const expirationLogChannel = expirationLogChannelId ? bot.channels.cache.get(expirationLogChannelId) : null;
      if (expirationLogChannel) {
        const expirationLog = buildPanel('# Bot expiré', [
          `> **Bot:** <@${botId}> (\`${botId}\`)`,
          `> **Owner:** ${currentOwnerId ? `<@${currentOwnerId}> (\`${currentOwnerId}\`)` : '`Inconnu`'}`,
          `> **Type:** \`${botType}\``,
          `> **Dossier:** \`${targetStorageId}\``,
        ]);

        await expirationLogChannel.send({
          components: [expirationLog],
          allowedMentions: { parse: [] },
          flags: Discord.MessageFlags.IsComponentsV2,
        }).catch(() => {});
      }

      try {
        if (currentOwnerUser) {
          const dmLabel = currentOwnerUser.tag || currentOwnerUser.username ? `${currentOwnerUser.username || currentOwnerUser.tag} (${currentOwnerUser.id})` : currentOwnerUser.id;
          console.log(`[EXPIRE] DM expiration vers ${dmLabel} pour ${botId}`);
          await currentOwnerUser.send({
            components: [buildExpiredPanel(botId, botName)],
            allowedMentions: { parse: [] },
            flags: Discord.MessageFlags.IsComponentsV2,
          });
        }
      } catch (error) {
        console.log('Impossible de DM le user', error);
      }
    });
    loginClient.destroy();

    return message.editReply({
      components: [
        buildPanel('# Bot ajouté', [
          `> *Le bot <@${botId}> (\`${botId}\`) a été créé avec succès*`,
          `> *Type: \`${botType}\`*`,
          `> *Owner: <@${ownerId}> (\`${ownerId}\`)*`,
          `> *Durée: \`${durationInput}\`*`,
          startError
            ? `> *Le bot est créé, mais le lancement automatique n'a pas pu être confirmé : \`${startError.message}\`*`
            : started
            ? '> *Le bot était déjà lancé et a été conservé en ligne*'
            : '> *Le bot a été lancé avec succès*',
        ]),
      ],
      allowedMentions: { parse: [] },
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
    });
  },
};
