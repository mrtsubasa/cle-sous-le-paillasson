const fs = require('fs');
const path = require('path');

const BOTS_FOLDERS_DIR = path.resolve(__dirname, '..', 'BotsFolders');

function getBotTypes() {
  if (!fs.existsSync(BOTS_FOLDERS_DIR)) return [];

  return fs
    .readdirSync(BOTS_FOLDERS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function autocompleteBotType(interaction) {
  const focused = interaction.options.getFocused(true);
  if (focused?.name !== 'type') {
    return interaction.respond([]);
  }

  const query = String(focused.value || '').trim().toLowerCase();
  const choices = getBotTypes()
    .filter((type) => !query || type.toLowerCase().includes(query))
    .slice(0, 25)
    .map((type) => ({ name: type, value: type }));

  return interaction.respond(choices);
}

module.exports = {
  autocompleteBotType,
  getBotTypes,
};
