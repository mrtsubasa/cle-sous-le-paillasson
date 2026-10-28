const config = require('../../config.json');
const fs = require('fs');
const path = require('path');
const Discord = require('discord.js');
const buildPanel = require('../../Utils/buildPanel');
const { hasAdminAccess } = require('../../Utils/adminAccess');
const { fetchUser } = require('../../Utils/discordLookup');

const PAGE_SIZE = 10;

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

function getBotConfigPath(botFolder) {
  return path.join(__dirname, '../../BotRuntimes', botFolder, 'config.json');
}

function readBotConfig(botFolder) {
  const configPath = getBotConfigPath(botFolder);
  if (!fs.existsSync(configPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
}

function getBuyerIds(botConfig) {
  const buyers = new Set();

  if (Array.isArray(botConfig?.buyers)) {
    for (const buyerId of botConfig.buyers) {
      if (buyerId) buyers.add(String(buyerId));
    }
  }

  if (Array.isArray(botConfig?.buyer)) {
    for (const buyerId of botConfig.buyer) {
      if (buyerId) buyers.add(String(buyerId));
    }
  }

  return [...buyers];
}

async function collectBuyerStats(bot) {
  const usersBotsDir = path.join(__dirname, '../../BotRuntimes');
  if (!fs.existsSync(usersBotsDir)) return [];

  const buyerMap = new Map();
  const botFolders = fs
    .readdirSync(usersBotsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const folder of botFolders) {
    const botConfig = readBotConfig(folder);
    if (!botConfig) continue;

    const botId = botConfig.botId || folder.split('_')[0] || folder;
    const buyerIds = getBuyerIds(botConfig);

    for (const buyerId of buyerIds) {
      if (!buyerMap.has(buyerId)) {
        buyerMap.set(buyerId, { buyerId, botIds: new Set() });
      }

      buyerMap.get(buyerId).botIds.add(String(botId));
    }
  }

  const stats = [];

  for (const [buyerId, entry] of buyerMap.entries()) {
    const user = await fetchUser(bot, buyerId);
    stats.push({
      buyerId,
      tag: user?.tag || user?.username || buyerId,
      mention: user ? `<@${buyerId}>` : null,
      botCount: entry.botIds.size,
    });
  }

  stats.sort((a, b) => b.botCount - a.botCount || a.tag.localeCompare(b.tag));
  return stats;
}

function buildBuyerPage(buyers, page, totalPages) {
  const pageIndex = Math.min(Math.max(page, 1), totalPages);
  const start = (pageIndex - 1) * PAGE_SIZE;
  const pageBuyers = buyers.slice(start, start + PAGE_SIZE);

  const container = buildPanel(
    `# Liste des acheteurs - page ${pageIndex}/${totalPages}`,
    [`> *${buyers.length} acheteur unique trouvé dans les bots enregistrés*`]
  );

  const lines = pageBuyers.map((buyer, index) => {
    const label = buyer.mention ? `${buyer.mention} (\`${buyer.buyerId}\`)` : `\`${buyer.buyerId}\``;
    return `\`${index + 1 + start}.\` **${buyer.tag}**\n┖ ${label} | ${buyer.botCount} bot`;
  });

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
          .setCustomId('buyer_list_prev')
          .setLabel('⬅')
          .setStyle(Discord.ButtonStyle.Secondary)
          .setDisabled(pageIndex <= 1),
        new Discord.ButtonBuilder()
          .setCustomId('buyer_list_next')
          .setLabel('➡')
          .setStyle(Discord.ButtonStyle.Secondary)
          .setDisabled(pageIndex >= totalPages)
      )
    );
  }

  return container;
}

async function sendReplyWithMessage(message, payload) {
  const response = await message.reply({ ...payload, withResponse: true });
  return response?.resource?.message ?? message.fetchReply().catch(() => null);
}

module.exports = {
  name: 'buyer-list',
  description: 'Affiche la liste des acheteurs de bots',
  permission: 'Aucune',
  dm: false,

  async run(bot, message) {
    if (!hasAdminAccess(message)) {
      return buildAccessError(message);
    }

    const buyers = await collectBuyerStats(bot);

    if (buyers.length < 1) {
      return message.reply({
        components: [
          buildPanel('# <:croix:1505270277796397146> Aucun acheteur', ['> *Aucun acheteur n\'a été trouvé dans les bots enregistrés*']),
        ],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const totalPages = Math.max(1, Math.ceil(buyers.length / PAGE_SIZE));
    let page = 1;

    const render = async () => ({
      components: [buildBuyerPage(buyers, page, totalPages)],
    });

    const initial = await render();
    const msg = await sendReplyWithMessage(message, {
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
        (interaction.customId === 'buyer_list_prev' || interaction.customId === 'buyer_list_next'),
      time: 10 * 60 * 1000,
    });

    collector.on('collect', async (interaction) => {
      if (interaction.customId === 'buyer_list_prev') {
        page = Math.max(1, page - 1);
      } else if (interaction.customId === 'buyer_list_next') {
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
