const config = require('../../config.json');
const Discord = require('discord.js');
const buildPanel = require('../../Utils/buildPanel');
const { hasAdminAccess } = require('../../Utils/adminAccess');
const botsService = require('../../Handlers/botsService');
const { readJsonConfig } = require('../../Utils/tokenVault');
const { getInterestedUserIdsFromRow } = require('../../Utils/clientRoleManager');

const PAGE_SIZE = 5;

function getBotStorageId(row) {
  return row?.folder || row?.botId;
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

function getBotName(botUser, row) {
  if (botUser?.tag) return botUser.tag;
  if (botUser?.username) return botUser.username;
  return row.botId;
}

function getStatus(record) {
  if (record.expired) return { emoji: '⏰', label: 'expiré' };
  if (record.tokenValid === false) return { emoji: '<:croix:1505270277796397146>', label: 'token invalide' };
  return record.started ? { emoji: '🟢', label: 'en ligne' } : { emoji: '🔴', label: 'éteint' };
}

function getExpireText(row) {
  return row.expired === 'true'
    ? 'expiré'
    : `<t:${Number(row.time) || Math.floor(Date.now() / 1000)}:R>`;
}

async function buildListPage(bot, rows, page, totalPages, targetUser, totalRows) {
  const pageIndex = Math.min(Math.max(page, 1), totalPages);
  const start = (pageIndex - 1) * PAGE_SIZE;

  const container = buildPanel(
    `# Bots de ${targetUser.username} - page ${pageIndex}/${totalPages}`,
    [`> *${totalRows} bot${totalRows > 1 ? 's' : ''} appartiennent à **${targetUser.username}**.*`]
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
      const status = getStatus(record);

      return `\`${index + 1 + start}.\` **${botName}** (\`${row.type || 'inconnu'}\`) - ${getExpireText(row)}\n┖ ${status.emoji} ${status.label}`;
    })
  );

  if (lines.length > 0) {
    container.addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(lines.join('\n\n'))
    );
  }

  container.addSeparatorComponents(
    new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
  );

  container.addActionRowComponents(
    new Discord.ActionRowBuilder().addComponents(
      new Discord.ButtonBuilder()
        .setCustomId('info_bot_prev')
        .setLabel('⬅')
        .setStyle(Discord.ButtonStyle.Secondary)
        .setDisabled(pageIndex <= 1),
      new Discord.ButtonBuilder()
        .setCustomId('info_bot_next')
        .setLabel('➡')
        .setStyle(Discord.ButtonStyle.Secondary)
        .setDisabled(pageIndex >= totalPages)
    )
  );

  return container;
}

module.exports = {
  name: 'info-bot',
  description: 'Affiche les bots d\'un membre',
  permission: 'Aucune',
  dm: false,
  subcommands: [
    {
      name: 'user',
      description: 'Affiche les bots d\'un membre',
      options: [
        {
          type: 'user',
          name: 'user',
          description: 'Le membre dont vous souhaitez afficher les bots',
          required: true,
          autocomplete: false,
        },
      ],
    },
  ],

  async run(bot, message, args) {
    if (!hasAdminAccess(message)) {
      return buildAccessError(message);
    }

    const subcommand = args.getSubcommand?.();
    if (subcommand !== 'user') {
      return message.reply({
        components: [buildPanel('# <:croix:1505270277796397146> Sous-commande inconnue', ['> *Sous-commande non prise en charge*'])],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const targetUser = args.getUser('user');
    const allRows = bot.db.prepare('SELECT * FROM bot ORDER BY CAST(time AS INTEGER) DESC, rowid DESC').all();
    const accessibleRows = allRows.filter((row) => isAccessibleBot(row, targetUser.id));
    const totalRows = accessibleRows.length;

    if (totalRows < 1) {
      await message.deferReply({ flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral }).catch(() => {});
      return message.editReply({
        components: [
          buildPanel('# <:croix:1505270277796397146> Aucun bot', [`> *${targetUser.username} n'a **aucun** bot*`]),
        ],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    await message.deferReply({ flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral }).catch(() => {});

    const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
    let page = 1;
    const render = async () => ({
      components: [await buildListPage(bot, accessibleRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, totalPages, targetUser, totalRows)],
    });

    const initial = await render();
    const msg = await message.editReply({
      components: initial.components,
      allowedMentions: { parse: [] },
      flags: Discord.MessageFlags.IsComponentsV2,
    });

    if (totalPages <= 1 || !msg?.createMessageComponentCollector) {
      return msg;
    }

    const collector = msg.createMessageComponentCollector({
      filter: (interaction) =>
        interaction.user.id === message.author.id &&
        (interaction.customId === 'info_bot_prev' || interaction.customId === 'info_bot_next'),
      time: 10 * 60 * 1000,
    });

    collector.on('collect', async (interaction) => {
      if (interaction.customId === 'info_bot_prev') {
        page = Math.max(1, page - 1);
      } else if (interaction.customId === 'info_bot_next') {
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
