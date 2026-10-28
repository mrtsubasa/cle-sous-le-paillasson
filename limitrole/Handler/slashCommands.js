const fs = require('fs');
const path = require('path');
const { loadRuntimeConfig } = require('../../../Utils/runtimeContext');

function readJsonConfigSafe(configPath) {
  try {
    if (!fs.existsSync(configPath)) return null;
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
}

function collectSlashCommandFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectSlashCommandFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

function getSlashCommandDirs() {
  const runtimeSlashDir = path.join(__dirname, '..', 'SlashCommands');
  const runtimeConfig = loadRuntimeConfig();
  const templateSlashDir = runtimeConfig?.type
    ? path.resolve(__dirname, '..', '..', '..', 'BotsFolders', runtimeConfig.type, 'SlashCommands')
    : null;

  return [...new Set([runtimeSlashDir, templateSlashDir].filter((dir) => dir && fs.existsSync(dir)))];
}

module.exports = (bot) => {
  const commandsByName = new Map();
  const commandDirs = getSlashCommandDirs();
  const commandFiles = commandDirs.flatMap((dir) => collectSlashCommandFiles(dir));

  console.log(
    `[SLASH-COMMAND] scan dirs=${commandDirs.map((dir) => path.basename(dir)).join(', ') || 'none'} files=${commandFiles.length}`
  );

  for (const filePath of commandFiles) {
    const props = require(filePath);

    if (!props?.name) continue;

    if (commandsByName.has(props.name)) {
      console.log(`[SLASH-COMMAND] duplicate ignored ▸ ${props.name} (${filePath})`);
      continue;
    }

    commandsByName.set(props.name, props);
    bot.slashCommands.set(props.name, props);
    console.log(`[SLASH-COMMAND] ▸ ${filePath}`);
  }

  bot.arrayOfSlashCommands = Array.from(commandsByName.values());
};
