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
  RoleSelectMenuBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} = Discord;

const DEFAULT_WELCOME_MESSAGE = 'Bienvenue sur **{server}** {user} !\nNous sommes **{members}** membres !';
const DEFAULT_WELCOME_LOG_MESSAGE = 'Le membre {user.name} a rejoint {server}. Nous sommes maintenant {members} membres.';

exports.help = {
  name: 'welcome',
  aliases: ['wel'],
  type: 'owner',
  description: 'Panel de configuration du welcome',
};

const formatTemplate = (template, member, joinSource = null) => {
  if (!template) return '';

  const createdAt = member.user.createdAt instanceof Date ? member.user.createdAt : null;
  const joinedAt = member.joinedAt instanceof Date ? member.joinedAt : null;
  const createdAtText = createdAt ? createdAt.toLocaleString('fr-FR') : 'Inconnu';
  const joinedAtText = joinedAt ? joinedAt.toLocaleString('fr-FR') : 'Inconnu';
  const serverOwner = member.guild.ownerId ? `<@${member.guild.ownerId}>` : 'Inconnu';
  const avatarUrl = member.user.displayAvatarURL?.({ extension: 'png', size: 1024 }) || member.user.displayAvatarURL?.() || '';
  const inviter = joinSource?.inviter || null;
  const joinSourceLabel = joinSource?.label || 'Source inconnue';
  const inviterMention = inviter ? `<@${inviter.id}>` : 'Inconnu';
  const inviterName = inviter?.username || 'Inconnu';
  const inviterTag = inviter?.tag || 'Inconnu';

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
    .replace(/{joinSource}/g, joinSourceLabel)
    .replace(/{invite.code}/g, joinSource?.code || 'Inconnu')
    .replace(/{inviteCode}/g, joinSource?.code || 'Inconnu')
    .replace(/{inviter}/g, inviterMention)
    .replace(/{inviter.mention}/g, inviterMention)
    .replace(/{inviter.name}/g, inviterName)
    .replace(/{inviter.id}/g, inviter?.id || 'Inconnu')
    .replace(/{inviter.tag}/g, inviterTag);
};

const createPreviewMember = (guild) => ({
  id: '189718516176388107',
  user: {
    username: 'NouvelUtilisateur',
    globalName: 'NouvelUtilisateur',
    tag: 'NouvelUtilisateur#0001',
    bot: false,
    createdAt: new Date('2024-01-01T12:00:00.000Z'),
    displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
  },
  guild,
  joinedAt: new Date('2024-06-01T12:00:00.000Z'),
});

const buildPreviewText = (template, guild, joinSource = null) => {
  const previewMember = createPreviewMember(guild);
  return formatTemplate(template, previewMember, joinSource);
};

