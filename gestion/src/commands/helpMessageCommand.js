const { MessageFlags } = require('discord.js');
const { buildHelpPayload, buildNoticePayload } = require('../utils/components');

async function runHelpMessageCommand(message, context) {
  const sent = await message.channel.send(
    buildHelpPayload({
      sessionId: 'pending',
      page: 0
    })
  );

  const session = context.sessionStore.createHelpSession({
    ownerId: message.author.id,
    channelId: message.channel.id,
    messageId: sent.id
  });

  await sent.edit(stripUpdateFlags(buildHelpPayload({ sessionId: session.id, page: 0 })));
  scheduleHelpExpire(context, session.id);
}

async function handleHelpInteraction(interaction, context) {
  if (!interaction.customId.startsWith('help:page:')) return false;

  const parts = interaction.customId.split(':');
  const sessionId = parts[2];
  const direction = parts[3];

  const session = context.sessionStore.getHelpSession(sessionId);
  if (!session) {
    await interaction.reply({
      ...buildNoticePayload({
        title: '# Session expirée',
        body: '> Le panneau d\'aide a expiré. Relancez `+helpmessage`.'
      }),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return true;
  }

  if (String(session.ownerId) !== String(interaction.user.id)) {
    await interaction.reply({
      ...buildNoticePayload({
        title: '# Action refusée',
        body: '> Seul l\'auteur de la commande peut changer de page.'
      }),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return true;
  }

  context.sessionStore.touchHelpSession(sessionId);
  if (direction === 'left') session.page = Math.max(0, session.page - 1);
  if (direction === 'right') session.page = Math.min(1, session.page + 1);

  await interaction.update({
    components: buildHelpPayload({ sessionId, page: session.page }).components,
    allowedMentions: { parse: [], repliedUser: false }
  });

  return true;
}

function scheduleHelpExpire(context, sessionId) {
  setTimeout(async () => {
    const session = context.sessionStore.getHelpSession(sessionId);
    if (!session) return;
    context.sessionStore.deleteHelpSession(sessionId);

    try {
      const channel = await context.client.channels.fetch(session.channelId);
      if (!channel || !channel.isTextBased()) return;
      const message = await channel.messages.fetch(session.messageId);
      await message.edit(stripUpdateFlags(buildHelpPayload({ sessionId, page: session.page, disabled: true })));
    } catch {
      // Ignore missing message.
    }
  }, 5 * 60 * 1000).unref();
}

module.exports = {
  runHelpMessageCommand,
  handleHelpInteraction
};

function stripUpdateFlags(payload) {
  return {
    components: payload.components,
    allowedMentions: payload.allowedMentions
  };
}
