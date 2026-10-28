const Discord = require('discord.js');
const { MessageFlags } = require('discord.js');

module.exports = {
  name: 'owner',
  description: 'Gerer la liste des owners',
  dm_permission: false,
  perm: 'sys',

  run: async (bot, interaction) => {
    if (!bot.functions.checkPerm(bot, interaction, 'sys')) {
      return interaction.reply({
        flags: Discord.MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        components: [
          new Discord.ContainerBuilder()
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
              new Discord.TextDisplayBuilder().setContent('> Tu ne peux pas utiliser cette commande.'),
            )
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true)),
        ],
      });
    }

    const req = bot.functions.getGuildData(bot, interaction.guild.id);
    let data = JSON.parse(req?.owner || '[]');
    let page = 1;

    const sendEphemeral = async (currentInteraction, content) => {
      const payload = {
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
        components: [
          new Discord.ContainerBuilder()
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
              new Discord.TextDisplayBuilder().setContent(`> ${content}`),
            )
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true)),
        ],
      };

      if (currentInteraction.replied || currentInteraction.deferred) {
        return currentInteraction.followUp(payload);
      }

      try {
        return await currentInteraction.reply(payload);
      } catch (error) {
        if (error?.code === 40060) return currentInteraction.followUp(payload);
        throw error;
      }
    };

    const buildPanel = (currentPage) => {
      const pageTotal = Math.ceil(data.length / 5) || 1;
      const start = (currentPage - 1) * 5;
      const end = currentPage * 5;

      const list =
        data.slice(start, end).map((m) => `> <@${m.id}> (\`${m.id}\`)`).join('\n\n') ||
        '> Aucun owner';

      const selectOptions = [];

      if (data.length > 5) {
        selectOptions.push({
          label: 'Page precedente',
          value: 'prev',
          emoji: { id: '1455728075026202674', name: 'left' },
        });
      }

      selectOptions.push(
        { label: 'Ajouter un owner', value: 'add', emoji: { id: '1492274382725320836', name: 'add' } },
        { label: 'Supprimer un owner', value: 'remove', emoji: { id: '1492274433232998511', name: 'remove' } },
        { label: 'Supprimer tous les owners', value: 'delall', emoji: { id: '1417146997739360326', name: 'delall' } },
      );

      if (data.length > 5) {
        selectOptions.push({
          label: 'Page suivante',
          value: 'next',
          emoji: { id: '1455728027617984543', name: 'right' },
        });
      }

      const select = new Discord.StringSelectMenuBuilder()
        .setCustomId('ownerPanelSlash')
        .setPlaceholder('Changer de page / ajouter ou supprimer un owner')
        .addOptions(selectOptions);

      return {
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [
          new Discord.ContainerBuilder()
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
            .addTextDisplayComponents(
              new Discord.TextDisplayBuilder().setContent(list),
            )
            .addActionRowComponents(new Discord.ActionRowBuilder().addComponents(select))
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true)),
        ],
        allowedMentions: { parse: [] },
      };
    };

    const buildAddModal = () =>
      new Discord.ModalBuilder()
        .setCustomId('owner_modal_slash_add')
        .setTitle('Ajouter un owner')
        .addLabelComponents(
          new Discord.LabelBuilder()
            .setLabel('Choisir les utilisateurs a ajouter')
            .setUserSelectMenuComponent(
              new Discord.UserSelectMenuBuilder()
                .setCustomId('user_selected')
                .setMinValues(1)
                .setMaxValues(25)
                .setRequired(true),
            ),
        );

    await interaction.reply(buildPanel(page));

    const msg = await interaction.fetchReply();

    const collector = msg.createMessageComponentCollector({ time: 300000 });

    collector.on('collect', async (i) => {
      if (i.user.id !== interaction.user.id) {
        return sendEphemeral(i, 'Ce panel ne vous appartient pas.');
      }

      if (!i.isStringSelectMenu() || i.customId !== 'ownerPanelSlash') return;

      const action = i.values[0];
      const pageTotal = Math.ceil(data.length / 5) || 1;

      if (action === 'prev' && page > 1) {
        page--;
        return i.update(buildPanel(page));
      }

      if (action === 'next' && page < pageTotal) {
        page++;
        return i.update(buildPanel(page));
      }

      if (action !== 'add' && action !== 'remove' && action !== 'delall') {
        return i.update({
          flags: Discord.MessageFlags.IsComponentsV2,
          components: [buildPanel(page).components[0]],
          allowedMentions: { parse: [] },
        });
      }

      if (action === 'remove' && data.length === 0) {
        return sendEphemeral(i, '> Aucun utilisateur a retirer.');
      }

      if (action === 'delall') {
        data = [];
        await bot.db.prepare('UPDATE guilds SET owner = ? WHERE id = ?')
          .run(JSON.stringify(data), interaction.guild.id);

        await msg.edit(buildPanel(page));

        return sendEphemeral(i, 'Tous les owners ont été supprimés.');
      }

      if (action === 'add') {
        const modal = buildAddModal();

        await i.showModal(modal);

        const submitted = await i.awaitModalSubmit({
          filter: (inter) =>
            inter.user.id === interaction.user.id &&
            inter.customId === 'owner_modal_slash_add',
          time: 60000,
        }).catch(() => null);

        if (!submitted) return;

        const users = submitted.fields.getSelectedUsers('user_selected', true).map((u) => u.id);

        const added = [];
        const already = [];

        for (const id of users) {
          if (data.find((x) => x.id === id)) already.push(id);
          else {
            data.push({ id, author: interaction.user.id, time: Date.now() });
            added.push(id);
          }
        }

        await bot.db.prepare('UPDATE guilds SET owner = ? WHERE id = ?')
          .run(JSON.stringify(data), interaction.guild.id);

        await msg.edit(buildPanel(page));

        return submitted.reply({
          flags: Discord.MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          components: [
            new Discord.ContainerBuilder()
              .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
              .addTextDisplayComponents(
                new Discord.TextDisplayBuilder().setContent('# Ajouter un owner'),
              )
              .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
              .addTextDisplayComponents(
                new Discord.TextDisplayBuilder().setContent(
                  `Ajoutés: ${added.map((x) => `<@${x}>`).join(', ') || 'aucun'}`,
                ),
              )
              .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true)),
          ],
          allowedMentions: { parse: [] },
        });
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
          filter: (m) => m.author.id === interaction.user.id,
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

          const exists = data.find((x) => x.id === id);

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

          data = data.filter((x) => x.id !== id);

          await bot.db.prepare('UPDATE guilds SET owner = ? WHERE id = ?')
            .run(JSON.stringify(data), interaction.guild.id);

          await msg.edit(buildPanel(page));

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

      return i.update({
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [buildPanel(page).components[0]],
        allowedMentions: { parse: [] },
      });
    });
  },
};
