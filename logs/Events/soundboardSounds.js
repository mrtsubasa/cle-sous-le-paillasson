const { sendSoundboardLog } = require('../Utils/soundboardLogs');

module.exports = {
  name: 'soundboardSounds',
  async execute(soundboardSounds, guild, bot) {
    if (!guild?.id) return;

    await sendSoundboardLog(bot, guild.id, 'sounds', {
      sounds: soundboardSounds,
      guild,
    });
  },
};
