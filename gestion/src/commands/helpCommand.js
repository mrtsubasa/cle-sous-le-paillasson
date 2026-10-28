const { randomUUID } = require('node:crypto');
const { ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SeparatorSpacingSize } = require('discord.js');
const { COMMAND_DESCRIPTIONS, CONFIGURABLE_COMMANDS, OWNER_COMMANDS, SYS_ONLY_COMMANDS } = require('../constants/commands');
const { getDerivedPermissionLevel } = require('../utils/access');
const { buildNoticePayload } = require('../utils/components');

const HELP_COMMANDS_TTL_MS = 5 * 60 * 1000;
const HELP_COMMANDS_PAGE_SIZE = 10;
const helpCommandSessions = new Map();
const PUBLIC_COMMANDS = new Set(['help', 'helpall', 'perms', 'perm', 'mybot']);
const ADMIN_COMMANDS = new Set(['custom', 'helpmessage', 'verif', 'say', 'create', 'baninfo', 'ban', 'unban']);
const ACTUAL_OWNER_ONLY_COMMANDS = new Set(['secure']);

async function runHelpCommand(message, context) {
  const cmds = getHelpCommandNames(message, context);
  const prefix = String(context.config.prefix);

  const pages = chunkCommands(cmds, prefix);
  const quickLinks = resolveQuickLinks(context, message.guild.id);

  if (pages.length <= 1) {
    await message.channel.send(
      buildHelpCommandPayload({
        sessionId: null,
        page: 0,
        pages,
        guildId: message.guild.id,
        quickLinks,
        disabled: false
      })
    );
    return;
  }

  const sessionId = randomUUID();
  const session = {
    id: sessionId,
    ownerId: String(message.author.id),
    guildId: String(message.guild.id),
    channelId: String(message.channel.id),
    messageId: 'pending',
    page: 0,
    pages,
    prefix,
    quickLinks,
    expiresAt: Date.now() + HELP_COMMANDS_TTL_MS
  };

  helpCommandSessions.set(sessionId, session);

  const sent = await message.channel.send(
    buildHelpCommandPayload({
      sessionId,
      page: 0,
      pages,
      guildId: message.guild.id,
      quickLinks,
      disabled: false
    })
  );

  session.messageId = sent.id;
  scheduleHelpCommandExpiration(context, sessionId);
}

async function handleHelpCommandInteraction(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('helpcmd:page:')) return false;

  const [, , sessionId, direction] = interaction.customId.split(':');
  const session = getHelpCommandSession(sessionId);

  if (!session) {
    await interaction.reply({
      ...buildNoticePayload({
        title: '# Session expiree',
        body: '> Le panneau help a expire. Relancez la commande.'
      }),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    }).catch(() => null);
    return true;
  }

  if (String(session.ownerId) !== String(interaction.user.id)) {
    await interaction.reply({
      ...buildNoticePayload({
        title: '# Action refusee',
        body: '> Seul l\'auteur de la commande help peut changer de page.'
      }),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    }).catch(() => null);
    return true;
  }

  session.expiresAt = Date.now() + HELP_COMMANDS_TTL_MS;
  if (direction === 'left') {
    session.page = Math.max(0, session.page - 1);
  }
  if (direction === 'right') {
    session.page = Math.min(session.pages.length - 1, session.page + 1);
  }

  await interaction
    .update(
      stripUpdateFlags(
        buildHelpCommandPayload({
          sessionId: session.id,
          page: session.page,
          pages: session.pages,
          guildId: session.guildId,
          quickLinks: session.quickLinks,
          disabled: false
        })
      )
    )
    .catch(() => null);

  return true;
}

function buildHelpCommandPayload({ sessionId, page, pages, guildId, quickLinks, disabled }) {
  const safePages = Array.isArray(pages) && pages.length ? pages : [['> Aucune commande disponible pour votre profil.']];
  const currentPage = Math.max(0, Math.min(page || 0, safePages.length - 1));
  const pageLines = safePages[currentPage];
  const totalPages = safePages.length;

  const container = new ContainerBuilder()
    .addTextDisplayComponents((text) => text.setContent('## Commandes'))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent('> Liste des commandes auxquelles vous avez acces'));

  if (totalPages > 1) {
    container.addTextDisplayComponents((text) => text.setContent(`> Page: \`${currentPage + 1}/${totalPages}\``));
  }

  container
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(pageLines.join('\n')));

  const buttons = buildQuickLinkButtons(quickLinks, guildId);
  if (buttons.length) {
    container.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
    container.addActionRowComponents((row) => row.setComponents(...buttons));
  }

  if (totalPages > 1 && sessionId) {
    container.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
    container.addActionRowComponents((row) =>
      row.setComponents(
        new ButtonBuilder()
          .setCustomId(`helpcmd:page:${sessionId}:left`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel('Precedent')
          .setDisabled(disabled || currentPage === 0),
        new ButtonBuilder()
          .setCustomId(`helpcmd:page:${sessionId}:right`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel('Suivant')
          .setDisabled(disabled || currentPage >= totalPages - 1)
      )
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false }
  };
}

function scheduleHelpCommandExpiration(context, sessionId) {
  const session = helpCommandSessions.get(String(sessionId));
  if (!session) return;

  const delayMs = Math.max(5_000, session.expiresAt - Date.now() + 500);
  setTimeout(async () => {
    const current = helpCommandSessions.get(String(sessionId));
    if (!current) return;
    if (Date.now() < current.expiresAt) {
      scheduleHelpCommandExpiration(context, sessionId);
      return;
    }

    const session = getHelpCommandSession(sessionId);
    if (!session) return;

    helpCommandSessions.delete(String(sessionId));

    try {
      const channel = await context.client.channels.fetch(session.channelId);
      if (!channel || !channel.isTextBased()) return;
      const message = await channel.messages.fetch(session.messageId);
      await message.edit(
        stripUpdateFlags(
          buildHelpCommandPayload({
            sessionId: session.id,
            page: session.page,
            pages: session.pages,
            guildId: session.guildId,
            quickLinks: session.quickLinks,
            disabled: true
          })
        )
      );
    } catch {
      // Ignore missing message/channel.
    }
  }, delayMs).unref();
}

function getHelpCommandSession(sessionId) {
  const session = helpCommandSessions.get(String(sessionId)) || null;
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    helpCommandSessions.delete(String(sessionId));
    return null;
  }
  return session;
}

