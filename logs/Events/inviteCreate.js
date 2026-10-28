const { resolveInviteLogData, sendInviteLog } = require('../Utils/inviteLogs');

module.exports = {
  name: 'inviteCreate',
  async execute(invite, bot) {
    if (!invite?.guild) return;

    const data = await resolveInviteLogData(invite, 'create');
    if (!data) return;

    await sendInviteLog(bot, invite.guild.id, 'create', {
      ...data,
    });
  },
};
