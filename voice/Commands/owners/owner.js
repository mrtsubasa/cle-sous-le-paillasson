const Discord = require('discord.js');

exports.help = {
    name: 'owner',
    aliases: [],
    type: 'sys',
    description: 'Gérer la liste des owners'
}

exports.run = async (bot, message) => {
    if (!message.guild) return;

    if (!bot.functions.checkPerm(bot, message, 'sys')) return;

  const req = bot.functions.checkGuild(bot, message.guild.id);
  let data = JSON.parse(req.owner || '[]');
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
        .join('\n\n') || '> Aucun owner';

    const selectOptions = [];

    if (data.length > 5) {
      selectOptions.push({
        label: 'Page precedente',
        value: 'prev',
        emoji: { id: '1488193340011712653', name: 'left' },
        default: false,
      });
    }

    selectOptions.push(
      {
        label: 'Ajouter un owner',
        value: 'add',
        emoji: { id: '1488193340011712653', name: 'add' },
      },
      {
        label: 'Supprimer un owner',
        value: 'remove',
        emoji: { id: '1488193340011712653', name: 'remove' },
      },
      {
        label: 'Supprimer tous les owners',
        value: 'delall',
        emoji: { id: '1488193340011712653', name: 'delall' },
      },
    );

    if (data.length > 5) {
      selectOptions.push({
        label: 'Page suivante',
        value: 'next',
        emoji: { id: '1488193340011712653', name: 'right' },
        default: false,
      });
    }

    const select = new Discord.StringSelectMenuBuilder()
      .setCustomId('ownerPanel')
      .setPlaceholder('Changer de page / ajouter ou supprimer un owner')
      .addOptions(selectOptions);

    return new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('# Liste des owners'),
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          `> Vous pouvez consulter, ajouter ou supprimer des membres de la liste des owners\n> Nombre actuel d'owners : \`${data.length}\`\n> Page ${currentPage}/${pageTotal}`,
        ),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(list))
      .addActionRowComponents(new Discord.ActionRowBuilder().addComponents(select))
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true));
  };

  const buildAddModal = () =>
    new Discord.ModalBuilder()
      .setCustomId('owner_modal_add')
      .setTitle('Ajouter un owner')
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

      if (!i.isStringSelectMenu() || i.customId !== 'ownerPanel') return;

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
        await bot.db.prepare('UPDATE guilds SET owner = @data WHERE id = @id')
          .run({ data: JSON.stringify(data), id: message.guild.id });

        await msg.edit({
          flags: Discord.MessageFlags.IsComponentsV2,
          components: [buildPanel(page)],
          allowedMentions: { parse: [] },
        });

        return sendEphemeral(i, 'Tous les owners ont été supprimés.');
      }

      if (action === 'add') {
        const modal = buildAddModal();

        await i.showModal(modal);

        const submitted = await i.awaitModalSubmit({
          filter: (inter) =>
            inter.user.id === message.author.id &&
            inter.customId === `owner_modal_${action}`,
          time: 60000,
        }).catch(() => null);

        if (!submitted) return;

        const selectedUsers = submitted.fields.getSelectedUsers('user_selected', true);
        const users = selectedUsers.map((user) => user.id);
        const added = [];
        const alreadyOwner = [];

        for (const id of users) {
          if (data.find((x) => x.id === id)) {
            alreadyOwner.push(id);
            continue;
          }
          data.push({ author: message.author.id, id, time: Date.now() });
          added.push(id);
        }

        await bot.db
          .prepare('UPDATE guilds SET owner = @data WHERE id = @id')
          .run({ data: JSON.stringify(data), id: message.guild.id });

        await sendModalResult(
          submitted,
          'Ajouter un owner',
          [
            added.length ? `> Ajoutes : ${added.map((id) => `<@${id}>`).join(', ')}` : null,
            alreadyOwner.length
              ? `> Deja owner : ${alreadyOwner.map((id) => `<@${id}>`).join(', ')}`
              : null,
            !added.length && !alreadyOwner.length ? '> Aucun utilisateur ajoute' : null,
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
                    new Discord.TextDisplayBuilder().setContent('> Utilisateur pas owner'),
                  ),
              ],
            });
          }

          data = data.filter(x => x.id !== id);

          await bot.db.prepare('UPDATE guilds SET owner = @data WHERE id = @id')
            .run({ data: JSON.stringify(data), id: message.guild.id });

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
                  new Discord.TextDisplayBuilder().setContent(`> <@${id}> supprimé de la liste des owners`),
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
