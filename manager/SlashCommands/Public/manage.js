const config = require('../../config.json');
const Discord = require('discord.js');
const fs = require('fs');
const path = require('path');
const botsService = require('../../Handlers/botsService');
const buildPanel = require('../../Utils/buildPanel');
const { readJsonConfig, writeJsonConfig } = require('../../Utils/tokenVault');
const { syncMusicEnvFromConfig } = require('../../Utils/musicEnv');
const { prepareBotRuntime, getRuntimeDir } = require('../../Utils/templateRuntime');
const { getInterestedUserIdsFromRow } = require('../../Utils/clientRoleManager');
const {
  fetchUser,
  getFallbackUser,
  isTokenValid,
  invalidateTokenValidityCache,
} = require('../../Utils/discordLookup');

const PAGE_SIZE = 5;
const MANAGE_FLAGS = Discord.MessageFlags.IsComponentsV2;
const DEV_APPLICATIONS_URL = 'https://discord.com/developers/applications';
const INVALID_TOKEN_BOT_LABEL = `- *(<:croix:1505270277796397146> [Aucun bot lié](${DEV_APPLICATIONS_URL}))*`;
const finalizedBotAliases = new Map();

function getBotRow(bot, botId) {
  const requestedId = String(botId || '');
  const aliased = finalizedBotAliases.get(requestedId);
  const lookupId = aliased?.botId || requestedId;

  const row = bot.db.prepare('SELECT * FROM bot WHERE botId = ? OR folder = ?').get(lookupId, lookupId);
  if (row) return row;

  if (aliased?.storageId) {
    return bot.db.prepare('SELECT * FROM bot WHERE folder = ?').get(aliased.storageId);
  }

  return null;
}

function rememberFinalizedBotAlias(oldBotId, newBotId, storageId) {
  if (!oldBotId || !newBotId || String(oldBotId) === String(newBotId)) return;
  finalizedBotAliases.set(String(oldBotId), {
    botId: String(newBotId),
    storageId: storageId ? String(storageId) : null,
  });
}

function isRunning(botId, botClient) {
  return require('../../Utils/lauchChildProcess')(
    `./BotRuntimes/${botId}/index.js`,
    'checkstart',
    botClient
  );
}

function getBotStorageId(rowOrBotId) {
  if (typeof rowOrBotId === 'string') return rowOrBotId;
  return rowOrBotId?.folder || rowOrBotId?.botId;
}

function readBotConfig(row) {
  const storageId = getBotStorageId(row);
  if (!storageId) return null;

  const configPath = path.join(__dirname, '../../BotRuntimes', storageId, 'config.json');
  return readJsonConfig(configPath, { migrateToken: false });
}

function isAccessibleBot(row, userId) {
  return getInterestedUserIdsFromRow(row, readBotConfig(row)).includes(String(userId));
}

function getBotLink(botId) {
  if (!/^\d{17,20}$/.test(String(botId || ''))) return null;
  return `https://discord.com/api/oauth2/authorize?client_id=${botId}&permissions=8&scope=bot%20applications.commands`;
}

function getDeveloperApplicationLabel(type) {
  return `[${Discord.escapeMarkdown(type || 'bot')}](${DEV_APPLICATIONS_URL})`;
}

function getDisplayBotName(row, botUser, tokenValid) {
  if (botUser?.tag) return botUser.tag;
  if (botUser?.username && botUser.username !== row?.botId) return botUser.username;
  return row?.botId || 'Bot inconnu';
}

function getStatus(row, started, tokenInvalid = false) {
  if (tokenInvalid) {
    return { label: 'token invalide', emoji: '<:croix:1505270277796397146>', disabled: true };
  }

  if (row.expired === 'true') {
    return { label: 'expiré', emoji: '⏰', disabled: true };
  }

  if (started) {
    return { label: 'en ligne', emoji: '🟢', disabled: false };
  }

  return { label: 'hors ligne', emoji: '🔴', disabled: false };
}

function formatTimeLeft(row) {
  if (row.expired === 'true') return 'expiré';
  const remaining = Number(row.time) - Math.floor(Date.now() / 1000);
  if (!Number.isFinite(remaining)) return 'inconnu';
  if (remaining <= 0) return 'expiré';
  const days = Math.floor(remaining / 86400);
  if (days >= 1) return `dans ${days} jour${days > 1 ? 's' : ''}`;
  const hours = Math.floor(remaining / 3600);
  if (hours >= 1) return `dans ${hours} heure${hours > 1 ? 's' : ''}`;
  const minutes = Math.floor(remaining / 60);
  return `dans ${Math.max(minutes, 1)} min`;
}

