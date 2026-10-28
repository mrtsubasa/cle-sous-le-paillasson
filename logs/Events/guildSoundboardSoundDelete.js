const {
  getSoundboardAuditEntry,
  sendSoundboardLog,
} = require('../Utils/soundboardLogs');

module.exports = {
  name: 'guildSoundboardSoundDelete',
  async execute(soundboardSound, bot) {
    if (!soundboardSound?.guild) return;

    const auditEntry = await getSoundboardAuditEntry(soundboardSound.guild, soundboardSound.soundId, 'delete');
    await sendSoundboardLog(bot, soundboardSound.guild.id, 'delete', {
      executor: auditEntry?.executor,
      sound: soundboardSound,
    });
  },
};
