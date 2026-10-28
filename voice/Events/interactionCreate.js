const Discord = require('discord.js');
const { OverwriteType } = require('discord-api-types/v10');

function parseTempVocalControlId(customId) {
  const parts = String(customId || '').split(':');
  if (parts.length < 3 || parts[0] !== 'tempvocal') return null;
  return {
    channelId: parts[1],
    action: parts[2],
    page: Number.parseInt(parts[3] || '0', 10) || 0,
  };
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, bot, config) {
    if (interaction.isCommand()) {
      const cmd = bot.slashCommands.get(interaction.commandName);

      const args = [];

      for (const option of interaction.options.data) {
        if (option.type === 1) {
          if (option.name) args.push(option.name);
          option.options?.forEach((x) => {
            if (x.value) args.push(x.value);
          });
        } else if (option.value) {
          args.push(option.value);
        }
      }

      cmd.run(bot, interaction, args, config);
      return;
    }

    if (interaction.isButton() && interaction.customId === 'test_open_user_modal') {
      const modal = new Discord.ModalBuilder()
        .setCustomId('user_modal')
        .setTitle('User Chooser')
        .addLabelComponents(
          new Discord.LabelBuilder()
            .setLabel('Choose your users')
            .setUserSelectMenuComponent(
              new Discord.UserSelectMenuBuilder()
                .setCustomId('user_selected')
                .setMaxValues(5)
                .setRequired(true),
            ),
        );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isButton()) {
        const tempVocalControl = parseTempVocalControlId(interaction.customId);
        if (tempVocalControl) {
        const { channelId, action, page } = tempVocalControl;
        const guild = interaction.guild;
        const voiceChannel = guild?.channels?.cache?.get(channelId)
          || await guild?.channels?.fetch?.(channelId).catch?.(() => null);

        const safeReply = async (content) => {
          const payload = {
            content,
            flags: Discord.MessageFlags.Ephemeral,
          };

          if (interaction.replied || interaction.deferred) {
            return interaction.followUp(payload).catch(() => null);
          }

          try {
            return await interaction.reply(payload);
          } catch (error) {
            if (error?.code === 40060 || error?.code === 10062) {
              return interaction.followUp(payload).catch(() => null);
            }
            throw error;
          }
        };

        if (!guild || !voiceChannel || ![Discord.ChannelType.GuildVoice, Discord.ChannelType.GuildStageVoice].includes(voiceChannel.type)) {
          return safeReply('> Ce vocal temporaire est introuvable.');
        }

        const ownerId = bot.functions.getGuildTempVocalChannelOwner(bot, guild.id, channelId);
        if (!ownerId) {
          return safeReply('> Ce vocal temporaire n est plus enregistré.');
        }

        const isOwner = interaction.user.id === ownerId;
        if (!isOwner) {
          return safeReply('> Seul le propriétaire actuel peut gérer ce vocal.');
        }

        const everyoneRole = guild.roles.everyone;
        const isInteractionAckError = (error) => error?.code === 40060 || error?.code === 10062;
        const deferTempVocalResponse = async () => {
          if (interaction.replied || interaction.deferred) return true;

          try {
            await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
            return true;
          } catch (error) {
            if (isInteractionAckError(error)) return false;
            throw error;
          }
        };
        const sendDeferredReply = async (content) => {
          const canRespond = await deferTempVocalResponse();
          if (!canRespond) return null;

          return interaction.editReply({ content }).catch((error) => {
            if (isInteractionAckError(error)) return null;
            throw error;
          });
        };

        const replyModalResult = async (modalInteraction, content) => {
          const payload = {
            content,
            flags: Discord.MessageFlags.Ephemeral,
          };

          if (modalInteraction.replied || modalInteraction.deferred) {
            return modalInteraction.followUp(payload).catch(() => null);
          }

          try {
            return await modalInteraction.reply(payload);
          } catch (error) {
            if (error?.code !== 40060 && error?.code !== 10062) {
              try {
                await modalInteraction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
                return modalInteraction.editReply({ content });
              } catch {
                return null;
              }
            }

            try {
              await modalInteraction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
              return modalInteraction.editReply({ content });
            } catch {
              return null;
            }
          }
        };

        const promptModal = async (customId, title, label, description, placeholder, defaultValue = '') => {
          const modal = new Discord.ModalBuilder()
            .setCustomId(customId)
            .setTitle(title)
            .addLabelComponents(
              new Discord.LabelBuilder()
                .setLabel(label)
                .setDescription(description)
                .setTextInputComponent(
                  new Discord.TextInputBuilder()
                    .setCustomId('value')
                    .setStyle(Discord.TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder(placeholder)
                    .setValue(String(defaultValue)),
                ),
            );

          await interaction.showModal(modal);
          const submitted = await interaction.awaitModalSubmit({
            filter: (modalInteraction) =>
              modalInteraction.user.id === interaction.user.id &&
              modalInteraction.customId === customId,
            time: 60000,
          }).catch(() => null);

          return submitted;
        };

        const buildUserModal = (customId, title, label, description, maxValues = 5) => new Discord.ModalBuilder()
          .setCustomId(customId)
          .setTitle(title)
          .addLabelComponents(
            new Discord.LabelBuilder()
              .setLabel(label)
              .setDescription(description)
              .setUserSelectMenuComponent(
                new Discord.UserSelectMenuBuilder()
                  .setCustomId('user_selected')
                  .setMinValues(1)
                  .setMaxValues(maxValues)
                  .setRequired(true),
              ),
          );

        const refreshTempVocalAccess = async (nextOwnerId = ownerId) => {
          await bot.functions.applyTempVocalAccess(bot, guild, voiceChannel, nextOwnerId);
        };

        const refreshTempVocalPanel = async () => {
          const ownerUser = guild.members.cache.get(ownerId)?.user || interaction.user;
          await bot.functions.syncTempVocalOwnerPanel(bot, guild, voiceChannel, ownerUser);
        };

        const applyEveryoneOverwrite = async (overwrites) => {
          await voiceChannel.permissionOverwrites.edit(everyoneRole, overwrites);
        };

        const replyTempVocalMembersPanel = async (targetInteraction, panelPage = 0, mode = 'reply') => {
          const payload = {
            flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
            components: [
              bot.functions.buildTempVocalAddedMembersPanel(
                bot,
                guild,
                voiceChannel,
                ownerId,
                panelPage,
              ),
            ],
            allowedMentions: { parse: [] },
          };

          if (mode === 'update') {
            try {
              return await targetInteraction.update(payload);
            } catch {
              return null;
            }
          }

          if (targetInteraction.replied || targetInteraction.deferred) {
            return targetInteraction.followUp(payload).catch(() => null);
          }

          try {
            return await targetInteraction.reply(payload);
          } catch (error) {
            if (error?.code !== 40060 && error?.code !== 10062) {
              try {
                await targetInteraction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
                return targetInteraction.editReply({ components: payload.components, allowedMentions: payload.allowedMentions });
              } catch {
                return null;
              }
            }

            try {
              await targetInteraction.deferReply({ flags: Discord.MessageFlags.Ephemeral });
              return targetInteraction.editReply({ components: payload.components, allowedMentions: payload.allowedMentions });
            } catch {
              return null;
            }
          }
        };

        if (action === 'lock') {
          await deferTempVocalResponse();
          await applyEveryoneOverwrite({ Connect: false });
          await refreshTempVocalAccess();
          await refreshTempVocalPanel();
          return sendDeferredReply(`> Le vocal <#${voiceChannel.id}> est maintenant verrouillé.`);
        }

        if (action === 'unlock') {
          await deferTempVocalResponse();
          await applyEveryoneOverwrite({ Connect: null });
          await refreshTempVocalAccess();
          await refreshTempVocalPanel();
          return sendDeferredReply(`> Le vocal <#${voiceChannel.id}> est maintenant déverrouillé.`);
        }

        if (action === 'hide') {
          await deferTempVocalResponse();
          await applyEveryoneOverwrite({ ViewChannel: false });
          await refreshTempVocalAccess();
          await refreshTempVocalPanel();
          return sendDeferredReply(`> Le vocal <#${voiceChannel.id}> est maintenant masqué.`);
        }

        if (action === 'show') {
          await deferTempVocalResponse();
          await applyEveryoneOverwrite({ ViewChannel: null });
          await refreshTempVocalAccess();
          await refreshTempVocalPanel();
          return sendDeferredReply(`> Le vocal <#${voiceChannel.id}> est maintenant affiché.`);
        }

        if (action === 'members') {
          return replyTempVocalMembersPanel(interaction, 0, 'reply');
        }

        if (action === 'membersPrev' || action === 'membersNext') {
          const nextPage = action === 'membersPrev' ? page - 1 : page + 1;
          return replyTempVocalMembersPanel(interaction, nextPage, 'update');
        }

        if (action === 'rename') {
          const submitted = await promptModal(
            `tempvocal:${channelId}:renameModal`,
            'Renommer le vocal',
            'Nouveau nom',
            'Le nom sera limité à 100 caractères.',
            'Nouveau nom du vocal',
            voiceChannel.name,
          );

          if (!submitted) return;
          const newName = submitted.fields.getTextInputValue('value').trim().slice(0, 100);
          if (!newName) {
            return replyModalResult(submitted, '> Nom invalide.');
          }

          await voiceChannel.setName(newName);
          await bot.functions.syncTempVocalOwnerPanel(bot, guild, voiceChannel, guild.members.cache.get(ownerId)?.user || interaction.user);
          return replyModalResult(submitted, `> Vocal renommé en \`${newName}\`.`);
        }

        if (action === 'limit') {
          const submitted = await promptModal(
            `tempvocal:${channelId}:limitModal`,
            'Changer la limite',
            'Nouvelle limite',
            '0 pour aucune limite, maximum 99.',
            '0',
            String(voiceChannel.userLimit || 0),
          );

          if (!submitted) return;
          const parsed = Number.parseInt(submitted.fields.getTextInputValue('value').trim(), 10);
          if (!Number.isFinite(parsed) || parsed < 0 || parsed > 99) {
            return replyModalResult(submitted, '> Limite invalide.');
          }

          await voiceChannel.setUserLimit(parsed);
          await bot.functions.syncTempVocalOwnerPanel(bot, guild, voiceChannel, guild.members.cache.get(ownerId)?.user || interaction.user);
          return replyModalResult(submitted, `> Limite du vocal définie sur \`${parsed}\`.`);
        }

        if (action === 'add' || action === 'remove' || action === 'expel' || action === 'transfer' || action === 'invite') {
          const submitted = await (() => {
            const customId = `tempvocal:${channelId}:${action}Modal`;
            const modal = buildUserModal(
              customId,
              action === 'transfer'
                ? 'Transférer la propriété'
                : action === 'expel'
                  ? 'Expulser un membre'
                  : action === 'invite'
                    ? 'Inviter un membre'
                  : action === 'add'
                    ? 'Ajouter un membre'
                    : 'Retirer un membre',
              action === 'transfer'
                ? 'Choisir le nouveau propriétaire'
                : action === 'expel'
                  ? 'Choisir les membres à expulser'
                  : action === 'invite'
                    ? 'Choisir le membre à inviter'
                  : action === 'add'
                    ? 'Choisir les membres à ajouter'
                    : 'Choisir les membres à retirer',
              action === 'transfer'
                ? 'Un seul utilisateur à la fois'
                : action === 'invite'
                  ? 'Une seule personne à la fois.'
                  : 'Tu peux en sélectionner plusieurs.',
              (action === 'transfer' || action === 'invite') ? 1 : 5,
            );

            return (async () => {
              await interaction.showModal(modal);
              return interaction.awaitModalSubmit({
                filter: (modalInteraction) =>
                  modalInteraction.user.id === interaction.user.id &&
                  modalInteraction.customId === customId,
                time: 60000,
              }).catch(() => null);
            })();
          })();

          if (!submitted) return;

          const selectedUsers = submitted.fields.getSelectedUsers('user_selected', true);
          const selectedIds = selectedUsers.map((user) => user?.id).filter(Boolean);
          if (!selectedIds.length) {
            return replyModalResult(submitted, '> Aucun utilisateur sélectionné.');
          }

          if (action === 'transfer') {
            const targetUserId = selectedIds[0];
            const targetUser = await guild.client.users.fetch(targetUserId).catch(() => null);
            if (!targetUser) {
              return replyModalResult(submitted, '> Utilisateur introuvable.');
            }

            if (targetUser.bot) {
              return replyModalResult(submitted, '> Tu ne peux pas transférer la propriété à un bot.');
            }

            const targetMember = guild.members.cache.get(targetUserId) || await guild.members.fetch(targetUserId).catch(() => null);
            if (!targetMember?.voice?.channelId || targetMember.voice.channelId !== voiceChannel.id) {
              return replyModalResult(submitted, '> Le nouvel owner doit être dans ce vocal.');
            }

            const tempvocal = bot.functions.getGuildTempVocal(bot, guild.id);
            const nextChannels = { ...(tempvocal.channels || {}) };
            if (!nextChannels[channelId]) {
              return replyModalResult(submitted, '> Ce vocal n est plus enregistré.');
            }

            nextChannels[channelId] = {
              ...nextChannels[channelId],
              ownerId: targetUser.id,
            };

            bot.functions.setGuildTempVocal(bot, guild.id, {
              ...tempvocal,
              channels: nextChannels,
            });

            await refreshTempVocalAccess(targetUser.id);
            await bot.functions.syncTempVocalOwnerPanel(bot, guild, voiceChannel, targetUser);

            return replyModalResult(submitted, `> La propriété a été transférée à <@${targetUser.id}>.`);
          }

          if (action === 'invite') {
            const targetUserId = selectedIds[0];
            const targetUser = await guild.client.users.fetch(targetUserId).catch(() => null);
            if (!targetUser) {
              return replyModalResult(submitted, '> Utilisateur introuvable.');
            }

            if (targetUser.bot) {
              return replyModalResult(submitted, '> Tu ne peux pas inviter un bot.');
            }

            const inviter = guild.members.cache.get(interaction.user.id)
              || await guild.members.fetch(interaction.user.id).catch(() => null);
            const sentInvite = await bot.functions.sendTempVocalInvite(
              targetUser,
              inviter?.user || interaction.user,
              guild,
              voiceChannel,
            );

            if (!sentInvite) {
              return replyModalResult(submitted, `> Impossible d envoyer l invitation en DM à <@${targetUser.id}>.`);
            }

            return replyModalResult(submitted, `> Invitation envoyée à <@${targetUser.id}>.`);
          }

          const results = [];

          for (const memberId of selectedIds) {
            if (!memberId) continue;

            if (action === 'add') {
              await voiceChannel.permissionOverwrites.create(memberId, {
                ViewChannel: true,
                Connect: true,
                Speak: true,
              }, { type: OverwriteType.Member });
              results.push(`+<@${memberId}>`);
              continue;
            }

            if (action === 'remove') {
              const autoAccessIds = bot.functions.getGuildTempVocalAccessMemberIds(bot, guild.id, ownerId);
              if (String(memberId) === String(ownerId) || autoAccessIds.includes(String(memberId))) {
                results.push(`!<@${memberId}>`);
                continue;
              }

              await voiceChannel.permissionOverwrites.delete(memberId).catch(() => {});
              results.push(`-<@${memberId}>`);
              continue;
            }

            if (action === 'expel') {
              const targetMember = guild.members.cache.get(memberId) || await guild.members.fetch(memberId).catch(() => null);
              if (targetMember?.voice?.channelId !== voiceChannel.id) {
                results.push(`~<@${memberId}>`);
                continue;
              }

              await targetMember.voice.disconnect().catch(() => {});
              results.push(`x<@${memberId}>`);
              continue;
            }

          }

          await refreshTempVocalAccess();
          await bot.functions.syncTempVocalOwnerPanel(bot, guild, voiceChannel, guild.members.cache.get(ownerId)?.user || interaction.user);

          const summary = {
            add: '> Membres ajoutés : ',
            remove: '> Membres retirés : ',
            expel: '> Membres expulsés : ',
          }[action];

          const success = results
            .filter((item) => item.startsWith(
              action === 'add'
                ? '+'
                : action === 'remove'
                  ? '-'
                  : 'x',
            ))
            .map((item) => item.slice(1));
          const skipped = results
            .filter((item) => item.startsWith('!') || item.startsWith('~'))
            .map((item) => item.slice(1));

          const lines = [];
          if (success.length) lines.push(`${summary}${success.join(', ')}`);
          if (skipped.length) {
            lines.push(action === 'remove'
              ? `> Accès automatiques ignorés : ${skipped.join(', ')}`
              : `> Membres non concernés : ${skipped.join(', ')}`);
          }
          if (!lines.length) lines.push('> Aucun changement.');

          return replyModalResult(submitted, lines.join('\n'));
        }
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'user_modal') {
      const selectedUsers = interaction.fields.getSelectedUsers('user_selected', true);
      const usersList = selectedUsers.map((user) => `<@${user.id}>`).join(', ');

      await interaction.reply({
        content: `Utilisateurs selectionnes : ${usersList}`,
        flags: Discord.MessageFlags.Ephemeral,
      });
    }
  },
};
