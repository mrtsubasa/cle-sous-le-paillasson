const config = require('../../config.json');
const Discord = require('discord.js');
const fs = require('fs');
const path = require('path');
const buildPanel = require('../../Utils/buildPanel');
const { sendAdminActionLog } = require('../../Utils/adminActionLog');
const launchChildProcess = require('../../Utils/lauchChildProcess');
const { hasAdminAccess } = require('../../Utils/adminAccess');
const publicManage = require('../Public/manage.js');
const { readJsonConfig } = require('../../Utils/tokenVault');
const { syncClientRoleForUsers } = require('../../Utils/clientRoleManager');

function getBotStorageId(row) {
  return row?.folder || row?.botId;
}

function getBotDir(storageId) {
  return path.join(__dirname, '../../BotRuntimes', storageId || '');
}

function buildError(title, lines) {
  return buildPanel(title, lines);
}

async function deleteBotFolder(storageId) {
  const botDir = getBotDir(storageId);
  if (!fs.existsSync(botDir)) return;

  fs.rmSync(botDir, { recursive: true, force: true });
}

module.exports = {
  name: 'delbot',
  description: 'Supprime un bot perso de la base de données et du disque',
  permission: 'Aucune',
  dm: true,
  options: [
    {
      type: 'string',
      name: 'identifiant',
      description: 'L\'identifiant du bot à supprimer',
      required: true,
      autocomplete: false,
    },
  ],

  async run(bot, message, args) {
    await message.deferReply({ flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral }).catch(() => {});

    if (!hasAdminAccess(message)) {
      return message.editReply({
        components: [buildError('# <:croix:1505270277796397146> Utilisateur non autorisé', ['> *Vous n’êtes pas autorisé à utiliser cette commande*'])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const botId = args.getString('identifiant');
    const row = bot.db.prepare('SELECT * FROM bot WHERE botId = ?').get(botId);

    if (!row) {
      return message.editReply({
        components: [buildError('# <:croix:1505270277796397146> Bot non trouvé', [`> *Le bot ${botId} n'a pas été trouvé*`])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const storageId = getBotStorageId(row);
    const botUser = await bot.users.fetch(botId).catch(() => ({ id: botId, username: botId }));
    const started = await publicManage.__private__.isRunning(storageId, botUser);

    try {
      if (started) {
        await launchChildProcess(`./BotRuntimes/${storageId}/index.js`, 'stop', botUser, bot);
      }
    } catch (error) {
      console.error(`[DELBOT] Impossible d'arrêter ${botId} avant suppression:`, error);
    }

    const botConfig = readJsonConfig(path.join(__dirname, '../../BotRuntimes', storageId, 'config.json'), { migrateToken: false });
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

    try {
      await deleteBotFolder(storageId);
    } catch (error) {
      return message.editReply({
        components: [buildError('# <:croix:1505270277796397146> Suppression impossible', [`> *Impossible de supprimer le dossier du bot ${botId}*`, `> *${error.message}*`])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    bot.db.prepare('DELETE FROM bot WHERE botId = ?').run(botId);

    await syncClientRoleForUsers(bot, [...roleUserIds]).catch((error) => {
      console.log(`[DELBOT] Sync role client échouée pour ${botId}: ${error.message}`);
    });

    await sendAdminActionLog(bot, 'botDeleteLogs', '# Bot supprimé', [
      `> **Bot:** <@${botId}> (\`${botId}\`)`,
      `> **Type:** \`${row.type || 'inconnu'}\``,
      `> **Dossier:** \`${storageId}\``,
      `> **Owner avant suppression:** ${row.ownerId ? `<@${row.ownerId}> (\`${row.ownerId}\`)` : '`Inconnu`'}`,
      `> **Supprimé par:** <@${message.author.id}> (\`${message.author.id}\`)`,
      `> **Statut avant suppression:** ${started ? 'démarré' : 'arrêté'}`,
    ]);

    return message.editReply({
      components: [
        buildPanel('# Bot supprimé', [
          `> *Le bot ${botId} a été supprimé de la base de données et du disque*`,
          started
            ? '> *Le bot a été arrêté avant suppression*'
            : '> *Le bot était déjà éteint*',
        ]),
      ],
      allowedMentions: { parse: [] },
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
    });
  },
};
