const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  RoleSelectMenuBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder
} = require('discord.js');
const { buildExecutionFailedPayload, buildNoticePayload, withV2 } = require('../utils/components');

const verifSessions = new Map();

async function runVerifCommand(message, context) {
  const canManageCommands = context.accessStore.canUseAdminCommands(message.guild.id, message.author.id);
  
  if (!canManageCommands) {
    await message.channel.send(buildExecutionFailedPayload('Tu peux pas faire cette commande'));
    return;
  }

  const container = new ContainerBuilder()
    .addTextDisplayComponents((text) => text.setContent('# Verification Vocal'))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent('> Vous pouvez choisir le role a check ci-dessous'))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent('> ### Choissisez le(s) role(s) a check :'));
    
  const sessionId = message.id;
  verifSessions.set(sessionId, {
    id: sessionId,
    authorId: message.author.id,
    guildId: message.guild.id,
    roles: [],
    option: null,
    targetMembers: []
  });
  
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(`verif_roles_${sessionId}`)
    .setPlaceholder('Selectionnez les roles a check')
    .setMinValues(1)
    .setMaxValues(10);
    
  container.addActionRowComponents((row) => row.addComponents(roleSelect));
  
  await message.channel.send(withV2({
    components: [container]
  }));
}

async function handleVerifInteraction(interaction, context) {
  try {
  if (!interaction.isMessageComponent()) return false;
  
  const { customId } = interaction;
  
  if (customId.startsWith('verif_roles_')) {
    const sessionId = customId.replace('verif_roles_', '');
    const session = verifSessions.get(sessionId);
    
    if (!session || session.authorId !== interaction.user.id) {
      await safeReply(interaction, {
        ...buildExecutionFailedPayload('Action non autorisee ou session expiree'),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      });
      return true;
    }
    
    session.roles = interaction.values;
    
    const container = new ContainerBuilder()
      .addTextDisplayComponents((text) => text.setContent('# Verification'))
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) => text.setContent('> Chosissez une option :'));
      
    const stringSelect = new StringSelectMenuBuilder()
      .setCustomId(`verif_option_${sessionId}`)
      .setPlaceholder('Selectionnez une option')
      .addOptions([
        { label: 'Les membres en vocal', value: 'in_voice' },
        { label: 'Les membres pas en vocal', value: 'not_in_voice' }
      ]);
      
    container.addActionRowComponents((row) => row.addComponents(stringSelect));
    
    await safeUpdate(interaction, withV2({
      components: [container]
    }));
    
    return true;
  }
  
  if (customId.startsWith('verif_option_')) {
    const sessionId = customId.replace('verif_option_', '');
    const session = verifSessions.get(sessionId);
    
    if (!session || session.authorId !== interaction.user.id) {
      await safeReply(interaction, {
        ...buildExecutionFailedPayload('Action non autorisee ou session expiree'),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      });
      return true;
    }
    
    session.option = interaction.values[0];

    // Acknowledge quickly before fetching guild members (can exceed 3s on large guilds).
    const usedDeferredReply = await safeDeferUpdate(interaction);
    
    await renderFinalList(interaction, session, usedDeferredReply ? 'edit' : 'update');
    
    return true;
  }
  
  if (customId.startsWith('verif_ping_')) {
    const sessionId = customId.replace('verif_ping_', '');
    const session = verifSessions.get(sessionId);
    
    if (!session || session.authorId !== interaction.user.id) {
      await safeReply(interaction, {
        ...buildExecutionFailedPayload('Action non autorisee ou session expiree'),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      });
      return true;
    }
    
    await executePing(interaction, session);
    
    return true;
  }
  
  if (customId.startsWith('verif_cancel_')) {
    const sessionId = customId.replace('verif_cancel_', '');
    const session = verifSessions.get(sessionId);
    
    if (!session || session.authorId !== interaction.user.id) {
      await safeReply(interaction, {
        ...buildExecutionFailedPayload('Action non autorisee ou session expiree'),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      });
      return true;
    }
    
    verifSessions.delete(sessionId);
    
    const container = new ContainerBuilder()
      .addTextDisplayComponents((text) => text.setContent('> Commande annuler'))
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
      
    await safeUpdate(interaction, withV2({
      components: [container]
    }));
    
    return true;
  }
  
  return false;
  } catch (error) {
    if (isAlreadyAcknowledgedError(error)) {
      return true;
    }
    throw error;
  }
}

