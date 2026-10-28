const Discord = require('discord.js');
const { ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

exports.help = {
  name: 'greet',
  aliases: ["g"],
  type: 'owner',
  description: 'Panel de configuration du greet',
};

exports.run = async (bot, message, args) => {
  if (!bot.functions.checkPerm(bot, message, 'owner')) return;

  let guildData = await bot.db
    .prepare('SELECT * FROM guilds WHERE id = ?')
    .get(message.guild.id);

  if (!guildData) {
    await bot.db
      .prepare('INSERT INTO guilds (id, greetChannels, greetLog, greetDeleteTime) VALUES (?, ?, ?, ?)')
      .run(message.guild.id, JSON.stringify([]), null, 10000);

    guildData = { greetChannels: '[]', greetLog: null, greetDeleteTime: 10000 };
  }

  let greetChannels = JSON.parse(guildData.greetChannels || '[]');
  let greetLog = guildData.greetLog || null;
  let greetDeleteTime = parseInt(guildData.greetDeleteTime) || 10000;

  const formatChannels = ids =>
    ids.length ? ids.map(id => `> <#${id}>`).join('\n') : '> Aucun salon configuré';

  const buildPanel = () => {
    return new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('# Panel de configuration'))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('> Configurez les salons de greet ci-dessous'))
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
      
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('# Salons de greet'))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(formatChannels(greetChannels)))
      .addActionRowComponents(
        new Discord.ActionRowBuilder().addComponents(
          new Discord.ChannelSelectMenuBuilder()
            .setCustomId('greetChannels:select')
            .setPlaceholder('Sélectionnez ou désélectionnez les salons de greet')
            .setMinValues(0)
            .setMaxValues(25)
            .addChannelTypes(Discord.ChannelType.GuildText)
        )
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
      
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('# Salon des logs'))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(formatChannels(greetLog ? [greetLog] : [])))
      .addActionRowComponents(
        new Discord.ActionRowBuilder().addComponents(
          new Discord.ChannelSelectMenuBuilder()
            .setCustomId('greetLog:select')
            .setPlaceholder('Sélectionnez ou désélectionnez le salon de logs')
            .setMinValues(0)
            .setMaxValues(1)
            .addChannelTypes(Discord.ChannelType.GuildText)
        )
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
      
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`# Temps avant suppression (ms)`))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`> ${greetDeleteTime} ms`))
      .addActionRowComponents(
        new Discord.ActionRowBuilder().addComponents(
          new Discord.ButtonBuilder()
            .setCustomId('editGreetTime')
            .setLabel('Modifier le temps')
            .setStyle(ButtonStyle.Secondary)
        )
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
  };

  const msg = await message.reply({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildPanel()],
  });

  const collector = msg.createMessageComponentCollector({ time: 180000 });

  const modalHandler = async interaction => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== 'modalGreetTime') return;
    if (interaction.user.id !== message.author.id) return;
    if (interaction.guildId !== message.guild.id) return;

    await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });

    const value = interaction.fields.getTextInputValue('greetTimeInput');
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 0) {
      return interaction.editReply({ content: '> Veuillez entrer un nombre valide ≥ 0' });
    }

    greetDeleteTime = parsed;

    try {
      await bot.db.prepare('UPDATE guilds SET greetDeleteTime = ? WHERE id = ?')
        .run(parsed, interaction.guild.id);

      await interaction.editReply({ content: `> Temps avant suppression mis à jour : ${parsed} ms` });

      const panelMsg = await interaction.channel.messages.fetch(msg.id).catch(() => null);
      if (panelMsg) await panelMsg.edit({ components: [buildPanel()] }).catch(() => {});
    } catch (error) {
      console.error(error);
      await interaction.editReply({ content: '> Impossible de mettre à jour le temps de suppression.' }).catch(() => {});
    }
  };

  bot.on('interactionCreate', modalHandler);

  collector.on('end', () => {
    bot.off('interactionCreate', modalHandler);
  });

  collector.on('collect', async interaction => {
    if (interaction.user.id !== message.author.id) return;

    if (interaction.customId === 'greetChannels:select') {
      const oldChannels = [...greetChannels];
      greetChannels = interaction.values;

      await bot.db.prepare('UPDATE guilds SET greetChannels = ? WHERE id = ?')
        .run(JSON.stringify(greetChannels), interaction.guild.id);

      if (greetLog) {
        const logChannel = await bot.channels.fetch(greetLog).catch(() => null);
        if (logChannel) {
          const added = greetChannels.filter(v => !oldChannels.includes(v));
          const removed = oldChannels.filter(v => !greetChannels.includes(v));
          const actionText = [];
          if (added.length) actionText.push(`> Ajout : ${added.map(id => `<#${id}>`).join(', ')}`);
          if (removed.length) actionText.push(`> Suppression : ${removed.map(id => `<#${id}>`).join(', ')}`);
          if (!actionText.length) actionText.push('Aucune modification');

          const logEmbed = new Discord.ContainerBuilder()
          .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('# Modification des salons de greet'))
            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`> Auteur : <@${interaction.user.id}>`))
            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(actionText.join('\n')))
            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
          await logChannel.send({ flags: Discord.MessageFlags.IsComponentsV2, components: [logEmbed] });
        }
      }
    }

    if (interaction.customId === 'greetLog:select') {
      greetLog = interaction.values[0] || null;
      await bot.db.prepare('UPDATE guilds SET greetLog = ? WHERE id = ?')
        .run(greetLog, interaction.guild.id);
    }

    if (interaction.isButton() && interaction.customId === 'editGreetTime') {
      const modal = new ModalBuilder()
        .setCustomId('modalGreetTime')
        .setTitle('Modifier le temps avant suppression')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('greetTimeInput')
              .setLabel('Temps en millisecondes')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Ex : 10000')
              .setRequired(true)
          )
        );
  return interaction.showModal(modal);
}

await interaction.update({ flags: Discord.MessageFlags.IsComponentsV2, components: [buildPanel()] });
  });
};
