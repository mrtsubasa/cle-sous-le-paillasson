const {
  getSoundboardAuditEntry,
  sendSoundboardLog,
} = require('../Utils/soundboardLogs');

const recentSoundboardUpdates = new Map();

module.exports = {
  name: 'guildSoundboardSoundUpdate',
  async execute(oldSoundboardSound, newSoundboardSound, bot) {
    if (!newSoundboardSound?.guild) return;

    const lastLogAt = recentSoundboardUpdates.get(newSoundboardSound.soundId) || 0;
    if (Date.now() - lastLogAt < 1500) return;
    recentSoundboardUpdates.set(newSoundboardSound.soundId, Date.now());

    const auditEntry = await getSoundboardAuditEntry(newSoundboardSound.guild, newSoundboardSound.soundId, 'update');
    await sendSoundboardLog(bot, newSoundboardSound.guild.id, 'update', {
      executor: auditEntry?.executor,
      oldSound: oldSoundboardSound,
      sound: newSoundboardSound,
    });
  },
};
