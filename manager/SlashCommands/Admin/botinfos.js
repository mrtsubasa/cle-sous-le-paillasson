const config = require('../../config.json');
const fs = require('fs');
const path = require('path');
const Discord = require('discord.js');
const buildPanel = require('../../Utils/buildPanel');
const { hasAdminAccess } = require('../../Utils/adminAccess');
const publicManage = require('../Public/manage.js');
const { fetchUser, getFallbackUser } = require('../../Utils/discordLookup');

function getBotStorageId(row) {
  return row?.folder || row?.botId;
}

function readBotConfig(row) {
  const configPath = path.join(__dirname, '../../BotRuntimes', getBotStorageId(row), 'config.json');
  if (!fs.existsSync(configPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
}

function getBuyerLabel(row) {
  const botConfig = readBotConfig(row);
  const buyers = Array.isArray(botConfig?.buyers) ? botConfig.buyers.filter(Boolean) : [];
  const singleBuyer = Array.isArray(botConfig?.buyer) ? botConfig.buyer.filter(Boolean) : [];
  const buyerId = buyers[0] || singleBuyer[0] || row.buyer || row.buyerId || null;

  if (!buyerId) return '`Aucun`';
  return `<@${buyerId}> (\`${buyerId}\`)`;
}

function formatStatus(row, started) {
  if (row.expired === 'true') return '⏰ expiré';
  return started ? '🟢 en ligne' : '🔴 éteint';
}

function formatExpire(row) {
  return row.expired === 'true'
    ? 'expiré'
    : `<t:${Number(row.time) || Math.floor(Date.now() / 1000)}:R>`;
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

function buildInfoLines(row, botUser, started, tokenValid) {
  const ownerLabel = row.ownerId ? `<@${row.ownerId}> (\`${row.ownerId}\`)` : '`Inconnu`';
  const buyerLabel = getBuyerLabel(row);
  const storageId = getBotStorageId(row);
  const displayName = botUser?.tag || botUser?.username || row.botId;

  return [
    `> **Nom:** **${displayName}**`,
    `> **Identifiant:** \`${row.botId}\``,
    `> **Type:** \`${row.type || 'inconnu'}\``,
    `> **Statut:** ${formatStatus(row, started)}`,
    `> **Expire:** ${formatExpire(row)}`,
    `> **Owner:** ${ownerLabel}`,
    `> **Buyer:** ${buyerLabel}`,
    `> **Dossier:** \`${storageId}\``,
    `> **Token:** ${tokenValid ? '<:vc:1505279574014169171> valide' : '<:croix:1505270277796397146> invalide'}`,
  ];
}

module.exports = {
  name: 'botinfos',
  description: 'Affiche les informations d\'un bot',
  permission: 'Aucune',
  dm: false,
  options: [
    {
      type: 'string',
      name: 'identifiant',
      description: 'L\'identifiant du bot à consulter',
      required: true,
      autocomplete: false,
    },
  ],

  async run(bot, message, args) {
    if (!hasAdminAccess(message)) {
      return buildAccessError(message);
    }

    const botId = args.getString('identifiant');
    const row = bot.db.prepare('SELECT * FROM bot WHERE botId = ?').get(botId);

    await message.deferReply({ flags: Discord.MessageFlags.Ephemeral }).catch(() => {});

    if (!row) {
      return message.editReply({
        components: [
          buildPanel('# <:croix:1505270277796397146> Bot non trouvé', [`> *Le bot ${botId} n'a pas été trouvé*`]),
        ],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2,
      });
    }

    const botUser = await fetchUser(bot, botId);
    const started = await publicManage.__private__.isRunning(getBotStorageId(row), botUser || getFallbackUser(row.botId));
    const tokenValid = await publicManage.__private__.isTokenValid(row.token);
    const container = buildPanel('# Bot infos', buildInfoLines(row, botUser, started, tokenValid));

    const avatarUrl = botUser?.displayAvatarURL?.({ size: 256 }) || botUser?.avatarURL?.({ size: 256 }) || null;
    if (avatarUrl) {
      container.addMediaGalleryComponents(
        new Discord.MediaGalleryBuilder().addItems(
          new Discord.MediaGalleryItemBuilder().setURL(avatarUrl)
        )
      );
    }

    if (!tokenValid) {
      container.addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          '⚠️ **Token invalide détecté !** Veuillez changer le token de votre bot'
        )
      );
    }

    return message.editReply({
      components: [container],
      allowedMentions: { parse: [] },
      flags: Discord.MessageFlags.IsComponentsV2,
    });
  },
};
