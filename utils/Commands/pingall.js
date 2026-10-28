const { 
  ContainerBuilder, ButtonStyle, MessageFlags,
  ButtonBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelSelectMenuBuilder, ChannelType
} = require('discord.js');

exports.help = {
  name: 'pingall',
  aliases: ["p"],
  type: 'owner',
  description: 'Mentionne tous les utilisateurs du serveur par groupes',
};

exports.run = async (bot, message, args) => {
  if (!bot.functions.checkPerm(bot, message, 'owner')) return;

  let guildData = await bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(message.guild.id);
  if (!guildData) {
    await bot.db.prepare('INSERT INTO guilds (id, mentionChannels) VALUES (?, ?)').run(message.guild.id, JSON.stringify([]));
    guildData = { mentionChannels: '[]' };
  }

  let mentionChannels = JSON.parse(guildData.mentionChannels || '[]');
  let usersPerMention = 10;
  let deleteTime = 10;
  let isRunning = false;

  const formatChannels = (ids) => ids.length ? ids.map(id => `> <#${id}>`).join('\n') : '> Aucun salon configuré';

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

  const buildPanel = () => {
    return new ContainerBuilder()
      .addTextDisplayComponents((text) => text.setContent('# Panel de configuration PingAll'))
      .addTextDisplayComponents((text) => text.setContent('> Configurez les options ci-dessous'))

      .addSeparatorComponents((separator) => separator)
      .addTextDisplayComponents((text) => text.setContent('# Salons de PingAll'))
      .addTextDisplayComponents((text) => text.setContent(formatChannels(mentionChannels)))
      .addActionRowComponents((row) =>
        row.setComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('mentionChannels:select')
            .setPlaceholder('Sélectionnez un salon')
            .addChannelTypes(ChannelType.GuildText)
            .setMinValues(0)
            .setMaxValues(10)
            .setDisabled(isRunning)
        )
      )

      .addSeparatorComponents((separator) => separator)
      .addSectionComponents((section) =>
        section
          .addTextDisplayComponents(
            (text) => text.setContent(`# Start Pingall`)
          )
          .addTextDisplayComponents(
            (text) => text.setContent(`> Nombres d'utilisateurs : ${usersPerMention}\n> Temps avant suppression : ${deleteTime} sec`)
          )
          .setButtonAccessory((button) =>
            button
              .setCustomId('startMention')
              .setLabel('Start')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(isRunning)
          )
      )

      .addSeparatorComponents((separator) => separator)
      .addSectionComponents((section) =>
        section
          .addTextDisplayComponents(
            (text) => text.setContent('# Options PingAll')
          )
          .addTextDisplayComponents(
            (text) => text.setContent('> Modifier les options PingAll')
          )
          .setButtonAccessory((button) =>
            button
              .setCustomId('editOptions')
              .setLabel('Modifier')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(isRunning)
          )
      )
      .addSeparatorComponents((separator) => separator);
  };

  const msg = await message.reply({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });

  const collector = msg.createMessageComponentCollector({ time: 300000 });

  collector.on('collect', async (interaction) => {
    if (interaction.user.id !== message.author.id) return;

    if (interaction.customId === 'mentionChannels:select') {
      mentionChannels = interaction.values;
      await bot.db.prepare('UPDATE guilds SET mentionChannels = ? WHERE id = ?').run(JSON.stringify(mentionChannels), message.guild.id);
      await interaction.update({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });
    }

    if (interaction.customId === 'editOptions') {
      const modal = new ModalBuilder()
        .setCustomId('mentionOptionsModal')
        .setTitle('Modifier options PingAll')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('usersPerMentionInput')
              .setLabel('Nombre d’utilisateurs')
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
        if (modalInteraction.customId !== 'mentionOptionsModal') return;
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

    if (interaction.customId === 'startMention') {
      if (!mentionChannels.length) return interaction.reply({ content: '> Veuillez sélectionner au moins un salon', flags: 64 });

      isRunning = true;
      await interaction.update({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 }).catch(() => {});

      const membersCollection = await fetchMembersSafe();
      const members = membersCollection
        ? membersCollection.filter(m => !m.user.bot).map(m => `<@${m.id}>`)
        : [];

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
      await bot.db.prepare('UPDATE guilds SET mentionChannels = ? WHERE id = ?').run(JSON.stringify(mentionChannels), message.guild.id);
      await msg.edit({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }
  });
};
