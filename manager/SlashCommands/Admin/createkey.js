const config = require('../../config.json');
const Discord = require('discord.js');
const buildPanel = require('../../Utils/buildPanel');
const { sendAdminActionLog } = require('../../Utils/adminActionLog');
const parseDurationInput = require('../../Utils/parseDuration');
const { hasAdminAccess } = require('../../Utils/adminAccess');
const { autocompleteBotType } = require('../../Utils/botTypes');

function validerDuree(duree) {
  return parseDurationInput(duree);
}

function formatHiddenKeys(keys) {
  return keys.map((key) => `||${key}||`).join('\n');
}

function formatLogKeys(keys) {
  return keys.map((key) => `> **Clé:** ||${key}||`).join('\n');
}

  module.exports = {
    name: 'createkey',
    description: 'Permets de créer une/des clé',
    permission: 'Aucune',
    dm: true,
    autocomplete: autocompleteBotType,
    options: [
      {
        type: 'string',
        name: 'type',
        description: 'Le type de bot que vous souhaitez avoir une/des clé',
        required: true,
        autocomplete: true,
      },
      {
        type: 'string',
        name: 'time',
        description: 'Le temps de l\'offre',
        required: true,
        autocomplete: false,
      },
      {
        type: 'user',
        name: 'user',
        description: 'L\'utilisateur à qui attribuer la clé',
        required: false,
        autocomplete: false,
      },
      {
        type: 'number',
        name: 'nb_key',
        description: 'Le nombre de clés à générer',
        required: false,
        autocomplete: false,
      },
    ],
  
    async run(bot, message, args) {
        await message.deferReply({ flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral }).catch(() => {});

        if(!hasAdminAccess(message)) {
            const embed = buildPanel(
                '# <:croix:1505270277796397146> Utilisateur non autorisé',
                ['> *Vous n’êtes pas autorisé à utiliser cette commande*']
            );
            return message.editReply({ components: [embed], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
        }
        const time = await validerDuree(args.getString('time'));
        let number = args.getNumber('nb_key');
        if(!number) number = 1;

        if (time !== false) {
            const targetUser = args.getUser('user');
            const targetUserId = targetUser?.id || null;
            const keys = genererCle(number)
            const embed = buildPanel('# Clés générées', [
                `> *Les clés suivantes ont été générer avec succès:*\n${formatHiddenKeys(keys)}`,
                `**Informations:**`,
                `> *Type de bot:* \`${args.getString('type')}\``,
                `> *Temps:* \`${args.getString('time')}\``,
                `> *Nombre de clés:* \`${args.getNumber('nb_key') || '1'}\``,
                `> *Utilisateur cible:* ${targetUserId ? `<@${targetUserId}> (\`${targetUserId}\`)` : '`Aucun`'}`
            ]);
            const selectKey = bot.db.prepare('SELECT 1 FROM cle WHERE code = ? LIMIT 1');
            const insertKey = bot.db.prepare('INSERT INTO cle (code, type, day, targetUserId) VALUES (?, ?, ?, ?)');

            for (const key of keys) {
                const exists = selectKey.get(key);
                if (exists) {
                    const duplicateEmbed = buildPanel(
                        '# <:croix:1505270277796397146> Clé déjà enregistrée',
                        ['> *La clé suivante est déjà enregistrée dans la base de données*']
                    );
                    return message.editReply({ components: [duplicateEmbed], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
                }

                insertKey.run(key, args.getString('type'), args.getString('time'), targetUserId);
            }

            await message.editReply({ components: [embed], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });

            await sendAdminActionLog(bot, 'keyCreateLogs', '# Clé(s) générée(s)', [
                `> **Auteur:** <@${message.author.id}> (\`${message.author.id}\`)`,
                `> **Type:** \`${args.getString('type')}\``,
                `> **Durée:** \`${args.getString('time')}\``,
                `> **Nombre:** \`${number}\``,
                `> **Utilisateur cible:** ${targetUserId ? `<@${targetUserId}> (\`${targetUserId}\`)` : '`Aucun`'}`,
                formatLogKeys(keys),
            ]);
        } else {
            const embed = buildPanel(
                '# <:croix:1505270277796397146> Temps invalide',
                ['> *Veuillez fournir un temps valide*']
            );
            return message.editReply({ components: [embed], flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
        }
    }
}

function genererCle(nb) {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.';
    const clesGenerees = [];
    for (let j = 0; j < nb; j++) {
        let cle = '';
        for (let i = 0; i < 20; i++) {
            const indiceAleatoire = Math.floor(Math.random() * caracteres.length);
            cle += caracteres.charAt(indiceAleatoire);
        }
        clesGenerees.push(`${cle}`);
    }
    return clesGenerees;
}
