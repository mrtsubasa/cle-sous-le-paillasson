const config = require('../../config.json');
const Discord = require('discord.js');
const buildPanel = require('../../Utils/buildPanel');
const { hasAdminAccess } = require('../../Utils/adminAccess');
const launchChildProcess = require('../../Utils/lauchChildProcess');
const publicManage = require('../Public/manage.js');

function getBotStorageId(row) {
  return row?.folder || row?.botId;
}

module.exports = {
  name: 'start-all',
  description: 'Démarre tous les bots enregistrés',
  permission: 'Aucune',
  dm: true,

  async run(bot, message) {
    if (!hasAdminAccess(message)) {
      return message.reply({
        components: [
          buildPanel('# <:croix:1505270277796397146> Utilisateur non autorisé', ['> *Vous n’êtes pas autorisé à utiliser cette commande*']),
        ],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const rows = bot.db.prepare('SELECT * FROM bot ORDER BY time DESC').all();

    if (rows.length < 1) {
      return message.reply({
        components: [
          buildPanel('# <:croix:1505270277796397146> Aucun bot', ['> *Aucun bot n\'est enregistré dans la base de données*']),
        ],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const startedBots = [];
    const alreadyStartedBots = [];
    const skippedExpired = [];
    const skippedMissing = [];

    await message.deferReply({ flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
    await message.editReply({
      components: [buildPanel('# Démarrage global', ['> *Le démarrage de tous les bots est en cours...*'])],
      allowedMentions: { parse: [] },
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
    });

    for (const row of rows) {
      const botId = row.botId;
      const storageId = getBotStorageId(row);

      if (!botId || !storageId) {
        skippedMissing.push(botId || storageId || '`inconnu`');
        continue;
      }

      if (row.expired === 'true') {
        skippedExpired.push(botId);
        continue;
      }

      const botUser = await bot.users.fetch(botId).catch(() => ({ id: botId, username: botId }));
      const started = await publicManage.__private__.isRunning(storageId, botUser);

      if (started) {
        alreadyStartedBots.push(botId);
        continue;
      }

      try {
        await launchChildProcess(`./BotRuntimes/${storageId}/index.js`, 'start', botUser, bot);
        startedBots.push(botId);
      } catch (error) {
        console.log(`[STARTALL] Impossible de démarrer ${botId}: ${error.message}`);
      }
    }

    const lines = [
      `> *Bots démarrés: ${startedBots.length}*`,
    ];

    if (alreadyStartedBots.length > 0) {
      lines.push(`> *Bots déjà lancés ignorés: ${alreadyStartedBots.length}*`);
    }

    if (skippedExpired.length > 0) {
      lines.push(`> *Bots expirés ignorés: ${skippedExpired.length}*`);
    }

    if (skippedMissing.length > 0) {
      lines.push(`> *Bots ignorés car dossier introuvable: ${skippedMissing.length}*`);
    }

    if (startedBots.length > 0) {
      lines.push(`> *Le démarrage a été appliqué à tous les bots arrêtés et valides*`);
    } else {
      lines.push(`> *Aucun bot arrêté et valide n'a pu être démarré*`);
    }

    return message.editReply({
      components: [
        buildPanel('# Démarrage terminé', lines),
      ],
      allowedMentions: { parse: [] },
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
    });
  },
};