function formatDiscordTimestamp(row) {
  const unix = Number(row.time) || Math.floor(Date.now() / 1000);
  return row.expired === 'true' ? 'expiré' : `<t:${unix}:R>`;
}

function updateBotCode(botId, botType) {
  botsService.updateBotCode(botId, botType);
}

async function buildListPage(bot, rows, page, totalPages, authorName, totalRows) {
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = await Promise.all(
    rows.map(async (row) => {
      const record = await botsService.buildBotRecord(bot, row, {
        liveStatus: true,
        resolveUser: true,
        resolveTokenValidity: true,
        includeAvatar: false,
      });

      const status = getStatus(row, record.started, !record.tokenValid);
      const liveStatus = record.started
        ? { label: 'en ligne', emoji: '🟢' }
        : { label: 'éteint', emoji: '🔴' };
      const botName = getDisplayBotName(row, { tag: record.name, username: record.name }, record.tokenValid);
      const timeLeft = formatDiscordTimestamp(row);

      return { row, status, liveStatus, botName, timeLeft, tokenValid: record.tokenValid };
    })
  );

  const container = buildPanel(
    `# Bots de ${authorName} - page ${page}/${totalPages}`,
    [`> *${totalRows} bot${totalRows > 1 ? 's' : ''} au total. Choisis un bot pour ouvrir sa fiche de gestion*`]
  );

  for (let i = 0; i < pageItems.length; i += 1) {
    const item = pageItems[i];
    const { row, status, liveStatus, botName, timeLeft, tokenValid } = item;
    const botLabel = tokenValid
      ? getBotLink(row.botId)
        ? `• [**\`${botName}\`**](${getBotLink(row.botId)})`
        : `• **${botName}**`
      : INVALID_TOKEN_BOT_LABEL;
    if (i > 0) {
      container.addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      );
    }

    container.addSectionComponents(
      new Discord.SectionBuilder()
        .addTextDisplayComponents(
          new Discord.TextDisplayBuilder().setContent(
            tokenValid
              ? `${botLabel} (${row.type || 'bot'}) ${timeLeft} 👑\n└ ${status.emoji} ${status.label}`
              : `${getDeveloperApplicationLabel(row.type)} : ${timeLeft} 👑\n${INVALID_TOKEN_BOT_LABEL}`
          )
        )
        .setButtonAccessory((button) =>
          button
            .setCustomId(`manage_open:${row.botId}`)
            .setEmoji({ name: '⚙️' })
            .setStyle(Discord.ButtonStyle.Secondary)
        )
    );
  }

  container.addMediaGalleryComponents(
    new Discord.MediaGalleryBuilder().addItems(
      new Discord.MediaGalleryItemBuilder().setURL('https://cdn.discordapp.com/attachments/1002173915549937714/1366467172993339504/barreepic.gif?ex=6a001879&is=69fec6f9&hm=08c4287e13e8dcb098dbfafef3521be5220728ff7eeb27504767a7c98fd3bbdc')
    )
  );
  container.addSeparatorComponents(
    new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
  );
  container.addActionRowComponents(
    new Discord.ActionRowBuilder().addComponents(
      new Discord.ButtonBuilder()
        .setCustomId('manage_prev')
        .setLabel('⬅')
        .setStyle(Discord.ButtonStyle.Secondary)
        .setDisabled(page <= 1),
      new Discord.ButtonBuilder()
        .setCustomId('manage_updateall')
        .setLabel('Update all')
        .setEmoji('<:ddd:1505271153332191273>')
        .setStyle(Discord.ButtonStyle.Primary),
      new Discord.ButtonBuilder()
        .setCustomId('manage_next')
        .setLabel('➡')
        .setStyle(Discord.ButtonStyle.Secondary)
        .setDisabled(page >= totalPages)
    )
  );

  return container;
}