async function renderFinalList(interaction, session, mode = 'update') {
  try { await interaction.guild.members.fetch(); } catch (e) {}
  
  const membersWithRole = new Set();
  
  interaction.guild.members.cache.forEach(member => {
    const hasRole = session.roles.some(roleId => member.roles.cache.has(roleId));
    if (hasRole) {
      const inVoice = !!member.voice.channelId;
      if (session.option === 'in_voice' && inVoice) {
        membersWithRole.add(member);
      } else if (session.option === 'not_in_voice' && !inVoice) {
        membersWithRole.add(member);
      }
    }
  });
  
  const targetMembers = Array.from(membersWithRole);
  session.targetMembers = targetMembers.map(m => m.id);
  
  const rolesText = session.roles.map(r => `<@&${r}>`).join(', ');
  const statusText = session.option === 'in_voice' ? 'en vocal' : 'pas en vocal';
  
  const container = new ContainerBuilder()
    .addTextDisplayComponents((text) => text.setContent('# Checker'))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(`> La liste des membres ${statusText} des roles : ${rolesText}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
    
  let listLines = [];
  targetMembers.forEach((m, idx) => {
    listLines.push(`> ${idx + 1}. <@${m.id}> (${m.id})`);
  });
  
  if (listLines.length === 0) {
    container.addTextDisplayComponents((text) => text.setContent('> *Aucun membre trouve.*'));
  } else {
    // Adding chunked text to avoid limit issues
    const CHUNK_SIZE = 15;
    for (let i = 0; i < listLines.length; i += CHUNK_SIZE) {
      const textChunk = listLines.slice(i, i + CHUNK_SIZE).join('\n');
      container.addTextDisplayComponents((text) => text.setContent(textChunk));
    }
  }
  
  const pingBtn = new ButtonBuilder()
    .setCustomId(`verif_ping_${session.id}`)
    .setLabel('Ping les tous !')
    .setEmoji('1489712005358026944')
    .setStyle(ButtonStyle.Secondary);
    
  const cancelBtn = new ButtonBuilder()
    .setCustomId(`verif_cancel_${session.id}`)
    .setLabel('Annuler')
    .setEmoji('1489711999226085430')
    .setStyle(ButtonStyle.Secondary);
    
  container.addActionRowComponents((row) => row.addComponents(pingBtn, cancelBtn));
  
  const payload = withV2({
    components: [container]
  });

  if (mode === 'edit') {
    await safeEditReply(interaction, payload);
    return;
  }

  await safeUpdate(interaction, payload);
}

async function executePing(interaction, session) {
  const members = session.targetMembers || [];

  if (session.pingInProgress) {
    await safeReply(interaction, {
      ...buildExecutionFailedPayload('Ping deja en cours'),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return;
  }
  
  if (members.length === 0) {
    await safeReply(interaction, {
      ...buildExecutionFailedPayload('Aucun membre a ping'),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return;
  }

  session.pingInProgress = true;
  
  const didAcknowledge = await safeDeferUpdate(interaction);
  if (!didAcknowledge) {
    // Another host/process likely acknowledged this interaction first.
    session.pingInProgress = false;
    return;
  }
  
  let pingText = '';
  const messagesToSend = [];
  
  for (const memberId of members) {
    const chunk = `<@${memberId}> `;
    if (pingText.length + chunk.length > 1900) {
      messagesToSend.push(pingText);
      pingText = chunk;
    } else {
      pingText += chunk;
    }
  }
  if (pingText) {
    messagesToSend.push(pingText);
  }
  
  try {
    for (const text of messagesToSend) {
      await interaction.channel.send({ content: text });
    }
  } finally {
    session.pingInProgress = false;
  }
  
  const container = new ContainerBuilder()
    .addTextDisplayComponents((text) => text.setContent('> Pings effectues'));
    
  await safeEditReply(interaction, withV2({
    components: [container],
    componentsRemoved: true
  }));
  
  verifSessions.delete(session.id);
}

module.exports = {
  runVerifCommand,
  handleVerifInteraction
};

function isAlreadyAcknowledgedError(error) {
  const code = Number(error?.code || error?.rawError?.code || 0);
  if (code === 40060) return true;
  return String(error?.message || '').toLowerCase().includes('already been acknowledged');
}

function isUnknownInteractionError(error) {
  const code = Number(error?.code || error?.rawError?.code || 0);
  if (code === 10062) return true;
  return String(error?.message || '').toLowerCase().includes('unknown interaction');
}

function isIgnorableInteractionError(error) {
  return isAlreadyAcknowledgedError(error) || isUnknownInteractionError(error) || isInteractionNotRepliedError(error);
}

function isInteractionNotRepliedError(error) {
  const code = String(error?.code || '');
  if (code === 'InteractionNotReplied') return true;
  return String(error?.message || '').toLowerCase().includes('has not been sent or deferred');
}

async function safeReply(interaction, payload) {
  try {
    if (!interaction.replied && !interaction.deferred) {
      return await interaction.reply(payload);
    }
    return await interaction.followUp(payload);
  } catch (error) {
    if (isIgnorableInteractionError(error)) return null;
    throw error;
  }
}

async function safeUpdate(interaction, payload) {
  try {
    return await interaction.update(payload);
  } catch (error) {
    if (isAlreadyAcknowledgedError(error)) {
      try {
        return await interaction.editReply(payload);
      } catch (secondError) {
        if (isIgnorableInteractionError(secondError)) return null;
        throw secondError;
      }
    }
    if (isUnknownInteractionError(error)) return null;
    throw error;
  }
}

async function safeEditReply(interaction, payload) {
  try {
    if (!interaction.deferred && !interaction.replied) return null;
    return await interaction.editReply(payload);
  } catch (error) {
    if (isIgnorableInteractionError(error)) return null;
    throw error;
  }
}

async function safeDeferUpdate(interaction) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
      return true;
    }
    return false;
  } catch (error) {
    if (isIgnorableInteractionError(error)) return false;
    throw error;
  }
}
