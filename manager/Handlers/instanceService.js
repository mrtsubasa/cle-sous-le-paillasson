const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { readJsonConfig, writeJsonConfig } = require('../Utils/tokenVault');
const { getConsoleAlertSource, sendBotErrorLog } = require('../Utils/botErrorLog');

const runningInstances = new Map();
let managerBot = null;

function setManagerBot(bot) {
  managerBot = bot || null;
}

function getInstanceDir(instanceName) {
  const runtimeDir = path.join(__dirname, '..', 'BotRuntimes', instanceName);
  if (fs.existsSync(runtimeDir)) {
    return runtimeDir;
  }

  return path.join(__dirname, '..', 'BotsFolders', instanceName);
}

function getInstanceConfigPath(instanceName) {
  return path.join(getInstanceDir(instanceName), 'config.json');
}

function readInstanceConfig(instanceName) {
  const configPath = getInstanceConfigPath(instanceName);
  return readJsonConfig(configPath, { migrateToken: true });
}

function writeInstanceConfig(instanceName, patch) {
  const configPath = getInstanceConfigPath(instanceName);
  const current = readInstanceConfig(instanceName);

  if (!current) {
    throw new Error(`Le fichier config.json de l'instance ${instanceName} est introuvable ou invalide.`);
  }

  const next = {
    ...current,
    ...patch,
  };

  return writeJsonConfig(configPath, next);
}

function isRunning(instanceName) {
  const entry = runningInstances.get(instanceName);
  return Boolean(entry?.process && entry.process.exitCode === null && !entry.process.killed);
}

function startInstance(instanceName) {
  const instanceDir = getInstanceDir(instanceName);
  const indexPath = path.join(instanceDir, 'index.js');

  if (!fs.existsSync(indexPath)) {
    throw new Error(`Le fichier index.js de l'instance ${instanceName} est introuvable.`);
  }

  if (isRunning(instanceName)) {
    return runningInstances.get(instanceName);
  }

  const child = spawn('node', ['index.js'], {
    cwd: instanceDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      BOT_STORAGE_ID: instanceName,
    },
  });

  runningInstances.set(instanceName, { process: child, startedAt: Date.now() });

  child.stdout.on('data', (data) => {
    const output = data.toString().trim();
    console.log(`[INSTANCE ${instanceName}] ${output}`);

    const source = getConsoleAlertSource(output);
    if (source) {
      sendBotErrorLog(managerBot, instanceName, output, { source }).catch(() => {});
    }
  });

  child.stderr.on('data', (data) => {
    const output = data.toString().trim();
    console.error(`[INSTANCE ${instanceName} ERROR] ${output}`);
    sendBotErrorLog(managerBot, instanceName, output, {
      source: getConsoleAlertSource(output) || 'CMD ERROR',
    }).catch(() => {});
  });

  child.on('exit', (code, signal) => {
    console.log(`[INSTANCE ${instanceName}] [EXIT] code=${code}${signal ? ` signal=${signal}` : ''}`);
    if (code && code !== 0) {
      sendBotErrorLog(
        managerBot,
        instanceName,
        `Le processus s'est arrêté avec le code ${code}${signal ? ` (${signal})` : ''}.`,
        { source: 'PROCESS EXIT' }
      ).catch(() => {});
    }
    const entry = runningInstances.get(instanceName);
    if (entry?.process === child) {
      runningInstances.delete(instanceName);
    }
  });

  return runningInstances.get(instanceName);
}

function stopInstance(instanceName) {
  const entry = runningInstances.get(instanceName);
  if (!entry?.process) return false;

  if (!entry.process.killed) {
    entry.process.kill('SIGTERM');
  }

  runningInstances.delete(instanceName);
  return true;
}

function restartInstance(instanceName) {
  stopInstance(instanceName);
  return startInstance(instanceName);
}

function performInstanceAction(instanceName, action) {
  if (action === 'start') return startInstance(instanceName);
  if (action === 'stop') return stopInstance(instanceName);
  if (action === 'restart') return restartInstance(instanceName);
  throw new Error("L'action est invalide.");
}

function getInstanceStatus(instanceName) {
  return {
    name: instanceName,
    running: isRunning(instanceName),
    config: readInstanceConfig(instanceName),
    dir: getInstanceDir(instanceName),
  };
}

module.exports = {
  getInstanceConfigPath,
  getInstanceDir,
  getInstanceStatus,
  isRunning,
  readInstanceConfig,
  restartInstance,
  performInstanceAction,
  setManagerBot,
  startInstance,
  stopInstance,
  writeInstanceConfig,
};
