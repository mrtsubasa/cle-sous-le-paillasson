const fs = require('fs');
const { getPresenceFile } = require('../Utils/presencePath');

const fetchWithTimeout = (promise, ms = 2000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    ),
  ]);
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchGuildInviteState = async (guild) => {
  const inviteState = {
    invites: new Map(),
    timestamp: Date.now(),
  };

  try {
    const invites = await fetchWithTimeout(guild.invites.fetch(), 3000);
    for (const invite of invites.values()) {
      inviteState.invites.set(invite.code, invite.uses ?? 0);
    }
  } catch (err) {
    //console.error(`[READY] Impossible de charger les invites pour ${guild.id}:`, err?.message || err);
  }

  return inviteState;
};

module.exports = {
  name: 'clientReady',
  async execute(bot) {
    const presenceFile = getPresenceFile(bot);

    bot.inviteStateCache = bot.inviteStateCache instanceof Map ? bot.inviteStateCache : new Map();
    let presenceApplied = false;

    try {
      if (presenceFile && fs.existsSync(presenceFile)) {
        const raw = fs.readFileSync(presenceFile, 'utf8');
        const saved = JSON.parse(raw);

        const status = ['online', 'idle', 'dnd', 'invisible'].includes(saved.status) ? saved.status : 'idle';
        const activityName = typeof saved.activityName === 'string' ? saved.activityName.trim() : '';
        const activityType = Number.isInteger(saved.activityType) ? saved.activityType : 4;
        const activityUrl = typeof saved.activityUrl === 'string' ? saved.activityUrl.trim() : '';
        const activityEmoji = typeof saved.activityEmoji === 'string' ? saved.activityEmoji.trim() : '';

        await bot.user.setPresence({
          status,
          activities: activityName
            ? [{
                name: activityType === 4 ? 'Custom Status' : activityName,
                type: activityType,
                ...(activityType === 4
                  ? { state: `${activityEmoji ? `${activityEmoji} ` : ''}${activityName}`.trim() }
                  : {}),
                ...(activityType === 1 && activityUrl ? { url: activityUrl } : {}),
              }]
            : [],
        });
        presenceApplied = true;
      }
    } catch (err) {
      console.error('Erreur chargement presence sauvegardee:', err);
    }

    if (!presenceApplied) {
      try {
        await bot.user.setPresence({ activities: [{ name: 'discord.gg/zix', type: 4 }], status: 'dnd' });
      } catch (err) {
        console.error('Erreur presence par defaut:', err);
      }
    }

    for (const guild of bot.guilds.cache.values()) {
      const state = await fetchGuildInviteState(guild);
      bot.inviteStateCache.set(guild.id, state);
      await delay(500);
    }

    if (!bot._inviteGuildCreateHooked) {
      bot._inviteGuildCreateHooked = true;
      bot.on('guildCreate', async (guild) => {
        const state = await fetchGuildInviteState(guild);
        bot.inviteStateCache.set(guild.id, state);
      });
    }
  },
}
