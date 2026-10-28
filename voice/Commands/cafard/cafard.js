const Discord = require('discord.js');
const {
  getGuildCafardList,
  setGuildCafardList,
  clearGuildCafardList,
  getGuildCafardOwner,
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
  name: 'cafard',
  aliases: [],
  type: 'owner',
  description: "Gerer ta liste personnelle de cafards, ou celle d'un membre",
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

  let data = getGuildCafardList(bot, message.guild.id, activeOwnerId);
  let page = 1;

  const saveData = async () => {
    data = setGuildCafardList(bot, message.guild.id, activeOwnerId, data);
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
        .join('\n\n') || '> Aucun cafard';

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
        label: 'Ajouter un cafard',
        value: 'add',
        emoji: { id: '1488193340011712653', name: 'add' },
      },
      {
        label: 'Supprimer un cafard',
        value: 'remove',
        emoji: { id: '1488193340011712653', name: 'remove' },
      },
      {
        label: 'Supprimer tous les cafards',
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
      .setCustomId('cafardPanel')
      .setPlaceholder('Changer de page / ajouter ou supprimer un cafard')
      .addOptions(selectOptions);

    return new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('# Liste des cafards'),
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          `> Propriétaire de la liste : <@${activeOwnerId}>\n> Cette liste est personnelle et ne concerne que ce membre.\n> Nombre actuel de cafards : \`${data.length}\`\n> Page ${currentPage}/${pageTotal}`,
        ),
      )
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(list))
      .addActionRowComponents(new Discord.ActionRowBuilder().addComponents(select))
      .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true));
  };

  const buildAddModal = () =>
    new Discord.ModalBuilder()
      .setCustomId('cafard_modal_add')
      .setTitle('Ajouter un cafard')
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

      if (!i.isStringSelectMenu() || i.customId !== 'cafardPanel') return;

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
        return sendEphemeral(i, '> Aucun cafard a retirer.');
      }

      if (action === 'delall') {
        data = [];
        await clearGuildCafardList(bot, message.guild.id, activeOwnerId);

        await msg.edit({
          flags: Discord.MessageFlags.IsComponentsV2,
          components: [buildPanel(page)],
          allowedMentions: { parse: [] },
        });

        return sendEphemeral(i, '> Tous les cafards de cette liste ont ete supprimes.');
      }

      if (action === 'add') {
        const modal = buildAddModal();

        await i.showModal(modal);

        const submitted = await i.awaitModalSubmit({
          filter: (inter) =>
            inter.user.id === message.author.id &&
            inter.customId === `cafard_modal_${action}`,
          time: 60000,
        }).catch(() => null);

        if (!submitted) return;

        const selectedUsers = submitted.fields.getSelectedUsers('user_selected', true);
        const users = selectedUsers.map((user) => user.id);
        const added = [];
        const alreadyBlocked = [];
        const ignoredSelf = [];
        const alreadyOwnedByOther = [];

        const activeOwnerMember = message.guild.members.cache.get(activeOwnerId)
          || await message.guild.members.fetch(activeOwnerId).catch(() => null);
        const ownerVoiceId = activeOwnerMember?.voice?.channelId || null;

        for (const id of users) {
          if (id === activeOwnerId) {
            ignoredSelf.push(id);
            continue;
          }

          if (data.find((x) => x.id === id)) {
            alreadyBlocked.push(id);
            continue;
          }

          const existingOwnerId = getGuildCafardOwner(bot, message.guild.id, id);
          if (existingOwnerId) {
            alreadyOwnedByOther.push({ id, ownerId: existingOwnerId });
            continue;
          }

          data.push({ author: activeOwnerId, id, time: Date.now() });
          added.push(id);
        }

        await saveData();

        const kicked = [];
        if (ownerVoiceId) {
          for (const id of added) {
            const targetMember = message.guild.members.cache.get(id)
              || await message.guild.members.fetch(id).catch(() => null);
            if (!targetMember?.voice?.channelId) continue;
            if (targetMember.voice.channelId !== ownerVoiceId) continue;

            await targetMember.voice.disconnect().catch(() => {});
            kicked.push(id);
          }
        }

        await sendModalResult(
          submitted,
          'Ajouter un cafard',
          [
            added.length ? `> Ajoutes : ${added.map((id) => `<@${id}>`).join(', ')}` : null,
            kicked.length ? `> Deconnectes du vocal : ${kicked.map((id) => `<@${id}>`).join(', ')}` : null,
            alreadyBlocked.length
              ? `> Deja presents dans cette liste : ${alreadyBlocked.map((id) => `<@${id}>`).join(', ')}`
              : null,
            alreadyOwnedByOther.length
              ? `> Deja en cafard chez ${alreadyOwnedByOther.map((entry) => `<@${entry.id}> par <@${entry.ownerId}>`).join(', ')}`
              : null,
            ignoredSelf.length ? '> Tu ne peux pas te mettre toi-meme dans la liste.' : null,
            !added.length && !alreadyBlocked.length && !alreadyOwnedByOther.length && !ignoredSelf.length
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
                    new Discord.TextDisplayBuilder().setContent('> Utilisateur pas dans ta liste.'),
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
                  new Discord.TextDisplayBuilder().setContent(`> <@${id}> supprimé de la liste cafard de <@${activeOwnerId}>`),
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
