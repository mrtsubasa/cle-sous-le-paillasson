const config = require('../../config.json');
const Discord = require('discord.js');
const fs = require('fs');
const path = require('path');
const buildPanel = require('../../Utils/buildPanel');
const { sendAdminActionLog } = require('../../Utils/adminActionLog');
const { hasAdminAccess } = require('../../Utils/adminAccess');
const parseDurationInput = require('../../Utils/parseDuration');
const { autocompleteBotType, getBotTypes } = require('../../Utils/botTypes');

function generateKey() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.';
  let key = '';

  for (let i = 0; i < 20; i += 1) {
    const index = Math.floor(Math.random() * characters.length);
    key += characters.charAt(index);
  }

  return key;
}

function buildAccessError(message) {
  return message.reply({
    components: [
      buildPanel(
        '# <:croix:1505270277796397146> Accès refusé',
        ['> *Cette commande est réservée aux membres du rôle manager ou aux owners.*']
      ),
    ],
    allowedMentions: { parse: [] },
    flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
  });
}

function formatHiddenKeys(keys) {
  return keys.map((key) => `||${key}||`).join('\n');
}

function formatLogKeys(keys) {
  return keys.map((key) => `> **Clé:** ||${key}||`).join('\n');
}

function makeDMContent(keys, type, duration, number) {
  return buildPanel('# Vos clés', [
    `> *Voici votre drop de \`${number}\` clé(s) pour le type \`${type}\`*`,
    `> *Durée: \`${duration}\`*`,
    `> *Clés:*`,
    formatHiddenKeys(keys),
  ]);
}

module.exports = {
  name: 'drop',
  description: 'Génère et envoie une ou plusieurs clés en MP à un utilisateur',
  permission: 'Aucune',
  dm: true,
  autocomplete: autocompleteBotType,
  options: [
    {
      type: 'user',
      name: 'utilisateur',
      description: 'L\'utilisateur à qui envoyer les clés',
      required: true,
      autocomplete: false,
    },
    {
      type: 'string',
      name: 'duree',
      description: 'La durée des clés',
      required: true,
      autocomplete: false,
    },
    {
      type: 'number',
      name: 'nombre',
      description: 'Le nombre de clés à générer',
      required: true,
      autocomplete: false,
    },
    {
      type: 'string',
      name: 'type',
      description: 'Le type de bot pour ces clés',
      required: false,
      autocomplete: true,
    },
  ],

  async run(bot, message, args) {
    if (!hasAdminAccess(message)) {
      return buildAccessError(message);
    }

    const targetUser = args.getUser('utilisateur');
    const typeInput = args.getString('type');
    const durationInput = args.getString('duree');
    const durationMs = parseDurationInput(durationInput);
    let number = args.getNumber('nombre');

    if (!targetUser) {
      return message.reply({
        components: [buildPanel('# <:croix:1505270277796397146> Utilisateur invalide', ['> *Veuillez fournir un utilisateur valide*'])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    if (durationMs === false) {
      return message.reply({
        components: [buildPanel('# <:croix:1505270277796397146> Durée invalide', ['> *Veuillez fournir une durée valide*'])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    if (!Number.isFinite(number) || number < 1) number = 1;
    number = Math.floor(number);

    const types = getBotTypes();
    const type = typeInput || types[0];

    if (!type) {
      return message.reply({
        components: [buildPanel('# <:croix:1505270277796397146> Aucun type disponible', ['> *Aucun dossier n\'a été trouvé dans `BotsFolders`*'])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const selectKey = bot.db.prepare('SELECT 1 FROM cle WHERE code = ? LIMIT 1');
    const insertKey = bot.db.prepare('INSERT INTO cle (code, type, day, targetUserId) VALUES (?, ?, ?, ?)');
    const keys = [];
    const maxAttempts = Math.max(50, number * 10);
    let attempts = 0;

    while (keys.length < number && attempts < maxAttempts) {
      attempts += 1;
      const key = generateKey();
      if (selectKey.get(key)) continue;
      keys.push(key);
      insertKey.run(key, type, durationInput, targetUser.id);
    }

    if (keys.length < number) {
      return message.reply({
        components: [buildPanel('# <:croix:1505270277796397146> Génération impossible', ['> *Impossible de générer assez de clés uniques pour le moment*'])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const dmContent = makeDMContent(keys, type, durationInput, number);
    let dmSent = true;

    try {
      await targetUser.send({
        components: [dmContent],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2,
      });
    } catch {
      dmSent = false;
    }

    await sendAdminActionLog(bot, 'keyDropLogs', '# Drop de clés', [
      `> **Auteur:** <@${message.author.id}> (\`${message.author.id}\`)`,
      `> **Cible:** <@${targetUser.id}> (\`${targetUser.id}\`)`,
      `> **Type:** \`${type}\``,
      `> **Durée:** \`${durationInput}\``,
      `> **Nombre:** \`${number}\``,
      `> **Envoi MP:** ${dmSent ? 'oui' : 'non'}`,
      formatLogKeys(keys),
    ]);

    return message.reply({
      components: [
        buildPanel('# Drop effectué', [
          `> *${number} clé(s) ont été générées pour <@${targetUser.id}> (\`${targetUser.id}\`)*`,
          `> *Type utilisé: \`${type}\`*`,
          `> *Durée: \`${durationInput}\`*`,
          dmSent
            ? '> *Les clés ont été envoyées en MP*'
            : '> *Impossible d\'envoyer le MP. Les clés ont quand même été enregistrées*',
        ]),
      ],
      allowedMentions: { parse: [] },
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
    });
  },
};
