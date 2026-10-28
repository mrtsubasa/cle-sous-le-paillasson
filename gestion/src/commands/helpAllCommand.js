const { ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SeparatorSpacingSize } = require('discord.js');
const { randomUUID } = require('node:crypto');
const { buildNoticePayload } = require('../utils/components');
const { COMMAND_DESCRIPTIONS, OWNER_COMMANDS, SYS_ONLY_COMMANDS } = require('../constants/commands');

const HELPALL_TTL_MS = 5 * 60 * 1000;
const helpAllSessions = new Map();

async function runHelpAllCommand(message, context) {
  const pages = buildPages(context, message.guild.id);
  const sessionId = randomUUID();

  const session = {
    id: sessionId,
    ownerId: String(message.author.id),
    guildId: String(message.guild.id),
    channelId: String(message.channel.id),
    messageId: 'pending',
    page: 0,
    pages,
    prefix: String(context.config.prefix),
    expiresAt: Date.now() + HELPALL_TTL_MS
  };

  helpAllSessions.set(sessionId, session);

  const sent = await message.channel.send(buildHelpAllPayload(session));
  session.messageId = sent.id;

  scheduleHelpAllExpiration(context, sessionId);
}

async function handleHelpAllInteraction(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('helpall:page:')) return false;

  const [, , sessionId, direction] = interaction.customId.split(':');
  const session = getHelpAllSession(sessionId);

  if (!session) {
    await interaction.reply({
      ...buildNoticePayload({
        title: '# Session expiree',
        body: '> Le panneau helpall a expire. Relancez la commande.'
      }),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    }).catch(() => null);
    return true;
  }

  if (String(session.ownerId) !== String(interaction.user.id)) {
    await interaction.reply({
      ...buildNoticePayload({
        title: '# Action refusee',
        body: '> Seul l\'auteur de la commande helpall peut changer de page.'
      }),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    }).catch(() => null);
    return true;
  }

  session.expiresAt = Date.now() + HELPALL_TTL_MS;

  if (direction === 'left') {
    session.page = Math.max(0, session.page - 1);
  }
  if (direction === 'right') {
    session.page = Math.min(session.pages.length - 1, session.page + 1);
  }

  await interaction.update(stripUpdateFlags(buildHelpAllPayload(session))).catch(() => null);
  return true;
}

function buildPages(context, guildId) {
  const perms = context.accessStore.getAllPerms(guildId);
  const pages = [];

  for (let i = 1; i <= 9; i += 1) {
    const key = String(i);
    const commands = normalizeCommands(perms[key]?.commands || perms[i]?.commands || []);
    pages.push({
      key,
      title: `Permission ${key}`,
      subtitle: '> Commandes accessibles pour cette permission',
      commands
    });
  }

  pages.push({
    key: 'owner',
    title: 'Owner',
    subtitle: '> Commandes owner/sys',
    commands: normalizeCommands(OWNER_COMMANDS),
    sysOnly: normalizeCommands(SYS_ONLY_COMMANDS)
  });

  return pages;
}

function buildHelpAllPayload(session, disabled = false) {
  const page = session.pages[session.page] || session.pages[0];
  const totalPages = Math.max(1, session.pages.length);
  const prefix = String(session.prefix);

  const commandsLines = page.commands.length
    ? page.commands.map((cmd) => `> \`${prefix}${cmd}\` - ${formatDescription(cmd, prefix)}`).join('\n')
    : '> Aucune commande configuree.';

  const container = new ContainerBuilder()
    .addTextDisplayComponents((text) => text.setContent('## Help All'))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(`> ${page.title} (${session.page + 1}/${totalPages})`))
    .addTextDisplayComponents((text) => text.setContent(page.subtitle))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(commandsLines));

  if (Array.isArray(page.sysOnly) && page.sysOnly.length > 0) {
    const sysLines = page.sysOnly
      .map((cmd) => `> \`${prefix}${cmd}\` - ${formatDescription(cmd, prefix)} (sys seulement)`)
      .join('\n');

    container
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) => text.setContent('> Commandes reservees au sys'))
      .addTextDisplayComponents((text) => text.setContent(sysLines));
  }

  container
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents((row) =>
      row.setComponents(
        new ButtonBuilder()
          .setCustomId(`helpall:page:${session.id}:left`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel('Precedent')
          .setDisabled(disabled || session.page === 0),
        new ButtonBuilder()
          .setCustomId(`helpall:page:${session.id}:right`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel('Suivant')
          .setDisabled(disabled || session.page >= totalPages - 1)
      )
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false }
  };
}

function formatDescription(commandName, prefix) {
  return String(COMMAND_DESCRIPTIONS[commandName] || 'Aucune description').replace(/\+/g, prefix);
}

function scheduleHelpAllExpiration(context, sessionId) {
  setTimeout(async () => {
    const session = getHelpAllSession(sessionId);
    if (!session) return;

    helpAllSessions.delete(sessionId);

    try {
      const channel = await context.client.channels.fetch(session.channelId);
      if (!channel || !channel.isTextBased()) return;
      const message = await channel.messages.fetch(session.messageId);
      await message.edit(stripUpdateFlags(buildHelpAllPayload(session, true)));
    } catch {
      // Ignore if message/channel no longer exists.
    }
  }, HELPALL_TTL_MS).unref();
}

function getHelpAllSession(sessionId) {
  const session = helpAllSessions.get(String(sessionId)) || null;
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    helpAllSessions.delete(String(sessionId));
    return null;
  }
  return session;
}

function normalizeCommands(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((cmd) => String(cmd || '').trim().toLowerCase()).filter(Boolean))]
    .filter((cmd) => cmd !== 'perm')
    .sort();
}

function stripUpdateFlags(payload) {
  return {
    components: payload.components,
    allowedMentions: payload.allowedMentions
  };
}

module.exports = {
  runHelpAllCommand,
  handleHelpAllInteraction
};
