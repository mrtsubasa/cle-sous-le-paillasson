const config = require('../../config.json');
const Discord = require('discord.js');
const fs = require('fs');
const path = require('path');
const buildPanel = require('../../Utils/buildPanel');
const { hasAdminAccess } = require('../../Utils/adminAccess');
const launchChildProcess = require('../../Utils/lauchChildProcess');
const botsService = require('../../Handlers/botsService');
const { autocompleteBotType } = require('../../Utils/botTypes');

function getBotStorageId(rowOrBotId) {
  if (typeof rowOrBotId === 'string') return rowOrBotId;
  return rowOrBotId?.folder || rowOrBotId?.botId;
}

module.exports = {
  name: 'update',
  description: 'Permet aux admins de mettre à jour et redémarrer un bot',
  permission: 'Aucune',
  dm: true,
  autocomplete: autocompleteBotType,
  options: [
    {
      type: 'string',
      name: 'identifiant',
      description: 'L\'identifiant du bot à mettre à jour',
      required: true,
      autocomplete: false,
    },
    {
      type: 'string',
      name: 'type',
      description: 'Le type de template à appliquer',
      required: true,
      autocomplete: true,
    },
  ],

  async run(bot, message, args) {
    await message.deferReply({ flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral }).catch(() => {});

    if (!hasAdminAccess(message)) {
      const embed = buildPanel('# Utilisateur non autorisé', ['> *Vous n’êtes pas autorisé à utiliser cette commande*']);
      return message.editReply({ components: [embed], allowedMentions: { parse: [] }, flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
    }

    const botId = args.getString('identifiant');
    const botType = args.getString('type');
    const row = bot.db.prepare('SELECT * FROM bot WHERE botId = ?').get(botId);

    if (!row) {
      return message.editReply({
        components: [buildPanel('# Bot non trouvé', [`> *Le bot ${botId} n'a pas été trouvé*`])],
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

    const botStorageId = getBotStorageId(row);
    const botUser = await bot.users.fetch(botId).catch(() => ({ id: botId, username: botId }));
    const started = await botsService.isRunning(botStorageId, botUser);

    try {
      botsService.updateBotCode(botStorageId, botType);
    } catch (error) {
      return message.editReply({
        components: [buildPanel('# <:croix:1505270277796397146> Mise à jour impossible', [`> *${error.message}*`])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    bot.db.prepare('UPDATE bot SET type = ? WHERE botId = ?').run(botType, botId);

    await launchChildProcess(
      `./BotRuntimes/${botStorageId}/index.js`,
      started ? 'restart' : 'start',
      botUser,
      bot
    );

    return message.editReply({
      components: [
        buildPanel(
          '# Bot mis à jour',
          [
            `> **Bot:** <@${botId}> (\`${botId}\`)`,
            `> **Template:** \`${botType}\``,
            String(row.type || '').toLowerCase() === String(botType || '').toLowerCase()
              ? '> *Le template a été réappliqué, même si le type était déjà le bon*'
              : '> *Le type du bot a aussi été mis à jour dans la base*',
            started
              ? '> *Le bot a été redémarré automatiquement*'
              : '> *Le bot a été démarré automatiquement*',
          ]
        ),
      ],
      allowedMentions: { parse: [] },
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
    });
  },
};
