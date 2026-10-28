const fs = require('fs');
const path = require('path');

function findBotRoot(startDir) {
  let current = startDir;

  while (current && current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'config.json')) && fs.existsSync(path.join(current, 'package.json'))) {
      return current;
    }

    current = path.dirname(current);
  }

  return path.resolve(startDir, '..');
}

function getRuntimePresenceFile(bot, startDir = __dirname) {
  const botRoot = findBotRoot(startDir);
  const parts = botRoot.split(path.sep);
  const botRuntimesIndex = parts.lastIndexOf('BotRuntimes');

  if (botRuntimesIndex !== -1) {
    return path.join(botRoot, 'botpresence.json');
  }

  const botsFoldersIndex = parts.lastIndexOf('BotsFolders');
  const templateName = botsFoldersIndex !== -1 ? parts[botsFoldersIndex + 1] : path.basename(botRoot);
  const workspaceRoot = botsFoldersIndex !== -1
    ? parts.slice(0, botsFoldersIndex).join(path.sep) || path.sep
    : path.dirname(path.dirname(botRoot));
  const runtimesRoot = path.join(workspaceRoot, 'BotRuntimes');
  const botId = bot?.user?.id || bot?.application?.id || bot?.client?.user?.id;

  if (!botId) return null;

  let runtimeName = `${botId}_${templateName}`;
  try {
    const matchingRuntime = fs.readdirSync(runtimesRoot)
      .find((name) => name === runtimeName || name.startsWith(`${runtimeName}_`));
    if (matchingRuntime) runtimeName = matchingRuntime;
  } catch {
    return null;
  }

  return path.join(runtimesRoot, runtimeName, 'botpresence.json');
}

function getPresenceFile(bot, startDir = __dirname) {
  return getRuntimePresenceFile(bot, startDir);
}

function ensurePresenceDir(presenceFile) {
  if (!presenceFile) return false;
  fs.mkdirSync(path.dirname(presenceFile), { recursive: true });
  return true;
}

module.exports = {
  ensurePresenceDir,
  getPresenceFile,
};
