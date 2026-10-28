const supportStates = new Map();

module.exports = {
  name: 'presenceUpdate',
  once: false,
  execute: async (oldPresence, newPresence, bot) => {
    try {
      if (!newPresence?.guild) return;
      const member = newPresence.member;
      if (!member || member.user.bot) return;

      const oldStatusText = oldPresence?.activities?.find(a => a.type === 4)?.state?.toLowerCase() || '';
      const newStatusText = newPresence.activities?.find(a => a.type === 4)?.state?.toLowerCase() || '';

      if (oldStatusText === newStatusText) {
        return;
      }

      const guildData = await bot.db.prepare(
        'SELECT supportRoles, supportKeywords, supportEnabled FROM guilds WHERE id = ?'
      ).get(newPresence.guild.id);

      if (!guildData) return;

      const supportEnabled = Number(guildData.supportEnabled);
      if (supportEnabled !== 1) {
        return;
      }

      const roles = JSON.parse(guildData.supportRoles || '[]');
      const keywords = JSON.parse(guildData.supportKeywords || '[]');

      if (!roles.length || !keywords.length) return;

      const hasKeyword = keywords.some(k =>
        newStatusText.includes(k.toLowerCase())
      );

      const previousKeywordState = supportStates.get(member.id);
      if (previousKeywordState !== undefined && previousKeywordState === hasKeyword) {
        return;
      }

      let changed = false;

      for (const roleId of roles) {
        if (hasKeyword && !member.roles.cache.has(roleId)) {
          await member.roles.add(roleId).catch(() => {});
          changed = true;
        } else if (!hasKeyword && member.roles.cache.has(roleId)) {
          await member.roles.remove(roleId).catch(() => {});
          changed = true;
        }
      }

      supportStates.set(member.id, hasKeyword);

    } catch (err) {
      console.error('[SUPPORT] presenceUpdate ERROR:', err);
    }
  }
};