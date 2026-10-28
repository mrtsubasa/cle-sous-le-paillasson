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

function parseFolderPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.includes('..')) return null;
  return raw.replace(/^\/+/, '').replace(/\\/g, '/');
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
      lines.push(...buildTreeLines(path.join(dirPath, entry.name), nextPrefix));
    }
  }

  return lines;
}

function collectRuntimeEntries(dirPath, base = '') {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return [];

  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  const items = [];

  for (const entry of entries) {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    items.push({
      name: entry.isDirectory() ? `${relative}/` : relative,
      value: relative,
      isDir: entry.isDirectory(),
    });

    if (entry.isDirectory()) {
      items.push(...collectRuntimeEntries(path.join(dirPath, entry.name), relative));
    }
  }

  return items;
}

function collectRuntimeDirectories(dirPath, base = '') {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return [];

  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  const items = [];

  for (const entry of entries) {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      items.push({
        name: `${relative}/`,
        value: relative,
      });
      items.push(...collectRuntimeDirectories(path.join(dirPath, entry.name), relative));
    }
  }

  return items;
}

function collectRuntimeFiles(dirPath, base = '') {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return [];

  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  const items = [];

  for (const entry of entries) {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isFile()) {
      items.push({
        name: relative,
        value: relative,
      });
    } else if (entry.isDirectory()) {
      items.push(...collectRuntimeFiles(path.join(dirPath, entry.name), relative));
    }
  }

  return items;
}

function buildRuntimeEntries(rootDir) {
  return collectRuntimeEntries(rootDir).map((entry) => ({
    ...entry,
    normalizedValue: entry.value.replace(/\\/g, '/').replace(/^\/+/, ''),
    normalizedName: entry.name.replace(/\\/g, '/').replace(/^\/+/, ''),
    baseName: path.posix.basename(entry.value).toLowerCase(),
  }));
}

function resolveUniqueEntry(entries, input) {
  const normalizedInput = parseFolderPath(input);
  if (!normalizedInput) return null;

  const lowered = normalizedInput.toLowerCase();
  const exactMatches = entries.filter((entry) => entry.normalizedValue.toLowerCase() === lowered);
  if (exactMatches.length === 1) return exactMatches[0];

  const basename = path.posix.basename(normalizedInput).toLowerCase();
  const baseMatches = entries.filter((entry) => entry.baseName === basename);
  if (baseMatches.length === 1) return baseMatches[0];

  const rootExact = entries.find((entry) => entry.normalizedValue.toLowerCase() === basename);
  if (rootExact) return rootExact;

  return null;
}

