const fs = require('fs');
const path = require('path');
const Discord = require('discord.js');
const buildPanel = require('../../Utils/buildPanel');
const launchChildProcess = require('../../Utils/lauchChildProcess');
const { fetchUser, getFallbackUser } = require('../../Utils/discordLookup');
const { readJsonConfig } = require('../../Utils/tokenVault');
const { getInterestedUserIdsFromRow } = require('../../Utils/clientRoleManager');
const botsService = require('../../Handlers/botsService');

const PAGE_SIZE = 10;

function getBotStorageId(row) {
  return row?.folder || row?.botId;
}

function readBotConfig(row) {
  const configPath = path.join(__dirname, '../../BotRuntimes', getBotStorageId(row), 'config.json');
  if (!fs.existsSync(configPath)) return null;
  return readJsonConfig(configPath, { migrateToken: false });
}

function isAccessibleBot(row, userId) {
  const botConfig = readBotConfig(row);
  return getInterestedUserIdsFromRow(row, botConfig).includes(String(userId));
}

function updateBotCode(botStorageId, botType) {
  botsService.updateBotCode(botStorageId, botType);
}

function formatTime(row) {
  const unix = Number(row.time) || Math.floor(Date.now() / 1000);
  return row.expired === 'true' ? 'expiré' : `<t:${unix}:R>`;
}

function getBotName(botUser, row) {
  if (botUser?.tag) return botUser.tag;
  if (botUser?.username) return botUser.username;
  return row.botId;
}

function getAuthorizeLink(botId) {
  return `https://discord.com/api/oauth2/authorize?client_id=${botId}&permissions=8&scope=bot%20applications.commands`;
}

async function buildMyBotView(bot, rows, page, authorName) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageIndex = Math.min(Math.max(page, 1), totalPages);
  const pageRows = rows.slice((pageIndex - 1) * PAGE_SIZE, pageIndex * PAGE_SIZE);
  const container = buildPanel(
    `# Bots de ${authorName}`,
    [`> *Sélectionne une action ou change de page avec le menu ci-dessous*`]
  );

  const listLines = await Promise.all(
    pageRows.map(async (row, index) => {
      try {
        const botUser = /^\d{17,20}$/.test(String(row.botId))
          ? bot.users.cache.get(row.botId) || await fetchUser(bot, row.botId)
          : null;
        const botName = getBotName(botUser, row);
        const botLink = getAuthorizeLink(row.botId);
        const botStorageId = getBotStorageId(row);
        const started = await launchChildProcess(
          `./BotRuntimes/${botStorageId}/index.js`,
          'checkstart',
          botUser || getFallbackUser(row.botId),
          bot
        );
        const status = row.expired === 'true'
          ? '⏰ expiré'
          : !row.token
            ? '⚠️ en attente du token'
            : started
              ? '🟢 en ligne'
              : '🔴 éteint';

        return `\`${index + 1 + (pageIndex - 1) * PAGE_SIZE}.\` [**\`${botName}\`**](${botLink}) (\`${row.type || 'inconnu'}\`) : ${formatTime(row)} 👑\n┖ ${status}`;
      } catch (error) {
        console.error(`[MYBOT] Impossible de charger ${row.botId}:`, error);
        return `\`${index + 1 + (pageIndex - 1) * PAGE_SIZE}.\` **\`${row.botId}\`** (\`${row.type || 'inconnu'}\`) : ${formatTime(row)} 👑\n┖ ⚠️ statut indisponible`;
      }
    })
  );

  if (listLines.length > 0) {
    container.addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(listLines.join('\n\n'))
    );
  }

  container.addMediaGalleryComponents(
    new Discord.MediaGalleryBuilder().addItems(
      new Discord.MediaGalleryItemBuilder().setURL('https://cdn.discordapp.com/attachments/1002173915549937714/1366467172993339504/barreepic.gif?ex=6a001879&is=69fec6f9&hm=08c4287e13e8dcb098dbfafef3521be5220728ff7eeb27504767a7c98fd3bbdc')
    )
  );

  const select = new Discord.StringSelectMenuBuilder()
    .setCustomId(`mybot_select:${pageIndex}`)
    .setPlaceholder('Manage bots')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      {
        label: 'Update All',
        value: 'action:updateall',
        description: 'Met à jour tous tes bots',
        emoji: '<:ddd:1505271153332191273>',
      },
      ...(totalPages > 1
        ? [
            {
              label: 'Page suivante',
              value: 'action:next',
              description: `Aller à la page ${Math.min(pageIndex + 1, totalPages)}`,
              emoji: '>',
            },
            {
              label: 'Page précédente',
              value: 'action:prev',
              description: `Aller à la page ${Math.max(pageIndex - 1, 1)}`,
              emoji: '<',
            },
          ]
        : [])
    );

  container.addSeparatorComponents(
    new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
  );
  container.addActionRowComponents(new Discord.ActionRowBuilder().addComponents(select));

  return { container, totalPages, pageIndex };
}

