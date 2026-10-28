const config = require('../../config.json');
const Discord = require('discord.js');
const buildPanel = require('../../Utils/buildPanel');
const { hasAdminAccess } = require('../../Utils/adminAccess');
const publicManage = require('../Public/manage.js');
const { startInstance } = require('../../Utils/managerApi');

function getBotStorageId(row) {
  return row?.folder || row?.botId;
}

module.exports = {
  name: 'start',
  description: 'Démarre un bot existant',
  permission: 'Aucune',
  dm: true,
  options: [
    {
      type: 'string',
      name: 'botid',
      description: 'L\'identifiant du bot à démarrer',
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

    const botId = args.getString('botid');
    const row = bot.db.prepare('SELECT * FROM bot WHERE botId = ?').get(botId);

    if (!row) {
      return message.editReply({
        components: [buildPanel('# <:croix:1505270277796397146> Bot non trouvé', [`> *Le bot ${botId} n'a pas été trouvé*`])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    if (row.expired === 'true') {
      return message.editReply({
        components: [buildPanel('# <:croix:1505270277796397146> Bot expiré', [`> *Le bot ${botId} a expiré et ne peut pas être démarré*`])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const botStorageId = getBotStorageId(row);
    const botUser = await bot.users.fetch(botId).catch(() => ({ id: botId, username: botId }));
    const started = await publicManage.__private__.isRunning(botStorageId, botUser);

    if (started) {
      return message.editReply({
        components: [
          buildPanel('# Déjà démarré', [
            `> *Le bot ${botId} est déjà en ligne*`,
          ]),
        ],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    try {
      await startInstance(botStorageId);
    } catch (error) {
      return message.editReply({
        components: [buildPanel('# <:croix:1505270277796397146> Démarrage impossible', [`> *${error.message}*`])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    return message.editReply({
      components: [
        buildPanel('# Bot démarré', [
          `> *Le bot ${botId} a été démarré avec succès*`,
        ]),
      ],
      allowedMentions: { parse: [] },
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
    });
  },
};
