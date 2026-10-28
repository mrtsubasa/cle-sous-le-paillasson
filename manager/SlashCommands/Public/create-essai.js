const Discord = require('discord.js');
const fs = require('fs');
const ms = require('ms');
const path = require('path');
const config = require('../../config.json');
const buildPanel = require('../../Utils/buildPanel');
const buildExpiredPanel = require('../../Utils/buildExpiredPanel');
const { encryptToken, readJsonConfig, writeJsonConfig } = require('../../Utils/tokenVault');
const { ensureMusicConfigFile, syncMusicEnvFromConfig } = require('../../Utils/musicEnv');
const { syncClientRoleForUsers } = require('../../Utils/clientRoleManager');
const { prepareBotRuntime, ensureRuntimeConfig } = require('../../Utils/templateRuntime');
const { getLogChannelId } = require('../../Utils/logChannels');
const { startInstance, stopInstance, getInstanceStatus } = require('../../Utils/managerApi');
const { autocompleteBotType } = require('../../Utils/botTypes');

const TRIAL_DURATION = '7d';
const TRIAL_DURATION_MS = ms(TRIAL_DURATION);

function generateDraftBotId() {
  return `trial_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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

function createBotFromTemplate(botStorageId, botType) {
  prepareBotRuntime(botStorageId, botType, { preserveRootFiles: new Set(['.env']) });
}

function writeBotConfig(storageId, botType, token, ownerId, botId = null) {
  const configPath = path.join(__dirname, '../../BotRuntimes', storageId, 'config.json');
  const isMusic = fs.existsSync(path.join(__dirname, '../../BotsFolders', botType, '.env'));
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

  let configFile = isMusic
    ? ensureMusicConfigFile(configPath, patch)
    : ensureRuntimeConfig(storageId, botType, patch);

  configFile.token = token;
  configFile.ownerId = ownerId;
  configFile.type = botType;
  configFile.folder = storageId;
  if (botId) {
    configFile.botId = botId;
    configFile.clientId = botId;
  }

  configFile.buyers = [ownerId];
  configFile.buyer = [ownerId];

  writeJsonConfig(configPath, configFile);
}

function scheduleTrialExpiration(bot, botId, botName, storageId, owner) {
  setTimeout(async () => {
    try {
      await stopInstance(storageId).catch(() => {});
      bot.db.prepare('UPDATE bot SET expired = ? WHERE botId = ?').run('true', botId);

      const botConfig = readJsonConfig(path.join(__dirname, '../../BotRuntimes', storageId, 'config.json'), { migrateToken: false });
      const roleUserIds = new Set([owner.id]);
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
        console.log(`[CREATE-ESSAI] Sync role après expiration échouée pour ${botId}: ${error.message}`);
      });

      try {
        await owner.send({
          components: [
            buildExpiredPanel(botId, botName, {
              entityLabel: 'essai',
              title: '# Essai expiré',
            }),
          ],
          allowedMentions: { parse: [] },
          flags: Discord.MessageFlags.IsComponentsV2,
        });
      } catch (error) {
        console.log('Impossible de DM le user', error);
      }
    } catch (error) {
      console.error(`[CREATE-ESSAI] Erreur lors de l'expiration du bot ${botId}:`, error);
    }
  }, TRIAL_DURATION_MS);
}

