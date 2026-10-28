const {
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  SeparatorSpacingSize
} = require('discord.js');
const { randomUUID } = require('node:crypto');
const { buildExecutionFailedPayload, buildNoticePayload } = require('../utils/components');

const SECURE_TTL_MS = 10 * 60 * 1000;
const secureSessions = new Map();

async function runSecureCommand(message, context) {
  if (!message.guild || message.author.bot) return;

  const userId = String(message.author.id);
  const isSys = context.accessStore.getSysUserId() === userId;
  const isOwner = isSys || context.accessStore.getOwnerUserIds(message.guild.id).includes(userId);
  if (!isOwner && !isSys) {
    await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys.'));
    return;
  }

  const sessionId = randomUUID();
  const session = {
    id: sessionId,
    ownerId: String(message.author.id),
    guildId: String(message.guild.id),
    channelId: String(message.channel.id),
    messageId: 'pending',
    expiresAt: Date.now() + SECURE_TTL_MS
  };

  secureSessions.set(sessionId, session);

  const sent = await message.channel.send(buildSecurePayload(context, session, false));
  session.messageId = sent.id;

  scheduleSecureExpiration(context, sessionId);
}

async function handleSecureInteraction(interaction, context) {
  if (!interaction.customId.startsWith('secure:panel:')) return false;
  if (!interaction.isChannelSelectMenu()) return true;

  const parts = interaction.customId.split(':');
  const sessionId = parts[2];
  const action = parts[3];

  const session = getSecureSession(sessionId);
  if (!session) {
    await interaction.reply({
      ...buildNoticePayload({
        title: '# Session expiree',
        body: '> Ce panneau a expire. Relancez `+secure`.'
      }),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    }).catch(() => null);
    return true;
  }

  if (String(interaction.user.id) !== String(session.ownerId)) {
    await interaction.reply({
      ...buildNoticePayload({
        title: '# Action refusee',
        body: "> Seul l'auteur de `+secure` peut modifier ce panneau."
      }),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    }).catch(() => null);
    return true;
  }

  const userId = String(interaction.user.id);
  const isSys = context.accessStore.getSysUserId() === userId;
  const isOwner = isSys || context.accessStore.getOwnerUserIds(interaction.guild.id).includes(userId);
  if (!isOwner && !isSys) {
    await interaction.reply({
      ...buildExecutionFailedPayload('Commande reservee aux owners/sys.'),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    }).catch(() => null);
    return true;
  }

  session.expiresAt = Date.now() + SECURE_TTL_MS;

  const current = context.accessStore.getGuildSecureRules(interaction.guild.id);
  const selected = splitChannelsAndCategories(interaction.guild, interaction.values || []);

  if (action === 'clear_targets') {
    context.accessStore.setGuildSecureRules(interaction.guild.id, {
      ...current,
      clearBlockedChannelIds: selected.channelIds,
      clearBlockedCategoryIds: selected.categoryIds
    });

    await context.logger.log(
      interaction.guild,
      '# Secure',
      `> Action: clear_rules\n> Channels: ${selected.channelIds.length}\n> Categories: ${selected.categoryIds.length}\n> Auteur: <@${interaction.user.id}>`
    );
  } else if (action === 'renew_targets') {
    context.accessStore.setGuildSecureRules(interaction.guild.id, {
      ...current,
      renewBlockedChannelIds: selected.channelIds,
      renewBlockedCategoryIds: selected.categoryIds
    });

    await context.logger.log(
      interaction.guild,
      '# Secure',
      `> Action: renew_rules\n> Channels: ${selected.channelIds.length}\n> Categories: ${selected.categoryIds.length}\n> Auteur: <@${interaction.user.id}>`
    );
  }

  await interaction.update(stripUpdateFlags(buildSecurePayload(context, session, false))).catch(async () => {
    await interaction.message.edit(stripUpdateFlags(buildSecurePayload(context, session, false))).catch(() => null);
  });

  return true;
}

