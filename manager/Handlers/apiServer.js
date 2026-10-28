const http = require('http');
const { URL } = require('url');
const path = require('path');
const botsService = require('./botsService');
const instanceService = require('./instanceService');
const { sendAdminActionLog } = require('../Utils/adminActionLog');
const { readJsonConfig } = require('../Utils/tokenVault');
const { getInterestedUserIdsFromRow } = require('../Utils/clientRoleManager');

function getActionLogKind(action) {
  if (action === 'start') return 'startLogs';
  if (action === 'stop') return 'stopLogs';
  if (action === 'restart') return 'restartLogs';
  return 'botActionLogs';
}

function getClientStartupLogKind(action) {
  if (action === 'start') return 'clientStartupLogs';
  if (action === 'stop') return 'clientStartupLogs';
  if (action === 'restart') return 'clientStartupLogs';
  return 'clientStartupLogs';
}

function getRuntimeConfigPath(row) {
  const storageId = row?.folder || row?.botId;
  if (!storageId) return null;

  return path.join(__dirname, '..', 'BotRuntimes', storageId, 'config.json');
}

function getBuyerInfo(row) {
  const runtimeConfigPath = getRuntimeConfigPath(row);
  const runtimeConfig = runtimeConfigPath ? readJsonConfig(runtimeConfigPath, { migrateToken: false }) : null;

  const buyers = [
    ...(Array.isArray(runtimeConfig?.buyers) ? runtimeConfig.buyers : []),
    ...(Array.isArray(runtimeConfig?.buyer) ? runtimeConfig.buyer : []),
  ]
    .filter(Boolean)
    .map(String);

  const buyerId = runtimeConfig?.ownerId || row?.ownerId || runtimeConfig?.buyerId || buyers[0] || null;
  const uniqueBuyers = [...new Set(buyers)];

  return {
    buyerId,
    buyerLabel: buyerId ? `<@${buyerId}> (\`${buyerId}\`)` : '`Inconnu`',
    buyers: uniqueBuyers,
  };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';

    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Corps trop volumineux.'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!raw.trim()) return resolve({});

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('JSON invalide.'));
      }
    });

    req.on('error', reject);
  });
}

function isAuthorized(req, secret) {
  if (!secret) return true;

  const headerSecret = req.headers['x-api-key'];
  const bearer = req.headers.authorization || '';
  const bearerSecret = bearer.startsWith('Bearer ') ? bearer.slice(7).trim() : null;

  return headerSecret === secret || bearerSecret === secret;
}

function unauthorized(res) {
  return sendJson(res, 401, {
    success: false,
    error: 'Unauthorized',
  });
}

function badRequest(res, message) {
  return sendJson(res, 400, {
    success: false,
    error: message,
  });
}

function notFound(res) {
  return sendJson(res, 404, {
    success: false,
    error: 'Route not found',
  });
}

function healthPayload() {
  return {
    success: true,
    service: 'bots-api',
    routes: [
      'GET /bots/:id',
      'POST /bots/:id/action',
      'GET /bots/list',
      'GET /bots/stats',
      'GET /bots/add',
      'POST /bots/add',
      'GET /bots/edit?botId=...',
      'PATCH /bots/edit',
      'POST /bots/edit',
      'GET /ping',
      'GET /instances/:id',
      'PATCH /instances/:id',
      'POST /instances/:id/start|stop',
    ],
  };
}

async function handleList(bot, url) {
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 25)));
  const ownerId = String(url.searchParams.get('ownerId') || '').trim();
  const rows = bot.db.prepare('SELECT * FROM bot ORDER BY CAST(time AS INTEGER) DESC, rowid DESC').all();
  const records = [];

  for (const row of rows) {
    const record = await botsService.buildBotRecord(bot, row, {
      liveStatus: false,
      resolveUser: true,
      resolveTokenValidity: true,
      includeAvatar: true,
    });

    if (ownerId) {
      const runtimeConfigPath = path.join(__dirname, '..', 'BotRuntimes', record.storageId, 'config.json');
      const runtimeConfig = readJsonConfig(runtimeConfigPath, { migrateToken: false });
      const interestedUserIds = getInterestedUserIdsFromRow(row, runtimeConfig);
      if (!interestedUserIds.includes(ownerId)) {
        continue;
      }
    }

    records.push(record);
  }

  const offset = (page - 1) * limit;
  const total = Number(records.length || 0);
  const pageRecords = records.slice(offset, offset + limit);

  return {
    success: true,
    page,
    limit,
    ownerId: ownerId || null,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    data: pageRecords,
  };
}

