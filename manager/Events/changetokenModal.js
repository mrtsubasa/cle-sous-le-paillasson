const fs = require('fs');
const path = require('path');
const Discord = require('discord.js');
const config = require('../config.json');
const botsService = require('../Handlers/botsService');
const { encryptToken, readJsonConfig, writeJsonConfig } = require('../Utils/tokenVault');
const { sendAdminActionLog } = require('../Utils/adminActionLog');
const { syncMusicEnvFromConfig } = require('../Utils/musicEnv');
const { getInterestedUserIdsFromRow, syncClientRoleForUsers } = require('../Utils/clientRoleManager');
const launchChildProcess = require('../Utils/lauchChildProcess');
const { invalidateTokenValidityCache } = require('../Utils/discordLookup');
const { getRuntimeConfigPath } = require('../Utils/templateRuntime');
const manageView = require('../SlashCommands/Public/manage.js');

const MAX_SELECTS_PER_MODAL = 5;

function getBotStorageId(row, botId) {
  return row?.folder || botId;
}

function readBotConfig(storageId) {
  const configPath = getRuntimeConfigPath(storageId);
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

function parseUserId(value) {
  const match = String(value || '').trim().match(/^<@!?(\d{17,20})>$|^(\d{17,20})$/);
  return match ? (match[1] || match[2]) : null;
}

function isDraftBotId(botId) {
  return !/^\d{17,20}$/.test(String(botId || ''));
}

function getFallbackUser(botId) {
  return {
    id: botId,
    username: botId,
    displayAvatarURL: () => null,
  };
}

function getUniqueFolderName(parentDir, baseName) {
  let candidate = baseName;
  let index = 1;

  while (fs.existsSync(path.join(parentDir, candidate))) {
    candidate = `${baseName}_${index}`;
    index += 1;
  }

  return candidate;
}

function getFinalStorageId(botId, botType) {
  const safeType = String(botType || 'bot').trim() || 'bot';
  return `${botId}_${safeType}`;
}

function renameRuntimeFolderIfNeeded(currentStorageId, finalBotId, botType) {
  const runtimesDir = path.join(__dirname, '..', 'BotRuntimes');
  const wantedStorageId = getFinalStorageId(finalBotId, botType);

  if (String(currentStorageId) === wantedStorageId) {
    return currentStorageId;
  }

  const currentDir = path.join(runtimesDir, currentStorageId);
  if (!fs.existsSync(currentDir)) {
    return currentStorageId;
  }

  const nextStorageId = getUniqueFolderName(runtimesDir, wantedStorageId);
  const nextDir = path.join(runtimesDir, nextStorageId);
  fs.renameSync(currentDir, nextDir);
  return nextStorageId;
}

function getSelectedBotId(interaction) {
  for (let index = 0; index < MAX_SELECTS_PER_MODAL; index += 1) {
    const customId = `changetoken_bot_${index}`;
    try {
      const values = interaction.fields.getStringSelectValues(customId);
      if (Array.isArray(values) && values[0]) {
        return values[0];
      }
    } catch {}
  }

  try {
    const values = interaction.fields.getStringSelectValues('changetoken_bot');
    if (Array.isArray(values) && values[0]) {
      return values[0];
    }
  } catch {}

  return null;
}

function isManagerOwner(userId) {
  return Array.isArray(config.owners) && config.owners.includes(String(userId));
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

function replyWithContainer(interaction, title, description) {
  return interaction.editReply({
    components: [buildNoticeContainer(title, description)],
    flags: Discord.MessageFlags.IsComponentsV2,
  });
}

async function refreshManageMessage(bot, interaction, sourceMessageId, botId) {
  if (!sourceMessageId || !interaction.channel) return;
  if (!manageView?.__private__?.buildDetailPage || !manageView?.__private__?.getBotRow) return;

  const sourceMessage = await interaction.channel.messages.fetch(sourceMessageId).catch(() => null);
  if (!sourceMessage?.edit) return;

  const refreshedRow = manageView.__private__.getBotRow(bot, botId);
  if (!refreshedRow) return;

  const record = await botsService.buildBotRecord(bot, refreshedRow, {
    liveStatus: true,
    resolveUser: true,
    resolveTokenValidity: true,
    includeAvatar: false,
  });
  const refreshedDetail = await manageView.__private__.buildDetailPage(bot, record);
  await sourceMessage.edit({ components: [refreshedDetail], allowedMentions: { parse: [] } }).catch(() => {});
}

module.exports = {
  name: 'interactionCreate',

  async execute(interaction, bot) {
    if (!interaction.isModalSubmit()) return;
    if (
      interaction.customId !== 'changetoken_modal' &&
      !interaction.customId.startsWith('manage_token_modal:') &&
      !interaction.customId.startsWith('manage_buyer_modal:')
    ) return;

    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

    const manageTokenMode = interaction.customId.startsWith('manage_token_modal:');
    const manageBuyerMode = interaction.customId.startsWith('manage_buyer_modal:');
    const customIdParts = interaction.customId.split(':');
    const botId = manageTokenMode
      ? customIdParts[1]
      : manageBuyerMode
        ? customIdParts[1]
        : getSelectedBotId(interaction);
    const sourceMessageId = (manageTokenMode || manageBuyerMode) ? customIdParts.slice(2).join(':') || null : null;
    const newToken = manageTokenMode
      ? interaction.fields.getTextInputValue('new_token')?.trim()
      : !manageBuyerMode
        ? interaction.fields.getTextInputValue('changetoken_token')?.trim()
        : null;
    const newBuyerRaw = manageBuyerMode ? interaction.fields.getTextInputValue('new_buyer')?.trim() : null;

    if (!botId || (!manageBuyerMode && !newToken) || (manageBuyerMode && !newBuyerRaw)) {
      return replyWithContainer(
        interaction,
        '# <:croix:1505270277796397146> Données manquantes',
        manageBuyerMode
          ? '> *Le bot ou le nouvel utilisateur est manquant dans le formulaire*'
          : '> *Le bot ou le token est manquant dans le formulaire*'
      );
    }

    const rows = bot.db.prepare('SELECT * FROM bot WHERE botId = ?').all(botId);
    if (!rows || rows.length < 1) {
      return replyWithContainer(
        interaction,
        '# <:croix:1505270277796397146> Bot introuvable',
        '> *Le bot sélectionné n’existe pas dans la base de données*'
      );
    }

    const row = rows[0];
    let storageId = getBotStorageId(row, botId);
    let botConfig = readBotConfig(storageId);

    if (!botConfig) {
      return replyWithContainer(
        interaction,
        '# <:croix:1505270277796397146> Configuration introuvable',
        '> *Le fichier de configuration du bot est introuvable ou illisible*'
      );
    }

    const userId = String(interaction.user.id);
    const buyers = getBuyers(botConfig.data);
    const interestedUserIds = getInterestedUserIdsFromRow(row, botConfig.data);
    const isOwner = String(row.ownerId) === userId || String(botConfig.data?.ownerId || '') === userId;
    const isBuyer = buyers.includes(userId) || interestedUserIds.includes(userId);
    const isManager = isManagerOwner(interaction.user.id);

    if (!isManager && !isOwner && !isBuyer) {
      return replyWithContainer(
        interaction,
        '# <:croix:1505270277796397146> Utilisateur non autorisé',
        '> *Vous n’êtes ni le propriétaire, ni un buyer de ce bot, ni owner du manager*'
      );
    }

    if (manageBuyerMode) {
      const newBuyerId = parseUserId(newBuyerRaw);
      if (!newBuyerId) {
        return replyWithContainer(
          interaction,
          '# <:croix:1505270277796397146> Utilisateur invalide',
          '> *Entre un @mention ou un ID Discord valide*'
        );
      }

      const targetGuildId = config.guildId || interaction.guildId || null;
      const targetGuild = targetGuildId ? bot.guilds.cache.get(targetGuildId) || await bot.guilds.fetch(targetGuildId).catch(() => null) : null;
      const newBuyerMember = targetGuild ? await targetGuild.members.fetch(newBuyerId).catch(() => null) : null;

      if (!newBuyerMember) {
        return replyWithContainer(
          interaction,
          '# <:croix:1505270277796397146> Utilisateur introuvable',
          '> *L’utilisateur sélectionné doit être présent sur le serveur du manager*'
        );
      }

      const previousOwnerId = row.ownerId || null;
      const previousBuyers = [...buyers];

      if (String(previousOwnerId) === String(newBuyerId)) {
        return replyWithContainer(
          interaction,
          '# <:croix:1505270277796397146> Buyer déjà défini',
          `> *<@${newBuyerId}> (\`${newBuyerId}\`) est déjà buyer de ce bot*`
        );
      }

      const updatedConfig = { ...botConfig.data };
      updatedConfig.ownerId = newBuyerId;
      updatedConfig.buyers = [newBuyerId];
      updatedConfig.buyer = [newBuyerId];
      updatedConfig.botId = botConfig.data.botId || botId;
      updatedConfig.folder = storageId;
      updatedConfig.type = row.type;

      botsService.syncBotOwnershipFromConfig(bot, storageId, updatedConfig, {
        row,
        updateDatabase: true,
      });
      invalidateTokenValidityCache(botConfig.data.token);
      syncMusicEnvFromConfig(storageId, row.type, {
        ownerId: newBuyerId,
        token: botConfig.data.token || '',
        clientId: botConfig.data.clientId || botConfig.data.botId || botId,
        botId: botConfig.data.botId || botId,
      });

      await syncClientRoleForUsers(bot, [previousOwnerId, ...previousBuyers, newBuyerId]).catch((error) => {
        console.log(`[CHANGETOKEN] Sync role client échouée pour ${botId}: ${error.message}`);
      });

      const botUser = bot.users.cache.get(botId) || getFallbackUser(botId);
      const started = await launchChildProcess(`./BotRuntimes/${storageId}/index.js`, 'checkstart', botUser, bot);
      if (started) {
        await launchChildProcess(`./BotRuntimes/${storageId}/index.js`, 'restart', botUser, bot);
      }

      await sendAdminActionLog(bot, 'buyerChangeLogs', '# Buyer modifié', [
        `> **Bot:** <@${botId}> (\`${botId}\`)`,
        `> **Type:** \`${row.type || 'inconnu'}\``,
        `> **Dossier:** \`${storageId}\``,
        `> **Avant:** ${previousOwnerId ? `<@${previousOwnerId}> (\`${previousOwnerId}\`)` : '`Inconnu`'}`,
        `> **Après:** <@${newBuyerId}> (\`${newBuyerId}\`)`,
        `> **Modifié par:** <@${interaction.user.id}> (\`${interaction.user.id}\`)`,
      ]);

      await refreshManageMessage(bot, interaction, sourceMessageId, botId);

      return replyWithContainer(
        interaction,
        '# Buyer modifié',
        `> *Le buyer du bot <@${botId}> (\`${botId}\`) a été remplacé par <@${newBuyerId}> (\`${newBuyerId}\`) et le bot a été relancé*`
      );
    }

    const tempClient = new Discord.Client({ intents: [Discord.GatewayIntentBits.Guilds] });
    let newBotId;

    try {
      await tempClient.login(newToken);
      newBotId = tempClient.user?.id;
    } catch {
      tempClient.destroy();
      return replyWithContainer(
        interaction,
        '# <:croix:1505270277796397146> Token invalide',
        '> *Le token fourni est invalide. Aucune modification n’a été faite*'
      );
    }

    tempClient.destroy();

    if (!newBotId) {
      return replyWithContainer(
        interaction,
        '# <:croix:1505270277796397146> Token invalide',
        '> *Le token fourni est invalide. Aucune modification n’a été faite*'
      );
    }

    if (!isDraftBotId(botId) && newBotId !== botId) {
      return replyWithContainer(
        interaction,
        '# <:croix:1505270277796397146> Mauvais bot',
        `> *Le token fourni correspond à \`${newBotId || 'inconnu'}\`, pas au bot sélectionné \`${botId}\`*`
      );
    }

    const finalBotId = isDraftBotId(botId) ? newBotId : botId;
    if (isDraftBotId(botId)) {
      storageId = renameRuntimeFolderIfNeeded(storageId, finalBotId, row.type);
      botConfig = readBotConfig(storageId);

      if (!botConfig) {
        return replyWithContainer(
          interaction,
          '# <:croix:1505270277796397146> Configuration introuvable',
          '> *Le fichier de configuration du bot est introuvable ou illisible après renommage du dossier*'
        );
      }
    }

    const updatedConfig = { ...botConfig.data };
    updatedConfig.token = newToken;
    updatedConfig.botId = finalBotId;
    updatedConfig.clientId = finalBotId;
    updatedConfig.folder = storageId;
    updatedConfig.type = row.type;

    const normalizedBuyers = [...new Set([
      ...buyers,
      botConfig.data?.ownerId,
      row.ownerId,
    ].filter(Boolean).map(String))];
    updatedConfig.buyers = normalizedBuyers;
    updatedConfig.buyer = normalizedBuyers;

    writeJsonConfig(botConfig.path, updatedConfig);
    invalidateTokenValidityCache(botConfig.data.token);
    invalidateTokenValidityCache(newToken);
    syncMusicEnvFromConfig(storageId, row.type, {
      token: newToken,
      ownerId: row.ownerId,
      clientId: finalBotId,
      botId: finalBotId,
      buyers: normalizedBuyers,
    });

    await syncClientRoleForUsers(bot, [row.ownerId, ...normalizedBuyers]).catch((error) => {
      console.log(`[CHANGETOKEN] Sync role client échouée pour ${botId}: ${error.message}`);
    });

    if (isDraftBotId(botId)) {
      bot.db.prepare('UPDATE bot SET botId = ?, token = ?, folder = ? WHERE botId = ?').run(newBotId, encryptToken(newToken), storageId, botId);
      manageView?.__private__?.rememberFinalizedBotAlias?.(botId, newBotId, storageId);
    } else {
      bot.db.prepare('UPDATE bot SET token = ?, folder = ? WHERE botId = ?').run(encryptToken(newToken), storageId, botId);
    }

    const botUser = bot.users.cache.get(finalBotId) || getFallbackUser(finalBotId);
    const started = await launchChildProcess(`./BotRuntimes/${storageId}/index.js`, 'checkstart', botUser, bot);

    if (started) {
      await launchChildProcess(`./BotRuntimes/${storageId}/index.js`, 'restart', botUser, bot);
    } else {
      await launchChildProcess(`./BotRuntimes/${storageId}/index.js`, 'start', botUser, bot);
    }

    await sendAdminActionLog(bot, 'tokenChangeLogs', '# Token modifié', [
      `> **Bot:** <@${finalBotId}> (\`${finalBotId}\`)`,
      `> **Type:** \`${row.type || 'inconnu'}\``,
      `> **Dossier:** \`${storageId}\``,
      `> **Modifié par:** <@${interaction.user.id}> (\`${interaction.user.id}\`)`,
      `> **Mode:** changement de token`,
    ]);

    await refreshManageMessage(bot, interaction, sourceMessageId, finalBotId);

    return replyWithContainer(
      interaction,
      '# Token modifié',
      isDraftBotId(botId)
        ? `> *Le bot \`${botId}\` a été finalisé en \`${newBotId}\` avec succès. Le bot a été relancé*`
        : `> *Le token du bot <@${botId}> (\`${botId}\`) a été modifié avec succès. Le bot a été relancé*`
    );
  },
};