function resolveRuntimeTarget(rootDir, folderInput, fileInput) {
  const normalizedFolder = parseFolderPath(folderInput);
  const normalizedFile = parseFolderPath(fileInput);
  const entries = buildRuntimeEntries(rootDir);

  if (!normalizedFolder && !normalizedFile) {
    return {
      targetPath: rootDir,
      resolvedLabel: 'racine',
      isFile: false,
    };
  }

  if (normalizedFile && !normalizedFolder) {
    const directFile = path.resolve(rootDir, normalizedFile);
    if (isInsideBotRuntimes(directFile) && fs.existsSync(directFile)) {
      const stat = fs.statSync(directFile);
      return {
        targetPath: directFile,
        resolvedLabel: normalizedFile,
        isFile: stat.isFile(),
      };
    }

    const uniqueFile = resolveUniqueEntry(entries.filter((entry) => !entry.isDir), normalizedFile);
    if (uniqueFile) {
      const targetPath = path.resolve(rootDir, uniqueFile.value);
      const stat = fs.statSync(targetPath);
      return {
        targetPath,
        resolvedLabel: uniqueFile.value,
        isFile: stat.isFile(),
      };
    }
  }

  if (normalizedFolder && normalizedFile) {
    const directPath = path.resolve(rootDir, normalizedFolder, normalizedFile);
    if (isInsideBotRuntimes(directPath) && fs.existsSync(directPath)) {
      const stat = fs.statSync(directPath);
      return {
        targetPath: directPath,
        resolvedLabel: `${normalizedFolder}/${normalizedFile}`,
        isFile: stat.isFile(),
      };
    }
  }

  const combinedInput = [normalizedFolder, normalizedFile].filter(Boolean).join('/');
  const directPath = combinedInput ? path.resolve(rootDir, combinedInput) : null;
  if (directPath && isInsideBotRuntimes(directPath) && fs.existsSync(directPath)) {
    const stat = fs.statSync(directPath);
    return {
      targetPath: directPath,
      resolvedLabel: combinedInput,
      isFile: stat.isFile(),
    };
  }

  const normalizedInput = combinedInput.replace(/\\/g, '/').replace(/^\/+/, '');
  const exactMatch = entries.find((entry) => entry.normalizedValue.toLowerCase() === normalizedInput.toLowerCase());
  if (exactMatch) {
    const targetPath = path.resolve(rootDir, exactMatch.value);
    const stat = fs.statSync(targetPath);
    return {
      targetPath,
      resolvedLabel: exactMatch.value,
      isFile: stat.isFile(),
    };
  }

  const uniqueMatch = resolveUniqueEntry(entries, normalizedInput);
  if (uniqueMatch) {
    const targetPath = path.resolve(rootDir, uniqueMatch.value);
    const stat = fs.statSync(targetPath);
    return {
      targetPath,
      resolvedLabel: uniqueMatch.value,
      isFile: stat.isFile(),
    };
  }

  return {
    targetPath: null,
    resolvedLabel: null,
    isFile: false,
    candidates: entries
      .filter((entry) => entry.baseName === path.posix.basename(normalizedInput).toLowerCase())
      .slice(0, 8)
      .map((entry) => entry.value),
  };
}

function readFileLines(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split(/\r?\n/);
  } catch {
    return ['[Impossible de lire le fichier]'];
  }
}

