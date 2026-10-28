const Discord = require('discord.js');

exports.help = {
  name: 'badword',
  aliases: ["bad"],
  type: 'owner',
  description: 'Gérer la liste des mots interdits',
};

exports.run = async (bot, message) => {
  if (!message.guild) return;
  if (!bot.functions.checkPerm(bot, message, 'owner')) return;

  const req = bot.functions.ensureGuildRow(bot, message.guild.id);
  let data = JSON.parse(req?.badword || '[]')
    .map(word => String(word || '').trim().toLowerCase())
    .filter(Boolean);
  let page = 1;
  bot.badwordCache ??= new Map();
  bot.badwordCache.set(message.guild.id, [...data]);

  const syncCache = () => {
    bot.badwordCache.set(message.guild.id, [...data]);
  };

  const sendEphemeral = async (interaction, content) => {
    const payload = {
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      components: [
        new Discord.ContainerBuilder().addTextDisplayComponents(
          new Discord.TextDisplayBuilder().setContent(content),
        ),
      ],
    };

    if (interaction.replied || interaction.deferred) {
      return interaction.followUp(payload);
    }

    return interaction.reply(payload);
  };

  const sendModalResult = async (interaction, title, content) => {
    const payload = {
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      components: [
        new Discord.ContainerBuilder()
          .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent(`# ${title}`),
          )
          .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent(content),
          )
          .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true)),
      ],
      allowedMentions: { parse: [] },
    };

    if (interaction.replied || interaction.deferred) {
      return interaction.followUp(payload);
    }

    try {
      return await interaction.reply(payload);
    } catch (error) {
      if (error?.code === 40060) {
        return interaction.followUp(payload);
      }
      throw error;
    }
  };

  const normalizeWords = (value) =>
    String(value || '')
      .split(/[\n,]+/)
      .map(word => word.trim().toLowerCase())
      .filter(Boolean);

  const buildPanel = (currentPage) => {
    const pageTotal = Math.ceil(data.length / 5) || 1;
    const start = (currentPage - 1) * 5;
    const end = currentPage * 5;

    const list =
      data.slice(start, end).map((word, index) => `> ${start + index + 1}. \`${word}\``).join('\n\n') ||
      '> Aucun mot interdit';

    const selectOptions = [];

    if (data.length > 5) {
      selectOptions.push({
        label: 'Page precedente',
        value: 'prev',
        emoji: { id: '1492275922156523671', name: 'left' },
        default: false,
      });
    }

    selectOptions.push(
      {
        label: 'Ajouter un mot',
        value: 'add',
        emoji: { id: '1492274382725320836', name: 'add' },
      },
      {
        label: 'Supprimer un mot',
        value: 'remove',
        emoji: { id: '1492274433232998511', name: 'remove' },
      },
      {
        label: 'Supprimer tous les mots',
        value: 'delall',
        emoji: { id: '1492274604268327084', name: 'delall' },
      },
    );

    if (data.length > 5) {
      selectOptions.push({
        label: 'Page suivante',
        value: 'next',
        emoji: { id: '1492275784415711295', name: 'right' },
        default: false,
      });
    }

    const select = new Discord.StringSelectMenuBuilder()
      .setCustomId('badwordPanel')
      .setPlaceholder('Changer de page / ajouter ou supprimer un mot')
      .addOptions(selectOptions);

    return new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('# Liste des badwords'),
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          `> Vous pouvez consulter, ajouter ou supprimer des mots interdits\n> Nombre actuel de mots : \`${data.length}\`\n> Page ${currentPage}/${pageTotal}\n> Les mots bloqués suppriment aussi les messages contenant des liens comme \`http\`, \`https\` ou \`discord.gg\` si tu les ajoutes dans la liste.`,
        ),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(list))
      .addActionRowComponents(new Discord.ActionRowBuilder().addComponents(select))
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true));
  };

  const buildAddModal = () =>
    new Discord.ModalBuilder()
      .setCustomId('badword_modal_add')
      .setTitle('Ajouter des bad words')
      .addComponents(
        new Discord.ActionRowBuilder().addComponents(
          new Discord.TextInputBuilder()
            .setCustomId('words')
            .setLabel('Mots a bloquer')
            .setStyle(Discord.TextInputStyle.Paragraph)
            .setRequired(true),
        ),
      );

  const buildRemoveModal = () =>
    new Discord.ModalBuilder()
      .setCustomId('badword_modal_remove')
      .setTitle('Supprimer des bad words')
      .addComponents(
        new Discord.ActionRowBuilder().addComponents(
          new Discord.TextInputBuilder()
            .setCustomId('words')
            .setLabel('Mots a retirer')
            .setStyle(Discord.TextInputStyle.Paragraph)
            .setRequired(true),
        ),
      );

  const msg = await message.reply({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildPanel(page)],
    allowedMentions: { parse: [] },
  });

  const collector = msg.createMessageComponentCollector({ time: 300000 });

  collector.on('collect', async (i) => {
    try {
      if (i.user.id !== message.author.id) {
        return sendEphemeral(i, '> Action réservée au propriétaire de la commande.');
      }

      if (!i.isStringSelectMenu() || i.customId !== 'badwordPanel') return;

      const action = i.values[0];
      const pageTotal = Math.ceil(data.length / 5) || 1;

      if (action === 'prev' && page > 1) {
        page--;
        return i.update({
          flags: Discord.MessageFlags.IsComponentsV2,
          components: [buildPanel(page)],
          allowedMentions: { parse: [] },
        });
      }

      if (action === 'next' && page < pageTotal) {
        page++;
        return i.update({
          flags: Discord.MessageFlags.IsComponentsV2,
          components: [buildPanel(page)],
          allowedMentions: { parse: [] },
        });
      }

      if (action !== 'add' && action !== 'remove' && action !== 'delall') {
        return i.update({
          flags: Discord.MessageFlags.IsComponentsV2,
          components: [buildPanel(page)],
          allowedMentions: { parse: [] },
        });
      }

      if (action === 'delall') {
        data = [];
        await bot.db.prepare('UPDATE guilds SET badword = ? WHERE id = ?')
          .run(JSON.stringify(data), message.guild.id);
        syncCache();

        await msg.edit({
          flags: Discord.MessageFlags.IsComponentsV2,
          components: [buildPanel(page)],
          allowedMentions: { parse: [] },
        });

        return sendEphemeral(i, '> Tous les mots interdits ont été supprimés.');
      }

      if (action === 'add') {
        const modal = buildAddModal();
        await i.showModal(modal);

        const submitted = await i.awaitModalSubmit({
          filter: (inter) =>
            inter.user.id === message.author.id &&
            inter.customId === 'badword_modal_add',
          time: 60000,
        }).catch(() => null);

        if (!submitted) return;

        const words = normalizeWords(submitted.fields.getTextInputValue('words'));
        const added = [];
        const alreadyExists = [];

        for (const word of words) {
          if (data.includes(word)) {
            alreadyExists.push(word);
            continue;
          }
          data.push(word);
          added.push(word);
        }

        data.sort((a, b) => a.localeCompare(b));
        await bot.db
          .prepare('UPDATE guilds SET badword = ? WHERE id = ?')
          .run(JSON.stringify(data), message.guild.id);
        syncCache();

        page = Math.min(page, Math.ceil(data.length / 5) || 1);

        await msg.edit({
          flags: Discord.MessageFlags.IsComponentsV2,
          components: [buildPanel(page)],
          allowedMentions: { parse: [] },
        });

        const lines = [];
        if (added.length) lines.push(`> Ajoutés : ${added.map(word => `\`${word}\``).join(', ')}`);
        if (alreadyExists.length) lines.push(`> Déjà présents : ${alreadyExists.map(word => `\`${word}\``).join(', ')}`);
        if (!lines.length) lines.push('> Aucun mot ajouté');

        return sendModalResult(submitted, 'Ajouter des bad words', lines.join('\n'));
      }

      if (action === 'remove') {
        const modal = buildRemoveModal();
        await i.showModal(modal);

        const submitted = await i.awaitModalSubmit({
          filter: (inter) =>
            inter.user.id === message.author.id &&
            inter.customId === 'badword_modal_remove',
          time: 60000,
        }).catch(() => null);

        if (!submitted) return;

        const words = normalizeWords(submitted.fields.getTextInputValue('words'));
        const removed = [];
        const notFound = [];

        for (const word of words) {
          if (!data.includes(word)) {
            notFound.push(word);
            continue;
          }
          data = data.filter(entry => entry !== word);
          removed.push(word);
        }

        await bot.db
          .prepare('UPDATE guilds SET badword = ? WHERE id = ?')
          .run(JSON.stringify(data), message.guild.id);
        syncCache();

        page = Math.min(page, Math.ceil(data.length / 5) || 1);

        await msg.edit({
          flags: Discord.MessageFlags.IsComponentsV2,
          components: [buildPanel(page)],
          allowedMentions: { parse: [] },
        });

        const lines = [];
        if (removed.length) lines.push(`> Supprimés : ${removed.map(word => `\`${word}\``).join(', ')}`);
        if (notFound.length) lines.push(`> Introuvables : ${notFound.map(word => `\`${word}\``).join(', ')}`);
        if (!lines.length) lines.push('> Aucun mot supprimé');

        return sendModalResult(submitted, 'Supprimer des bad words', lines.join('\n'));
      }

      await msg.edit({
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [buildPanel(page)],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.log(error);
    }
  });
};
