const Discord = require('discord.js');
const {
  getGuildLaisseList,
  setGuildLaisseList,
  clearGuildLaisseList,
  getGuildLaisseOwner,
} = require('../../Utils/bot.js');

function resolveUserId(input) {
  if (!input) return null;
  return (
    input.match(/<@!?(\d+)>/)?.[1] ||
    input.match(/\d{15,25}/)?.[0] ||
    null
  );
}

exports.help = {
  name: 'laisse',
  aliases: [],
  type: 'owner',
  description: "Gerer ta liste personnelle de laisse, ou celle d'un membre",
};

exports.run = async (bot, message, args = []) => {
  if (!message.guild) return;
  if (!bot.functions.checkPerm(bot, message, 'owner')) return;

  const authorId = message.author.id;
  const requestedId = resolveUserId(args[0]);
  let activeOwnerId = authorId;

  if (requestedId && requestedId !== authorId) {
    const targetMember = await message.guild.members.fetch(requestedId).catch(() => null);
    if (!targetMember) {
      const payload = {
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
        components: [
          new Discord.ContainerBuilder().addTextDisplayComponents(
            new Discord.TextDisplayBuilder().setContent('> Utilisateur cible invalide ou introuvable.'),
          ),
        ],
      };

      return message.reply(payload).catch(() => null);
    }

    activeOwnerId = targetMember.id;
  }

  let data = getGuildLaisseList(bot, message.guild.id, activeOwnerId);
  let page = 1;

  const saveData = async () => {
    data = setGuildLaisseList(bot, message.guild.id, activeOwnerId, data);
  };

  const sendEphemeral = async (interaction, content) => {
    const payload = {
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      components: [
        new Discord.ContainerBuilder().addTextDisplayComponents(
          new Discord.TextDisplayBuilder().setContent(content),
        ),
      ],
      allowedMentions: { parse: [] },
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
        .join('\n\n') || '> Aucune personne en laisse';

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
        label: 'Ajouter une personne',
        value: 'add',
        emoji: { id: '1488193340011712653', name: 'add' },
      },
      {
        label: 'Supprimer une personne',
        value: 'remove',
        emoji: { id: '1488193340011712653', name: 'remove' },
      },
      {
        label: 'Supprimer toute la laisse',
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
      .setCustomId('laissePanel')
      .setPlaceholder('Changer de page / ajouter ou supprimer une personne en laisse')
      .addOptions(selectOptions);

    return new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('# Liste de la laisse'),
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          `> Propriétaire de la liste : <@${activeOwnerId}>\n> Cette liste suit automatiquement ce membre dans ses vocaux.\n> Nombre actuel de personnes en laisse : \`${data.length}\`\n> Page ${currentPage}/${pageTotal}`,
        ),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(list))
      .addActionRowComponents(new Discord.ActionRowBuilder().addComponents(select))
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true));
  };

  const buildAddModal = () =>
    new Discord.ModalBuilder()
      .setCustomId('laisse_modal_add')
      .setTitle('Ajouter une personne en laisse')
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
        return sendEphemeral(i, '> Ce panneau ne t appartient pas.');
      }

      if (!i.isStringSelectMenu() || i.customId !== 'laissePanel') return;

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
        return sendEphemeral(i, '> Aucune personne a retirer.');
      }

      if (action === 'delall') {
        data = [];
        await clearGuildLaisseList(bot, message.guild.id, activeOwnerId);

        await msg.edit({
          flags: Discord.MessageFlags.IsComponentsV2,
          components: [buildPanel(page)],
          allowedMentions: { parse: [] },
        });

        return sendEphemeral(i, '> Toute la laisse a ete supprimee.');
      }

      if (action === 'add') {
        const modal = buildAddModal();

        await i.showModal(modal);

        const submitted = await i.awaitModalSubmit({
          filter: (inter) =>
            inter.user.id === message.author.id &&
            inter.customId === `laisse_modal_${action}`,
          time: 60000,
        }).catch(() => null);

        if (!submitted) return;

        const selectedUsers = submitted.fields.getSelectedUsers('user_selected', true);
        const users = selectedUsers.map((user) => user.id);
        const added = [];
        const alreadyInList = [];
        const alreadyLeashed = [];
        const ignoredSelf = [];

        const activeOwnerMember = message.guild.members.cache.get(activeOwnerId)
          || await message.guild.members.fetch(activeOwnerId).catch(() => null);
        const activeOwnerVoiceId = activeOwnerMember?.voice?.channelId || null;

        for (const id of users) {
          if (id === activeOwnerId) {
            ignoredSelf.push(id);
            continue;
          }

          if (data.find((x) => x.id === id)) {
            alreadyInList.push(id);
            continue;
          }

          const existingOwnerId = getGuildLaisseOwner(bot, message.guild.id, id);
          if (existingOwnerId) {
            alreadyLeashed.push({ id, ownerId: existingOwnerId });
            continue;
          }

          data.push({ author: activeOwnerId, id, time: Date.now() });
          added.push(id);
        }

        await saveData();

        if (activeOwnerVoiceId) {
          for (const id of added) {
            const targetMember = message.guild.members.cache.get(id)
              || await message.guild.members.fetch(id).catch(() => null);
            if (!targetMember?.voice?.channelId) continue;

            if (targetMember.voice.channelId !== activeOwnerVoiceId) {
              await targetMember.voice.setChannel(activeOwnerVoiceId).catch(() => {});
            }
          }
        } else {
          for (const id of added) {
            const targetMember = message.guild.members.cache.get(id)
              || await message.guild.members.fetch(id).catch(() => null);
            if (!targetMember?.voice?.channelId) continue;

            await targetMember.voice.disconnect().catch(() => {});
          }
        }

        await sendModalResult(
          submitted,
          'Ajouter une personne en laisse',
          [
            added.length ? `> Ajoutees : ${added.map((id) => `<@${id}>`).join(', ')}` : null,
            activeOwnerVoiceId && added.length
              ? `> Elles suivent maintenant <@${activeOwnerId}> dans <#${activeOwnerVoiceId}>`
              : null,
            alreadyInList.length
              ? `> Deja dans cette liste : ${alreadyInList.map((id) => `<@${id}>`).join(', ')}`
              : null,
            alreadyLeashed.length
              ? `> Deja en laisse chez ${alreadyLeashed.map((entry) => `<@${entry.id}> par <@${entry.ownerId}>`).join(', ')}`
              : null,
            ignoredSelf.length ? '> Tu ne peux pas te mettre toi-meme en laisse.' : null,
            !added.length && !alreadyInList.length && !alreadyLeashed.length && !ignoredSelf.length
              ? '> Aucun utilisateur ajoute'
              : null,
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
                new Discord.TextDisplayBuilder().setContent('> Envoie un ID ou une mention'),
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
          const id = resolveUserId(input);

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
                    new Discord.TextDisplayBuilder().setContent('> Utilisateur pas dans cette laisse.'),
                  ),
              ],
            });
          }

          data = data.filter((x) => x.id !== id);
          await saveData();

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
                  new Discord.TextDisplayBuilder().setContent(`> <@${id}> supprimé de la laisse de <@${activeOwnerId}>`),
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
