const config = require('../../config.json');
const Discord = require('discord.js');
const fs = require('fs');
const path = require('path');
const buildPanel = require('../../Utils/buildPanel');
const { hasAdminAccess } = require('../../Utils/adminAccess');

const PAGE_SIZE = 35;

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

function getBotStorageId(row) {
  return row?.folder || row?.botId;
}

function getBotRootDir(storageId) {
  return path.resolve(__dirname, '../../BotRuntimes', storageId || '');
}

function isInsideBotRuntimes(targetPath) {
  const root = path.resolve(__dirname, '../../BotRuntimes');
  const resolved = path.resolve(targetPath);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

function buildTreeLines(dirPath, prefix = '') {
  if (!fs.existsSync(dirPath)) return [];

  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  const lines = [];

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const branch = isLast ? '└─' : '├─';
    const nextPrefix = prefix + (isLast ? '   ' : '│  ');
    const label = entry.isDirectory() ? `${entry.name}/` : entry.name;

    lines.push(`${prefix}${branch} ${label}`);

    if (entry.isDirectory()) {
      const childPath = path.join(dirPath, entry.name);
      lines.push(...buildTreeLines(childPath, nextPrefix));
    }
  }

  return lines;
}

function buildPage(lines, page, totalPages, botId, storageId) {
  const pageIndex = Math.min(Math.max(page, 1), totalPages);
  const start = (pageIndex - 1) * PAGE_SIZE;
  const pageLines = lines.slice(start, start + PAGE_SIZE);

  const container = buildPanel(
    `# Dossier de ${botId}`,
    [
      `> *Dossier: \`${storageId}\`*`,
      `> *Page ${pageIndex}/${totalPages}*`,
      pageLines.length > 0 ? `\`\`\`\n${pageLines.join('\n')}\n\`\`\`` : '> *Le dossier est vide*',
    ].filter(Boolean)
  );

  if (totalPages > 1) {
    container.addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
    );
    container.addActionRowComponents(
      new Discord.ActionRowBuilder().addComponents(
        new Discord.ButtonBuilder()
          .setCustomId('bot_dossier_prev')
          .setLabel('⬅')
          .setStyle(Discord.ButtonStyle.Secondary)
          .setDisabled(pageIndex <= 1),
        new Discord.ButtonBuilder()
          .setCustomId('bot_dossier_next')
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
  name: 'bot-dossier',
  description: 'Affiche le contenu du dossier d\'un bot spécifié par son identifiant',
  permission: 'Aucune',
  dm: true,
  options: [
    {
      type: 'string',
      name: 'botid',
      description: 'L\'identifiant du bot à consulter',
      required: true,
      autocomplete: false,
    },
  ],

  async run(bot, message, args) {
    if (!hasAdminAccess(message)) {
      return buildAccessError(message);
    }

    const botId = args.getString('botid');
    const row = bot.db.prepare('SELECT * FROM bot WHERE botId = ?').get(botId);

    if (!row) {
      return message.reply({
        components: [
          buildPanel('# <:croix:1505270277796397146> Bot non trouvé', [`> *Le bot ${botId} n'a pas été trouvé*`]),
        ],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const storageId = getBotStorageId(row);
    const botDir = getBotRootDir(storageId);

    if (!isInsideBotRuntimes(botDir) || !fs.existsSync(botDir)) {
      return message.reply({
        components: [
          buildPanel('# <:croix:1505270277796397146> Dossier introuvable', [`> *Le dossier du bot \`${storageId}\` est introuvable*`]),
        ],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const lines = buildTreeLines(botDir);
    const totalPages = Math.max(1, Math.ceil(lines.length / PAGE_SIZE));
    let page = 1;

    const render = () => ({
      components: [buildPage(lines, page, totalPages, botId, storageId)],
      allowedMentions: { parse: [] },
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
    });

    const msg = await sendReplyWithMessage(message, render());

    if (totalPages <= 1 || !msg?.createMessageComponentCollector) {
      return msg;
    }

    const collector = msg.createMessageComponentCollector({
      filter: (interaction) =>
        interaction.user.id === message.author.id &&
        (interaction.customId === 'bot_dossier_prev' || interaction.customId === 'bot_dossier_next'),
      time: 10 * 60 * 1000,
    });

    collector.on('collect', async (interaction) => {
      if (interaction.customId === 'bot_dossier_prev') {
        page = Math.max(1, page - 1);
      } else if (interaction.customId === 'bot_dossier_next') {
        page = Math.min(totalPages, page + 1);
      }

      return interaction.update(render()).catch(() => {});
    });
  },
};
