const config = require('../../config.json');
const Discord = require('discord.js');
const path = require('path');
const launchChildProcess = require('../../Utils/lauchChildProcess');
const buildPanel = require('../../Utils/buildPanel');
const buildExpiredPanel = require('../../Utils/buildExpiredPanel');
const { scheduleExpiration } = require('../../Utils/expirationScheduler');
const parseDurationInput = require('../../Utils/parseDuration');
const { readJsonConfig } = require('../../Utils/tokenVault');
const { syncClientRoleForUsers } = require('../../Utils/clientRoleManager');
const { hasAdminAccess } = require('../../Utils/adminAccess');
const { sendAdminActionLog } = require('../../Utils/adminActionLog');
const { getLogChannelId } = require('../../Utils/logChannels');

function buildExpirationMessage(botId, botName) {
  return buildExpiredPanel(botId, botName);
}

module.exports = {
  name: 'addtime',
  description: 'Permet aux admins d\'ajouter du temps à un bot sans clé',
  permission: 'Aucune',
  dm: true,
  options: [
    {
      type: 'string',
      name: 'identifiant',
      description: 'L\'identifiant du bot à prolonger',
      required: true,
      autocomplete: false,
    },
    {
      type: 'string',
      name: 'time',
      description: 'Le temps à ajouter',
      required: true,
      autocomplete: false,
    },
  ],

  async run(bot, message, args) {
    if (!hasAdminAccess(message)) {
      const embed = buildPanel('# <:croix:1505270277796397146> Utilisateur non autorisé', ['> *Vous n’êtes pas autorisé à utiliser cette commande*']);
      return message.reply({ components: [embed], allowedMentions: { parse: [] }, flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
    }

    const botId = args.getString('identifiant');
    const timeInput = args.getString('time');
    const durationMs = parseDurationInput(timeInput);

    if (durationMs === false) {
      return message.reply({
        components: [buildPanel('# <:croix:1505270277796397146> Temps invalide', ['> *Veuillez fournir un temps valide*'])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const botReq = bot.db.prepare('SELECT * FROM bot WHERE botId = ?').all(botId);
    if (botReq.length < 1) {
      return message.reply({
        components: [buildPanel('# <:croix:1505270277796397146> Bot non trouvé', [`> *Le bot ${botId} n'a pas été trouvé. Créez-le avec \`/create\`*`])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const row = botReq[0];
    const botUser = await bot.users.fetch(botId).catch(() => null);
    const owner = await bot.users.fetch(row.ownerId).catch(() => ({ id: row.ownerId, username: row.ownerId }));
    const botIndex = `./BotRuntimes/${row.folder || row.botId}/index.js`;
    const getCurrentOwner = async (storageId, fallbackOwnerId) => {
      const botConfig = readJsonConfig(path.join(__dirname, '../../BotRuntimes', storageId, 'config.json'), { migrateToken: false });
      const currentOwnerId = botConfig?.ownerId || fallbackOwnerId || null;
      const currentOwnerUser = currentOwnerId ? await bot.users.fetch(currentOwnerId).catch(() => null) : null;
      return { currentOwnerId, currentOwnerUser, botConfig };
    };

    const addedSeconds = Math.floor(durationMs / 1000);
    const newtime = row.expired === 'true'
      ? Math.floor(Date.now() / 1000) + addedSeconds
      : Number(row.time) + addedSeconds;

    bot.db.prepare('UPDATE bot SET time = ?, expired = ?, reminderSent = ?, reminderSentAt = ? WHERE botId = ?').run(newtime, 'false', 'false', null, botId);

    const botConfig = readJsonConfig(path.join(__dirname, '../../BotRuntimes', row.folder || row.botId, 'config.json'), { migrateToken: false });
    const roleUserIds = new Set([row.ownerId]);
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
      console.log(`[ADDTIME] Sync role client échouée pour ${botId}: ${error.message}`);
    });

    const isRunning = await require('../../Utils/lauchChildProcess')(botIndex, 'checkstart', owner, bot);

    const stopBot = async ({ botId: targetBotId, storageId, row: freshRow }) => {
      const { currentOwnerId, currentOwnerUser, botConfig } = await getCurrentOwner(storageId, freshRow?.ownerId || row.ownerId);

      await launchChildProcess(
        `./BotRuntimes/${storageId}/index.js`,
        'stop',
        currentOwnerUser || { id: currentOwnerId || targetBotId, username: currentOwnerId || targetBotId },
        bot
      );
      console.log(`Bot ${targetBotId} : temps expiré, process arrêté`);

      bot.db.prepare('UPDATE bot SET expired = ? WHERE botId = ?').run('true', targetBotId);

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
        console.log(`[ADDTIME] Sync role après expiration échouée pour ${targetBotId}: ${error.message}`);
      });

      const expirationLogChannelId = getLogChannelId('expirationLogs', ['expiryReminderLogs']);
      const expirationLogChannel = expirationLogChannelId ? bot.channels.cache.get(expirationLogChannelId) : null;
      if (expirationLogChannel) {
        const expirationLog = buildPanel('# Bot expiré', [
          `> **Bot:** <@${targetBotId}> (\`${targetBotId}\`)`,
          `> **Owner:** ${currentOwnerId ? `<@${currentOwnerId}> (\`${currentOwnerId}\`)` : '`Inconnu`'}`,
          `> **Type:** \`${row.type || 'inconnu'}\``,
          `> **Dossier:** \`${storageId}\``,
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
          console.log(`[EXPIRE] DM expiration vers ${dmLabel} pour ${targetBotId}`);
          await currentOwnerUser.send({
            components: [buildExpirationMessage(targetBotId, botUser?.username)],
            flags: Discord.MessageFlags.IsComponentsV2,
          });
        }
      } catch (err) {
        console.log('Impossible de DM le user', err);
      }
    };

    if (!isRunning) {
      await launchChildProcess(botIndex, 'start', owner, bot);
      scheduleExpiration(bot, { ...row, time: newtime, expired: 'false' }, owner, stopBot);
      await sendAdminActionLog(bot, 'updateLogs', '# Temps ajouté', [
        `> **Bot:** <@${botId}> (\`${botId}\`)`,
        `> **Owner:** ${row.ownerId ? `<@${row.ownerId}> (\`${row.ownerId}\`)` : '`Inconnu`'}`,
        `> **Type:** \`${row.type || 'inconnu'}\``,
        `> **Dossier:** \`${row.folder || row.botId}\``,
        `> **Temps ajouté:** \`${timeInput}\``,
        `> **Statut:** démarré automatiquement`,
      ]);
      return message.reply({
        components: [buildPanel('# Temps ajouté', [`> *Le bot ${botId} a été prolongé de \`${timeInput}\` et lancé avec succès*`])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    scheduleExpiration(bot, { ...row, time: newtime, expired: 'false' }, owner, stopBot);
    await sendAdminActionLog(bot, 'updateLogs', '# Temps ajouté', [
      `> **Bot:** <@${botId}> (\`${botId}\`)`,
      `> **Owner:** ${row.ownerId ? `<@${row.ownerId}> (\`${row.ownerId}\`)` : '`Inconnu`'}`,
      `> **Type:** \`${row.type || 'inconnu'}\``,
      `> **Dossier:** \`${row.folder || row.botId}\``,
      `> **Temps ajouté:** \`${timeInput}\``,
      `> **Statut:** prolongé`,
    ]);
    return message.reply({
      components: [buildPanel('# Temps ajouté', [`> *Le bot ${botId} a été prolongé de \`${timeInput}\` avec succès*`])],
      allowedMentions: { parse: [] },
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
    });
  }
};
