const config = require('../../config.json');
const Discord = require('discord.js');
const path = require('path');
const buildPanel = require('../../Utils/buildPanel');
const { hasAdminAccess } = require('../../Utils/adminAccess');
const botsService = require('../../Handlers/botsService');
const { readJsonConfig } = require('../../Utils/tokenVault');

const PAGE_SIZE = 10;

function getBotStorageId(row) {
  return row?.folder || row?.botId;
}

function readBotConfig(row) {
  const storageId = getBotStorageId(row);
  if (!storageId) return null;

  const configPath = path.join(__dirname, '../../BotRuntimes', storageId, 'config.json');
  return readJsonConfig(configPath, { migrateToken: false });
}

function getBuyerInfo(row) {
  const runtimeConfig = readBotConfig(row);
  const buyers = [
    ...(Array.isArray(runtimeConfig?.buyers) ? runtimeConfig.buyers : []),
    ...(Array.isArray(runtimeConfig?.buyer) ? runtimeConfig.buyer : []),
  ]
    .filter(Boolean)
    .map(String);

  const buyerId = runtimeConfig?.ownerId || row?.ownerId || runtimeConfig?.buyerId || buyers[0] || null;
  return {
    buyerId,
    buyers: [...new Set(buyers)],
  };
}

async function buildAccessError(message) {
  const payload = {
    components: [
      buildPanel(
        '# <:croix:1505270277796397146> Accès refusé',
        ['> *Cette commande est réservée aux membres du rôle manager ou aux owners.*']
      ),
    ],
    allowedMentions: { parse: [] },
    flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
  };

  if (message.deferred || message.replied) {
    return message.editReply(payload);
  }

  const response = await message.reply({ ...payload, withResponse: true });
  return response?.resource?.message ?? message.fetchReply().catch(() => null);
}

function formatExpire(row) {
  return row.expired === 'true'
    ? 'expiré'
    : `<t:${Number(row.time) || Math.floor(Date.now() / 1000)}:R>`;
}

function formatOwner(row) {
  const buyerInfo = getBuyerInfo(row);
  if (!buyerInfo.buyerId) return '`Inconnu`';

  const base = `<@${buyerInfo.buyerId}> (\`${buyerInfo.buyerId}\`)`;
  if (buyerInfo.buyers.length > 1) {
    const linked = buyerInfo.buyers
      .filter((id) => String(id) !== String(buyerInfo.buyerId))
      .map((id) => `<@${id}>`)
      .join(', ');

    return `${base}${linked ? ` | liés: ${linked}` : ''}`;
  }

  return base;
}

function getBotName(botUser, row) {
  if (botUser?.tag) return botUser.tag;
  if (botUser?.username) return botUser.username;
  return row.botId;
}

function getStatus(record) {
  if (record.expired) return '⏰ expiré';
  if (record.tokenValid === false) return '<:croix:1505270277796397146> token invalide';
  return record.started ? '🟢 en ligne' : '🔴 éteint';
}

async function buildListPage(bot, rows, page, totalPages, totalRows) {
  const pageIndex = Math.min(Math.max(page, 1), totalPages);
  const start = (pageIndex - 1) * PAGE_SIZE;

  const container = buildPanel(
    `# Liste des bots enregistrés - page ${pageIndex}/${totalPages}`,
    [`> *${totalRows} bot${totalRows > 1 ? 's' : ''} enregistré${totalRows > 1 ? 's' : ''} dans la base de données*`]
  );

  const lines = await Promise.all(
    rows.map(async (row, index) => {
      const record = await botsService.buildBotRecord(bot, row, {
        liveStatus: true,
        resolveUser: true,
        resolveTokenValidity: true,
        includeAvatar: false,
      });
      const botName = getBotName({ tag: record.name, username: record.name }, row);
      return [
        `\`${index + 1 + start}.\` **${botName}** (\`${row.type || 'inconnu'}\`)`,
        `┖ ${getStatus(record)} | Buyer: ${formatOwner(row)} | Expire: ${formatExpire(row)}`,
      ].join('\n');
    })
  );

  if (lines.length > 0) {
    container.addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(lines.join('\n\n'))
    );
  }

  if (totalPages > 1) {
    container.addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
    );
    container.addActionRowComponents(
      new Discord.ActionRowBuilder().addComponents(
        new Discord.ButtonBuilder()
          .setCustomId('bot_list_prev')
          .setLabel('⬅')
          .setStyle(Discord.ButtonStyle.Secondary)
          .setDisabled(pageIndex <= 1),
        new Discord.ButtonBuilder()
          .setCustomId('bot_list_next')
          .setLabel('➡')
          .setStyle(Discord.ButtonStyle.Secondary)
          .setDisabled(pageIndex >= totalPages)
      )
    );
  }

  return container;
}

async function sendInitialResponse(message, payload) {
  if (message.deferred || message.replied) {
    return message.editReply(payload);
  }

  const response = await message.reply({ ...payload, withResponse: true });
  return response?.resource?.message ?? message.fetchReply().catch(() => null);
}

module.exports = {
  name: 'bot-list',
  description: 'Affiche la liste des bots enregistrés',
  permission: 'Aucune',
  dm: false,

  async run(bot, message) {
    if (!hasAdminAccess(message)) {
      return buildAccessError(message);
    }

    const totalRows = bot.db.prepare('SELECT COUNT(*) AS count FROM bot').get()?.count || 0;

    if (totalRows < 1) {
      return sendInitialResponse(message, {
        components: [
          buildPanel('# <:croix:1505270277796397146> Aucun bot', ['> *Aucun bot n\'a été enregistré dans la base de données*']),
        ],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
    let page = 1;

    const render = async () => ({
      components: [await buildListPage(bot, botsService.getBotRows(bot, {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }), page, totalPages, totalRows)],
    });

    const initial = await render();
    const msg = await sendInitialResponse(message, {
      components: initial.components,
      allowedMentions: { parse: [] },
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
    });

    if (totalPages <= 1 || !msg?.createMessageComponentCollector) {
      return msg;
    }

    const collector = msg.createMessageComponentCollector({
      filter: (interaction) =>
        interaction.user.id === message.author.id &&
        (interaction.customId === 'bot_list_prev' || interaction.customId === 'bot_list_next'),
      time: 10 * 60 * 1000,
    });

    collector.on('collect', async (interaction) => {
      if (interaction.customId === 'bot_list_prev') {
        page = Math.max(1, page - 1);
      } else if (interaction.customId === 'bot_list_next') {
        page = Math.min(totalPages, page + 1);
      }

      const view = await render();
      return interaction.update({
        components: view.components,
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2,
      }).catch(() => {});
    });
  },
};
