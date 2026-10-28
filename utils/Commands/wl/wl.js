const Discord = require('discord.js');

exports.help = {
    name: 'wl',
    aliases: ["w"],
    type: 'owner',
    description: "Gérer la liste des wl"
}

exports.run = async (bot, message) => {
    if (!message.guild) return;

    if (!bot.functions.checkPerm(bot, message, 'owner')) return;

  const req = bot.functions.ensureGuildRow(bot, message.guild.id);
  let data = JSON.parse(req?.wl || '[]');
  let page = 1;

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

  const buildPanel = (currentPage) => {
    const pageTotal = Math.ceil(data.length / 5) || 1;
    const start = (currentPage - 1) * 5;
    const end = currentPage * 5;

    const list =
      data
        .slice(start, end)
        .map((m) => `> <@${m.id}> (\`${m.id}\`)`)
        .join('\n\n') || '> Aucun wl';

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
        label: 'Ajouter un wl',
        value: 'add',
        emoji: { id: '1492274382725320836', name: 'add' },
      },
      {
        label: 'Supprimer un wl',
        value: 'remove',
        emoji: { id: '1492274433232998511', name: 'remove' },
      },
      {
        label: 'Supprimer tous les wl',
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
      .setCustomId('wlPanel')
      .setPlaceholder('Changer de page / ajouter ou supprimer un wl')
      .addOptions(selectOptions);

    return new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('# Liste des wl'),
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          `> Vous pouvez consulter, ajouter ou supprimer des membres de la liste des wl\n> Nombre actuel de wl : \`${data.length}\`\n> Page ${currentPage}/${pageTotal}`,
        ),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(list))
      .addActionRowComponents(new Discord.ActionRowBuilder().addComponents(select))
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true));
  };

  const buildAddModal = () =>
    new Discord.ModalBuilder()
      .setCustomId('wl_modal_add')
      .setTitle('Ajouter un wl')
      .addLabelComponents(
        new Discord.LabelBuilder()
          .setLabel('Choisir les utilisateurs a ajouter')
          .setUserSelectMenuComponent(
            new Discord.UserSelectMenuBuilder()
              .setCustomId('user_selected')
              .setMinValues(1)
              .setMaxValues(5)
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
        return sendEphemeral(i, '> Pas pour toi fdp de merde!!');
      }

      if (!i.isStringSelectMenu() || i.customId !== 'wlPanel') return;

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

      if (action === 'remove' && data.length === 0) {
        return sendEphemeral(i, '> Aucun utilisateur a retirer.');
      }

      if (action === 'delall') {
        data = [];
        await bot.db.prepare('UPDATE guilds SET wl = ? WHERE id = ?')
          .run(JSON.stringify(data), message.guild.id);

        await msg.edit({
          flags: Discord.MessageFlags.IsComponentsV2,
          components: [buildPanel(page)],
          allowedMentions: { parse: [] },
        });

        return sendEphemeral(i, 'Tous les wl ont été supprimés.');
      }

      if (action === 'add') {
        const modal = buildAddModal();

        await i.showModal(modal);

        const submitted = await i.awaitModalSubmit({
          filter: (inter) =>
            inter.user.id === message.author.id &&
            inter.customId === `wl_modal_${action}`,
          time: 60000,
        }).catch(() => null);

        if (!submitted) return;

        const selectedUsers = submitted.fields.getSelectedUsers('user_selected', true);
        const users = selectedUsers.map((user) => user.id);
        const added = [];
        const alreadyWhitelisted = [];

        for (const id of users) {
          if (data.find((x) => x.id === id)) {
            alreadyWhitelisted.push(id);
            continue;
          }
          data.push({ author: message.author.id, id, time: Date.now() });
          added.push(id);
        }

        await bot.db
          .prepare('UPDATE guilds SET wl = ? WHERE id = ?')
          .run(JSON.stringify(data), message.guild.id);

        await sendModalResult(
          submitted,
          'Ajouter un wl',
          [
            added.length ? `> Ajoutes : ${added.map((id) => `<@${id}>`).join(', ')}` : null,
            alreadyWhitelisted.length
              ? `> Deja wl : ${alreadyWhitelisted.map((id) => `<@${id}>`).join(', ')}`
              : null,
            !added.length && !alreadyWhitelisted.length ? '> Aucun utilisateur ajoute' : null,
          ]
            .filter(Boolean)
            .join('\n'),
        );
      }

      if (action === 'remove') {
        await i.deferUpdate();

        await i.followUp({
          flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
          components: [
            new Discord.ContainerBuilder()
              .addTextDisplayComponents(
                new Discord.TextDisplayBuilder().setContent('> Envoyez un ID ou une mention'),
              ),
          ],
        });

        const collectorMsg = msg.channel.createMessageCollector({
          filter: m => m.author.id === message.author.id,
          time: 120000,
          max: 1,
        });

        collectorMsg.on('collect', async (m) => {
          const input = m.content.trim();

          const id =
            input.match(/<@!?(\d+)>/)?.[1] ||
            input.match(/\d{15,25}/)?.[0];

          if (!id) {
            await m.delete().catch(() => {});
            return await i.followUp({
              flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
              components: [
                new Discord.ContainerBuilder()
                  .addTextDisplayComponents(
                    new Discord.TextDisplayBuilder().setContent('> ID invalide.'),
                  ),
                ],
              });
          }

          const exists = data.find(x => x.id === id);

          if (!exists) {
            await m.delete().catch(() => {});
            return await i.followUp({
              flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
              components: [
                new Discord.ContainerBuilder()
                  .addTextDisplayComponents(
                    new Discord.TextDisplayBuilder().setContent('> Utilisateur pas WL'),
                  ),
                ],
              });
          }

          data = data.filter(x => x.id !== id);

          await bot.db.prepare('UPDATE guilds SET wl = ? WHERE id = ?')
            .run(JSON.stringify(data), message.guild.id);

          await msg.edit({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [buildPanel(page)],
            allowedMentions: { parse: [] },
          });

          await m.delete().catch(() => {});

          return await i.followUp({
            flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
            components: [
              new Discord.ContainerBuilder()
                .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(
                  new Discord.TextDisplayBuilder().setContent(`> <@${id}> supprimé de la WL`),
                )
                .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true)),
              ],
            });
        });

        return;
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
