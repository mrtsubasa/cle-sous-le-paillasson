const path = require('path');
const Discord = require('discord.js');
const config = require('../../config.json');
const { readJsonConfig } = require('../../Utils/tokenVault');
const { getInterestedUserIdsFromRow } = require('../../Utils/clientRoleManager');

const MAX_OPTIONS_PER_SELECT = 25;
const MAX_SELECTS_PER_MODAL = 5;

function getBotStorageId(row) {
  return row?.folder || row?.botId || null;
}

function readBotConfig(row) {
  const storageId = getBotStorageId(row);
  if (!storageId) return null;

  const configPath = path.join(__dirname, '../../BotRuntimes', storageId, 'config.json');
  const data = readJsonConfig(configPath, { migrateToken: true });
  if (!data) return null;
  return {
    path: configPath,
    data,
  };
}

function getBuyers(configFile) {
  const buyers = new Set();

  if (Array.isArray(configFile?.buyers)) {
    for (const buyerId of configFile.buyers) {
      if (buyerId) buyers.add(String(buyerId));
    }
  }

  if (Array.isArray(configFile?.buyer)) {
    for (const buyerId of configFile.buyer) {
      if (buyerId) buyers.add(String(buyerId));
    }
  }

  if (configFile?.ownerId) buyers.add(String(configFile.ownerId));
  if (configFile?.buyerId) buyers.add(String(configFile.buyerId));

  return [...buyers];
}

function resolveAccentColor(color) {
  if (typeof color === 'number') return color;
  if (Array.isArray(color) && color.length === 3) return color;
  if (typeof color === 'string') {
    const normalized = color.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
      return parseInt(normalized, 16);
    }
  }
  return null;
}

function buildNoticeContainer(title, description) {
  const container = new Discord.ContainerBuilder();
  const accentColor = resolveAccentColor(config.color);
  if (accentColor !== null) container.setAccentColor(accentColor);
  container.addTextDisplayComponents(
    new Discord.TextDisplayBuilder().setContent(`## ${title}\n${description}`)
  );
  return container;
}

function replyWithContainer(message, title, description) {
  return message.reply({
    components: [buildNoticeContainer(title, description)],
    flags: Discord.MessageFlags.Ephemeral | Discord.MessageFlags.IsComponentsV2,
  });
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function buildModal(botRows) {
  const chunks = chunkArray(botRows, MAX_OPTIONS_PER_SELECT).slice(0, MAX_SELECTS_PER_MODAL);
  const modal = new Discord.ModalBuilder()
    .setCustomId('changetoken_modal')
    .setTitle("Changement d'un token");

  modal.addTextDisplayComponents(
    new Discord.TextDisplayBuilder().setContent(
      '⚠️ Ce formulaire sera transmis à Manager Ne donne pas de mot de passe ni d’autre information sensible'
    )
  );

  const botLabels = chunks.map((chunk, index) => {
    const select = new Discord.StringSelectMenuBuilder()
      .setCustomId(`changetoken_bot_${index}`)
      .setPlaceholder(
        chunks.length === 1
          ? 'Sélectionner un bot'
          : `Sélectionner un bot (${index + 1}/${chunks.length})`
      )
      .setMinValues(1)
      .setMaxValues(1);

    select.addOptions(
      chunk.map((row) => ({
        label: row.username,
        value: row.botId,
        description: `Type: ${row.type || 'Inconnu'} | Owner: ${row.ownerLabel}`,
      }))
    );

    return new Discord.LabelBuilder()
      .setLabel(chunks.length === 1 ? 'Sélectionner un bot' : `Sélectionner un bot ${index + 1}`)
      .setDescription('Choisissez le bot dont vous souhaitez modifier le token')
      .setStringSelectMenuComponent(select);
  });

  const tokenLabel = new Discord.LabelBuilder()
    .setLabel('Nouveau token')
    .setDescription('Collez le nouveau token du bot')
    .setTextInputComponent(
      new Discord.TextInputBuilder()
        .setCustomId('changetoken_token')
        .setStyle(Discord.TextInputStyle.Short)
        .setPlaceholder('Collez le nouveau token ici')
        .setRequired(true)
    );

  modal.addLabelComponents(...botLabels, tokenLabel);
  return modal;
}

module.exports = {
  name: 'changetoken',
  description: "Permet de changer le token d'un bot",
  permission: 'Aucune',
  dm: true,

  async run(bot, message) {
    const rows = bot.db.prepare('SELECT * FROM bot').all();
    const userId = String(message.author.id);

    const accessibleBots = [];

    for (const row of rows) {
      if (!row?.botId) continue;

      const botConfig = readBotConfig(row);
      const interestedUserIds = getInterestedUserIdsFromRow(row, botConfig?.data);
      const buyers = getBuyers(botConfig?.data);
      const isOwner = String(row.ownerId) === userId || String(botConfig?.data?.ownerId || '') === userId;
      const isBuyer = buyers.includes(userId) || interestedUserIds.includes(userId);

      if (!isOwner && !isBuyer) continue;

      const cachedUser = bot.users.cache.get(row.botId);
      const username = cachedUser?.username || botConfig?.data?.username || botConfig?.data?.name || row.botId;

      accessibleBots.push({
        botId: row.botId,
        username,
        type: row.type || 'Inconnu',
        ownerLabel: isOwner ? 'Owner' : 'Buyer',
      });
    }

    if (accessibleBots.length < 1) {
      return replyWithContainer(
        message,
        '# <:croix:1505270277796397146> Aucun bot',
        "> *Vous n'avez **aucun** bot modifiable*"
      );
    }

    if (accessibleBots.length > MAX_OPTIONS_PER_SELECT * MAX_SELECTS_PER_MODAL) {
      return replyWithContainer(
        message,
        '# <:croix:1505270277796397146> Trop de bots',
        `> *Vous avez plus de ${MAX_OPTIONS_PER_SELECT * MAX_SELECTS_PER_MODAL} bots modifiables. La pagination actuelle peut afficher au maximum ${MAX_SELECTS_PER_MODAL} menus de ${MAX_OPTIONS_PER_SELECT} options.*`
      );
    }

    const modal = buildModal(accessibleBots);
    return message.showModal(modal);
  },
};
