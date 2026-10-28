const config = require('../../config.json');
const Discord = require('discord.js');
const buildPanel = require('../../Utils/buildPanel');
const { sendAdminActionLog } = require('../../Utils/adminActionLog');
const { hasAdminAccess } = require('../../Utils/adminAccess');

module.exports = {
  name: 'delkey',
  description: 'Supprime une clé de la liste',
  permission: 'Aucune',
  dm: true,
  options: [
    {
      type: 'string',
      name: 'code',
      description: 'Le code de la clé à supprimer',
      required: true,
      autocomplete: false,
    },
  ],

  async run(bot, message, args) {
    if (!hasAdminAccess(message)) {
      return message.reply({
        components: [
          buildPanel(
            '# <:croix:1505270277796397146> Utilisateur non autorisé',
            ['> *Vous n’êtes pas autorisé à utiliser cette commande*']
          ),
        ],
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const code = args.getString('code')?.trim();

    if (!code) {
      return message.reply({
        components: [
          buildPanel(
            '# <:croix:1505270277796397146> Clé invalide',
            ['> *Veuillez fournir le code de la clé à supprimer*']
          ),
        ],
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    try {
      const key = bot.db.prepare('SELECT * FROM cle WHERE code = ? LIMIT 1').get(code);

      if (!key) {
        return message.reply({
          components: [
            buildPanel(
              '# <:croix:1505270277796397146> Clé introuvable',
              ['> *Aucune clé ne correspond à ce code*']
            ),
          ],
          flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
        });
      }

      const result = bot.db.prepare('DELETE FROM cle WHERE code = ?').run(code);
      const targetUser = key.targetUserId ? `<@${key.targetUserId}> (\`${key.targetUserId}\`)` : '`Aucun`';
      const used = String(key.use) === 'true' || String(key.use) === '1' ? 'oui' : 'non';

      await sendAdminActionLog(bot, 'keyDeleteLogs', '# Clé supprimée', [
        `> **Auteur:** <@${message.author.id}> (\`${message.author.id}\`)`,
        `> **Code:** ||${code}||`,
        `> **Type:** \`${key.type || 'inconnu'}\``,
        `> **Temps:** \`${key.day || 'inconnu'}\``,
        `> **Utilisateur:** ${targetUser}`,
        `> **Utilisée:** \`${used}\``,
        `> **Ligne(s) supprimée(s):** \`${result.changes}\``,
      ]);

      return message.reply({
        components: [
          buildPanel('# Clé supprimée', [
            '> *La clé a été supprimée avec succès*',
            `> *Code:* ||${code}||`,
            `> *Type:* \`${key.type || 'inconnu'}\``,
            `> *Temps:* \`${key.day || 'inconnu'}\``,
            `> *Utilisateur:* ${targetUser}`,
            `> *Utilisée:* \`${used}\``,
          ]),
        ],
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    } catch {
      return message.reply({
        components: [
          buildPanel(
            '# <:croix:1505270277796397146> Erreur',
            ['> *Impossible de supprimer cette clé*']
          ),
        ],
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }
  },
};