module.exports = {
  name: 'mybot',
  description: 'Permet de voir vos bots.',
  permission: 'Aucune',
  dm: true,

  async run(bot, message) {
    try {
      await message.deferReply().catch(() => {});
      const rows = bot.db.prepare('SELECT * FROM bot ORDER BY time DESC').all();
      const accessibleRows = rows.filter((row) => isAccessibleBot(row, message.author.id));

      if (accessibleRows.length < 1) {
        const embed = buildPanel('# <:croix:1505270277796397146> Aucun bot', ['> *Vous n\'avez **aucun** bot !*']);
        return message.editReply({
          components: [embed],
          flags: Discord.MessageFlags.IsComponentsV2,
        });
      }

      let page = 1;
      let currentView = await buildMyBotView(bot, accessibleRows, page, message.author.username);

      const msg = await message.editReply({
        components: [currentView.container],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2,
      });

      const collector = msg.createMessageComponentCollector({
        filter: (interaction) =>
          interaction.user.id === message.author.id &&
          interaction.customId.startsWith('mybot_select:'),
        time: 10 * 60 * 1000,
      });

      collector.on('collect', async (interaction) => {
        if (interaction.customId.startsWith('mybot_select:')) {
          const selectedValue = interaction.values?.[0];

          if (selectedValue === 'action:updateall') {
            await interaction.deferReply();
            await interaction.editReply({
              components: [buildPanel('# Mise à jour globale', ['> *Mise à jour de tous vos bots en cours...*'])],
              allowedMentions: { parse: [] },
              flags: Discord.MessageFlags.IsComponentsV2,
            });

            const startedBots = [];
            const expiredBots = [];
            for (const row of accessibleRows) {
              if (row.expired === 'true') {
                expiredBots.push(row.botId);
                continue;
              }
              const botStorageId = getBotStorageId(row);
              const botUser = /^\d{17,20}$/.test(String(row.botId))
                ? await fetchUser(bot, row.botId)
                : null;
              const started = await require('../../Utils/lauchChildProcess')(
                `./BotRuntimes/${botStorageId}/index.js`,
                'checkstart',
                botUser || getFallbackUser(row.botId),
                bot
              );

              try {
                updateBotCode(botStorageId, row.type);
                if (started) startedBots.push({ botStorageId, botUser });
              } catch (error) {
                console.log(`[MYBOT] Update failed for ${row.botId}: ${error.message}`);
              }
            }

            for (const item of startedBots) {
              await require('../../Utils/lauchChildProcess')(
                `./BotRuntimes/${item.botStorageId}/index.js`,
                'restart',
                item.botUser || { id: item.botStorageId, username: item.botStorageId },
                bot
              );
            }

            currentView = await buildMyBotView(bot, accessibleRows, page, message.author.username);
            await msg.edit({
              components: [currentView.container],
              allowedMentions: { parse: [] },
              flags: Discord.MessageFlags.IsComponentsV2,
            });

            return interaction.followUp({
              components: [
                buildPanel('#  Mise à jour terminée', [
                  `> **Bots traités:** ${accessibleRows.length - expiredBots.length}`,
                  `> **Bots redémarrés:** ${startedBots.length}`,
                  expiredBots.length > 0 ? `> **Bots expirés ignorés:** ${expiredBots.length}` : null,
                  '> *Les templates ont été réappliqués proprement et les bots actifs ont été relancés si nécessaire*',
                ].filter(Boolean))
              ],
              allowedMentions: { parse: [] },
              flags: Discord.MessageFlags.IsComponentsV2,
            });
          }

          if (selectedValue === 'action:prev') {
            page = Math.max(1, page - 1);
          } else if (selectedValue === 'action:next') {
            page = Math.min(Math.max(1, Math.ceil(accessibleRows.length / PAGE_SIZE)), page + 1);
          }

          await interaction.deferUpdate().catch(() => {});
          currentView = await buildMyBotView(bot, accessibleRows, page, message.author.username);
          return msg.edit({
            components: [currentView.container],
            allowedMentions: { parse: [] },
            flags: Discord.MessageFlags.IsComponentsV2,
          });
        }
      });
    } catch (error) {
      console.error('[MYBOT] Erreur globale:', error);
      const embed = buildPanel('# <:croix:1505270277796397146> Erreur', ['> *Impossible de récupérer vos bots*']);
          return message.editReply({
            components: [embed],
            allowedMentions: { parse: [] },
            flags: Discord.MessageFlags.IsComponentsV2,
          });
    }
  }
};
