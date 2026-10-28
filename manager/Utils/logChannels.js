const config = require('../config.json');

function getChannelId(...keys) {
  for (const key of keys.flat()) {
    if (!key) continue;
    const value = config.channel?.[key];
    if (value) return value;
  }

  return null;
}

function getLogChannelId(kind = 'logs', fallbackKinds = []) {
  return getChannelId([kind, ...fallbackKinds, 'logs']);
}

module.exports = {
  getChannelId,
  getLogChannelId,
};
