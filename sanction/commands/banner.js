const { noCard, permissionCard } = require('../utils/cards');
const { hasPermissionForCommand } = require('../utils/permissions');
const { resolveMember } = require('../utils/resolvers');

function buildUserBannerCard(user, bannerUrl) {
  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 10, content: `# Banni\u00e8re de ${user.tag}` },
        { type: 12, items: [{ media: { url: bannerUrl } }] }
      ]
    }]
  };
}

function buildServerBannerCard(guild, bannerUrl) {
  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 10, content: `# Banni\u00e8re de ${guild.name}` },
        { type: 12, items: [{ media: { url: bannerUrl } }] }
      ]
    }]
  };
}

async function fetchUserBanner(client, userId) {
  const user = await client.users.fetch(String(userId), { force: true }).catch(() => null);
  if (!user) return null;
  const bannerUrl = user.bannerURL({ size: 4096, extension: 'png' });
  return {
    user,
    bannerUrl
  };
}

module.exports = {
  name: 'banner',
  async executePrefix(message, args) {
    if (!hasPermissionForCommand(message.member, 'banner')) {
      return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    const firstArg = String(args[0] || '').toLowerCase();
    const wantsServer = firstArg === 'server' || firstArg === 'serveur';

    if (wantsServer) {
      const bannerUrl = message.guild.bannerURL({ size: 4096, extension: 'png' });
      if (!bannerUrl) {
        return message.reply({ ...noCard("Ce serveur n'a pas de banni\u00e8re"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
      }

      const card = buildServerBannerCard(message.guild, bannerUrl);
      return message.reply({ ...card, allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    let targetMember = null;
    if (args[0]) {
      targetMember = await resolveMember(message, args[0]);
      if (!targetMember) {
        return message.reply({ ...noCard('Membre non trouv\u00e9'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
      }
    } else {
      targetMember = message.member;
    }

    const result = await fetchUserBanner(message.client, targetMember.id);
    if (!result || !result.bannerUrl) {
      return message.reply({ ...noCard("Ce membre n'a pas de banni\u00e8re"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    const card = buildUserBannerCard(result.user, result.bannerUrl);
    return message.reply({ ...card, allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }
};