module.exports = {
  name: 'create-essai',
  description: 'Crée un bot d\'essai gratuit utilisable une seule fois pendant 1 semaine',
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
      type: 'string',
      name: 'type',
      description: 'Le type du bot',
      required: true,
      autocomplete: true,
    },
  ],

  async run(bot, message, args) {
  await message.deferReply({ flags: Discord.MessageFlags.Ephemeral }).catch(() => {});

    const usedTrial = bot.db.prepare('SELECT 1 FROM trial_use WHERE userId = ? LIMIT 1').get(message.author.id);
    if (usedTrial) {
      return message.editReply({
        components: [
          buildPanel('# Essai déjà utilisé', ['> *Vous avez déjà utilisé votre bot d\'essai gratuit*']),
        ],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const token = args.getString('token')?.trim();
    const botType = args.getString('type');

    if (!token) {
      return message.editReply({
        components: [buildPanel('# Token invalide', ['> *Veuillez fournir un token valide*'])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const templateDir = path.join(__dirname, '../../BotsFolders', botType);
    if (!fs.existsSync(templateDir)) {
      return message.editReply({
        components: [buildPanel('# Type introuvable', [`> *Le type \`${botType}\` n'existe pas dans \`BotsFolders\`*`])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const loginClient = new Discord.Client({ intents: [] });
    const loginResult = await loginClient.login(token).catch(() => null);
    if (!loginResult) {
      loginClient.destroy();
      return message.editReply({
        components: [buildPanel('# Token invalide', ['> *Le token fourni est invalide*'])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const botUser = loginClient.user;
    const botId = botUser.id;
    const botName = botUser.username;
    const buyerId = message.author.id;
    const destinationParentDirectory = path.join(__dirname, '../../BotRuntimes');
    const storageId = getUniqueFolderName(destinationParentDirectory, `${botId}_${botType}_trial`);
    const existingBot = bot.db.prepare('SELECT * FROM bot WHERE botId = ?').get(botId);

    if (existingBot) {
      loginClient.destroy();
      return message.editReply({
        components: [
          buildPanel('# Bot déjà enregistré', [
            `> *Le bot <@${botId}> (\`${botId}\`) existe déjà dans la base de données*`,
          ]),
        ],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    try {
      createBotFromTemplate(storageId, botType);
      writeBotConfig(storageId, botType, token, buyerId, botId);
      syncMusicEnvFromConfig(storageId, botType, { token, ownerId: buyerId, clientId: botId, botId });
    } catch (error) {
      loginClient.destroy();
      return message.editReply({
        components: [buildPanel('# Création impossible', [`> *${error.message}*`])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const newTime = Math.floor(Date.now() / 1000) + Math.floor(TRIAL_DURATION_MS / 1000);

    bot.db.prepare(
      'INSERT INTO bot (botId, token, type, folder, time, starttime, ownerId, started, expired, reminderSent, reminderSentAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      botId,
      encryptToken(token),
      botType,
      storageId,
      newTime,
      TRIAL_DURATION,
      buyerId,
      'true',
      'false',
      'false',
      null
    );

    bot.db.prepare('INSERT INTO trial_use (userId, botId, usedAt) VALUES (?, ?, ?)').run(
      buyerId,
      botId,
      String(Date.now())
    );

    await syncClientRoleForUsers(bot, [buyerId]).catch((error) => {
      console.log(`[CREATE-ESSAI] Sync role client échouée pour ${buyerId}: ${error.message}`);
    });

    const buyer = await bot.users.fetch(buyerId).catch(() => message.author);
    const started = (await getInstanceStatus(storageId).catch(() => ({ data: { running: false } })))?.data?.running || false;
    let startError = null;

    if (!started) {
      await startInstance(storageId, { suppressLogs: true }).catch((error) => {
        startError = error;
        console.log(`[CREATE-ESSAI] Démarrage automatique échoué pour ${storageId}: ${error.message}`);
      });
    }

    scheduleTrialExpiration(bot, botId, botName, storageId, buyer);
    loginClient.destroy();

    const logChannelId = getLogChannelId('trialLogs');
    const logChannel = logChannelId ? bot.channels.cache.get(logChannelId) : null;
    if (logChannel) {
      const logEmbed = buildPanel('# Essai créé', [
        `> **Buyer:** <@${buyerId}> (**${message.author.username}** | \`${buyerId}\`)`,
        `> **Bot:** <@${botId}> (**${botName}** | \`${botId}\`)`,
        `> **Type:** \`${botType}\``,
        `> **Dossier:** \`${storageId}\``,
        `> **Durée:** \`${TRIAL_DURATION}\``,
        `> **Statut:** ${started ? 'déjà lancé au démarrage' : startError ? 'créé, lancement non confirmé' : 'démarré automatiquement'}`,
        `> **Utilisation:** essai gratuit unique pour \`${buyerId}\``,
      ]);

      await logChannel.send({
        components: [logEmbed],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2,
      }).catch(() => {});
    }

    return message.editReply({
      components: [
        buildPanel('# Essai créé', [
          `> *Le bot <@${botId}> (\`${botId}\`) a été créé avec succès*`,
          `> *Type: \`${botType}\`*`,
          `> *Durée: \`${TRIAL_DURATION}\`*`,
          `> *Cet essai ne peut être utilisé qu'une seule fois par utilisateur*`,
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
