const Discord = require('discord.js');
const { MessageFlags } = require('discord.js');

module.exports = {
  name: 'wl',
  description: 'Gerer la liste des wl',
  dm_permission: false,
  perm: 'owner',

  run: async (bot, interaction) => {
    if (!bot.functions.checkPerm(bot, interaction, 'owner')) {
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
    let data = JSON.parse(req?.wl || '[]');

    let page = 1;
    const PER_PAGE = 25;

    const sendEphemeral = async (currentInteraction, content) => {
      const payload = {
        flags: Discord.MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        components: [
          new Discord.ContainerBuilder()
            .addTextDisplayComponents(
              new Discord.TextDisplayBuilder().setContent(`> ${content}`),
            ),
        ],
      };

      if (currentInteraction.replied || currentInteraction.deferred) {
        return currentInteraction.followUp(payload);
      }

      return currentInteraction.reply(payload);
    };

    const sendModalResult = async (currentInteraction, title, content) => {
      const payload = {
        flags: Discord.MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
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

      if (currentInteraction.replied || currentInteraction.deferred) {
        return currentInteraction.followUp(payload);
      }

      return currentInteraction.reply(payload);
    };

    const getCurrentPageEntries = (currentPage) => {
      const start = (currentPage - 1) * 5;
      return data.slice(start, start + 5);
    };

    const getRemovePageEntries = (currentPage) => {
      const start = (currentPage - 1) * PER_PAGE;
      return data.filter((x) => x && x.id).slice(start, start + PER_PAGE);
    };

    const buildPanelPayload = (currentPage) => {
      const pageTotal = Math.ceil(data.length / 5) || 1;

      const list =
        getCurrentPageEntries(currentPage)
          .map((m) => `> <@${m.id}> (\`${m.id}\`)`)
          .join('\n\n') || '> Aucun wl';

      const options = [];

      if (data.length > 5) {
        options.push({
          label: 'Page precedente',
          value: 'prev',
          emoji: { id: '1455728075026202674', name: 'left' },
        });
      }

      options.push(
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
        options.push({
          label: 'Page suivante',
          value: 'next',
          emoji: { id: '1455728027617984543', name: 'right' },
        });
      }

      const select = new Discord.StringSelectMenuBuilder()
        .setCustomId('wlPanelSlash')
        .setPlaceholder('Changer de page / ajouter ou supprimer un wl')
        .addOptions(options);

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
        .addTextDisplayComponents(
          new Discord.TextDisplayBuilder().setContent(list),
        )
        .addActionRowComponents(
          new Discord.ActionRowBuilder().addComponents(select),
        )
        .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true));
    };

    const buildAddModal = () =>
      new Discord.ModalBuilder()
        .setCustomId('wl_modal_slash_add')
        .setTitle('Ajouter un wl')
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

    await interaction.reply({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [buildPanelPayload(page)],
      allowedMentions: { parse: [] },
    });

    const msg = await interaction.fetchReply();

    const collector = msg.createMessageComponentCollector({ time: 300000 });

    collector.on('collect', async (i) => {
      try {
        if (i.user.id !== interaction.user.id) {
          return sendEphemeral(i, 'Ce panel ne vous appartient pas.');
        }

        if (!i.isStringSelectMenu() || i.customId !== 'wlPanelSlash') return;

        const action = i.values[0];
        const pageTotal = Math.ceil(data.length / 5) || 1;

        if (action === 'prev' && page > 1) {
          page--;
          return i.update({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [buildPanelPayload(page)],
            allowedMentions: { parse: [] },
          });
        }

        if (action === 'next' && page < pageTotal) {
          page++;
          return i.update({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [buildPanelPayload(page)],
            allowedMentions: { parse: [] },
          });
        }

        if (action !== 'add' && action !== 'remove' && action !== 'delall') {
          return i.update({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [buildPanelPayload(page)],
            allowedMentions: { parse: [] },
          });
        }

        if (action === 'remove' && data.length === 0) {
          return sendEphemeral(i, 'Aucun utilisateur a retirer.');
        }

        if (action === 'delall') {
          data = [];
          await bot.db.prepare('UPDATE guilds SET wl = ? WHERE id = ?')
            .run(JSON.stringify(data), interaction.guild.id);

          await msg.edit({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [buildPanelPayload(page)],
            allowedMentions: { parse: [] },
          });

          return sendEphemeral(i, 'Tous les wl ont été supprimés.');
        }

        if (action === 'add') {
          const modal = buildAddModal();

          await i.showModal(modal);

          const submitted = await i.awaitModalSubmit({
            filter: (inter) =>
              inter.user.id === interaction.user.id &&
              inter.customId === 'wl_modal_slash_add',
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

          await bot.db.prepare('UPDATE guilds SET wl = ? WHERE id = ?')
            .run(JSON.stringify(data), interaction.guild.id);

          await msg.edit(buildPanelPayload(page));

          return submitted.reply({
            flags: Discord.MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            components: [
              new Discord.ContainerBuilder()
                .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(
                  new Discord.TextDisplayBuilder().setContent('# Ajouter un wl'),
                )
                .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(
                  new Discord.TextDisplayBuilder().setContent(
                    [
                      added.length ? `> Ajoutes : ${added.map((x) => `<@${x}>`).join(', ')}` : null,
                      already.length ? `> Deja wl : ${already.map((x) => `<@${x}>`).join(', ')}` : null,
                      !added.length && !already.length ? '> Aucun utilisateur ajoute' : null,
                    ]
                      .filter(Boolean)
                      .join('\n'),
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
            flags: Discord.MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
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
                flags: Discord.MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
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
                flags: Discord.MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
                components: [
                  new Discord.ContainerBuilder()
                    .addTextDisplayComponents(
                      new Discord.TextDisplayBuilder().setContent('> Utilisateur pas WL'),
                    ),
                ],
              });
            }

            data = data.filter((x) => x.id !== id);

            await bot.db.prepare('UPDATE guilds SET wl = ? WHERE id = ?')
              .run(JSON.stringify(data), interaction.guild.id);

            await msg.edit({
              flags: Discord.MessageFlags.IsComponentsV2,
              components: [buildPanelPayload(page)],
            });

            await m.delete().catch(() => {});

            return await i.followUp({
              flags: Discord.MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
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

        if (action === 'delall') {
          data = [];
          await bot.db.prepare('UPDATE guilds SET wl = ? WHERE id = ?')
            .run(JSON.stringify(data), interaction.guild.id);

          await msg.edit({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [buildPanelPayload(page)],
            allowedMentions: { parse: [] },
          });

          return sendEphemeral(i, 'Tous les wl ont été supprimés.');
        }

        return i.update(buildPanelPayload(page));
      } catch (error) {
        console.log(error);
      }
    });
  },
};
