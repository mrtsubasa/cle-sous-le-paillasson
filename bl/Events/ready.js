const fs = require('fs');
const { getPresenceFile } = require('../Utils/presencePath');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client, bot) {
    const presenceFile = getPresenceFile(bot || client);

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

        return;
      }
    } catch (err) {
      console.error('Erreur chargement presence sauvegardee:', err);
    }

    try {
      await bot.user.setPresence({
        activities: [{ name: 'discord.gg/zix', type: 4 }],
        status: 'idle',
      });
    } catch (err) {
      console.error('Erreur presence par defaut:', err);
    }
  },
};