function chunkCommands(commands, prefix) {
  const safePrefix = String(prefix);
  const lines = Array.isArray(commands) && commands.length
    ? commands.map((cmd) => `> \`${safePrefix}${cmd}\` - ${formatDescription(cmd, safePrefix)}`)
    : ['> Aucune commande disponible pour votre profil.'];

  const pages = [];
  for (let index = 0; index < lines.length; index += HELP_COMMANDS_PAGE_SIZE) {
    pages.push(lines.slice(index, index + HELP_COMMANDS_PAGE_SIZE));
  }
  return pages;
}

function formatDescription(commandName, prefix) {
  return String(COMMAND_DESCRIPTIONS[commandName] || 'Aucune description').replace(/\+/g, prefix);
}

function stripUpdateFlags(payload) {
  return {
    components: payload.components,
    allowedMentions: payload.allowedMentions
  };
}

module.exports = {
  runHelpCommand,
  handleHelpCommandInteraction
};

function getHelpCommandNames(message, context) {
  if (!message?.guild || !message?.author) {
    return [];
  }

  const guildId = String(message.guild.id);
  const userId = String(message.author.id);
  const actualSysUserId = String(context.accessStore.getSysUserId() || '');
  const actualOwnerIds = context.accessStore.getOwnerUserIds(guildId);
  const actualIsSys = actualSysUserId === userId;
  const actualIsOwner = actualIsSys || actualOwnerIds.includes(userId);
  const actualIsBuyer = context.accessStore.isBuyer(userId);
  const rawGrantedCommands = getRawGrantedCommandsForMember(guildId, message.member, userId, context.accessStore);

  return [
    ...new Set(
      [
        ...Object.keys(COMMAND_DESCRIPTIONS),
        ...CONFIGURABLE_COMMANDS,
        ...OWNER_COMMANDS,
        ...SYS_ONLY_COMMANDS
      ]
        .map((cmd) => String(cmd || '').trim().toLowerCase())
        .filter(Boolean)
    )
  ]
    .filter((commandName) =>
      canViewCommandInHelp({
        commandName,
        actualIsOwner,
        actualIsBuyer,
        rawGrantedCommands
      })
    )
    .sort((left, right) => left.localeCompare(right));
}

function canViewCommandInHelp({ commandName, actualIsOwner, actualIsBuyer, rawGrantedCommands }) {
  if (!commandName) return false;
  if (PUBLIC_COMMANDS.has(commandName)) return true;
  if (ACTUAL_OWNER_ONLY_COMMANDS.has(commandName)) return actualIsOwner;
  if (actualIsOwner || rawGrantedCommands.has(commandName)) return true;
  if (ADMIN_COMMANDS.has(commandName)) return actualIsBuyer;
  return false;
}

function getRawGrantedCommandsForMember(guildId, member, userId, accessStore) {
  const commands = new Set();
  const memberRoleIds = member?.roles?.cache?.map((role) => String(role.id)) || [];
  const allCommandRoles = accessStore.getAllCommandRoles(guildId) || {};

  for (const commandName of accessStore.getPermCommands(guildId, 'publique') || []) {
    commands.add(String(commandName || '').trim().toLowerCase());
  }

  for (const [commandName, roleIds] of Object.entries(allCommandRoles)) {
    if (Array.isArray(roleIds) && roleIds.some((roleId) => memberRoleIds.includes(String(roleId)))) {
      commands.add(String(commandName || '').trim().toLowerCase());
    }
  }

  for (const commandName of accessStore.getUserPermCommands(guildId, userId) || []) {
    commands.add(String(commandName || '').trim().toLowerCase());
  }

  const derivedPerm = getDerivedPermissionLevel(guildId, member, accessStore);
  if (derivedPerm !== null) {
    const perms = accessStore.getAllPerms(guildId);
    for (let i = 1; i <= derivedPerm; i += 1) {
      const permCommands = perms[i]?.commands || perms[String(i)]?.commands || [];
      for (const commandName of permCommands) {
        commands.add(String(commandName || '').trim().toLowerCase());
      }
    }
  }

  return commands;
}

function resolveQuickLinks(context, guildId) {
  const guildLinks = context.accessStore.getGuildQuickLinks(guildId);
  if (guildLinks.length) return guildLinks;
  return Array.isArray(context.config.quickLinks) ? context.config.quickLinks : [];
}

function buildQuickLinkButtons(quickLinks, guildId) {
  if (!Array.isArray(quickLinks) || !quickLinks.length) return [];

  return quickLinks
    .slice(0, 5)
    .map((link) => {
      const label = String(link.label || '').trim();
      if (!label) return null;

      if (link.type === 'url' && typeof link.url === 'string') {
        return new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(link.url);
      }

      if (link.type === 'channel' && /^\d+$/.test(String(link.channelId || ''))) {
        const url = `https://discord.com/channels/${guildId}/${link.channelId}`;
        return new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url);
      }

      return null;
    })
    .filter(Boolean);
}
