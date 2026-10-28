const { sendSoundboardLog } = require('../Utils/soundboardLogs');

module.exports = {
  name: 'guildSoundboardSoundsUpdate',
  async execute(soundboardSounds, guild, bot) {
    if (!guild?.id) return;

    await sendSoundboardLog(bot, guild.id, 'sounds_update', {
      sounds: soundboardSounds,
      guild,
    });
  },
};
