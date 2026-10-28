const config = require('../../config.json');
const Discord = require('discord.js');
const path = require('path');
const fs = require('fs');
const buildPanel = require('../../Utils/buildPanel');
const parseDurationInput = require('../../Utils/parseDuration');
const { encryptToken, readJsonConfig, writeJsonConfig } = require('../../Utils/tokenVault');
const { syncMusicEnvFromConfig } = require('../../Utils/musicEnv');
const { syncClientRoleForUsers } = require('../../Utils/clientRoleManager');
const { prepareBotRuntime, ensureRuntimeConfig } = require('../../Utils/templateRuntime');
const { getLogChannelId } = require('../../Utils/logChannels');

const embedStart1 = buildPanel('`Etape 1/4`', ['> *Préparation en cours...*']);

const embedStart2 = buildPanel('`Etape 2/4`', ['> *Téléchargement des dossiers en cours...*']);

const embedStart3 = buildPanel('`Etape 2/4`', ['> *Téléchargement effectué !*']);

const embedStart4 = buildPanel('`Etape 3/4`', ['> *Modification du config en cours...*']);

const embedStart5 = buildPanel('`Etape 3/4`', ['> *Modification du config terminé !*']);

const embedStart6 = buildPanel('`Etape 4/4`', ['> *Lancement du bot en cours...*']);

const embedStart7 = buildPanel('`Etape 4/4`', ['> *Lancement effectué !*']);
const EPHEMERAL_FLAGS = Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral;

