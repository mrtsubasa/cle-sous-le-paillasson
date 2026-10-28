const { 
  ContainerBuilder, ButtonStyle, MessageFlags,
  ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType
} = require('discord.js');

exports.help = {
  name: 'pingrole',
  aliases: ["pr"],
  type: 'owner',
  description: 'Ping tous les utilisateurs d’un ou plusieurs rôles choisis dans les salons sélectionnés',
};

exports.run = async (bot, message, args) => {
  if (!bot.functions.checkPerm(bot, message, 'owner')) return;

  let guildData = await bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(message.guild.id);
  if (!guildData) {
    await bot.db.prepare('INSERT INTO guilds (id, pingroleChannels, pingroleRoles) VALUES (?, ?, ?)')
      .run(message.guild.id, JSON.stringify([]), JSON.stringify([]));
    guildData = { pingroleChannels: '[]', pingroleRoles: '[]' };
  }

  let mentionChannels = JSON.parse(guildData.pingroleChannels || '[]');
  let mentionRoles = JSON.parse(guildData.pingroleRoles || '[]');
  let usersPerMention = 10;
  let deleteTime = 10;
  let isRunning = false;

  const formatChannels = (ids) => ids.length ? ids.map(id => `> <#${id}>`).join('\n') : '> Aucun salon configuré';
  const formatRoles = (ids) => ids.length ? ids.map(id => `> <@&${id}>`).join('\n') : '> Aucun rôle configuré';

  const fetchMembersSafe = async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const members = await message.guild.members.fetch().catch(() => null);
      if (members) return members;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (message.guild.members?.cache?.size) {
      return message.guild.members.cache;
    }

    return null;
  };

  const buildPanel = () => new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent('# Panel PingRole'))
    .addTextDisplayComponents(t => t.setContent('> Configurez les options ci-dessous'))

    .addSeparatorComponents(s => s)
    .addTextDisplayComponents(t => t.setContent('# Salons'))
    .addTextDisplayComponents(t => t.setContent(formatChannels(mentionChannels)))
    .addActionRowComponents(row =>
      row.setComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('selectChannels')
          .setPlaceholder('Sélectionnez un ou plusieurs salons')
          .addChannelTypes(ChannelType.GuildText)
          .setMinValues(0)
          .setMaxValues(10)
          .setDisabled(isRunning)
      )
    )

    .addSeparatorComponents(s => s)
    .addTextDisplayComponents(t => t.setContent('# Rôles'))
    .addTextDisplayComponents(t => t.setContent(formatRoles(mentionRoles)))
    .addActionRowComponents(row =>
      row.setComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('selectRoles')
          .setPlaceholder('Sélectionnez un ou plusieurs rôles')
          .setMinValues(1)
          .setMaxValues(10)
          .setDisabled(isRunning)
      )
    )

    .addSeparatorComponents(s => s)
    .addSectionComponents(section =>
      section.addTextDisplayComponents(t => t.setContent('# Options'))
             .addTextDisplayComponents(t => t.setContent(`> Nombres Utilisateurs par Mention : ${usersPerMention}\n> Suppression après : ${deleteTime} sec`))
             .setButtonAccessory(b =>
               b.setCustomId('editOptions')
                .setLabel('Modifier options')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(isRunning)
             )
    )
    .addSeparatorComponents(s => s)
    .addSectionComponents(section =>
      section.addTextDisplayComponents(t => t.setContent('> Lancer le ping'))
             .setButtonAccessory(b =>
               b.setCustomId('startPing')
                .setLabel('Start')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(isRunning)
             )
    );

  const msg = await message.reply({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });

  const collector = msg.createMessageComponentCollector({ time: 300000 });

  collector.on('collect', async interaction => {
    if (interaction.user.id !== message.author.id) return;

    if (interaction.customId === 'selectChannels') {
      mentionChannels = interaction.values;
      await bot.db.prepare('UPDATE guilds SET pingroleChannels = ? WHERE id = ?')
        .run(JSON.stringify(mentionChannels), message.guild.id);
      await interaction.update({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }

    if (interaction.customId === 'selectRoles') {
      mentionRoles = interaction.values;
      await bot.db.prepare('UPDATE guilds SET pingroleRoles = ? WHERE id = ?')
        .run(JSON.stringify(mentionRoles), message.guild.id);
      await interaction.update({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }

    if (interaction.customId === 'editOptions') {

      const modal = new ModalBuilder()
        .setCustomId('editPingOptionsModal')
        .setTitle('Modifier options PingRole')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('usersPerMentionInput')
              .setLabel('Nombre d’utilisateurs par mention')
              .setStyle(TextInputStyle.Short)
              .setValue(usersPerMention.toString())
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('deleteTimeInput')
              .setLabel('Temps avant suppression (sec)')
              .setStyle(TextInputStyle.Short)
              .setValue(deleteTime.toString())
              .setRequired(true)
          )
        );

      await interaction.showModal(modal);

      const modalHandler = async (modalInteraction) => {
        if (!modalInteraction.isModalSubmit()) return;
        if (modalInteraction.customId !== 'editPingOptionsModal') return;
        if (modalInteraction.user.id !== message.author.id) return;

        bot.off('interactionCreate', modalHandler);

        usersPerMention = parseInt(modalInteraction.fields.getTextInputValue('usersPerMentionInput')) || usersPerMention;
        deleteTime = parseInt(modalInteraction.fields.getTextInputValue('deleteTimeInput')) || deleteTime;

        await modalInteraction.reply({
          content: `> Options mises à jour : ${usersPerMention} utilisateurs par message\n> suppression après ${deleteTime} sec`,
          flags: 64
        }).catch(() => {});

        await msg.edit({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      };

      bot.on('interactionCreate', modalHandler);
      collector.once('end', () => bot.off('interactionCreate', modalHandler));
    }

    if (interaction.customId === 'startPing') {
      if (!mentionChannels.length || !mentionRoles.length)
        return interaction.reply({ content: '> Veuillez sélectionner au moins un salon et un rôle', flags: 64 }).catch(() => {});

      isRunning = true;
      await interaction.update({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 }).catch(() => {});

      const membersCollection = await fetchMembersSafe();
      const memberSet = new Set();
      if (membersCollection) {
        for (const roleId of mentionRoles) {
          if (!message.guild.roles.cache.has(roleId)) continue;

          const roleMembers = membersCollection.filter((member) => member.roles?.cache?.has(roleId));
          for (const member of roleMembers.values()) {
            memberSet.add(`<@${member.id}>`);
          }
        }
      }
      const members = [...memberSet];

      for (const channelId of mentionChannels) {
        const channel = message.guild.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased()) continue;

        for (let i = 0; i < members.length; i += usersPerMention) {
          const chunk = members.slice(i, i + usersPerMention);
          if (!chunk.length) continue;

          try {
            const sent = await channel.send({
              content: chunk.join(' ')
            });
            setTimeout(() => sent.delete().catch(() => {}), deleteTime * 1000);
          } catch {
            continue;
          }
        }
      }

      isRunning = false;
      mentionChannels = [];
      mentionRoles = [];
      await bot.db.prepare('UPDATE guilds SET pingroleChannels = ?, pingroleRoles = ? WHERE id = ?')
        .run(JSON.stringify(mentionChannels), JSON.stringify(mentionRoles), message.guild.id);

      await msg.edit({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }
  });
};
