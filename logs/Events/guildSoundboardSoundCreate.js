const {
  getSoundboardAuditEntry,
  sendSoundboardLog,
} = require('../Utils/soundboardLogs');

module.exports = {
  name: 'guildSoundboardSoundCreate',
  async execute(soundboardSound, bot) {
    if (!soundboardSound?.guild) return;

    const auditEntry = await getSoundboardAuditEntry(soundboardSound.guild, soundboardSound.soundId, 'create');
    await sendSoundboardLog(bot, soundboardSound.guild.id, 'create', {
      executor: auditEntry?.executor || soundboardSound.user,
      sound: soundboardSound,
    });
  },
};