async function buildDetailPage(bot, record) {
  const status = getStatus(record, record.started, !record.tokenValid);
  const botName = getDisplayBotName(record, { tag: record.name, username: record.name }, record.tokenValid);
  const botLabel = record.tokenValid ? `**${botName}**` : INVALID_TOKEN_BOT_LABEL;

  const container = buildPanel(record.tokenValid ? `# ${botName}` : '# Aucun bot lié', [
    `> ${botLabel} (\`${record.type || 'bot'}\`)`,
    `> Statut: **${status.label}**`,
    `> Expire: <t:${Number(record.time) || Math.floor(Date.now() / 1000)}:R>`
  ]);

  container.addMediaGalleryComponents(
    new Discord.MediaGalleryBuilder().addItems(
      new Discord.MediaGalleryItemBuilder().setURL('https://cdn.discordapp.com/attachments/1002173915549937714/1366467172993339504/barreepic.gif?ex=6a001879&is=69fec6f9&hm=08c4287e13e8dcb098dbfafef3521be5220728ff7eeb27504767a7c98fd3bbdc')
    )
  );

  const start = new Discord.ButtonBuilder()
    .setCustomId(`manage_start:${record.botId}`)
    .setLabel('Start')
    .setStyle(Discord.ButtonStyle.Secondary)
    .setDisabled(status.disabled || record.started);

  const stop = new Discord.ButtonBuilder()
    .setCustomId(`manage_stop:${record.botId}`)
    .setLabel('Stop')
    .setStyle(Discord.ButtonStyle.Secondary)
    .setDisabled(status.disabled || !record.started);

  const restart = new Discord.ButtonBuilder()
    .setCustomId(`manage_restart:${record.botId}`)
    .setLabel('Restart')
    .setStyle(Discord.ButtonStyle.Secondary)
    .setDisabled(status.disabled);

  const update = new Discord.ButtonBuilder()
    .setCustomId(`manage_update:${record.botId}`)
    .setLabel('Mettre à jour')
    .setStyle(Discord.ButtonStyle.Secondary)
    .setDisabled(record.expired === 'true');

  const buyer = new Discord.ButtonBuilder()
    .setCustomId(`manage_buyer:${record.botId}`)
    .setLabel('Changer buyer')
    .setStyle(Discord.ButtonStyle.Secondary)
    .setDisabled(record.expired === 'true');

  const token = new Discord.ButtonBuilder()
    .setCustomId(`manage_token:${record.botId}`)
    .setLabel('Changer token')
    .setStyle(Discord.ButtonStyle.Secondary)
    .setDisabled(record.expired === 'true');

  const back = new Discord.ButtonBuilder()
    .setCustomId('manage_back')
    .setLabel('Retour')
    .setStyle(Discord.ButtonStyle.Secondary);

  container.addSeparatorComponents(
    new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
  );
  container.addActionRowComponents(new Discord.ActionRowBuilder().addComponents(update, buyer));
  container.addSeparatorComponents(
    new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
  );
  container.addActionRowComponents(new Discord.ActionRowBuilder().addComponents(start, stop, restart, token));
  container.addSeparatorComponents(
    new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
  );
  container.addActionRowComponents(new Discord.ActionRowBuilder().addComponents(back));
  container.addSeparatorComponents(
    new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
  );

  return container;
}

function buildTokenModal(botId) {
  const modal = new Discord.ModalBuilder()
    .setCustomId(`manage_token_modal:${botId}`)
    .setTitle('Changer le token');

  modal.addTextDisplayComponents(
    new Discord.TextDisplayBuilder().setContent(
      '⚠️ Ne donne pas ton mot de passe. Colle uniquement le token du bot'
    )
  );

  const tokenLabel = new Discord.LabelBuilder()
    .setLabel('Nouveau token')
    .setDescription('Colle le nouveau token du bot')
    .setTextInputComponent(
      new Discord.TextInputBuilder()
        .setCustomId('new_token')
        .setStyle(Discord.TextInputStyle.Short)
        .setPlaceholder('Colle le token ici')
        .setRequired(true)
    );

  modal.addLabelComponents(tokenLabel);
  return modal;
}

function buildBuyerModal(botId) {
  const modal = new Discord.ModalBuilder()
    .setCustomId(`manage_buyer_modal:${botId}`)
    .setTitle('Changer le buyer');

  modal.addTextDisplayComponents(
    new Discord.TextDisplayBuilder().setContent(
      '⚠️ Entre le @mention ou l\'ID du nouvel utilisateur à mettre en buyer'
    )
  );

  const buyerLabel = new Discord.LabelBuilder()
    .setLabel('Nouveau buyer')
    .setDescription('Colle un @mention ou un ID Discord')
    .setTextInputComponent(
      new Discord.TextInputBuilder()
        .setCustomId('new_buyer')
        .setStyle(Discord.TextInputStyle.Short)
        .setPlaceholder('Ex: @Utilisateur ou 123456789012345678')
        .setRequired(true)
    );

  modal.addLabelComponents(buyerLabel);
  return modal;
}

