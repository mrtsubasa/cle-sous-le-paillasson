const http = require('http');
const config = require('../config.json');

function getBaseUrl() {
  const port = Number(process.env.BOTS_API_PORT || 3000);
  return `http://127.0.0.1:${port}`;
}

function getApiSecret() {
  return process.env.BOTS_API_KEY || config.api?.key || null;
}

const DEFAULT_TIMEOUT_MS = 5000;
const ACTION_TIMEOUT_MS = 15000;

function requestJson(method, pathname, body = null, options = {}) {
  const payload = body ? JSON.stringify(body) : null;
  const url = new URL(pathname, getBaseUrl());
  const secret = getApiSecret();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let settled = false;
    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...(secret ? { 'x-api-key': secret } : {}),
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');

        res.on('data', (chunk) => {
          raw += chunk;
        });

        res.on('end', () => {
          if (settled) return;
          settled = true;
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            data = raw;
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
            return;
          }

          const error = new Error(data?.error || `HTTP ${res.statusCode}`);
          error.statusCode = res.statusCode;
          error.body = data;
          reject(error);
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      if (settled) return;
      settled = true;
      const error = new Error(`API_TIMEOUT_${timeoutMs}MS`);
      req.destroy(error);
      reject(error);
    });

    req.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });

    if (payload) req.write(payload);
    req.end();
  });
}

async function getInstanceStatus(instanceName, options = {}) {
  return requestJson('GET', `/bots/${encodeURIComponent(instanceName)}`, null, options);
}

async function getBotStatus(botId, options = {}) {
  return requestJson('GET', `/bots/${encodeURIComponent(botId)}`, null, options);
}

async function startInstance(instanceName, payload = {}, options = {}) {
  return requestJson('POST', `/bots/${encodeURIComponent(instanceName)}/action`, {
    action: 'start',
    ...payload,
  }, { timeoutMs: options.timeoutMs ?? ACTION_TIMEOUT_MS });
}

async function stopInstance(instanceName, payload = {}, options = {}) {
  return requestJson('POST', `/bots/${encodeURIComponent(instanceName)}/action`, {
    action: 'stop',
    ...payload,
  }, { timeoutMs: options.timeoutMs ?? ACTION_TIMEOUT_MS });
}

async function restartInstance(instanceName, payload = {}, options = {}) {
  return requestJson('POST', `/bots/${encodeURIComponent(instanceName)}/action`, {
    action: 'restart',
    ...payload,
  }, { timeoutMs: options.timeoutMs ?? ACTION_TIMEOUT_MS });
}

async function performBotAction(botId, action, payload = {}, options = {}) {
  return requestJson('POST', `/bots/${encodeURIComponent(botId)}/action`, {
    ...payload,
    action,
  }, { timeoutMs: options.timeoutMs ?? ACTION_TIMEOUT_MS });
}

module.exports = {
  getApiSecret,
  getBotStatus,
  getInstanceStatus,
  performBotAction,
  restartInstance,
  startInstance,
  stopInstance,
};
