const Discord = require('discord.js');

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} = Discord;

const DEFAULT_LEAVE_MESSAGE = 'Au revoir **{user}** sur **{server}** !\nNous sommes maintenant **{members}** membres.';
const DEFAULT_LEAVE_LOG_MESSAGE = 'Le membre {user.name} a quitté {server}. Nous sommes maintenant {members} membres.';

exports.help = {
  name: 'leave',
  aliases: ['bye'],
  type: 'owner',
  description: 'Panel de configuration du leave',
};

const formatTemplate = (template, member, leaveSource = null) => {
  if (!template) return '';

  const createdAt = member.user.createdAt instanceof Date ? member.user.createdAt : null;
  const joinedAt = member.joinedAt instanceof Date ? member.joinedAt : null;
  const createdAtText = createdAt ? createdAt.toLocaleString('fr-FR') : 'Inconnu';
  const joinedAtText = joinedAt ? joinedAt.toLocaleString('fr-FR') : 'Inconnu';
  const serverOwner = member.guild.ownerId ? `<@${member.guild.ownerId}>` : 'Inconnu';
  const avatarUrl = member.user.displayAvatarURL?.({ extension: 'png', size: 1024 }) || member.user.displayAvatarURL?.() || '';
  const sourceLabel = leaveSource?.label || 'Source inconnue';

  return template
    .replace(/{user}/g, `<@${member.id}>`)
    .replace(/{user.mention}/g, `<@${member.id}>`)
    .replace(/{user.name}/g, member.user.username)
    .replace(/{user.id}/g, member.id)
    .replace(/{user.tag}/g, member.user.tag)
    .replace(/{user.globalName}/g, member.user.globalName || member.user.username)
    .replace(/{user.bot}/g, member.user.bot ? 'true' : 'false')
    .replace(/{user.createdAt}/g, createdAtText)
    .replace(/{user.createdAtRaw}/g, createdAt ? createdAt.toISOString() : 'Inconnu')
    .replace(/{user.avatar}/g, avatarUrl)
    .replace(/{server}/g, member.guild.name)
    .replace(/{server.id}/g, member.guild.id)
    .replace(/{server.owner}/g, serverOwner)
    .replace(/{members}/g, `${member.guild.memberCount}`)
    .replace(/{joinedAt}/g, joinedAtText)
    .replace(/{joinedAtRaw}/g, joinedAt ? joinedAt.toISOString() : 'Inconnu')
    .replace(/{leaveSource}/g, sourceLabel);
};

const buildPreviewText = (template, guild) => {
  const previewMember = {
    id: '189718516176388107',
    user: {
      username: 'UtilisateurSortant',
      globalName: 'UtilisateurSortant',
      tag: 'UtilisateurSortant#0001',
      bot: false,
      createdAt: new Date('2024-01-01T12:00:00.000Z'),
      displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/1.png',
    },
    guild,
    joinedAt: new Date('2024-06-01T12:00:00.000Z'),
  };

  return formatTemplate(template, previewMember, { label: 'Source inconnue' });
};

