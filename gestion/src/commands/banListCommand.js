const {
  ContainerBuilder,
  MessageFlags,
  SeparatorSpacingSize,
  StringSelectMenuBuilder
} = require('discord.js');
const { buildExecutionFailedPayload, buildNoticePayload } = require('../utils/components');

const PAGE_SIZE = 15;
const SESSION_TTL_MS = 10 * 60 * 1000;
const banListSessions = new Map();

async function runBanListCommand(message, context) {
  if (!message.guild || message.author.bot) return;

  const isOwner = context.accessStore.isOwner(message.guild.id, message.author.id);
  const isSys = context.accessStore.isSys(message.author.id);

  if (!isOwner && !isSys) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys.'));
    return;
  }

  let bans;
  try {
    const collection = await message.guild.bans.fetch();
    bans = [...collection.values()].map((entry) => ({
      userId: entry.user?.id || 'inconnu',
      reason: String(entry.reason || 'aucune raison')
    }));
  } catch (error) {
    await message.channel.send(buildExecutionFailedPayload('Impossible de recuperer la liste des bannis. Verifiez mes permissions.'));
    return;
  }

  const sessionId = createSessionId();
  const session = {
    id: sessionId,
    guildId: message.guild.id,
    channelId: message.channel.id,
    messageId: null,
    ownerId: message.author.id,
    bans,
    page: 0
  };
  banListSessions.set(sessionId, session);

  const sent = await message.channel.send(buildBanListPayload(session, false));
  session.messageId = sent.id;

  scheduleBanListExpiration(context, sessionId);
}

async function handleBanListInteraction(interaction, context) {
  if (!interaction.isStringSelectMenu()) return false;
  if (!interaction.customId.startsWith('banlist:navigate:')) return false;

  const sessionId = interaction.customId.split(':')[2];
  const session = banListSessions.get(sessionId);

  if (!session) {
    await interaction.reply({
      ...buildNoticePayload({
        title: '# Session expiree',
        body: '> La session banlist a expire. Relancez `+banlist`.'
      }),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return true;
  }

  if (String(interaction.user.id) !== String(session.ownerId)) {
    await interaction.reply({
      ...buildNoticePayload({
        title: '# Action refusee',
        body: '> Seul l\'auteur de `+banlist` peut naviguer dans les pages.'
      }),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return true;
  }

  if (String(interaction.guildId) !== String(session.guildId)) {
    await interaction.reply({
      ...buildExecutionFailedPayload('Cette interaction ne correspond pas au serveur de la session.'),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return true;
  }

  const totalPages = Math.max(1, Math.ceil(session.bans.length / PAGE_SIZE));
  const action = String(interaction.values[0] || '');

  if (action === 'next') {
    session.page = Math.min(totalPages - 1, session.page + 1);
  } else if (action === 'previous') {
    session.page = Math.max(0, session.page - 1);
  }

  await interaction.update(stripUpdateFlags(buildBanListPayload(session, false)));
  return true;
}

function buildBanListPayload(session, disabled) {
  const bans = Array.isArray(session.bans) ? session.bans : [];
  const totalBans = bans.length;
  const totalPages = Math.max(1, Math.ceil(totalBans / PAGE_SIZE));
  const page = Math.max(0, Math.min(session.page || 0, totalPages - 1));
  const start = page * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageItems = bans.slice(start, end);

  const container = new ContainerBuilder()
    .addTextDisplayComponents((text) => text.setContent('# Liste des bannis'))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent(
        `> Vous pouvez consulter la liste des bannis du serveur\n> Nombre actuel de bannis : ${totalBans}\n> Page ${page + 1}/${totalPages}`
      )
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));

  if (pageItems.length === 0) {
    container.addTextDisplayComponents((text) => text.setContent('> Aucun utilisateur banni.'));
  } else {
    const lines = [];
    pageItems.forEach((entry, index) => {
      const number = start + index + 1;
      lines.push(`> ${number}. <@${entry.userId}> (${entry.userId})`);
      lines.push(`>    Raison : ${entry.reason || 'aucune raison'}`);
    });
    container.addTextDisplayComponents((text) => text.setContent(lines.join('\n')));
  }

  if (totalPages > 1) {
    const options = [];
    if (page > 0) {
      options.push({
        label: 'Page precedente',
        value: 'previous',
        emoji: { id: '1491313453535858778' },
        description: `Aller Ã  la page ${page}`
      });
    }
    if (page < totalPages - 1) {
      options.push({
        label: 'Page suivante',
        value: 'next',
        emoji: { id: '1491313423269499070' },
        description: `Aller Ã  la page ${page + 2}`
      });
    }

    if (options.length > 0) {
      container
        .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents((row) =>
          row.setComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`banlist:navigate:${session.id}`)
              .setPlaceholder('Navigation')
              .setMinValues(1)
              .setMaxValues(1)
              .setDisabled(disabled)
              .addOptions(options)
          )
        );
    }
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false }
  };
}

function scheduleBanListExpiration(context, sessionId) {
  setTimeout(async () => {
    const session = banListSessions.get(sessionId);
    if (!session) return;
    banListSessions.delete(sessionId);

    try {
      const channel = await context.client.channels.fetch(session.channelId);
      if (!channel || !channel.isTextBased()) return;
      const message = await channel.messages.fetch(session.messageId);
      await message.edit(stripUpdateFlags(buildBanListPayload(session, true)));
    } catch {
      // Ignore missing message or permissions.
    }
  }, SESSION_TTL_MS).unref();
}

function stripUpdateFlags(payload) {
  return {
    components: payload.components,
    allowedMentions: payload.allowedMentions
  };
}

function createSessionId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = {
  runBanListCommand,
  handleBanListInteraction
};
