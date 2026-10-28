const config = require('../../config.json');
const Discord = require('discord.js');
const buildPanel = require('../../Utils/buildPanel');
const { hasAdminAccess } = require('../../Utils/adminAccess');
const publicManage = require('../Public/manage.js');
const { stopInstance } = require('../../Utils/managerApi');

function getBotStorageId(row) {
  return row?.folder || row?.botId;
}

module.exports = {
  name: 'stop',
  description: 'Arrête un bot existant',
  permission: 'Aucune',
  dm: true,
  options: [
    {
      type: 'string',
      name: 'botid',
      description: 'L\'identifiant du bot à arrêter',
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

    const botStorageId = getBotStorageId(row);
    const botUser = await bot.users.fetch(botId).catch(() => ({ id: botId, username: botId }));
    const started = await publicManage.__private__.isRunning(botStorageId, botUser);

    if (!started) {
      return message.editReply({
        components: [
          buildPanel('# Déjà arrêté', [
            `> *Le bot ${botId} est déjà éteint*`,
          ]),
        ],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    try {
      await stopInstance(botStorageId);
    } catch (error) {
      return message.editReply({
        components: [buildPanel('# <:croix:1505270277796397146> Arrêt impossible', [`> *${error.message}*`])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    return message.editReply({
      components: [
        buildPanel('# Bot arrêté', [
          `> *Le bot ${botId} a été arrêté avec succès*`,
        ]),
      ],
      allowedMentions: { parse: [] },
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
    });
  },
};