async function handleStats(bot) {
  return {
    success: true,
    data: await botsService.collectStats(bot, { fast: true }),
  };
}

async function handleAdd(bot, req) {
  const body = await readJsonBody(req);
  const result = await botsService.addBot(bot, body);
  return {
    success: true,
    data: result,
  };
}

async function handleEdit(bot, req, url) {
  const body = req.method === 'GET'
    ? { botId: url.searchParams.get('botId') }
    : await readJsonBody(req);

  if (!body.botId) {
    throw new Error('botId est obligatoire.');
  }

  if (req.method === 'GET') {
    const row = botsService.getBotRow(bot, body.botId);
    if (!row) {
      throw new Error(`Le bot ${body.botId} est introuvable.`);
    }

    return {
      success: true,
      data: {
        bot: await botsService.buildBotRecord(bot, row, {
          liveStatus: false,
        }),
        availableTypes: botsService.getBotTypes(),
      },
    };
  }

  const result = await botsService.editBot(bot, body);
  return {
    success: true,
    data: result,
  };
}

function getInstanceName(url) {
  return String(url.searchParams.get('storageId') || url.searchParams.get('name') || '').trim();
}

function getBotRouteId(pathname) {
  const match = pathname.match(/^\/bots\/([^/]+)$/);
  return match ? match[1] : null;
}

function getBotActionRoute(pathname) {
  const match = pathname.match(/^\/bots\/([^/]+)\/action$/);
  return match ? match[1] : null;
}

function getRowForInstance(bot, instanceName) {
  return bot.db.prepare('SELECT * FROM bot WHERE folder = ? OR botId = ?').get(instanceName, instanceName);
}

async function handleInstanceGet(instanceName) {
  if (!instanceName) {
    throw new Error("L'identifiant d'instance est obligatoire.");
  }

  return {
    success: true,
    data: instanceService.getInstanceStatus(instanceName),
  };
}

async function handleInstancePatch(req, instanceName) {
  if (!instanceName) {
    throw new Error("L'identifiant d'instance est obligatoire.");
  }
  const body = await readJsonBody(req);

  const updated = instanceService.writeInstanceConfig(instanceName, body);
  return {
    success: true,
    data: {
      name: instanceName,
      config: updated,
    },
  };
}

async function handleInstanceAction(bot, instanceName, action) {
  if (!instanceName) {
    throw new Error("L'identifiant d'instance est obligatoire.");
  }

  instanceService.performInstanceAction(instanceName, action);
  const row = bot ? getRowForInstance(bot, instanceName) : null;
  if (row) {
    bot.db.prepare('UPDATE bot SET started = ? WHERE botId = ?').run(action === 'stop' ? 'false' : 'true', row.botId);
  }

  return {
    success: true,
    data: instanceService.getInstanceStatus(instanceName),
  };
}

async function handleBotGet(botId) {
  if (!botId) {
    throw new Error("L'identifiant du bot est obligatoire.");
  }

  return {
    success: true,
    data: instanceService.getInstanceStatus(botId),
  };
}