exports.run = async (bot, message) => {
  if (!bot.functions.checkPerm(bot, message, 'owner')) return;
  if (!message.guild) return;

  let guildData = await bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(message.guild.id);

  if (!guildData) {
    await bot.db.prepare(
      'INSERT INTO guilds (id, leaveChannels, leaveMessage, leaveLogChannel, leaveLogMessage) VALUES (?, ?, ?, ?, ?)',
    ).run(
      message.guild.id,
      JSON.stringify([]),
      DEFAULT_LEAVE_MESSAGE,
      null,
      DEFAULT_LEAVE_LOG_MESSAGE,
    );

    guildData = {
      leaveChannels: '[]',
      leaveMessage: DEFAULT_LEAVE_MESSAGE,
      leaveLogChannel: null,
      leaveLogMessage: DEFAULT_LEAVE_LOG_MESSAGE,
    };
  }

  let leaveChannels = JSON.parse(guildData.leaveChannels || '[]');
  let leaveMessage = guildData.leaveMessage || DEFAULT_LEAVE_MESSAGE;
  let leaveLogChannel = guildData.leaveLogChannel || null;
  let leaveLogMessage = guildData.leaveLogMessage || DEFAULT_LEAVE_LOG_MESSAGE;

  const formatChannels = (ids) => (ids.length ? ids.map((id) => `<#${id}>`).join('\n') : '> Aucun salon configuré');
  const formatChannel = (id) => (id ? `<#${id}>` : 'Aucun salon configuré');

  const buildPanel = () => {
    const leavePreview = buildPreviewText(leaveMessage, message.guild);
    const leaveLogPreview = buildPreviewText(leaveLogMessage, message.guild);

    return new ContainerBuilder()
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Panel de configuration'))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '> Configure les salons, les messages et le salon de logs pour les départs.'
        ),
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Salons de leave'))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(formatChannels(leaveChannels)))
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('leaveChannels:select')
            .setPlaceholder('Sélectionnez les salons de leave')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setMinValues(0)
            .setMaxValues(10),
        ),
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Message de leave'))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '> Variables : `{user}` `{user.mention}` `{user.name}` `{user.id}` `{user.tag}` `{user.globalName}` `{user.bot}` `{user.createdAt}` `{user.createdAtRaw}` `{user.avatar}` `{server}` `{server.id}` `{server.owner}` `{members}` `{joinedAt}` `{joinedAtRaw}` `{leaveSource}`',
        ),
      )
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`\`\`\`\n${leaveMessage}\n\`\`\``))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Aperçu'))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`\`\`\`\n${leavePreview}\n\`\`\``))
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('leaveMessage:edit')
            .setLabel('Modifier le message')
            .setStyle(ButtonStyle.Secondary),
        ),
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Logs de leave'))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('> Configure un salon de logs séparé et un message dédié pour les départs.'),
      )
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`> Salon actuel : ${formatChannel(leaveLogChannel)}`))
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('leaveLogChannel:select')
            .setPlaceholder('Sélectionnez le salon de logs')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setMinValues(0)
            .setMaxValues(1),
        ),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '> Variables : `{user}` `{user.mention}` `{user.name}` `{user.id}` `{user.tag}` `{user.globalName}` `{user.bot}` `{user.createdAt}` `{user.createdAtRaw}` `{user.avatar}` `{server}` `{server.id}` `{server.owner}` `{members}` `{joinedAt}` `{joinedAtRaw}` `{leaveSource}`',
        ),
      )
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`\`\`\`\n${leaveLogMessage}\n\`\`\``))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Aperçu'))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`\`\`\`\n${leaveLogPreview}\n\`\`\``))
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('leaveLogMessage:edit')
            .setLabel('Modifier le message de logs')
            .setStyle(ButtonStyle.Secondary),
        ),
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  };

  const msg = await message.reply({
    flags: MessageFlags.IsComponentsV2,
    components: [buildPanel()],
    allowedMentions: { parse: [] },
  });

  const collector = msg.createMessageComponentCollector({ time: 300000 });

  const sendEphemeral = async (interaction, content) => {
    const payload = { content, flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) return interaction.followUp(payload);
    return interaction.reply(payload);
  };

  const openTextModal = async (interaction, customId, title, label, value, placeholder) => {
    const modal = new ModalBuilder()
      .setCustomId(customId)
      .setTitle(title)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(`${customId}:input`)
            .setLabel(label)
            .setStyle(TextInputStyle.Paragraph)
            .setValue(value)
            .setPlaceholder(placeholder)
            .setRequired(true),
        ),
      );

    await interaction.showModal(modal);
  };

  collector.on('collect', async (interaction) => {
    try {
      if (interaction.user.id !== message.author.id) {
        return sendEphemeral(interaction, '> Ce panneau ne vous appartient pas.');
      }

      if (interaction.isChannelSelectMenu() && interaction.customId === 'leaveChannels:select') {
        leaveChannels = interaction.values || [];

        await bot.db.prepare('UPDATE guilds SET leaveChannels = ? WHERE id = ?')
          .run(JSON.stringify(leaveChannels), message.guild.id);

        return interaction.update({
          flags: MessageFlags.IsComponentsV2,
          components: [buildPanel()],
          allowedMentions: { parse: [] },
        });
      }

      if (interaction.isChannelSelectMenu() && interaction.customId === 'leaveLogChannel:select') {
        leaveLogChannel = interaction.values?.[0] || null;

        await bot.db.prepare('UPDATE guilds SET leaveLogChannel = ? WHERE id = ?')
          .run(leaveLogChannel, message.guild.id);

        return interaction.update({
          flags: MessageFlags.IsComponentsV2,
          components: [buildPanel()],
          allowedMentions: { parse: [] },
        });
      }

      if (interaction.isButton() && interaction.customId === 'leaveMessage:edit') {
        await openTextModal(
          interaction,
          'leaveMessage:modal',
          'Modifier le message de leave',
          'Message de leave',
          leaveMessage,
          'Ex : Au revoir **{user}** !',
        );

        const submitted = await interaction.awaitModalSubmit({
          filter: (m) => m.user.id === message.author.id && m.customId === 'leaveMessage:modal',
          time: 60000,
        }).catch(() => null);

        if (!submitted) return;

        leaveMessage = submitted.fields.getTextInputValue('leaveMessage:modal:input').trim() || DEFAULT_LEAVE_MESSAGE;

        await bot.db.prepare('UPDATE guilds SET leaveMessage = ? WHERE id = ?')
          .run(leaveMessage, message.guild.id);

        await msg.edit({
          flags: MessageFlags.IsComponentsV2,
          components: [buildPanel()],
          allowedMentions: { parse: [] },
        });

        return sendEphemeral(submitted, `> Message leave mis à jour.\n\`\`\`\n${leaveMessage}\n\`\`\``);
      }

      if (interaction.isButton() && interaction.customId === 'leaveLogMessage:edit') {
        await openTextModal(
          interaction,
          'leaveLogMessage:modal',
          'Modifier le message de logs leave',
          'Message de logs leave',
          leaveLogMessage,
          'Ex : Le membre {user.name} a quitté {server}.',
        );

        const submitted = await interaction.awaitModalSubmit({
          filter: (m) => m.user.id === message.author.id && m.customId === 'leaveLogMessage:modal',
          time: 60000,
        }).catch(() => null);

        if (!submitted) return;

        leaveLogMessage = submitted.fields.getTextInputValue('leaveLogMessage:modal:input').trim() || DEFAULT_LEAVE_LOG_MESSAGE;

        await bot.db.prepare('UPDATE guilds SET leaveLogMessage = ? WHERE id = ?')
          .run(leaveLogMessage, message.guild.id);

        await msg.edit({
          flags: MessageFlags.IsComponentsV2,
          components: [buildPanel()],
          allowedMentions: { parse: [] },
        });

        return sendEphemeral(submitted, `> Message de logs leave mis à jour.\n\`\`\`\n${leaveLogMessage}\n\`\`\``);
      }
    } catch (error) {
      console.error('[LEAVE] Erreur pendant la configuration:', error);
      if (interaction.isRepliable?.() && !interaction.replied && !interaction.deferred) {
        await sendEphemeral(interaction, '> Une erreur est survenue pendant la configuration du leave.');
      }
    }
  });
};