exports.run = async (bot, message) => {
  if (!bot.functions.checkPerm(bot, message, 'owner')) return;
  if (!message.guild) return;

  let guildData = await bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(message.guild.id);

  if (!guildData) {
    await bot.db.prepare(
      'INSERT INTO guilds (id, welcomeChannels, welcomeMessage, welcomeRole, welcomeLogChannel, welcomeLogMessage) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      message.guild.id,
      JSON.stringify([]),
      DEFAULT_WELCOME_MESSAGE,
      null,
      null,
      DEFAULT_WELCOME_LOG_MESSAGE,
    );

    guildData = {
      welcomeChannels: '[]',
      welcomeMessage: DEFAULT_WELCOME_MESSAGE,
      welcomeRole: null,
      welcomeLogChannel: null,
      welcomeLogMessage: DEFAULT_WELCOME_LOG_MESSAGE,
    };
  }

  let welcomeChannels = JSON.parse(guildData.welcomeChannels || '[]');
  let welcomeMessage = guildData.welcomeMessage || DEFAULT_WELCOME_MESSAGE;
  let welcomeRole = guildData.welcomeRole || null;
  let welcomeLogChannel = guildData.welcomeLogChannel || null;
  let welcomeLogMessage = guildData.welcomeLogMessage || DEFAULT_WELCOME_LOG_MESSAGE;

  const formatChannels = (ids) => (ids.length ? ids.map((id) => `<#${id}>`).join('\n') : '> Aucun salon configuré');
  const formatChannel = (id) => (id ? `<#${id}>` : 'Aucun salon configuré');
  const formatRole = (roleId) => (roleId ? `<@&${roleId}>` : '> Aucun rôle configuré');

  const buildPanel = () => {
    const welcomePreview = buildPreviewText(welcomeMessage, message.guild);
    const welcomeLogPreview = buildPreviewText(welcomeLogMessage, message.guild, {
      label: 'Invitation de Inviteur#0001',
      code: 'abcdef',
      inviter: {
        id: '987654321098765432',
        username: 'Inviteur',
        tag: 'Inviteur#0001',
      },
    });

    return new ContainerBuilder()
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Panel de configuration'))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '> Configure les salons, les messages et le rôle optionnel à attribuer à l arrivée.\n> Les emojis normaux 😋 et les emojis Discord `<:nom:ID>` sont acceptés dans les messages.',
        ),
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Salons de welcome'))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(formatChannels(welcomeChannels)))
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('welcomeChannels:select')
            .setPlaceholder('Sélectionnez les salons de welcome')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setMinValues(0)
            .setMaxValues(10),
        ),
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Message de welcome'))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '> Variables : `{user}` `{user.mention}` `{user.name}` `{user.id}` `{user.tag}` `{user.globalName}` `{user.bot}` `{user.createdAt}` `{user.createdAtRaw}` `{user.avatar}` `{server}` `{server.id}` `{server.owner}` `{members}` `{joinedAt}` `{joinedAtRaw}` `{joinSource}` `{invite.code}` `{inviteCode}` `{inviter}` `{inviter.mention}` `{inviter.name}` `{inviter.id}` `{inviter.tag}`',
        ),
      )
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`\`\`\`\n${welcomeMessage}\n\`\`\``))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Aperçu'))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`\`\`\`\n${welcomePreview}\n\`\`\``))
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('welcomeMessage:edit')
            .setLabel('Modifier le message')
            .setStyle(ButtonStyle.Secondary),
        ),
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Rôle à attribuer'))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('> Laisse vide si tu ne veux pas attribuer de rôle à l arrivée.'),
      )
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(formatRole(welcomeRole)))
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId('welcomeRole:select')
            .setPlaceholder('Sélectionnez un rôle ou laissez vide')
            .setMinValues(0)
            .setMaxValues(1),
        ),
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Logs de welcome'))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '> Configure un salon de logs séparé et un message dédié pour les arrivées.',
        ),
      )
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`> Salon actuel : ${formatChannel(welcomeLogChannel)}`))
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('welcomeLogChannel:select')
            .setPlaceholder('Sélectionnez le salon de logs')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setMinValues(0)
            .setMaxValues(1),
        ),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '> Variables : `{user}` `{user.mention}` `{user.name}` `{user.id}` `{user.tag}` `{user.globalName}` `{user.bot}` `{user.createdAt}` `{user.createdAtRaw}` `{user.avatar}` `{server}` `{server.id}` `{server.owner}` `{members}` `{joinedAt}` `{joinedAtRaw}` `{joinSource}` `{invite.code}` `{inviteCode}` `{inviter}` `{inviter.mention}` `{inviter.name}` `{inviter.id}` `{inviter.tag}`',
        ),
      )
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`\`\`\`\n${welcomeLogMessage}\n\`\`\``))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Aperçu'))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`\`\`\`\n${welcomeLogPreview}\n\`\`\``))
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('welcomeLogMessage:edit')
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

      if (interaction.isChannelSelectMenu() && interaction.customId === 'welcomeChannels:select') {
        welcomeChannels = interaction.values || [];

        await bot.db.prepare('UPDATE guilds SET welcomeChannels = ? WHERE id = ?')
          .run(JSON.stringify(welcomeChannels), message.guild.id);

        return interaction.update({
          flags: MessageFlags.IsComponentsV2,
          components: [buildPanel()],
          allowedMentions: { parse: [] },
        });
      }

      if (interaction.isRoleSelectMenu() && interaction.customId === 'welcomeRole:select') {
        welcomeRole = interaction.values?.[0] || null;

        await bot.db.prepare('UPDATE guilds SET welcomeRole = ? WHERE id = ?')
          .run(welcomeRole, message.guild.id);

        return interaction.update({
          flags: MessageFlags.IsComponentsV2,
          components: [buildPanel()],
          allowedMentions: { parse: [] },
        });
      }

      if (interaction.isChannelSelectMenu() && interaction.customId === 'welcomeLogChannel:select') {
        welcomeLogChannel = interaction.values?.[0] || null;

        await bot.db.prepare('UPDATE guilds SET welcomeLogChannel = ? WHERE id = ?')
          .run(welcomeLogChannel, message.guild.id);

        return interaction.update({
          flags: MessageFlags.IsComponentsV2,
          components: [buildPanel()],
          allowedMentions: { parse: [] },
        });
      }

      if (interaction.isButton() && interaction.customId === 'welcomeMessage:edit') {
        await openTextModal(
          interaction,
          'welcomeMessage:modal',
          'Modifier le message de welcome',
          'Message de welcome',
          welcomeMessage,
          'Ex : Bienvenue sur **{server}** {user} 😋',
        );

        const submitted = await interaction.awaitModalSubmit({
          filter: (m) => m.user.id === message.author.id && m.customId === 'welcomeMessage:modal',
          time: 60000,
        }).catch(() => null);

        if (!submitted) return;

        welcomeMessage = submitted.fields.getTextInputValue('welcomeMessage:modal:input').trim() || DEFAULT_WELCOME_MESSAGE;

        await bot.db.prepare('UPDATE guilds SET welcomeMessage = ? WHERE id = ?')
          .run(welcomeMessage, message.guild.id);

        await msg.edit({
          flags: MessageFlags.IsComponentsV2,
          components: [buildPanel()],
          allowedMentions: { parse: [] },
        });

        return sendEphemeral(submitted, `> Message welcome mis à jour.\n\`\`\`\n${welcomeMessage}\n\`\`\``);
      }

      if (interaction.isButton() && interaction.customId === 'welcomeLogMessage:edit') {
        await openTextModal(
          interaction,
          'welcomeLogMessage:modal',
          'Modifier le message de logs',
          'Message de logs',
          welcomeLogMessage,
          'Ex : {user.name} a rejoint {server} 😋',
        );

        const submitted = await interaction.awaitModalSubmit({
          filter: (m) => m.user.id === message.author.id && m.customId === 'welcomeLogMessage:modal',
          time: 60000,
        }).catch(() => null);

        if (!submitted) return;

        welcomeLogMessage = submitted.fields.getTextInputValue('welcomeLogMessage:modal:input').trim() || DEFAULT_WELCOME_LOG_MESSAGE;

        await bot.db.prepare('UPDATE guilds SET welcomeLogMessage = ? WHERE id = ?')
          .run(welcomeLogMessage, message.guild.id);

        await msg.edit({
          flags: MessageFlags.IsComponentsV2,
          components: [buildPanel()],
          allowedMentions: { parse: [] },
        });

        return sendEphemeral(submitted, `> Message de logs mis à jour.\n\`\`\`\n${welcomeLogMessage}\n\`\`\``);
      }
    } catch (error) {
      console.log(error);
    }
  });
};
