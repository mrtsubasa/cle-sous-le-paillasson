const Discord = require('discord.js');
const path = require('path');
const buildPanel = require('../../Utils/buildPanel');
const buildExpiredPanel = require('../../Utils/buildExpiredPanel');
const launchChildProcess = require('../../Utils/lauchChildProcess');
const { scheduleExpiration } = require('../../Utils/expirationScheduler');
const parseDurationInput = require('../../Utils/parseDuration');
const { readJsonConfig } = require('../../Utils/tokenVault');
const { syncClientRoleForUsers } = require('../../Utils/clientRoleManager');
const { hasAdminAccess } = require('../../Utils/adminAccess');
const { sendAdminActionLog } = require('../../Utils/adminActionLog');

function getBotStorageId(row) {
  return row?.folder || row?.botId;
}

function getCurrentOwner(storageId, fallbackOwnerId) {
  const configPath = path.join(__dirname, '../../BotRuntimes', storageId, 'config.json');
  const botConfig = readJsonConfig(configPath, { migrateToken: false });
  return {
    botConfig,
    currentOwnerId: botConfig?.ownerId || fallbackOwnerId || null,
  };
}

function buildExpirationMessage(botId, botName) {
  return buildExpiredPanel(botId, botName);
}

module.exports = {
  name: 'removetime',
  description: 'Permet aux admins de retirer du temps à un bot',
  permission: 'Aucune',
  dm: true,
  options: [
    {
      type: 'string',
      name: 'identifiant',
      description: "L'identifiant du bot à réduire",
      required: true,
      autocomplete: false,
    },
    {
      type: 'string',
      name: 'time',
      description: 'Le temps à retirer',
      required: true,
      autocomplete: false,
    },
  ],

  async run(bot, message, args) {
    await message.deferReply({ flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral }).catch(() => {});

    if (!hasAdminAccess(message)) {
      const embed = buildPanel('# <:croix:1505270277796397146> Utilisateur non autorisé', ['> *Vous n’êtes pas autorisé à utiliser cette commande*']);
      return message.editReply({ components: [embed], allowedMentions: { parse: [] }, flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
    }

    const botId = args.getString('identifiant');
    const timeInput = args.getString('time');
    const durationMs = parseDurationInput(timeInput);

    if (durationMs === false) {
      return message.editReply({
        components: [buildPanel('# <:croix:1505270277796397146> Durée invalide', ['> *Veuillez fournir une durée valide*'])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const row = bot.db.prepare('SELECT * FROM bot WHERE botId = ?').get(botId);
    if (!row) {
      return message.editReply({
        components: [buildPanel('# <:croix:1505270277796397146> Bot non trouvé', [`> *Le bot ${botId} n'a pas été trouvé*`])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const botStorageId = getBotStorageId(row);
    const { botConfig, currentOwnerId } = getCurrentOwner(botStorageId, row.ownerId);
    const owner = currentOwnerId
      ? await bot.users.fetch(currentOwnerId).catch(() => ({ id: currentOwnerId, username: currentOwnerId }))
      : { id: row.ownerId, username: row.ownerId };
    const botUser = await bot.users.fetch(botId).catch(() => ({ id: botId, username: botId }));
    const botIndex = `./BotRuntimes/${botStorageId}/index.js`;
    const now = Math.floor(Date.now() / 1000);
    const subtractSeconds = Math.floor(durationMs / 1000);
    const currentTime = Number(row.time) || now;
    const nextTime = Math.max(0, currentTime - subtractSeconds);

    const roleUserIds = new Set([currentOwnerId || row.ownerId]);
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

    if (nextTime <= now) {
      bot.db.prepare('UPDATE bot SET time = ?, expired = ?, reminderSent = ?, reminderSentAt = ? WHERE botId = ?').run(
        now,
        'true',
        'false',
        null,
        botId
      );

      try {
        await launchChildProcess(botIndex, 'stop', owner, bot);
      } catch {}

      await syncClientRoleForUsers(bot, [...roleUserIds]).catch((error) => {
        console.log(`[REMOVETIME] Sync role après expiration échouée pour ${botId}: ${error.message}`);
      });

      try {
        console.log(`[EXPIRE] DM expiration vers ${owner.username || owner.tag || owner.id} (${owner.id}) pour ${botId}`);
        await owner.send({
          components: [buildExpirationMessage(botId, botUser?.username)],
          allowedMentions: { parse: [] },
          flags: Discord.MessageFlags.IsComponentsV2,
        });
      } catch (error) {
        console.log('[REMOVETIME] Impossible de DM le user', error);
      }

      return message.editReply({
        components: [
          buildPanel('# Temps réduit', [
            `> *Le bot ${botId} a perdu \`${timeInput}\` et a expiré immédiatement*`,
            '> *Le bot a été arrêté et le rôle client a été synchronisé*',
          ]),
        ],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    bot.db.prepare('UPDATE bot SET time = ?, expired = ?, reminderSent = ?, reminderSentAt = ? WHERE botId = ?').run(
      nextTime,
      'false',
      'false',
      null,
      botId
    );

    await syncClientRoleForUsers(bot, [...roleUserIds]).catch((error) => {
      console.log(`[REMOVETIME] Sync role client échouée pour ${botId}: ${error.message}`);
    });

    const started = await require('../../Utils/lauchChildProcess')(botIndex, 'checkstart', owner, bot);
    const stopBot = async ({ storageId, row: freshRow }) => {
      const current = getCurrentOwner(storageId, freshRow?.ownerId || row.ownerId);
      const currentOwnerUser = current.currentOwnerId
        ? await bot.users.fetch(current.currentOwnerId).catch(() => null)
        : null;

      await launchChildProcess(
        `./BotRuntimes/${storageId}/index.js`,
        'stop',
        currentOwnerUser || { id: current.currentOwnerId || botId, username: current.currentOwnerId || botId },
        bot
      );

      bot.db.prepare('UPDATE bot SET expired = ? WHERE botId = ?').run('true', botId);

      const roleIds = new Set([current.currentOwnerId || freshRow?.ownerId || row.ownerId]);
      if (Array.isArray(current.botConfig?.buyers)) {
        for (const buyerId of current.botConfig.buyers) {
          if (buyerId) roleIds.add(String(buyerId));
        }
      }
      if (Array.isArray(current.botConfig?.buyer)) {
        for (const buyerId of current.botConfig.buyer) {
          if (buyerId) roleIds.add(String(buyerId));
        }
      }

      await syncClientRoleForUsers(bot, [...roleIds]).catch((error) => {
        console.log(`[REMOVETIME] Sync role après expiration échouée pour ${botId}: ${error.message}`);
      });

      if (currentOwnerUser) {
        console.log(`[EXPIRE] DM expiration vers ${currentOwnerUser.username || currentOwnerUser.tag || currentOwnerUser.id} (${currentOwnerUser.id}) pour ${botId}`);
        await currentOwnerUser.send({
          components: [buildExpirationMessage(botId, botUser?.username)],
          allowedMentions: { parse: [] },
          flags: Discord.MessageFlags.IsComponentsV2,
        }).catch(() => {});
      }
    };

    scheduleExpiration(bot, { ...row, time: nextTime, expired: 'false' }, owner, stopBot);
    await sendAdminActionLog(bot, 'updateLogs', '# Temps retiré', [
      `> **Bot:** <@${botId}> (\`${botId}\`)`,
      `> **Owner:** ${row.ownerId ? `<@${row.ownerId}> (\`${row.ownerId}\`)` : '`Inconnu`'}`,
      `> **Type:** \`${row.type || 'inconnu'}\``,
      `> **Dossier:** \`${botStorageId}\``,
      `> **Temps retiré:** \`${timeInput}\``,
      `> **Nouvelle expiration:** <t:${nextTime}:R>`,
      `> **Statut:** ${started ? 'en ligne' : 'hors ligne'}`,
    ]);

    if (started) {
      return message.editReply({
        components: [
          buildPanel('# Temps réduit', [
          `> *Le bot ${botId} a perdu \`${timeInput}\` avec succès*`,
          `> *Nouvelle expiration: <t:${nextTime}:R>*`,
          '> *Le bot reste en ligne*',
        ]),
      ],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    return message.editReply({
      components: [
        buildPanel('# Temps réduit', [
          `> *Le bot ${botId} a perdu \`${timeInput}\` avec succès*`,
          `> *Nouvelle expiration: <t:${nextTime}:R>*`,
          '> *Le bot est actuellement hors ligne*',
        ]),
      ],
      allowedMentions: { parse: [] },
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
    });
  },
};
