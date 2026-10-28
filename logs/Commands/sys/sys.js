const Discord = require('discord.js');

exports.help = {
  name: 'sys',
  aliases: [],
  type: 'buyer',
  description: 'Gerer la liste des sys',
};

exports.run = async (bot, message) => {
  if (!bot.functions.checkPerm(bot, message, 'buyer')) return;

  const req = bot.functions.getGuildData(bot, message.guild.id);
  let data = JSON.parse(req?.sys || '[]');
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
      data.slice(start, end).map((m) => `> <@${m.id}> (\`${m.id}\`)`).join('\n\n') ||
      '> Aucun sys';

    const selectOptions = [];

    if (data.length > 5) {
      selectOptions.push({
        label: 'Page precedente',
        value: 'prev',
        emoji: { id: '1455728075026202674', name: 'left' },
      });
    }

    selectOptions.push(
      {
        label: 'Ajouter un sys',
        value: 'add',
        emoji: { id: '1492274382725320836', name: 'add' },
      },
      {
        label: 'Supprimer un sys',
        value: 'remove',
        emoji: { id: '1492274433232998511', name: 'remove' },
      },
      {
        label: 'Supprimer tous les sys',
        value: 'delall',
        emoji: { id: '1417146997739360326', name: 'delall' },
      },
    );

    if (data.length > 5) {
      selectOptions.push({
        label: 'Page suivante',
        value: 'next',
        emoji: { id: '1455728027617984543', name: 'right' },
      });
    }

    const select = new Discord.StringSelectMenuBuilder()
      .setCustomId('sysPanel')
      .setPlaceholder('Changer de page / ajouter ou supprimer un sys')
      .addOptions(selectOptions);

    return new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('# Liste des sys'))
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          `> Vous pouvez consulter, ajouter ou supprimer des membres de la liste des sys\n> Nombre actuel de sys : \`${data.length}\`\n> Page ${currentPage}/${pageTotal}`,
        ),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(list))
      .addActionRowComponents(new Discord.ActionRowBuilder().addComponents(select))
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true));
  };

  const buildAddModal = () =>
    new Discord.ModalBuilder()
      .setCustomId('sys_modal_add')
      .setTitle('Ajouter un sys')
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

    if (!i.isStringSelectMenu() || i.customId !== 'sysPanel') return;

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
        await bot.db.prepare('UPDATE guilds SET sys = ? WHERE id = ?')
          .run(JSON.stringify(data), message.guild.id);

        await msg.edit({
          flags: Discord.MessageFlags.IsComponentsV2,
          components: [buildPanel(page)],
          allowedMentions: { parse: [] },
        });

        return sendEphemeral(i, 'Tous les sys ont été supprimés.');
      }

      if (action === 'add') {
        const modal = buildAddModal();

        await i.showModal(modal);

        const submitted = await i.awaitModalSubmit({
          filter: (inter) =>
            inter.user.id === message.author.id &&
            inter.customId === 'sys_modal_add',
          time: 60000,
        }).catch(() => null);

        if (!submitted) return;

        const selectedUsers = submitted.fields.getSelectedUsers('user_selected', true);
        const users = selectedUsers.map((user) => user.id);
        const added = [];
        const alreadyInList = [];

        for (const id of users) {
          if (data.find((x) => x.id === id)) {
            alreadyInList.push(id);
            continue;
          }
          data.push({ author: message.author.id, id, time: Date.now() });
          added.push(id);
        }

        await bot.db
          .prepare('UPDATE guilds SET sys = ? WHERE id = ?')
          .run(JSON.stringify(data), message.guild.id);

        await msg.edit({
          flags: Discord.MessageFlags.IsComponentsV2,
          components: [buildPanel(page)],
          allowedMentions: { parse: [] },
        });

        await sendModalResult(
          submitted,
          'Ajouter un sys',
          [
            added.length ? `> Ajoutes : ${added.map((id) => `<@${id}>`).join(', ')}` : null,
            alreadyInList.length
              ? `> Deja sys : ${alreadyInList.map((id) => `<@${id}>`).join(', ')}`
              : null,
            !added.length && !alreadyInList.length ? '> Aucun utilisateur ajoute' : null,
          ]
            .filter(Boolean)
            .join('\n'),
        );

        return;
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
                    new Discord.TextDisplayBuilder().setContent('> Utilisateur pas sys'),
                  ),
              ],
            });
          }

          data = data.filter(x => x.id !== id);

          await bot.db.prepare('UPDATE guilds SET sys = ? WHERE id = ?')
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
                  new Discord.TextDisplayBuilder().setContent(`> <@${id}> supprimé de la liste des sys`),
                )
                .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true)),
            ],
          });
        });

        return;
      }

      return i.update({
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [buildPanel(page)],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.log(error);
    }
  });
};