function buildPage(lines, page, totalPages, botId, storageId, folderPath, isFile = false) {
  const pageIndex = Math.min(Math.max(page, 1), totalPages);
  const start = (pageIndex - 1) * PAGE_SIZE;
  const pageLines = lines.slice(start, start + PAGE_SIZE);
  const folderLabel = folderPath ? `\`${folderPath}\`` : '`racine`';

  const container = buildPanel(
    `# Structure de ${botId}`,
    [
      `> **BotId:** \`${botId}\``,
      `> **Dossier runtime:** \`${storageId}\``,
      `> **Dossier consulté:** ${folderLabel}`,
      `> **Page:** ${pageIndex}/${totalPages}`,
      pageLines.length > 0
        ? `\`\`\`\n${pageLines.join('\n')}\n\`\`\``
        : isFile
          ? '> *Le fichier est vide*'
          : '> *Le dossier est vide*',
    ]
  );

  if (totalPages > 1) {
    container.addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
    );
    container.addActionRowComponents(
      new Discord.ActionRowBuilder().addComponents(
        new Discord.ButtonBuilder()
          .setCustomId('bot_structure_prev')
          .setLabel('⬅')
          .setStyle(Discord.ButtonStyle.Secondary)
          .setDisabled(pageIndex <= 1),
        new Discord.ButtonBuilder()
          .setCustomId('bot_structure_next')
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

async function autocomplete(interaction, bot) {
  const botId = interaction.options.getString('botid');
  if (!botId) {
    return interaction.respond([]);
  }

  const row = bot.db.prepare('SELECT * FROM bot WHERE botId = ?').get(botId);
  if (!row) {
    return interaction.respond([]);
  }

  const storageId = getBotStorageId(row);
  const rootDir = getBotRootDir(storageId);
  if (!isInsideBotRuntimes(rootDir) || !fs.existsSync(rootDir)) {
    return interaction.respond([]);
  }

  const focused = interaction.options.getFocused(true) || { name: 'dossier', value: '' };
  const query = String(interaction.options.getFocused(true)?.value || '').toLowerCase();
  if (focused.name === 'dossier') {
    const entries = collectRuntimeDirectories(rootDir);
    const filtered = entries
      .filter((entry) => !query || entry.value.toLowerCase().includes(query) || entry.name.toLowerCase().includes(query))
      .slice(0, 25)
      .map((entry) => ({
        name: entry.name.length > 100 ? `${entry.name.slice(0, 97)}...` : entry.name,
        value: entry.value,
      }));

    return interaction.respond(filtered);
  }

  const folderInput = parseFolderPath(interaction.options.getString('dossier'));
  const baseDir = folderInput ? path.resolve(rootDir, folderInput) : rootDir;
  if (!isInsideBotRuntimes(baseDir) || !fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
    return interaction.respond([]);
  }

  const entries = collectRuntimeFiles(baseDir, folderInput || '');
  const filtered = entries
    .filter((entry) => !query || entry.value.toLowerCase().includes(query) || entry.name.toLowerCase().includes(query))
    .slice(0, 25)
    .map((entry) => ({
      name: entry.name.length > 100 ? `${entry.name.slice(0, 97)}...` : entry.name,
      value: entry.value,
    }));

  return interaction.respond(filtered);
}

module.exports = {
  name: 'bot-structure',
  description: 'Affiche le contenu d\'un dossier runtime précis d\'un bot',
  permission: 'Aucune',
  dm: true,
  autocomplete,
  options: [
    {
      type: 'string',
      name: 'botid',
      description: 'L\'identifiant du bot à consulter',
      required: true,
      autocomplete: false,
    },
    {
      type: 'string',
      name: 'dossier',
      description: 'Le dossier du runtime à afficher ou un fichier seul à résoudre automatiquement',
      required: false,
      autocomplete: true,
    },
    {
      type: 'string',
      name: 'fichier',
      description: 'Le fichier à afficher (ex: config.json, index.js)',
      required: false,
      autocomplete: true,
    },
  ],

  async run(bot, message, args) {
    if (!hasAdminAccess(message)) {
      return buildAccessError(message);
    }

    const botId = args.getString('botid');
    const folderInput = parseFolderPath(args.getString('dossier'));
    const fileInput = parseFolderPath(args.getString('fichier'));
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
    const rootDir = getBotRootDir(storageId);

    if (!isInsideBotRuntimes(rootDir) || !fs.existsSync(rootDir)) {
      return message.reply({
        components: [
          buildPanel('# <:croix:1505270277796397146> Dossier introuvable', [`> *Le dossier du bot \`${storageId}\` est introuvable*`]),
        ],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const resolved = resolveRuntimeTarget(rootDir, folderInput, fileInput);
    if (!resolved.targetPath) {
      return message.reply({
        components: [
          buildPanel(
            '# <:croix:1505270277796397146> Dossier introuvable',
            [
              `> *Le chemin \`${[folderInput, fileInput].filter(Boolean).join('/') || 'racine'}\` n'existe pas dans le runtime du bot*`,
              resolved.candidates?.length > 1 ? `> *Précise le dossier complet: ${resolved.candidates.map((item) => `\`${item}\``).join(', ')}*` : null,
            ].filter(Boolean)
          ),
        ],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      });
    }

    const lines = resolved.isFile ? readFileLines(resolved.targetPath) : buildTreeLines(resolved.targetPath);
    const totalPages = Math.max(1, Math.ceil(lines.length / PAGE_SIZE));
    let page = 1;

    const render = () => ({
      components: [buildPage(lines, page, totalPages, botId, storageId, resolved.resolvedLabel, resolved.isFile)],
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
        (interaction.customId === 'bot_structure_prev' || interaction.customId === 'bot_structure_next'),
      time: 10 * 60 * 1000,
    });

    collector.on('collect', async (interaction) => {
      if (interaction.customId === 'bot_structure_prev') {
        page = Math.max(1, page - 1);
      } else if (interaction.customId === 'bot_structure_next') {
        page = Math.min(totalPages, page + 1);
      }

      return interaction.update(render()).catch(() => {});
    });
  },
};
