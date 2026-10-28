const { resolveInviteLogData, sendInviteLog } = require('../Utils/inviteLogs');

module.exports = {
  name: 'inviteDelete',
  async execute(invite, bot) {
    if (!invite?.guild) return;

    const data = await resolveInviteLogData(invite, 'delete');
    if (!data) return;

    await sendInviteLog(bot, invite.guild.id, 'delete', {
      ...data,
    });
  },
};