async function handleBotAction(bot, botId, req) {
  if (!botId) {
    throw new Error("L'identifiant du bot est obligatoire.");
  }

  const body = await readJsonBody(req);
  const action = String(body.action || '').trim().toLowerCase();
  if (!['start', 'stop', 'restart'].includes(action)) {
    throw new Error("L'action est invalide.");
  }
  const suppressLogs = Boolean(body.suppressLogs);

  instanceService.performInstanceAction(botId, action);
  const row = bot ? getRowForInstance(bot, botId) : null;
  if (row) {
    bot.db.prepare('UPDATE bot SET started = ? WHERE botId = ?').run(action === 'stop' ? 'false' : 'true', row.botId);
  }

  if (bot && row && !suppressLogs) {
    const buyerInfo = getBuyerInfo(row);
    const logLines = [
      `> **Bot:** <@${row.botId}> (\`${row.botId}\`)`,
      `> **Buyer:** ${buyerInfo.buyerLabel}`,
      buyerInfo.buyers.length > 1 ? `> **Buyers liés:** ${buyerInfo.buyers.map((id) => `<@${id}>`).join(', ')}` : null,
      `> **Type:** \`${row.type || 'inconnu'}\``,
      `> **Dossier:** \`${row.folder || row.botId}\``,
      `> **Action:** ${action === 'start' ? 'Démarrage' : action === 'stop' ? 'Arrêt' : 'Redémarrage'}`,
      `> **État:** ${action === 'stop' ? 'arrêté' : 'démarré'}`,
    ].filter(Boolean);

    Promise.all([
      sendAdminActionLog(
        bot,
        getActionLogKind(action),
        action === 'start' ? '# Bot démarré' : action === 'stop' ? '# Bot arrêté' : '# Bot redémarré',
        logLines,
        ['botActionLogs', 'logs']
      ),
      sendAdminActionLog(
        bot,
        getClientStartupLogKind(action),
        action === 'start' ? '# Client démarré' : action === 'stop' ? '# Client arrêté' : '# Client redémarré',
        [
          `> **Bot:** <@${row.botId}> (\`${row.botId}\`)`,
          `> **Buyer:** ${buyerInfo.buyerLabel}`,
          buyerInfo.buyers.length > 1 ? `> **Buyers liés:** ${buyerInfo.buyers.map((id) => `<@${id}>`).join(', ')}` : null,
          `> **Type:** \`${row.type || 'inconnu'}\``,
          `> **Dossier:** \`${row.folder || row.botId}\``,
        ].filter(Boolean),
        ['botActionLogs', 'logs']
      ),
    ]).catch((error) => {
      console.log(`[API] Envoi des logs ${action} échoué pour ${botId}: ${error.message}`);
    });
  }

  return {
    success: true,
    data: {
      action,
      ...instanceService.getInstanceStatus(botId),
    },
  };
}

function createApiServer(bot) {
  instanceService.setManagerBot(bot);

  const secret = botsService.getApiSecret();
  const port = Number(process.env.BOTS_API_PORT || 3000);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const method = req.method || 'GET';

    try {
      if (!isAuthorized(req, secret)) {
        return unauthorized(res);
      }

      if (method === 'GET' && url.pathname === '/') {
        return sendJson(res, 200, healthPayload());
      }

      if (method === 'GET' && url.pathname === '/bots/list') {
        return sendJson(res, 200, await handleList(bot, url));
      }

      if (method === 'GET' && url.pathname === '/bots/stats') {
        return sendJson(res, 200, await handleStats(bot));
      }

      if (method === 'GET' && url.pathname === '/bots/add') {
        return sendJson(res, 200, {
          success: true,
          data: {
            fields: ['token', 'ownerId', 'type', 'duration'],
            availableTypes: botsService.getBotTypes(),
          },
        });
      }

      if (method === 'POST' && url.pathname === '/bots/add') {
        return sendJson(res, 201, await handleAdd(bot, req));
      }

      if ((method === 'GET' || method === 'PATCH' || method === 'POST') && url.pathname === '/bots/edit') {
        return sendJson(res, 200, await handleEdit(bot, req, url));
      }

      if (method === 'GET' && url.pathname === '/ping') {
        return sendJson(res, 200, { status: 'connected' });
      }

      const botRouteId = getBotRouteId(url.pathname);
      if (botRouteId && method === 'GET') {
        return sendJson(res, 200, await handleBotGet(botRouteId));
      }

      const botActionRouteId = getBotActionRoute(url.pathname);
      if (botActionRouteId && method === 'POST') {
        return sendJson(res, 200, await handleBotAction(bot, botActionRouteId, req));
      }

      const instanceRouteMatch = url.pathname.match(/^\/instances\/([^/]+)$/);
      if (instanceRouteMatch) {
        const instanceName = instanceRouteMatch[1];
        if (method === 'GET') {
          return sendJson(res, 200, await handleInstanceGet(instanceName));
        }

        if (method === 'PATCH') {
          return sendJson(res, 200, await handleInstancePatch(req, instanceName));
        }
      }

      const instanceActionMatch = url.pathname.match(/^\/instances\/([^/]+)\/(start|stop)$/);
      if (instanceActionMatch && method === 'POST') {
        const instanceName = instanceActionMatch[1];
        const action = instanceActionMatch[2];
        return sendJson(res, 200, await handleInstanceAction(bot, instanceName, action));
      }

      return notFound(res);
    } catch (error) {
      const statusCode = /obligatoire|invalide|introuvable|introuvable/i.test(error.message) ? 400 : 500;
      return sendJson(res, statusCode, {
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`\x1b[36m[BOTS API] serveur demarre sur http://127.0.0.1:${port}\x1b[0m`);
  });

  return server;
}

module.exports = createApiServer;
