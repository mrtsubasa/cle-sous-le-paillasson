const Discord = require('discord.js');
const { getConfiguredLogChannelId } = require('../../Utils/logChannels');
const { addRoleBypass, removeRoleBypass } = require('../../Utils/bypass');

exports.help = {
  name: 'bypass',
  aliases: ['bypass-add', 'bypass-remove'],
  type: 'owner',
  description: 'Gerer la liste des bypass',
};

exports.run = async (bot, message) => {
  if (!message.guild) return;
  if (!bot.functions.checkPerm(bot, message, 'owner')) return;

  const req = bot.functions.getGuildData(bot, message.guild.id);
  let data = JSON.parse(req?.roleBypass || '[]');
  let page = 1;

  const sendEphemeral = async (interaction, content) => {
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

    if (interaction.replied || interaction.deferred) {
      return interaction.followUp(payload);
    }

    try {
      return await interaction.reply(payload);
    } catch (error) {
      if (error?.code === 40060) return interaction.followUp(payload);
      throw error;
    }
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
      if (error?.code === 40060) return interaction.followUp(payload);
      throw error;
    }
  };

  async function sendAddLog(targets) {
    const logChannelId = getConfiguredLogChannelId(bot, message.guild.id, 'bypass_add_logs');
    const logChannel = logChannelId ? message.guild.channels.cache.get(logChannelId) : null;
    if (!logChannel?.isTextBased?.()) return;

    const unixTimestamp = Math.floor(Date.now() / 1000);
    const list = targets.map((id) => `> <@${id}> (\`${id}\`)`).join('\n');

    const container = new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('# Bypass ajoute'),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          `> ↳ Ajouté par : <@${message.author.id}> **${message.author.username}** (\`${message.author.id}\`)\n`
          + `> ↳ Utilisateurs :\n${list}\n`
          + `> ↳ Date : <t:${unixTimestamp}:F>`,
        ),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true));

    await logChannel.send({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [container],
      allowedMentions: { parse: [] },
    });
  }

  async function sendRemoveLog(targets) {
    const logChannelId = getConfiguredLogChannelId(bot, message.guild.id, 'bypass_remove_logs');
    const logChannel = logChannelId ? message.guild.channels.cache.get(logChannelId) : null;
    if (!logChannel?.isTextBased?.()) return;

    const unixTimestamp = Math.floor(Date.now() / 1000);
    const list = targets.map((id) => `> <@${id}> (\`${id}\`)`).join('\n');

    const container = new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('# Bypass retire'),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          `> ↳ Retiré par : <@${message.author.id}> **${message.author.username}** (\`${message.author.id}\`)\n`
          + `> ↳ Utilisateurs :\n${list}\n`
          + `> ↳ Date : <t:${unixTimestamp}:F>`,
        ),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true));

    await logChannel.send({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [container],
      allowedMentions: { parse: [] },
    });
  }

  const buildPanel = (currentPage) => {
    const pageTotal = Math.ceil(data.length / 5) || 1;
    const start = (currentPage - 1) * 5;
    const end = currentPage * 5;

    const list =
      data.slice(start, end).map((m) => `> <@${m.id}> (\`${m.id}\`)`).join('\n\n') ||
      '> Aucun bypass';

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
        label: 'Ajouter un bypass',
        value: 'add',
        emoji: { id: '1492274382725320836', name: 'add' },
      },
      {
        label: 'Supprimer un bypass',
        value: 'remove',
        emoji: { id: '1492274433232998511', name: 'remove' },
      },
      {
        label: 'Supprimer tous les bypass',
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
      .setCustomId('bypassPanel')
      .setPlaceholder('Changer de page / ajouter ou supprimer un bypass')
      .addOptions(selectOptions);

    return new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('# Liste des bypass'),
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          `> Vous pouvez consulter, ajouter ou supprimer des membres de la liste des bypass\n> Nombre actuel de bypass : \`${data.length}\`\n> Page ${currentPage}/${pageTotal}`,
        ),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(list))
      .addActionRowComponents(new Discord.ActionRowBuilder().addComponents(select))
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true));
  };

  const buildAddModal = () =>
    new Discord.ModalBuilder()
      .setCustomId('bypass_modal_add')
      .setTitle('Ajouter un bypass')
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

      if (!i.isStringSelectMenu() || i.customId !== 'bypassPanel') return;

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
        await bot.db.prepare('UPDATE guilds SET roleBypass = ? WHERE id = ?')
          .run(JSON.stringify(data), message.guild.id);

        await msg.edit({
          flags: Discord.MessageFlags.IsComponentsV2,
          components: [buildPanel(page)],
          allowedMentions: { parse: [] },
        });

        return sendEphemeral(i, 'Tous les bypass ont été supprimés.');
      }

      if (action === 'add') {
        const modal = buildAddModal();

        await i.showModal(modal);

        const submitted = await i.awaitModalSubmit({
          filter: (inter) =>
            inter.user.id === message.author.id &&
            inter.customId === 'bypass_modal_add',
          time: 60000,
        }).catch(() => null);

        if (!submitted) return;

        const selectedUsers = submitted.fields.getSelectedUsers('user_selected', true);
        const users = selectedUsers.map((user) => user.id);
        const added = [];
        const alreadyBypass = [];

        for (const id of users) {
          if (data.find((x) => x.id === id)) {
            alreadyBypass.push(id);
            continue;
          }
          data.push({ author: message.author.id, id, time: Date.now() });
          added.push(id);
        }

        await bot.db
          .prepare('UPDATE guilds SET roleBypass = ? WHERE id = ?')
          .run(JSON.stringify(data), message.guild.id);

        if (added.length) await sendAddLog(added);

        await sendModalResult(
          submitted,
          'Ajouter un bypass',
          [
            added.length ? `> Ajoutes : ${added.map((id) => `<@${id}>`).join(', ')}` : null,
            alreadyBypass.length
              ? `> Deja bypass : ${alreadyBypass.map((id) => `<@${id}>`).join(', ')}`
              : null,
            !added.length && !alreadyBypass.length ? '> Aucun utilisateur ajoute' : null,
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
          filter: (m) => m.author.id === message.author.id,
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
                    new Discord.TextDisplayBuilder().setContent('> Utilisateur pas bypass'),
                  ),
              ],
            });
          }

          data = data.filter((x) => x.id !== id);

          await bot.db.prepare('UPDATE guilds SET roleBypass = ? WHERE id = ?')
            .run(JSON.stringify(data), message.guild.id);

          await msg.edit({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [buildPanel(page)],
            allowedMentions: { parse: [] },
          });

          await m.delete().catch(() => {});

          if (id) await sendRemoveLog([id]);

          return await i.followUp({
            flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
            components: [
              new Discord.ContainerBuilder()
                .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(
                  new Discord.TextDisplayBuilder().setContent(`> <@${id}> supprimé de la liste des bypass`),
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
