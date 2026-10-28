function ensureGuildProfileRow(bot, guildId) {
  if (!bot?.db || !guildId) return null;

  let row = bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
  if (!row) {
    bot.db.prepare('INSERT INTO guilds (id) VALUES (?)').run(guildId);
    row = bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
  }

  return row;
}

function loadGuildProfile(bot, guildId) {
  const row = ensureGuildProfileRow(bot, guildId);
  return {
    bio: typeof row?.serverProfileBio === 'string' ? row.serverProfileBio : '',
  };
}

function saveGuildProfile(bot, guildId, profile) {
  if (!bot?.db || !guildId) return { bio: '' };

  const bio = typeof profile?.bio === 'string' ? profile.bio : '';

  bot.db
    .prepare('UPDATE guilds SET serverProfileBio = ? WHERE id = ?')
    .run(bio, guildId);

  return { bio };
}

module.exports = {
  loadGuildProfile,
  saveGuildProfile,
};
