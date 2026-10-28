const config = require('../../config.json');
const Discord = require('discord.js');
const buildPanel = require('../../Utils/buildPanel');
const { hasAdminAccess } = require('../../Utils/adminAccess');
const launchChildProcess = require('../../Utils/lauchChildProcess');
const botsService = require('../../Handlers/botsService');

function getBotStorageId(row) {
  return row?.folder || row?.botId;
}

module.exports = {
  name: 'updateall',
  description: 'Met à jour tous les bots enregistrés et redémarre ceux qui sont lancés',
  permission: 'Aucune',
  dm: true,

  async run(bot, message) {
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

    const rows = bot.db.prepare('SELECT * FROM bot ORDER BY time DESC').all();

    if (rows.length < 1) {
      return message.editReply({
        components: [
          buildPanel('# <:croix:1505270277796397146> Aucun bot', ['> *Aucun bot n\'est enregistré dans la base de données*']),
        ],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const updatedBots = [];
    const restartedBots = [];
    const skippedExpired = [];
    const skippedMissing = [];

    await message.editReply({
      components: [buildPanel('# Mise à jour globale', ['> *La mise à jour de tous les bots est en cours...*'])],
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
      const started = await botsService.isRunning(storageId, botUser);

      try {
        botsService.updateBotCode(storageId, row.type);
        updatedBots.push(botId);

        if (started) {
          await launchChildProcess(`./BotRuntimes/${storageId}/index.js`, 'restart', botUser, bot);
          restartedBots.push(botId);
        }
      } catch (error) {
        console.log(`[UPDATEALL] Impossible de mettre à jour ${botId}: ${error.message}`);
      }
    }

    const lines = [
      `> *Bots mis à jour: ${updatedBots.length}*`,
      `> *Bots redémarrés: ${restartedBots.length}*`,
    ];

    if (skippedExpired.length > 0) {
      lines.push(`> *Bots expirés ignorés: ${skippedExpired.length}*`);
    }

    if (skippedMissing.length > 0) {
      lines.push(`> *Bots ignorés car dossier introuvable: ${skippedMissing.length}*`);
    }

    if (updatedBots.length > 0) {
      lines.push(`> *Tous les bots valides ont été recopiés depuis leur template respectif*`);
    } else {
      lines.push(`> *Aucun bot valide n'a pu être mis à jour*`);
    }

    return message.editReply({
      components: [
        buildPanel('# Mise à jour terminée', lines.length > 0 ? lines : ['> *Aucun bot n\'a pu être mis à jour*']),
      ],
      allowedMentions: { parse: [] },
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
    });
  },
};
