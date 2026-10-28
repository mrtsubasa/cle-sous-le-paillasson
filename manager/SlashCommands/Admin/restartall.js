const config = require('../../config.json');
const Discord = require('discord.js');
const buildPanel = require('../../Utils/buildPanel');
const { hasAdminAccess } = require('../../Utils/adminAccess');
const launchChildProcess = require('../../Utils/lauchChildProcess');

function getBotStorageId(row) {
  return row?.folder || row?.botId;
}

module.exports = {
  name: 'restartall',
  description: 'Redémarre tous les bots enregistrés',
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

    const restartedBots = [];
    const skippedExpired = [];
    const skippedMissing = [];

    await message.deferReply({ flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
    await message.editReply({
      components: [buildPanel('# Redémarrage global', ['> *Le redémarrage de tous les bots est en cours...*'])],
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

      try {
        await launchChildProcess(`./BotRuntimes/${storageId}/index.js`, 'restart', botUser, bot);
        restartedBots.push(botId);
      } catch (error) {
        console.log(`[RESTARTALL] Impossible de redémarrer ${botId}: ${error.message}`);
      }
    }

    const lines = [
      `> *Bots redémarrés: ${restartedBots.length}*`,
    ];

    if (skippedExpired.length > 0) {
      lines.push(`> *Bots expirés ignorés: ${skippedExpired.length}*`);
    }

    if (skippedMissing.length > 0) {
      lines.push(`> *Bots ignorés car dossier introuvable: ${skippedMissing.length}*`);
    }

    if (restartedBots.length > 0) {
      lines.push(`> *Le redémarrage a été appliqué à tous les bots valides, même ceux déjà arrêtés*`);
    } else {
      lines.push(`> *Aucun bot valide n'a pu être redémarré*`);
    }

    return message.editReply({
      components: [
        buildPanel('# Redémarrage terminé', lines),
      ],
      allowedMentions: { parse: [] },
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
    });
  },
};