function buildSecurePayload(context, session, disabled) {
  const rules = context.accessStore.getGuildSecureRules(session.guildId);

  const clearDefault = [...rules.clearBlockedChannelIds, ...rules.clearBlockedCategoryIds].slice(0, 25);
  const renewDefault = [...rules.renewBlockedChannelIds, ...rules.renewBlockedCategoryIds].slice(0, 25);

  const clearLines = formatTargets(rules.clearBlockedChannelIds, rules.clearBlockedCategoryIds);
  const renewLines = formatTargets(rules.renewBlockedChannelIds, rules.renewBlockedCategoryIds);

  const container = new ContainerBuilder()
    .addTextDisplayComponents((text) => text.setContent('## Secure'))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent('> Sur les cibles bloquees, seul le sys peut utiliser clear/renew.')
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent('### Blocage clear'))
    .addTextDisplayComponents((text) => text.setContent(clearLines))
    .addActionRowComponents((row) =>
      row.setComponents((() => {
        const menu = new ChannelSelectMenuBuilder()
          .setCustomId(`secure:panel:${session.id}:clear_targets`)
          .setPlaceholder('Choisir salons/categories bloques pour clear')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildCategory)
          .setMinValues(0)
          .setMaxValues(25)
          .setDisabled(disabled);
        if (clearDefault.length) menu.setDefaultChannels(...clearDefault);
        return menu;
      })())
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent('### Blocage renew'))
    .addTextDisplayComponents((text) => text.setContent(renewLines))
    .addActionRowComponents((row) =>
      row.setComponents((() => {
        const menu = new ChannelSelectMenuBuilder()
          .setCustomId(`secure:panel:${session.id}:renew_targets`)
          .setPlaceholder('Choisir salons/categories bloques pour renew')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildCategory)
          .setMinValues(0)
          .setMaxValues(25)
          .setDisabled(disabled);
        if (renewDefault.length) menu.setDefaultChannels(...renewDefault);
        return menu;
      })())
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false }
  };
}

function splitChannelsAndCategories(guild, ids) {
  const channelIds = [];
  const categoryIds = [];

  for (const id of Array.isArray(ids) ? ids : []) {
    const channel = guild.channels?.cache?.get(String(id));
    if (!channel) continue;
    if (channel.type === ChannelType.GuildCategory) {
      categoryIds.push(String(channel.id));
    } else {
      channelIds.push(String(channel.id));
    }
  }

  return {
    channelIds: [...new Set(channelIds)],
    categoryIds: [...new Set(categoryIds)]
  };
}

function formatTargets(channelIds, categoryIds) {
  const channelPart = channelIds.length ? channelIds.map((id) => `<#${id}>`).join(', ') : 'aucun salon';
  const categoryPart = categoryIds.length ? categoryIds.map((id) => `\`${id}\``).join(', ') : 'aucune categorie';
  return `> Salons: ${channelPart}\n> Categories: ${categoryPart}`;
}

function getSecureSession(sessionId) {
  const session = secureSessions.get(String(sessionId));
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    secureSessions.delete(String(sessionId));
    return null;
  }
  return session;
}

function scheduleSecureExpiration(context, sessionId) {
  setTimeout(async () => {
    const session = getSecureSession(sessionId);
    if (!session) return;

    secureSessions.delete(String(sessionId));

    try {
      const channel = await context.client.channels.fetch(session.channelId);
      if (!channel || !channel.isTextBased()) return;
      const message = await channel.messages.fetch(session.messageId);
      await message.edit(stripUpdateFlags(buildSecurePayload(context, session, true)));
    } catch {
      // Ignore not found.
    }
  }, SECURE_TTL_MS).unref();
}

function stripUpdateFlags(payload) {
  return {
    components: payload.components,
    allowedMentions: payload.allowedMentions
  };
}

module.exports = {
  runSecureCommand,
  handleSecureInteraction
};
