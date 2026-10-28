const config = require('../../config.json');
const Discord = require('discord.js');
const buildPanel = require('../../Utils/buildPanel');
const botsService = require('../../Handlers/botsService');
const publicManage = require('../Public/manage.js');
const { fetchUser } = require('../../Utils/discordLookup');
const { readJsonConfig } = require('../../Utils/tokenVault');
const { getInterestedUserIdsFromRow } = require('../../Utils/clientRoleManager');

const PAGE_SIZE = 5;
const EPHEMERAL_FLAGS = Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral;

function getBotRow(bot, botId) {
  return bot.db.prepare('SELECT * FROM bot WHERE botId = ?').get(botId);
}

function getBotStorageId(rowOrBotId) {
  if (typeof rowOrBotId === 'string') return rowOrBotId;
  return rowOrBotId?.folder || rowOrBotId?.botId;
}

function readBotConfig(row) {
  const storageId = getBotStorageId(row);
  if (!storageId) return null;

  const configPath = require('path').join(__dirname, '../../BotRuntimes', storageId, 'config.json');
  return readJsonConfig(configPath, { migrateToken: false });
}

function isAccessibleBot(row, userId) {
  return getInterestedUserIdsFromRow(row, readBotConfig(row)).includes(String(userId));
}

function isManagerOwner(userId) {
  return Array.isArray(config.owners) && config.owners.includes(String(userId));
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
      '⚠️ Colle l\'identifiant ou la mention de l\'utilisateur à mettre en buyer'
    )
  );

  const buyerLabel = new Discord.LabelBuilder()
    .setLabel('Nouveau buyer')
    .setDescription('Mention ou identifiant de l\'utilisateur')
    .setTextInputComponent(
      new Discord.TextInputBuilder()
        .setCustomId('new_buyer')
        .setStyle(Discord.TextInputStyle.Short)
        .setPlaceholder('Ex: 123456789012345678 ou <@123456789012345678>')
        .setRequired(true)
    );

  modal.addLabelComponents(buyerLabel);
  return modal;
}

module.exports = {
  name: 'adminmanage',
  description: 'Permet aux admins de gérer les bots d\'un utilisateur',
  permission: 'Aucune',
  dm: true,
  options: [
    {
      type: 'user',
      name: 'user',
      description: 'L\'utilisateur dont vous souhaitez gérer les bots',
      required: true,
      autocomplete: false,
    },
  ],

  async run(bot, message, args) {
    await message.deferReply({ flags: EPHEMERAL_FLAGS }).catch(() => {});

    if (!isManagerOwner(message.author.id)) {
      const embed = buildPanel(
        '# <:croix:1505270277796397146> Accès refusé',
        ['> *Cette commande est réservée aux owners du manager*']
      );
      return message.editReply({ components: [embed], allowedMentions: { parse: [] }, flags: EPHEMERAL_FLAGS });
    }

    const targetUser = args.getUser('user');
    const allRows = bot.db.prepare('SELECT * FROM bot ORDER BY CAST(time AS INTEGER) DESC, rowid DESC').all();
    const accessibleRows = allRows.filter((row) => isAccessibleBot(row, targetUser.id));
    const totalRows = accessibleRows.length;

    if (totalRows < 1) {
      const empty = buildPanel('# <:croix:1505270277796397146> Aucun bot', [`> *${targetUser.username} n'a **aucun** bot.*`]);
      return message.editReply({ components: [empty], allowedMentions: { parse: [] }, flags: EPHEMERAL_FLAGS });
    }

    const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
    let page = 1;
    let selectedBotId = null;

    const renderList = async () => {
      const list = await publicManage.__private__.buildListPage(
        bot,
        accessibleRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        page,
        totalPages,
        targetUser.username,
        totalRows
      );
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
      const detail = await publicManage.__private__.buildDetailPage(bot, record);
      return { components: [detail] };
    };

    const initial = await renderList();
    const msg = await message.editReply({
      components: initial.components,
      allowedMentions: { parse: [] },
      flags: EPHEMERAL_FLAGS,
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

        await interaction.deferReply({ flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral });
        await interaction.editReply({
          components: [buildPanel('# Mise à jour globale', ['> *Mise à jour de tous les bots de cet utilisateur en cours...*'])],
          allowedMentions: { parse: [] },
          flags: EPHEMERAL_FLAGS,
        });

        for (const row of ownedRows) {
          const botId = row.botId;
          const botStorageId = getBotStorageId(row);
          const botUser = await fetchUser(bot, botId);

          if (row.expired === 'true') {
            expiredBots.push(botId);
            continue;
          }

          const started = await botsService.isRunning(botStorageId, botUser);

          try {
            botsService.updateBotCode(botStorageId, row.type);
            if (started) startedBots.push({ botStorageId, botUser });
          } catch (error) {
            console.log(`[ADMIN MANAGE] Update all failed for ${botId}: ${error.message}`);
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
              '#  Mise à jour terminée',
              [
                `> **Bots traités:** ${ownedRows.length - expiredBots.length}`,
                `> **Bots redémarrés:** ${startedBots.length}`,
                expiredBots.length > 0 ? `> **Bots expirés ignorés:** ${expiredBots.length}` : null,
                `> *Les bots de ${targetUser.username} ont été remis à jour et relancés si besoin*`,
              ].filter(Boolean)
            )
          ],
          allowedMentions: { parse: [] },
          flags: EPHEMERAL_FLAGS,
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
        if (!row) return interaction.reply({ content: '> Bot introuvable', allowedMentions: { parse: [] } });
        if (row.expired === 'true') {
          return interaction.reply({
            components: [buildPanel('# <:croix:1505270277796397146> Bot expiré', ['> *Votre bot a expiré*'])],
            allowedMentions: { parse: [] },
            flags: EPHEMERAL_FLAGS,
          });
        }

        const botStorageId = getBotStorageId(row);
        const botUser = await fetchUser(bot, botId);

        if (action === 'token') {
          return interaction.showModal(buildTokenModal(`${botId}:${interaction.message.id}`));
        }

        await interaction.deferReply({ flags: EPHEMERAL_FLAGS }).catch(() => {});

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
          flags: EPHEMERAL_FLAGS,
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
            components: [buildPanel('# <:croix:1505270277796397146> Bot expiré', ['> *Votre bot a expiré*'])],
            allowedMentions: { parse: [] },
            flags: Discord.MessageFlags.IsComponentsV2,
          });
        }

        await interaction.deferReply({ flags: EPHEMERAL_FLAGS }).catch(() => {});

        const botStorageId = getBotStorageId(row);
        const botUser = await fetchUser(bot, botId);
          const started = await botsService.isRunning(botStorageId, botUser);

          try {
            botsService.updateBotCode(botStorageId, row.type);
        } catch (error) {
          return interaction.editReply({
            components: [buildPanel('# <:croix:1505270277796397146> Mise à jour impossible', [`> *${error.message}*`])],
            allowedMentions: { parse: [] },
            flags: EPHEMERAL_FLAGS,
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
          flags: EPHEMERAL_FLAGS,
        }).catch(() => {});

        if (refreshed) {
          return msg.edit({ components: refreshed.components, allowedMentions: { parse: [] } });
        }
      }
    });
  },
};