module.exports = {
  name: 'manage',
  description: 'Permet de gérer votre bot',
  permission: 'Aucune',
  dm: true,

  async run(bot, message) {
    await message.deferReply().catch(() => {});

    const sendReply = async (payload) => {
      const responsePayload = {
        ...payload,
        flags: Discord.MessageFlags.IsComponentsV2,
      };

      try {
        if (message.deferred || message.replied) {
          return await message.editReply(responsePayload);
        }

        return await message.reply(responsePayload);
      } catch {
        return null;
      }
    };

    const allRows = bot.db.prepare('SELECT * FROM bot ORDER BY CAST(time AS INTEGER) DESC, rowid DESC').all();
    const accessibleRows = allRows.filter((row) => isAccessibleBot(row, message.author.id));
    const totalRows = accessibleRows.length;

    if (totalRows < 1) {
      const empty = buildPanel('# <:croix:1505270277796397146> Aucun bot', ['> *Vous n\'avez **aucun** bot*']);
      return sendReply({ components: [empty], flags: Discord.MessageFlags.IsComponentsV2 });
    }

    const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
    let page = 1;
    let selectedBotId = null;

    const renderList = async () => {
      const pageRows = accessibleRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      const list = await buildListPage(bot, pageRows, page, totalPages, message.author.username, totalRows);
      return { components: [list] };
    };

    const renderDetail = async (botId) => {
      const row = getBotRow(bot, botId);
      if (!row) return null;
      const record = await botsService.buildBotRecord(bot, row, {
        liveStatus: true,
        resolveUser: true,
        resolveTokenValidity: true,
        includeAvatar: false,
      });
      const detail = await buildDetailPage(bot, record);
      return {
        components: [detail],
      };
    };

    const initial = await renderList();
    const msg = await sendReply({
      components: initial.components,
      allowedMentions: { parse: [] },
      flags: Discord.MessageFlags.IsComponentsV2,
    });

    const collector = msg.createMessageComponentCollector({ time: 10 * 60 * 1000 });

    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== message.author.id) {
        const deny = buildPanel('# <:croix:1505270277796397146> Utilisateur non autorisé', ['> *Vous n’êtes pas autorisé à utiliser cette interaction*']);
        return interaction.reply({ components: [deny], allowedMentions: { parse: [] }, flags: Discord.MessageFlags.IsComponentsV2 });
      }

      if (interaction.customId === 'manage_prev') {
        page = Math.max(1, page - 1);
        const view = await renderList();
        return interaction.update({ components: view.components, allowedMentions: { parse: [] } });
      }

      if (interaction.customId === 'manage_next') {
        page = Math.min(totalPages, page + 1);
        const view = await renderList();
        return interaction.update({ components: view.components, allowedMentions: { parse: [] } });
      }

      if (interaction.customId === 'manage_updateall') {
        const ownedRows = accessibleRows;
        const startedBots = [];
        const expiredBots = [];

        await interaction.deferReply();
        await interaction.editReply({
          components: [buildPanel('# Mise à jour globale', ['> *Mise à jour de tous vos bots en cours...*'])],
          allowedMentions: { parse: [] },
          flags: MANAGE_FLAGS,
        });

        for (const row of ownedRows) {
          const botId = row.botId;
          const botStorageId = getBotStorageId(row);
          const botUser = await fetchUser(bot, botId);
          if (row.expired === 'true') {
            expiredBots.push(botId);
            continue;
          }
          const started = await isRunning(botStorageId, botUser);

          try {
            updateBotCode(botStorageId, row.type);
            if (started) startedBots.push({ botStorageId, botUser });
          } catch (error) {
            console.log(`[MANAGE] Update all failed for ${botId}: ${error.message}`);
          }
        }

        for (const item of startedBots) {
          await require('../../Utils/lauchChildProcess')(
            `./BotRuntimes/${item.botStorageId}/index.js`,
            'restart',
            item.botUser,
            bot
          );
        }

        const view = await renderList();
        await msg.edit({ components: view.components, allowedMentions: { parse: [] } });

        return interaction.followUp({
          components: [
            buildPanel(
              '# Mise à jour terminée',
              [
                `> **Bots traités:** ${ownedRows.length - expiredBots.length}`,
                `> **Bots redémarrés:** ${startedBots.length}`,
                expiredBots.length > 0 ? `> **Bots expirés ignorés:** ${expiredBots.length}` : null,
                '> *Les templates ont été réappliqués proprement et les bots actifs ont été relancés si nécessaire*',
              ].filter(Boolean)
            )
          ],
          allowedMentions: { parse: [] },
          flags: MANAGE_FLAGS,
        });
      }

      if (interaction.customId.startsWith('manage_open:')) {
        selectedBotId = interaction.customId.split(':')[1];
        const view = await renderDetail(selectedBotId);
        if (!view) return interaction.reply({ content: '> Bot introuvable', allowedMentions: { parse: [] } });
        return interaction.update({ components: view.components, allowedMentions: { parse: [] } });
      }

      if (interaction.customId === 'manage_back') {
        selectedBotId = null;
        const view = await renderList();
        return interaction.update({ components: view.components, allowedMentions: { parse: [] } });
      }

      const buyerMatch = interaction.customId.match(/^manage_buyer:(.+)$/);
      if (buyerMatch) {
        const botId = buyerMatch[1];
        const row = getBotRow(bot, botId);
        if (!row) return interaction.reply({ content: '> Bot introuvable', allowedMentions: { parse: [] } });
        return interaction.showModal(buildBuyerModal(`${botId}:${interaction.message.id}`));
      }

      const actionMatch = interaction.customId.match(/^manage_(start|stop|restart|token):(.+)$/);
      if (actionMatch) {
        const action = actionMatch[1];
        const botId = actionMatch[2];
        const row = getBotRow(bot, botId);
        if (!row) return interaction.reply({ content: '> Bot introuvable' });

        const botStorageId = getBotStorageId(row);
        const botUser = await fetchUser(bot, botId);

        if (action === 'token') {
          return interaction.showModal(buildTokenModal(`${botId}:${interaction.message.id}`));
        }

        await interaction.deferReply().catch(() => {});

        await require('../../Utils/lauchChildProcess')(
          `./BotRuntimes/${botStorageId}/index.js`,
          action,
          botUser,
          bot
        );

        const refreshed = await renderDetail(botId);
        const titles = {
          start: '# Bot lancé',
          stop: '# Bot arrêté',
          restart: '# Bot relancé',
        };

        await interaction.editReply({
          components: [
            buildPanel(
              `# ${titles[action]}`,
              [
                `> **Bot:** <@${botId}> (\`${botId}\`)`,
                `> **Action:** Le bot a été ${action === 'stop' ? 'arrêté' : action === 'start' ? 'lancé' : 'relancé'} avec succès`,
              ]
            )
          ],
          allowedMentions: { parse: [] },
          flags: MANAGE_FLAGS,
        }).catch(() => {});

        if (refreshed) {
          return msg.edit({ components: refreshed.components, allowedMentions: { parse: [] } });
        }
      }

      const updateMatch = interaction.customId.match(/^manage_update:(.+)$/);
      if (updateMatch) {
        const botId = updateMatch[1];
        const row = getBotRow(bot, botId);
        if (!row) return interaction.reply({ content: '> Bot introuvable', allowedMentions: { parse: [] } });
        if (row.expired === 'true') {
          return interaction.reply({
            components: [buildPanel('# <:croix:1505270277796397146> Bot expiré', ['> *Votre bot a expiré.*'])],
            allowedMentions: { parse: [] },
            flags: MANAGE_FLAGS,
          });
        }

        await interaction.deferReply().catch(() => {});

        const botStorageId = getBotStorageId(row);
        const botUser = await fetchUser(bot, botId);
        const started = await isRunning(botStorageId, botUser);

        try {
          updateBotCode(botStorageId, row.type);
        } catch (error) {
          return interaction.editReply({
            components: [buildPanel('# <:croix:1505270277796397146> Mise à jour impossible', [`> *${error.message}*`])],
            allowedMentions: { parse: [] },
            flags: MANAGE_FLAGS,
          }).catch(() => {});
        }

        if (started) {
          await require('../../Utils/lauchChildProcess')(
            `./BotRuntimes/${botStorageId}/index.js`,
            'restart',
            botUser,
            bot
          );
        }

        const refreshed = await renderDetail(botId);

        await interaction.editReply({
          components: [
            buildPanel(
              '# Bot mis à jour',
              [
                `> **Bot:** <@${botId}> (\`${botId}\`)`,
                `> **Template:** \`${row.type || 'inconnu'}\``,
                started
                  ? '> *Le bot a été relancé automatiquement*'
                  : '> *Le bot a été démarré automatiquement*',
              ]
            )
          ],
          allowedMentions: { parse: [] },
          flags: MANAGE_FLAGS,
        }).catch(() => {});

        if (refreshed) {
          return msg.edit({ components: refreshed.components, allowedMentions: { parse: [] } });
        }
      }
    });
  },
};

module.exports.__private__ = {
  buildListPage,
  buildDetailPage,
  rememberFinalizedBotAlias,
  updateBotCode,
  getBotRow,
  isRunning,
  isTokenValid,
  invalidateTokenValidityCache,
  getStatus,
  formatDiscordTimestamp,
};