function generateDraftBotId() {
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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

function getBotFolderBaseName(botId, botType) {
  return `${botId}_${botType}`;
}
  
  module.exports = {
    name: 'create',
    description: 'Permet de créer votre bot',
    permission: 'Aucune',
    dm: true,
    options: [
      {
        type: 'string',
        name: 'key',
        description: 'La clé à utiliser',
        required: true,
        autocomplete: false,
      },
      {
        type: 'string',
        name: 'token',
        description: 'Le token du bot à créer. Laissez vide pour le définir plus tard',
        required: false,
        autocomplete: false,
      }
    ],
  
    async run(bot, message, args) {
        await message.deferReply({ flags: EPHEMERAL_FLAGS }).catch(() => {});
        const sendReply = async (payload) => {
            try {
                if (message.deferred || message.replied) {
                    return await message.editReply(payload);
                }

                return await message.reply(payload);
            } catch {
                return null;
            }
        };

        const cle = args.getString('key');
        const token = args.getString('token')?.trim();
        const req = bot.db.prepare('SELECT * FROM cle WHERE code = ?').all(cle);

        if(req.length < 1) {
            const embed = buildPanel('# <:croix:1505270277796397146> Clé invalide', ['> *La clé fournie est invalide*']);
            return sendReply({ components: [embed], flags: EPHEMERAL_FLAGS });
        }

        const keytype = req[0].type;
        const keytime = req[0].day;
        const keyTargetUserId = req[0].targetUserId || message.author.id;

        if (String(req[0].use) !== 'false' && String(req[0].use) !== '0') {
            const embed = buildPanel('# <:croix:1505270277796397146> Clé utilisée', ['> *La clé fournie est déjà utilisé']);
            return sendReply({ components: [embed], flags: EPHEMERAL_FLAGS });
        }

        const sourceDirectory = `./BotsFolders/${keytype}`;
        const destinationParentDirectory = './BotRuntimes';
        let destinationFolderName = getUniqueFolderName(destinationParentDirectory, `${keyTargetUserId}_${keytype}`);
        let recordBotId = generateDraftBotId();

        if (token) {
          const { Client, GatewayIntentBits, Partials } = require('discord.js');
          const client = new Client({
              intents: [
                  GatewayIntentBits.Guilds,
                  GatewayIntentBits.GuildMessages,
                  GatewayIntentBits.MessageContent,
                  GatewayIntentBits.GuildMembers,
                  GatewayIntentBits.GuildPresences,
                  GatewayIntentBits.GuildVoiceStates,
                  GatewayIntentBits.DirectMessages,
                  GatewayIntentBits.GuildMessageReactions,
                  GatewayIntentBits.GuildBans,
                  GatewayIntentBits.GuildEmojisAndStickers,
                  GatewayIntentBits.GuildInvites,
              ],
              partials: [
                  Partials.Channel,
                  Partials.Message,
                  Partials.User,
                  Partials.GuildMember,
                  Partials.Reaction,
                  Partials.ThreadMember,
                  Partials.GuildScheduledEvent,
              ],
          });

          const loginResult = await client.login(token).catch(() => null);
          if (!loginResult) {
              const embed = buildPanel('# <:croix:1505270277796397146> Token invalide', [`> *Le token fourni est invalide, la clé n'a pas été utilisée*`]);
              return sendReply({ components: [embed], flags: EPHEMERAL_FLAGS });
          }

          recordBotId = client.user.id;
          destinationFolderName = getUniqueFolderName(
            destinationParentDirectory,
            getBotFolderBaseName(recordBotId, keytype)
          );

          const embed = buildPanel('# Lancement du processus', ['> *Lancement du processus en cours...*']);

          await sendReply({ components: [embed], flags: EPHEMERAL_FLAGS });
          await copierArborescence(
            sourceDirectory,
            destinationParentDirectory,
            destinationFolderName,
            message,
            client,
            token,
            bot,
            cle,
            keytype,
            keytime,
            keyTargetUserId,
            true,
            recordBotId
          );
          return;
        }

        const embed = buildPanel('# Bot préparé', ['> *Le bot a été créé sans token Tu peux l\'ajouter plus tard depuis `manage`*']);
        await sendReply({ components: [embed], flags: EPHEMERAL_FLAGS });
        await copierArborescence(
          sourceDirectory,
          destinationParentDirectory,
          destinationFolderName,
          message,
          null,
          '',
          bot,
          cle,
          keytype,
          keytime,
          keyTargetUserId,
          false,
          recordBotId
        );
    }
}

async function copierArborescence(sourceDir, destinationParentDir, destinationFolderName, message, client, token, bot, cle, keytype, keytime, ownerId, shouldStart, recordBotId) {
    if (!fs.existsSync(sourceDir)) {
        return message.followUp({
            components: [buildPanel('`Etape 1/4`', [`> *Le dossier source '${sourceDir}' n'existe pas*`])],
            flags: EPHEMERAL_FLAGS
        });
    } else {
    await message.followUp({ components: [embedStart2], flags: EPHEMERAL_FLAGS });

    if (!fs.existsSync(destinationParentDir)) {
        fs.mkdirSync(destinationParentDir, { recursive: true });
    }

    prepareBotRuntime(destinationFolderName, keytype, { preserveRootFiles: new Set(['.env']) });

    await message.followUp({ components: [embedStart3], flags: EPHEMERAL_FLAGS })
    await message.followUp({ components: [embedStart4], flags: EPHEMERAL_FLAGS })

    const configPath = path.join(__dirname, '../../BotRuntimes', destinationFolderName, 'config.json');
    const configachanger = ensureRuntimeConfig(destinationFolderName, keytype, {
      token: token || '',
      ownerId,
      type: keytype,
      folder: destinationFolderName,
      botId: recordBotId,
      clientId: shouldStart ? recordBotId : '',
    });
    configachanger.token = token || '';
    configachanger.ownerId = ownerId;
    configachanger.type = keytype;
    configachanger.folder = destinationFolderName;
    configachanger.botId = recordBotId;
    configachanger.clientId = shouldStart ? recordBotId : '';
    configachanger.buyers = [ownerId];
    configachanger.buyer = [ownerId];
    writeJsonConfig(configPath, configachanger);

    syncMusicEnvFromConfig(destinationFolderName, keytype, {
      token: token || '',
      ownerId,
      clientId: shouldStart ? recordBotId : '',
      botId: shouldStart ? recordBotId : '',
    });

    let startError = null;

    await message.followUp({ components: [embedStart5], flags: EPHEMERAL_FLAGS })
    if (shouldStart) {
      await message.followUp({ components: [embedStart6], flags: EPHEMERAL_FLAGS })

      startError = await require('../../Utils/managerApi').startInstance(destinationFolderName, { suppressLogs: true })
        .then(() => null)
        .catch((error) => {
          console.log(`[CREATE] Démarrage automatique échoué pour ${destinationFolderName}: ${error.message}`);
          return error;
        });
      client.destroy()
      if (startError) {
        await message.followUp({
          components: [buildPanel('`Etape 4/4`', [
            `> *Le bot est créé, mais le lancement automatique n'a pas pu être confirmé : \`${startError.message}\`*`,
          ])],
          flags: EPHEMERAL_FLAGS
        });
      } else {
      await message.followUp({ components: [embedStart7], flags: EPHEMERAL_FLAGS })
      }
    } else {
      await message.followUp({
        components: [buildPanel('# Bot prêt', [`> *Le bot est en attente du token. Va dans \`manage\` pour l\'ajouter*`])],
        flags: EPHEMERAL_FLAGS
      });
    }
            const botLabel = shouldStart
              ? `<@${client.user.id}> (**${client.user.username}** | \`${client.user.id}\`)`
              : `\`${destinationFolderName}\``;
            const ownerLabel = `<@${ownerId}> (**${ownerId}** | \`${ownerId}\`)`;

            const embed = buildPanel('# Lancement d\'un bot', [
              `> **Bot:** ${botLabel}`,
              `> **Owner:** ${ownerLabel}`,
              `> **Type:** \`${keytype}\``,
              `> **Dossier:** \`${destinationFolderName}\``,
              `> **Token:** ${token ? 'présent' : 'absent'}`,
              `> **Statut:** ${shouldStart ? startError ? 'créé, lancement non confirmé' : 'démarré' : 'préparé'}`,
            ]);

            const logChannelId = getLogChannelId('createLogs', ['botCreateLogs', 'botActionLogs']);
            const logChannel = bot.channels.cache.get(logChannelId);
            if (logChannel) {
              await logChannel.send({
                components: [embed],
                allowedMentions: { parse: [] },
                flags: Discord.MessageFlags.IsComponentsV2,
              }).catch(() => {});
            }

            console.log(
              `[CREATE] type=${keytype} buyer=${message.author.username} (${message.author.id}) owner=${ownerId} bot=${shouldStart ? client.user.tag : destinationFolderName} (${shouldStart ? client.user.id : destinationFolderName})`
            );
    const durationMs = parseDurationInput(keytime);
    if (durationMs === false) {
      return message.followUp({
        components: [buildPanel('# <:croix:1505270277796397146> Temps invalide', ['> *La durée de cette clé est invalide*'])],
        flags: EPHEMERAL_FLAGS,
      });
    }
    const newTime = String(Math.floor((Date.now() / 1000) + (durationMs / 1000)));
      const existingBot = bot.db.prepare('SELECT * FROM bot WHERE botId = ?').get(recordBotId);
      const previousOwnerId = existingBot?.ownerId || null;

      if (existingBot) {
        bot.db.prepare(
          'UPDATE bot SET token = ?, type = ?, folder = ?, time = ?, starttime = ?, ownerId = ?, started = ?, expired = ?, reminderSent = ?, reminderSentAt = ? WHERE botId = ?'
        ).run(
          encryptToken(token || ''),
          keytype,
          destinationFolderName,
          newTime,
          keytime,
          ownerId,
          shouldStart ? 'true' : 'false',
          'false',
          'false',
          null,
          recordBotId
        );
      } else {
        bot.db.prepare('INSERT INTO bot (botId, token, type, folder, time, starttime, ownerId, started, expired, reminderSent, reminderSentAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          recordBotId,
          encryptToken(token || ''),
          keytype,
          destinationFolderName,
          newTime,
          keytime,
          ownerId,
          shouldStart ? 'true' : 'false',
          'false',
          'false',
          null
        );
      }
      bot.db.prepare('UPDATE cle SET "use" = ? WHERE code = ?').run('true', cle);

      await syncClientRoleForUsers(bot, [previousOwnerId, ownerId]).catch((error) => {
        console.log(`[CREATE] Sync role client échouée pour ${ownerId}: ${error.message}`);
      });
    }
  }

async function copierArborescence2(sourceDir, destinationParentDir, destinationFolderName) {
      if (!fs.existsSync(sourceDir)) {
        console.log(`Le dossier source '${sourceDir}' n'existe pas.`);
    } else {
    if (!fs.existsSync(destinationParentDir)) {
        fs.mkdirSync(destinationParentDir, { recursive: true });
    }

    const destinationDir = path.join(destinationParentDir, destinationFolderName);
    if (!fs.existsSync(destinationDir)) {
        fs.mkdirSync(destinationDir);
    }

    const files = fs.readdirSync(sourceDir);

    for (const file of files) {
        const sourcePath = path.join(sourceDir, file);
        const destinationPath = path.join(destinationDir, file);

        const stat = fs.statSync(sourcePath);


        if (stat.isFile()) {
            fs.copyFileSync(sourcePath, destinationPath);
        } else if(stat.isDirectory()) {
          await copierArborescence2(sourcePath, destinationDir, file);
        }
    }
  }
}
