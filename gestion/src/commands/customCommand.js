const { MessageFlags } = require('discord.js');
const { isValidCommandName } = require('../services/customStore');
const {
  buildAwaitCustomNamePayload,
  buildCustomListPayload,
  buildCustomManagePayload,
  buildCustomEmbedOutputPayload,
  buildCustomSessionEndedPayload,
  buildEmbedConfiguratorPayload,
  buildExecutionFailedPayload,
  buildMessageConfigModal,
  buildNoticePayload,
  buildButtonRoleTargetPickerPayload,
  buildPermissionDeniedPayload,
  buildRoleActionConfigModal,
  buildRoleActionEmbedConfiguratorPayload,
  buildSelectorConfigModal,
  buildSelectorPanelPayload,
  buildTypeConfigControlsPayload,
  buildDeletedCustomPayload
} = require('../utils/components');
const { buildVariableContext, formatTemplate } = require('../utils/variables');

async function runCustomPanelCommand(message, context) {
  const customs = context.customStore.listGuildCustoms(message.guild.id);
  const session = context.sessionStore.createPanelSession({
    guildId: message.guild.id,
    channelId: message.channel.id,
    ownerId: message.author.id,
    messageId: 'pending'
  });

  const sent = await message.channel.send(
    buildCustomListPayload({
      prefix: context.config.prefix,
      sessionId: session.id,
      customs
    })
  );

  context.sessionStore.setPanelMessageId(session.id, sent.id);
}

async function handlePendingCustomNameInput(message, context) {
  if (!message.guild || message.author.bot) return false;
  const pending = context.sessionStore.getPendingNameInput(message.channel.id, message.author.id);
  if (!pending) return false;

  context.sessionStore.clearPendingNameInput(message.channel.id, message.author.id);
  await safeDelete(message);

  const session = context.sessionStore.getPanelSession(pending.sessionId);
  if (!session) return true;

  let panelMessage;
  try {
    panelMessage = await message.channel.messages.fetch(session.messageId);
  } catch {
    return true;
  }

  const inputName = String(message.content || '').trim().toLowerCase();
  if (!isValidCommandName(inputName)) {
    await panelMessage.edit(
      stripUpdateFlags(
        buildNoticePayload({
          title: '# Nom invalide',
          body: '> Le nom doit commencer par `+` et contenir uniquement lettres/chiffres/_/- (max 32 caractères).'
        })
      )
    );
    await panelMessage.edit(stripUpdateFlags(buildAwaitCustomNamePayload({ sessionId: session.id })));
    context.sessionStore.createPendingNameInput({
      sessionId: session.id,
      guildId: session.guildId,
      channelId: session.channelId,
      userId: session.ownerId,
      messageId: session.messageId,
      timeoutMs: 90_000
    });
    return true;
  }

  if (context.customStore.getByName(message.guild.id, inputName)) {
    await panelMessage.edit(
      stripUpdateFlags(
        buildNoticePayload({
          title: '# Nom déjà pris',
          body: `> La custom \`${inputName}\` existe déjà.`
        })
      )
    );
    await panelMessage.edit(stripUpdateFlags(buildAwaitCustomNamePayload({ sessionId: session.id })));
    context.sessionStore.createPendingNameInput({
      sessionId: session.id,
      guildId: session.guildId,
      channelId: session.channelId,
      userId: session.ownerId,
      messageId: session.messageId,
      timeoutMs: 90_000
    });
    return true;
  }

  let custom;
  try {
    custom = context.customStore.create(message.guild.id, {
      name: inputName,
      createdBy: message.author.id
    });
  } catch (error) {
    await panelMessage.edit(stripUpdateFlags(buildExecutionFailedPayload('Impossible de créer la custom. Réessayez.')));
    return true;
  }

  context.sessionStore.touchPanelSession(session.id);
  context.sessionStore.setSelectedCustom(session.id, custom.id);
  await context.logger.log(message.guild, '# Création custom', `> Créée par <@${message.author.id}> : \`${custom.name}\``);

  await panelMessage.edit(
    stripUpdateFlags(
      buildCustomManagePayload({
        sessionId: session.id,
        custom,
        guildRolesCount: message.guild.roles.cache.size
      })
    )
  );

  return true;
}

async function handlePendingEmbedFieldInput(message, context) {
  if (!message.guild || message.author.bot) return false;
  const pending = context.sessionStore.getPendingEmbedInput(message.channel.id, message.author.id);
  if (!pending) return false;

  context.sessionStore.clearPendingEmbedInput(message.channel.id, message.author.id);
  await safeDelete(message);

  const session = context.sessionStore.getPanelSession(pending.sessionId);
  if (!session) return true;

  const customId = pending.customId || session.selectedCustomId;
  const custom = context.customStore.getById(message.guild.id, customId);
  if (!custom) return true;

  if (pending.scope === 'role_action_response_embed') {
    if (custom.type !== 'role_action') return true;

    const draft = context.sessionStore.getEmbedDraft(session.id)
      || cloneRoleActionEmbedConfig(custom.config.roleAction.responseEmbed);
    const rawInput = String(message.content || '').trim();
    const shouldClear = ['none', 'null', 'vide', '-', 'clear'].includes(rawInput.toLowerCase());
    const nextValue = shouldClear ? '' : rawInput;

    if ((pending.field === 'thumbnailUrl' || pending.field === 'imageUrl') && nextValue && !isValidUrl(nextValue)) {
      await message.channel.send(
        buildNoticePayload({
          title: '# URL invalide',
          body: '> Utilisez une URL valide commençant par `http://` ou `https://`.'
        })
      ).catch(() => null);
      return true;
    }

    draft[pending.field] = nextValue;
    context.sessionStore.setEmbedDraft(session.id, draft);

    try {
      const panelMessage = await message.channel.messages.fetch(session.messageId);
      await panelMessage.edit(
        stripUpdateFlags(
          buildRoleActionEmbedConfiguratorPayload({
            sessionId: session.id,
            customName: custom.name,
            draft
          })
        )
      );
    } catch {
      // Ignore if panel message no longer exists.
    }

    return true;
  }

  if (custom.type !== 'embed' && pending.scope !== 'selector_response_embed') return true;

  const baseConfig = pending.scope === 'selector_response_embed' ? custom.config.selector : custom.config.embed;
  const draft = context.sessionStore.getEmbedDraft(session.id) || cloneEmbedConfig(baseConfig);
  const rawInput = String(message.content || '').trim();
  const shouldClear = ['none', 'null', 'vide', '-', 'clear'].includes(rawInput.toLowerCase());
  const nextValue = shouldClear ? '' : rawInput;

  const actionPrefix = pending.scope === 'selector_response_embed' ? 'selector_embed' : 'embed';

  if (pending.field === 'button') {
    const step = String(pending.step || 'content_mode');

    if (step === 'content_mode') {
      const contentMode = parseButtonContentChoice(nextValue);
      if (contentMode === 'cancel') {
        await message.channel.send(
          buildNoticePayload({
            title: '# Action annulée',
            body: '> Configuration du bouton annulée.'
          })
        ).catch(() => null);
        return true;
      }

      if (!contentMode) {
        context.sessionStore.createPendingEmbedInput({
          sessionId: session.id,
          channelId: message.channel.id,
          userId: message.author.id,
          field: 'button',
          step: 'content_mode',
          timeoutMs: 120_000
        });
        await message.channel.send(
          buildNoticePayload({
            title: '# Choix invalide',
            body: '> Envoyez `1` (emoji), `2` (texte), `3` (emoji + texte) ou `0` pour annuler.'
          })
        ).catch(() => null);
        return true;
      }

      draft.buttonContentMode = contentMode;
      if (contentMode === 'emoji') {
        draft.buttonLabel = '';
        draft.buttonEmoji = '';
      } else if (contentMode === 'text') {
        draft.buttonEmoji = '';
      }
      context.sessionStore.setEmbedDraft(session.id, draft);

      if (contentMode === 'emoji') {
        context.sessionStore.createPendingEmbedInput({
          sessionId: session.id,
          channelId: message.channel.id,
          userId: message.author.id,
          field: 'button',
          step: 'emoji',
          timeoutMs: 120_000
        });
        await message.channel.send(
          buildNoticePayload({
            title: '# Bouton: emoji',
            body: '> Envoyez l\'emoji du bouton.'
          })
        ).catch(() => null);
      } else {
        context.sessionStore.createPendingEmbedInput({
          sessionId: session.id,
          channelId: message.channel.id,
          userId: message.author.id,
          field: 'button',
          step: 'label_color',
          meta: { contentMode },
          timeoutMs: 120_000
        });
        await message.channel.send(
          buildNoticePayload({
            title: '# Bouton: nom + couleur',
            body: '> Format: `nom | couleur`\n> Couleurs: `none`, `primary`, `success`, `danger`.'
          })
        ).catch(() => null);
      }

      try {
        const panelMessage = await message.channel.messages.fetch(session.messageId);
        await panelMessage.edit(
          stripUpdateFlags(
            buildEmbedConfiguratorPayload({
              sessionId: session.id,
              customName: custom.name,
              draft,
              actionPrefix
            })
          )
        );
      } catch {
        // Ignore if panel message no longer exists.
      }

      return true;
    }

    if (step === 'label_color') {
      const parsed = parseButtonLabelAndColor(nextValue, draft.buttonLabel || 'Bouton');
      if (!parsed) {
        context.sessionStore.createPendingEmbedInput({
          sessionId: session.id,
          channelId: message.channel.id,
          userId: message.author.id,
          field: 'button',
          step: 'label_color',
          meta: { contentMode: String(pending.meta?.contentMode || draft.buttonContentMode || 'text') },
          timeoutMs: 120_000
        });
        await message.channel.send(
          buildNoticePayload({
            title: '# Bouton: nom + couleur',
            body: '> Format: `nom | couleur`\n> Couleurs: `none`, `primary`, `success`, `danger`.'
          })
        ).catch(() => null);
        return true;
      }

      draft.buttonLabel = parsed.label;
      draft.buttonColor = parsed.color;
      context.sessionStore.setEmbedDraft(session.id, draft);

      const contentMode = String(pending.meta?.contentMode || draft.buttonContentMode || 'text');
      if (contentMode === 'both') {
        context.sessionStore.createPendingEmbedInput({
          sessionId: session.id,
          channelId: message.channel.id,
          userId: message.author.id,
          field: 'button',
          step: 'emoji',
          timeoutMs: 120_000
        });
        await message.channel.send(
          buildNoticePayload({
            title: '# Bouton: emoji',
            body: '> Envoyez l\'emoji du bouton.'
          })
        ).catch(() => null);
      } else {
        context.sessionStore.createPendingEmbedInput({
          sessionId: session.id,
          channelId: message.channel.id,
          userId: message.author.id,
          field: 'button',
          step: 'type',
          timeoutMs: 120_000
        });
        await message.channel.send(
          buildNoticePayload({
            title: '# Type de bouton',
            body: '> Choisissez un type:\n> `1` Lien serveur\n> `2` Channel du serveur\n> `3` Ajout de rôle\n> `4` Lien (général)\n> `0` Annuler\n> Envoyez `0`, `1`, `2`, `3` ou `4`.'
          })
        ).catch(() => null);
      }

      try {
        const panelMessage = await message.channel.messages.fetch(session.messageId);
        await panelMessage.edit(
          stripUpdateFlags(
            buildEmbedConfiguratorPayload({
              sessionId: session.id,
              customName: custom.name,
              draft,
              actionPrefix
            })
          )
        );
      } catch {
        // Ignore if panel message no longer exists.
      }

      return true;
    }

    if (step === 'emoji') {
      if (!nextValue) {
        context.sessionStore.createPendingEmbedInput({
          sessionId: session.id,
          channelId: message.channel.id,
          userId: message.author.id,
          field: 'button',
          step: 'emoji',
          timeoutMs: 120_000
        });
        await message.channel.send(
          buildNoticePayload({
            title: '# Emoji invalide',
            body: '> Envoyez un emoji valide (unicode ou custom).'
          })
        ).catch(() => null);
        return true;
      }

      draft.buttonEmoji = nextValue;
      context.sessionStore.setEmbedDraft(session.id, draft);

      if (String(draft.buttonContentMode || 'text') === 'emoji') {
        context.sessionStore.createPendingEmbedInput({
          sessionId: session.id,
          channelId: message.channel.id,
          userId: message.author.id,
          field: 'button',
          step: 'color',
          timeoutMs: 120_000
        });
        await message.channel.send(
          buildNoticePayload({
            title: '# Bouton: couleur',
            body: '> Choisissez la couleur: `none`, `primary`, `success`, `danger`.'
          })
        ).catch(() => null);
      } else {
        context.sessionStore.createPendingEmbedInput({
          sessionId: session.id,
          channelId: message.channel.id,
          userId: message.author.id,
          field: 'button',
          step: 'type',
          timeoutMs: 120_000
        });
        await message.channel.send(
          buildNoticePayload({
            title: '# Type de bouton',
            body: '> Choisissez un type:\n> `1` Lien serveur\n> `2` Channel du serveur\n> `3` Ajout de rôle\n> `4` Lien (général)\n> `0` Annuler\n> Envoyez `0`, `1`, `2`, `3` ou `4`.'
          })
        ).catch(() => null);
      }

      try {
        const panelMessage = await message.channel.messages.fetch(session.messageId);
        await panelMessage.edit(
          stripUpdateFlags(
            buildEmbedConfiguratorPayload({
              sessionId: session.id,
              customName: custom.name,
              draft,
              actionPrefix
            })
          )
        );
      } catch {
        // Ignore if panel message no longer exists.
      }

      return true;
    }

    if (step === 'color') {
      const color = parseButtonColor(rawInput || nextValue);
      if (!color) {
        context.sessionStore.createPendingEmbedInput({
          sessionId: session.id,
          channelId: message.channel.id,
          userId: message.author.id,
          field: 'button',
          step: 'color',
          timeoutMs: 120_000
        });
        await message.channel.send(
          buildNoticePayload({
            title: '# Couleur invalide',
            body: '> Utilisez `none`, `primary`, `success` ou `danger`.'
          })
        ).catch(() => null);
        return true;
      }

      draft.buttonColor = color;
      context.sessionStore.setEmbedDraft(session.id, draft);
      context.sessionStore.createPendingEmbedInput({
        sessionId: session.id,
        channelId: message.channel.id,
        userId: message.author.id,
        field: 'button',
        step: 'type',
        timeoutMs: 120_000
      });

      await message.channel.send(
        buildNoticePayload({
          title: '# Type de bouton',
          body: '> Choisissez un type:\n> `1` Lien serveur\n> `2` Channel du serveur\n> `3` Ajout de rôle\n> `4` Lien (général)\n> `0` Annuler\n> Envoyez `0`, `1`, `2`, `3` ou `4`.'
        })
      ).catch(() => null);

      try {
        const panelMessage = await message.channel.messages.fetch(session.messageId);
        await panelMessage.edit(
          stripUpdateFlags(
            buildEmbedConfiguratorPayload({
              sessionId: session.id,
              customName: custom.name,
              draft,
              actionPrefix
            })
          )
        );
      } catch {
        // Ignore if panel message no longer exists.
      }

      return true;
    }

    if (step === 'type') {
      const mode = parseButtonModeChoice(nextValue);
      if (mode === 'cancel') {
        await message.channel.send(
          buildNoticePayload({
            title: '# Action annulée',
            body: '> Configuration du bouton annulée.'
          })
        ).catch(() => null);
        return true;
      }

      if (!mode) {
        context.sessionStore.createPendingEmbedInput({
          sessionId: session.id,
          channelId: message.channel.id,
          userId: message.author.id,
          field: 'button',
          step: 'type',
          timeoutMs: 120_000
        });
        await message.channel.send(
          buildNoticePayload({
            title: '# Choix invalide',
            body: '> Envoyez `0`, `1`, `2`, `3` ou `4`.'
          })
        ).catch(() => null);
        return true;
      }

      draft.buttonMode = mode;
      draft.buttonTarget = '';
      context.sessionStore.setEmbedDraft(session.id, draft);
      context.sessionStore.createPendingEmbedInput({
        sessionId: session.id,
        channelId: message.channel.id,
        userId: message.author.id,
        field: 'button',
        step: 'target',
        meta: { mode },
        timeoutMs: 120_000
      });

      const targetPrompt = mode === 'server_url'
        ? '> Envoyez maintenant le lien serveur (invite ou URL `http://` / `https://`).'
        : mode === 'url'
          ? '> Envoyez maintenant le lien général (URL complète `http://` ou `https://`).'
        : mode === 'channel'
          ? '> Envoyez l\'ID du channel (ou mention du channel).'
          : '> Envoyez l\'ID du rôle (ou mention du rôle).';

      if (mode === 'role_add') {
        await message.channel.send(
          buildButtonRoleTargetPickerPayload({
            sessionId: session.id,
            selectedRoleIds: extractSnowflakes(draft.buttonTarget)
          })
        ).catch(() => null);
      } else {
        await message.channel.send(
          buildNoticePayload({
            title: '# Cible du bouton',
            body: targetPrompt
          })
        ).catch(() => null);
      }

      try {
        const panelMessage = await message.channel.messages.fetch(session.messageId);
        await panelMessage.edit(
          stripUpdateFlags(
            buildEmbedConfiguratorPayload({
              sessionId: session.id,
              customName: custom.name,
              draft,
              actionPrefix
            })
          )
        );
      } catch {
        // Ignore if panel message no longer exists.
      }

      return true;
    }

    const mode = String(pending.meta?.mode || draft.buttonMode || 'none').toLowerCase();
    if (mode === 'url' || mode === 'server_url') {
      if (!nextValue || !isValidUrl(nextValue)) {
        context.sessionStore.createPendingEmbedInput({
          sessionId: session.id,
          channelId: message.channel.id,
          userId: message.author.id,
          field: 'button',
          step: 'target',
          meta: { mode },
          timeoutMs: 120_000
        });
        await message.channel.send(
          buildNoticePayload({
            title: '# URL invalide',
            body: '> Utilisez une URL valide commençant par `http://` ou `https://`.'
          })
        ).catch(() => null);
        return true;
      }
      draft.buttonTarget = nextValue;
    }

    if (mode === 'channel' || mode === 'role_add') {
      const id = extractSnowflake(nextValue);
      if (!id) {
        context.sessionStore.createPendingEmbedInput({
          sessionId: session.id,
          channelId: message.channel.id,
          userId: message.author.id,
          field: 'button',
          step: 'target',
          meta: { mode },
          timeoutMs: 120_000
        });
        await message.channel.send(
          buildNoticePayload({
            title: '# ID invalide',
            body: mode === 'channel'
              ? '> Envoyez un ID de channel valide (ou mention).' 
              : '> Envoyez un ID de rôle valide (ou mention).'
          })
        ).catch(() => null);
        return true;
      }
      draft.buttonTarget = id;
    }

    context.sessionStore.setEmbedDraft(session.id, draft);

    await message.channel.send(
      buildNoticePayload({
        title: '# Bouton configuré',
        body: '> Configuration enregistrée. Confirmez l\'embed pour appliquer le bouton en bas.'
      })
    ).catch(() => null);

    try {
      const panelMessage = await message.channel.messages.fetch(session.messageId);
      await panelMessage.edit(
        stripUpdateFlags(
          buildEmbedConfiguratorPayload({
              sessionId: session.id,
              customName: custom.name,
              draft,
              actionPrefix
            })
        )
      );
    } catch {
      // Ignore if panel message no longer exists.
    }

    return true;
  }

  if ((pending.field === 'thumbnailUrl' || pending.field === 'imageRightUrl' || pending.field === 'pictureUrl') && nextValue && !isValidUrl(nextValue)) {
    await message.channel.send(
      buildNoticePayload({
        title: '# URL invalide',
        body: '> Utilisez une URL valide commençant par `http://` ou `https://`.'
      })
    ).catch(() => null);
    return true;
  }

  if (pending.field === 'buttonMode' && nextValue) {
    const allowed = new Set(['none', 'url', 'server_url', 'channel', 'role_add']);
    if (!allowed.has(nextValue.toLowerCase())) {
      await message.channel.send(
        buildNoticePayload({
          title: '# Type de bouton invalide',
          body: '> Utilisez `none`, `server_url`, `url`, `channel` ou `role_add`.'
        })
      ).catch(() => null);
      return true;
    }
  }

  if (pending.field === 'buttonTarget' && nextValue) {
    const mode = String(draft.buttonMode || 'none').toLowerCase();
    if ((mode === 'url' || mode === 'server_url') && !isValidUrl(nextValue)) {
      await message.channel.send(
        buildNoticePayload({
          title: '# Cible invalide',
          body: '> Pour `url` ou `server_url`, entrez une URL valide commençant par `http://` ou `https://`.'
        })
      ).catch(() => null);
      return true;
    }

    if ((mode === 'channel' || mode === 'role_add') && !extractSnowflake(nextValue)) {
      await message.channel.send(
        buildNoticePayload({
          title: '# Cible invalide',
          body: '> Pour `channel` ou `role_add`, entrez un ID valide (ou mention).'
        })
      ).catch(() => null);
      return true;
    }
  }

  if (pending.field === 'buttonLabel' && nextValue && nextValue.length > 80) {
    await message.channel.send(
      buildNoticePayload({
        title: '# Texte trop long',
        body: '> Le texte du bouton doit faire 80 caractères maximum.'
      })
    ).catch(() => null);
    return true;
  }

  if (pending.field === 'accentColor' && nextValue && !isValidHexColor(nextValue)) {
    await message.channel.send(
      buildNoticePayload({
        title: '# Couleur invalide',
        body: '> Utilisez un format hex valide, par exemple `#5865F2`.'
      })
    ).catch(() => null);
    return true;
  }

  draft[pending.field] = nextValue;
  context.sessionStore.setEmbedDraft(session.id, draft);

  try {
    const panelMessage = await message.channel.messages.fetch(session.messageId);
    await panelMessage.edit(
      stripUpdateFlags(
        buildEmbedConfiguratorPayload({
              sessionId: session.id,
              customName: custom.name,
              draft,
              actionPrefix
            })
      )
    );
  } catch {
    // Ignore if panel message no longer exists.
  }

  return true;
}

async function handleCustomPanelInteraction(interaction, context) {
  if (!interaction.customId.startsWith('custom:panel:')) return false;

  const parts = interaction.customId.split(':');
  const sessionId = parts[2];
  const action = parts[3];
  const targetCustomId = parts[4];

  const session = context.sessionStore.getPanelSession(sessionId);
  if (!session) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        ...buildCustomSessionEndedPayload(),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      });
    }
    return true;
  }

  if (String(interaction.user.id) !== String(session.ownerId)) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        ...buildNoticePayload({
          title: '# Action refusée',
          body: '> Seul l\'utilisateur ayant lancé `+custom` peut utiliser ce panneau.'
        }),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      });
    }
    return true;
  }

  context.sessionStore.touchPanelSession(session.id);
  const sessionCustomId = session.selectedCustomId || null;
  const resolvedCustomId = targetCustomId || sessionCustomId;

  if (action === 'create' && interaction.isButton()) {
    context.sessionStore.createPendingNameInput({
      sessionId: session.id,
      guildId: interaction.guild.id,
      channelId: interaction.channel.id,
      userId: interaction.user.id,
      messageId: interaction.message.id,
      timeoutMs: 90_000
    });

    scheduleNameInputTimeout(context, session.id, interaction.channel.id, interaction.user.id, interaction.message.id);
    await interaction.update(stripUpdateFlags(buildAwaitCustomNamePayload({ sessionId: session.id })));
    return true;
  }

  if (action === 'cancel_create' && interaction.isButton()) {
    context.sessionStore.clearPendingNameInput(interaction.channel.id, interaction.user.id);
    const customs = context.customStore.listGuildCustoms(interaction.guild.id);
    await interaction.update(stripUpdateFlags(buildCustomListPayload({ sessionId: session.id, customs })));
    return true;
  }

  if (action === 'back' && interaction.isButton()) {
    const customs = context.customStore.listGuildCustoms(interaction.guild.id);
    await interaction.update(stripUpdateFlags(buildCustomListPayload({ sessionId: session.id, customs })));
    return true;
  }

  if (action === 'open' && interaction.isStringSelectMenu()) {
    const selectedId = interaction.values[0];
    const custom = context.customStore.getById(interaction.guild.id, selectedId);
    if (!custom) {
      await interaction.reply({
        ...buildExecutionFailedPayload('Custom introuvable.'),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      });
      return true;
    }
    context.sessionStore.setSelectedCustom(session.id, custom.id);
    await interaction.update(
      stripUpdateFlags(
        buildCustomManagePayload({
          sessionId: session.id,
          custom,
          guildRolesCount: interaction.guild.roles.cache.size
        })
      )
    );
    return true;
  }

  if (action === 'roles' && interaction.isRoleSelectMenu()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom) return true;

    const updated = context.customStore.setPermissions(
      interaction.guild.id,
      custom.id,
      interaction.values,
      custom.permissions.userIds
    );

    await interaction.update(
      stripUpdateFlags(
        buildCustomManagePayload({
          sessionId: session.id,
          custom: updated,
          guildRolesCount: interaction.guild.roles.cache.size
        })
      )
    );
    return true;
  }

  if (action === 'users' && interaction.isUserSelectMenu()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom) return true;

    const updated = context.customStore.setPermissions(
      interaction.guild.id,
      custom.id,
      custom.permissions.roleIds,
      interaction.values
    );

    await interaction.update(
      stripUpdateFlags(
        buildCustomManagePayload({
          sessionId: session.id,
          custom: updated,
          guildRolesCount: interaction.guild.roles.cache.size
        })
      )
    );
    return true;
  }

  if (action === 'behavior_options' && interaction.isStringSelectMenu()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom) return true;

    const selected = new Set(interaction.values);
    const updated = context.customStore.update(interaction.guild.id, custom.id, (entry) => {
      entry.config.behavior = {
        deleteBotResponse: selected.has('delete_response'),
        deleteCommand: selected.has('delete_command'),
        targetAnotherMember: selected.has('target_other_member')
      };

      if (!entry.config.roleAction) return;
      entry.config.roleAction.targetMode = entry.config.behavior.targetAnotherMember ? 'mention_or_author' : 'author';
    });

    await interaction.update(
      stripUpdateFlags(
        buildTypeConfigControlsPayload({
          sessionId: session.id,
          custom: updated,
          guildRolesCount: interaction.guild.roles.cache.size
        })
      )
    );
    return true;
  }

  if (action === 'type' && interaction.isStringSelectMenu()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom) return true;

    const selectedType = interaction.values[0];
    const updated = context.customStore.setType(interaction.guild.id, custom.id, selectedType);
    await interaction.update(
      stripUpdateFlags(
        buildTypeConfigControlsPayload({
          sessionId: session.id,
          custom: updated,
          guildRolesCount: interaction.guild.roles.cache.size
        })
      )
    );
    return true;
  }

  if (action === 'configure' && interaction.isButton()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom) return true;

    if (custom.type === 'embed') {
      const draft = cloneEmbedConfig(custom.config.embed);
      context.sessionStore.setEmbedDraft(session.id, draft);
      await interaction.update(
        stripUpdateFlags(
          buildEmbedConfiguratorPayload({
              sessionId: session.id,
              customName: custom.name,
              draft
            })
        )
      );
      return true;
    }

    await interaction.update(
      stripUpdateFlags(
        buildTypeConfigControlsPayload({
          sessionId: session.id,
          custom,
          guildRolesCount: interaction.guild.roles.cache.size
        })
      )
    );
    return true;
  }

  if (action === 'back_manage' && interaction.isButton()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom) return true;
    await interaction.update(
      stripUpdateFlags(
        buildCustomManagePayload({
          sessionId: session.id,
          custom,
          guildRolesCount: interaction.guild.roles.cache.size
        })
      )
    );
    return true;
  }

  if (action === 'delete_custom' && interaction.isButton()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom) return true;

    context.customStore.deleteCustom(interaction.guild.id, custom.id);
    context.sessionStore.setSelectedCustom(session.id, null);

    await interaction.update(
      stripUpdateFlags(buildDeletedCustomPayload())
    );
    return true;
  }

  if (action === 'embed_editor' && interaction.isButton()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom || custom.type !== 'embed') return true;
    const draft = cloneEmbedConfig(context.sessionStore.getEmbedDraft(session.id) || custom.config.embed);
    context.sessionStore.setEmbedDraft(session.id, draft);
    await interaction.update(
      stripUpdateFlags(
        buildEmbedConfiguratorPayload({
          sessionId: session.id,
          customName: custom.name,
          draft
        })
      )
    );
    return true;
  }

  if (action === 'role_embed_editor' && interaction.isButton()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom || custom.type !== 'role_action') return true;
    const draft = cloneRoleActionEmbedConfig(
      context.sessionStore.getEmbedDraft(session.id) || custom.config.roleAction.responseEmbed
    );
    context.sessionStore.setEmbedDraft(session.id, draft);
    await interaction.update(
      stripUpdateFlags(
        buildRoleActionEmbedConfiguratorPayload({
          sessionId: session.id,
          customName: custom.name,
          draft
        })
      )
    );
    return true;
  }

  if (action === 'embed_field' && interaction.isStringSelectMenu()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom || custom.type !== 'embed') return true;
    const field = interaction.values[0];
    const labels = {
      title: 'Titre',
      description: 'Description',
      accentColor: 'Couleur',
      footer: 'Footer',
      thumbnailUrl: 'Thumbnail URL',
      imageRightUrl: 'Image URL',
      pictureUrl: 'Picture URL',
      button: 'Bouton',
      authorName: 'Auteur'
    };

    if (field === 'button') {
      context.sessionStore.createPendingEmbedInput({
        sessionId: session.id,
        channelId: interaction.channel.id,
        userId: interaction.user.id,
        field: 'button',
        step: 'content_mode',
        timeoutMs: 120_000
      });

      await interaction.reply({
        ...buildNoticePayload({
          title: '# Bouton: type de contenu',
          body: '> Choisissez:\n> `1` Emoji uniquement\n> `2` Texte uniquement\n> `3` Emoji + texte\n> `0` Annuler'
        }),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      });
      return true;
    }

    context.sessionStore.createPendingEmbedInput({
      sessionId: session.id,
      channelId: interaction.channel.id,
      userId: interaction.user.id,
      field,
      timeoutMs: 120_000
    });
    await interaction.reply({
      ...buildNoticePayload({
        title: '# Saisie attendue',
        body: `> Envoyez maintenant la valeur pour **${labels[field] || field}** dans ce salon.\n> Pour vider le champ, envoyez \`none\`.`
      }),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return true;
  }

  if (action === 'button_roles' && interaction.isRoleSelectMenu()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom || custom.type !== 'embed') return true;

    const selectedRoleIds = (interaction.values || []).map((id) => String(id)).filter((id) => /^\d{15,20}$/.test(id)).slice(0, 4);
    if (!selectedRoleIds.length) {
      await interaction.reply({
        ...buildNoticePayload({
          title: '# Sélection invalide',
          body: '> Sélectionnez au moins un rôle.'
        }),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      });
      return true;
    }

    const draft = cloneEmbedConfig(context.sessionStore.getEmbedDraft(session.id) || custom.config.embed);
    draft.buttonMode = 'role_add';
    draft.buttonTarget = selectedRoleIds.join(',');
    context.sessionStore.setEmbedDraft(session.id, draft);
    context.sessionStore.clearPendingEmbedInput(interaction.channel.id, interaction.user.id);

    try {
      const panelMessage = await interaction.channel.messages.fetch(session.messageId);
      await panelMessage.edit(
        stripUpdateFlags(
          buildEmbedConfiguratorPayload({
            sessionId: session.id,
            customName: custom.name,
            draft
          })
        )
      );
    } catch {
      // Ignore if panel message no longer exists.
    }

    await interaction.reply({
      ...buildNoticePayload({
        title: '# Rôles enregistrés',
        body: `> Bouton configuré avec ${selectedRoleIds.length} rôle(s). Confirmez l'embed pour appliquer.`
      }),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return true;
  }

  if (action === 'embed_confirm' && interaction.isButton()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom || custom.type !== 'embed') return true;
    const draft = cloneEmbedConfig(context.sessionStore.getEmbedDraft(session.id) || custom.config.embed);
    context.customStore.update(interaction.guild.id, custom.id, (entry) => {
      entry.config.embed = draft;
    });
    context.sessionStore.clearEmbedDraft(session.id);
    const refreshed = context.customStore.getById(interaction.guild.id, custom.id);
    await interaction.update(
      stripUpdateFlags(
        buildCustomManagePayload({
          sessionId: session.id,
          custom: refreshed,
          guildRolesCount: interaction.guild.roles.cache.size
        })
      )
    );
    return true;
  }

  if (action === 'role_embed_field' && interaction.isStringSelectMenu()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom || custom.type !== 'role_action') return true;
    const field = interaction.values[0];
    const labels = {
      title: 'Titre',
      description: 'Description',
      accentColor: 'Couleur',
      footer: 'Footer',
      thumbnailUrl: 'Thumbnail URL',
      imageRightUrl: 'Image URL',
      pictureUrl: 'Picture URL',
      button: 'Bouton',
      authorName: 'Auteur'
    };

    if (field === 'button') {
      context.sessionStore.createPendingEmbedInput({
        sessionId: session.id,
        channelId: interaction.channel.id,
        userId: interaction.user.id,
        field: 'button',
        step: 'content_mode',
        scope: 'role_action_response_embed',
        customId: custom.id,
        timeoutMs: 120_000
      });

      await interaction.reply({
        ...buildNoticePayload({
          title: '# Bouton: type de contenu',
          body: '> Choisissez:\n> `1` Emoji uniquement\n> `2` Texte uniquement\n> `3` Emoji + texte\n> `0` Annuler'
        }),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      });
      return true;
    }

    context.sessionStore.createPendingEmbedInput({
      sessionId: session.id,
      channelId: interaction.channel.id,
      userId: interaction.user.id,
      field,
      scope: 'role_action_response_embed',
      customId: custom.id,
      timeoutMs: 120_000
    });
    await interaction.reply({
      ...buildNoticePayload({
        title: '# Saisie attendue',
        body: `> Envoyez maintenant la valeur pour **${labels[field] || field}** dans ce salon.\n> Pour vider le champ, envoyez \`none\`.`
      }),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return true;
  }

  if (action === 'role_embed_confirm' && interaction.isButton()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom || custom.type !== 'role_action') return true;
    const draft = cloneRoleActionEmbedConfig(
      context.sessionStore.getEmbedDraft(session.id) || custom.config.roleAction.responseEmbed
    );
    context.customStore.update(interaction.guild.id, custom.id, (entry) => {
      entry.config.roleAction.responseEmbed = draft;
    });
    context.sessionStore.clearEmbedDraft(session.id);
    const refreshed = context.customStore.getById(interaction.guild.id, custom.id);
    await interaction.update(
      stripUpdateFlags(
        buildTypeConfigControlsPayload({
          sessionId: session.id,
          custom: refreshed,
          guildRolesCount: interaction.guild.roles.cache.size
        })
      )
    );
    return true;
  }

  if (action === 'role_embed_cancel' && interaction.isButton()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom || custom.type !== 'role_action') return true;
    context.sessionStore.clearEmbedDraft(session.id);
    const refreshed = context.customStore.getById(interaction.guild.id, custom.id);
    await interaction.update(
      stripUpdateFlags(
        buildTypeConfigControlsPayload({
          sessionId: session.id,
          custom: refreshed,
          guildRolesCount: interaction.guild.roles.cache.size
        })
      )
    );
    return true;
  }

  if (action === 'embed_cancel' && interaction.isButton()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom || custom.type !== 'embed') return true;
    context.sessionStore.clearEmbedDraft(session.id);
    const refreshed = context.customStore.getById(interaction.guild.id, custom.id);
    await interaction.update(
      stripUpdateFlags(
        buildCustomManagePayload({
          sessionId: session.id,
          custom: refreshed,
          guildRolesCount: interaction.guild.roles.cache.size
        })
      )
    );
    return true;
  }

  if (action === 'open_modal_message' && interaction.isButton()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom) return true;
    await interaction.showModal(buildMessageConfigModal(session.id, custom.id, custom.config.message));
    return true;
  }

  if (action === 'open_modal_role_action' && interaction.isButton()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom) return true;
    await interaction.showModal(buildRoleActionConfigModal(session.id, custom.id, custom.config.roleAction));
    return true;
  }

  if (action === 'selector_embed_editor' && interaction.isButton()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom || custom.type !== 'selector') return true;
    const draft = cloneEmbedConfig(context.sessionStore.getEmbedDraft(session.id) || custom.config.selector);
    context.sessionStore.setEmbedDraft(session.id, draft);
    await interaction.update(
      stripUpdateFlags(
        buildEmbedConfiguratorPayload({
          sessionId: session.id,
          customName: custom.name,
          draft,
          actionPrefix: 'selector_embed'
        })
      )
    );
    return true;
  }

  if (action === 'selector_embed_cancel' && interaction.isButton()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom || custom.type !== 'selector') return true;
    context.sessionStore.clearEmbedDraft(session.id);
    const refreshed = context.customStore.getById(interaction.guild.id, custom.id);
    await interaction.update(
      stripUpdateFlags(
        buildTypeConfigControlsPayload({
          sessionId: session.id,
          custom: refreshed,
          guildRolesCount: interaction.guild.roles.cache.size
        })
      )
    );
    return true;
  }

  if (action === 'selector_embed_confirm' && interaction.isButton()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom || custom.type !== 'selector') return true;
    const draft = cloneEmbedConfig(context.sessionStore.getEmbedDraft(session.id) || custom.config.selector);
    context.customStore.update(interaction.guild.id, custom.id, (entry) => {
      // we merge it with existing selector config to not lose roleIds or maxValues or placeholder
      entry.config.selector = { ...entry.config.selector, ...draft };
    });
    context.sessionStore.clearEmbedDraft(session.id);
    const refreshed = context.customStore.getById(interaction.guild.id, custom.id);
    await interaction.update(
      stripUpdateFlags(
        buildTypeConfigControlsPayload({
          sessionId: session.id,
          custom: refreshed,
          guildRolesCount: interaction.guild.roles.cache.size
        })
      )
    );
    return true;
  }

  if (action === 'selector_embed_field' && interaction.isStringSelectMenu()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom || custom.type !== 'selector') return true;
    const field = interaction.values[0];
    const labels = {
      title: 'Titre',
      description: 'Description',
      accentColor: 'Couleur',
      footer: 'Footer',
      thumbnailUrl: 'Thumbnail URL',
      imageRightUrl: 'Image URL',
      pictureUrl: 'Picture URL',
      button: 'Bouton',
      authorName: 'Auteur'
    };

    if (field === 'button') {
      context.sessionStore.createPendingEmbedInput({
        sessionId: session.id,
        channelId: interaction.channel.id,
        userId: interaction.user.id,
        field: 'button',
        step: 'content_mode',
        scope: 'selector_response_embed',
        customId: custom.id,
        timeoutMs: 120_000
      });

      await interaction.reply({
        ...buildNoticePayload({
          title: '# Bouton: type de contenu',
          body: '> Choisissez:\n> `1` Emoji uniquement\n> `2` Texte uniquement\n> `3` Emoji + texte\n> `0` Annuler'
        }),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      });
      return true;
    }

    context.sessionStore.createPendingEmbedInput({
      sessionId: session.id,
      channelId: interaction.channel.id,
      userId: interaction.user.id,
      field,
      scope: 'selector_response_embed',
      customId: custom.id,
      timeoutMs: 120_000
    });
    await interaction.reply({
      ...buildNoticePayload({
        title: '# Saisie attendue',
        body: `> Envoyez maintenant la valeur pour **${labels[field] || field}** dans ce salon.\n> Pour vider le champ, envoyez \`none\`.`
      }),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return true;
  }

  if (action === 'open_modal_selector' && interaction.isButton()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom) return true;
    await interaction.showModal(buildSelectorConfigModal(session.id, custom.id, custom.config.selector));
    return true;
  }

  if (action === 'role_pick' && interaction.isRoleSelectMenu()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom) return true;
    const pickedRoleId = interaction.values[0] || null;
    const updated = context.customStore.update(interaction.guild.id, custom.id, (entry) => {
      entry.config.roleAction.roleId = pickedRoleId;
    });
    await interaction.update(
      stripUpdateFlags(
        buildTypeConfigControlsPayload({
          sessionId: session.id,
          custom: updated,
          guildRolesCount: interaction.guild.roles.cache.size
        })
      )
    );
    return true;
  }

  if (action === 'role_action_pick' && interaction.isStringSelectMenu()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom) return true;
    const selected = interaction.values[0];
    const updated = context.customStore.update(interaction.guild.id, custom.id, (entry) => {
      entry.config.roleAction.action = selected;
    });
    await interaction.update(
      stripUpdateFlags(
        buildTypeConfigControlsPayload({
          sessionId: session.id,
          custom: updated,
          guildRolesCount: interaction.guild.roles.cache.size
        })
      )
    );
    return true;
  }

  if (action === 'role_target_pick' && interaction.isStringSelectMenu()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom) return true;
    const selected = interaction.values[0];
    const updated = context.customStore.update(interaction.guild.id, custom.id, (entry) => {
      entry.config.roleAction.targetMode = selected;
    });
    await interaction.update(
      stripUpdateFlags(
        buildTypeConfigControlsPayload({
          sessionId: session.id,
          custom: updated,
          guildRolesCount: interaction.guild.roles.cache.size
        })
      )
    );
    return true;
  }

  if (action === 'role_response_pick' && interaction.isStringSelectMenu()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom) return true;
    const selected = interaction.values[0];
    const updated = context.customStore.update(interaction.guild.id, custom.id, (entry) => {
      entry.config.roleAction.responseMode = selected;
    });
    await interaction.update(
      stripUpdateFlags(
        buildTypeConfigControlsPayload({
          sessionId: session.id,
          custom: updated,
          guildRolesCount: interaction.guild.roles.cache.size
        })
      )
    );
    return true;
  }

  if (action === 'selector_roles' && interaction.isRoleSelectMenu()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom) return true;
    const updated = context.customStore.update(interaction.guild.id, custom.id, (entry) => {
      entry.config.selector.roleIds = interaction.values;
    });
    await interaction.update(
      stripUpdateFlags(
        buildTypeConfigControlsPayload({
          sessionId: session.id,
          custom: updated,
          guildRolesCount: interaction.guild.roles.cache.size
        })
      )
    );
    return true;
  }

  if (action === 'selector_max' && interaction.isStringSelectMenu()) {
    const custom = context.customStore.getById(interaction.guild.id, resolvedCustomId);
    if (!custom) return true;
    const maxValues = Number.parseInt(interaction.values[0], 10) || 1;
    const updated = context.customStore.update(interaction.guild.id, custom.id, (entry) => {
      entry.config.selector.maxValues = maxValues;
    });
    await interaction.update(
      stripUpdateFlags(
        buildTypeConfigControlsPayload({
          sessionId: session.id,
          custom: updated,
          guildRolesCount: interaction.guild.roles.cache.size
        })
      )
    );
    return true;
  }

  return true;
}

async function handleCustomModal(interaction, context) {
  if (!interaction.customId.startsWith('custom:modal:')) return false;
  const parts = interaction.customId.split(':');
  const modalType = parts[2];
  const sessionId = parts[3];

  const session = context.sessionStore.getPanelSession(sessionId);
  if (!session) {
    await interaction.reply({
      ...buildCustomSessionEndedPayload(),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return true;
  }

  if (String(interaction.user.id) !== String(session.ownerId)) {
    await interaction.reply({
      ...buildNoticePayload({
        title: '# Action refusée',
        body: '> Cette modal ne vous appartient pas.'
      }),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return true;
  }

  const customId = session.selectedCustomId;
  const custom = context.customStore.getById(interaction.guild.id, customId);
  if (!custom) {
    await interaction.reply({
      ...buildExecutionFailedPayload('Custom introuvable.'),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return true;
  }

  if (modalType === 'embed') {
    const title = interaction.fields.getTextInputValue('title').trim();
    const description = interaction.fields.getTextInputValue('description').trim();
    const accentColor = interaction.fields.getTextInputValue('accentColor').trim() || '#5865F2';
    const footer = interaction.fields.getTextInputValue('footer').trim();

    context.customStore.update(interaction.guild.id, custom.id, (entry) => {
      entry.config.embed.title = title;
      entry.config.embed.description = description;
      entry.config.embed.accentColor = accentColor;
      entry.config.embed.footer = footer;
    });
  } else if (modalType === 'message') {
    const content = interaction.fields.getTextInputValue('content').trim();
    context.customStore.update(interaction.guild.id, custom.id, (entry) => {
      entry.config.message.content = content;
    });
  } else if (modalType === 'role_action') {
    const confirmationTemplate = interaction.fields.getTextInputValue('confirmationTemplate').trim();
    context.customStore.update(interaction.guild.id, custom.id, (entry) => {
      entry.config.roleAction.confirmationTemplate = confirmationTemplate;
    });
  } else if (modalType === 'selector') {
    const title = interaction.fields.getTextInputValue('title').trim();
    const description = interaction.fields.getTextInputValue('description').trim();
    const accentColor = interaction.fields.getTextInputValue('accentColor').trim() || '#2B2D31';
    const placeholder = interaction.fields.getTextInputValue('placeholder').trim() || 'Sélectionnez vos rôles';

    context.customStore.update(interaction.guild.id, custom.id, (entry) => {
      entry.config.selector.title = title;
      entry.config.selector.description = description;
      entry.config.selector.accentColor = accentColor;
      entry.config.selector.placeholder = placeholder;
    });
  }

  const updated = context.customStore.getById(interaction.guild.id, custom.id);
  await interaction.reply({
    ...buildTypeConfigControlsPayload({
      sessionId: session.id,
      custom: updated,
      guildRolesCount: interaction.guild.roles.cache.size
    }),
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
  });
  return true;
}

async function tryExecuteDynamicCustom(message, commandName, args, context) {
  const custom = context.customStore.getByName(message.guild.id, commandName);
  if (!custom) return false;

  const behavior = getCustomBehavior(custom);

  const canUse = hasPermission(custom, message.member, context);
  if (!canUse) {
    await message.channel.send(buildPermissionDeniedPayload());
    await context.logger.log(message.guild, '# Custom refusée', `> Commande: \`${commandName}\`\n> Auteur: <@${message.author.id}>`);
    return true;
  }

  if (!custom.type) {
    await message.channel.send(
      buildExecutionFailedPayload('Cette custom n\'est pas encore configurée.')
    );
    return true;
  }

  if (custom.type === 'embed') {
    const targetMember = resolveDynamicTargetMember(message, behavior);
    const vars = buildVariableContext({ guild: message.guild, targetMember });
    const outputConfig = {
      ...custom.config.embed,
      title: formatTemplate(custom.config.embed.title || '', vars),
      description: formatTemplate(custom.config.embed.description || '', vars),
      accentColor: formatTemplate(custom.config.embed.accentColor || '', vars),
      footer: formatTemplate(custom.config.embed.footer || '', vars),
      authorName: formatTemplate(custom.config.embed.authorName || '', vars),
      thumbnailUrl: formatTemplate(custom.config.embed.thumbnailUrl || '', vars),
      imageRightUrl: formatTemplate(custom.config.embed.imageRightUrl || '', vars),
      pictureUrl: formatTemplate(custom.config.embed.pictureUrl || custom.config.embed.imageUrl || '', vars),
      guildId: message.guild.id
    };
    const payload = buildCustomEmbedOutputPayload(custom.name, outputConfig);
    await sendManagedResponse(message.channel, payload, behavior);
    if (behavior.deleteCommand) await safeDelete(message);
    return true;
  }

  if (custom.type === 'message') {
    const targetMember = resolveDynamicTargetMember(message, behavior);
    const vars = buildVariableContext({ guild: message.guild, targetMember });
    const content = String(formatTemplate(custom.config.message.content || 'Message non configuré.', vars) || '').trim();
    await sendManagedResponse(message.channel, {
      content: content || 'Message non configuré.',
      allowedMentions: { parse: [], repliedUser: false }
    }, behavior);
    if (behavior.deleteCommand) await safeDelete(message);
    return true;
  }

  if (custom.type === 'role_action') {
    const targetMember = await resolveRoleActionTarget(message, custom.config.roleAction.targetMode);
    if (!targetMember) {
      await message.channel.send(buildExecutionFailedPayload('Membre cible introuvable.'));
      return true;
    }

    const roleId = custom.config.roleAction.roleId;
    if (!roleId) {
      await message.channel.send(buildExecutionFailedPayload('Aucun rôle configuré pour cette custom.'));
      return true;
    }

    const role = message.guild.roles.cache.get(roleId);
    if (!role) {
      await message.channel.send(buildExecutionFailedPayload('Le rôle configuré n\'existe plus.'));
      return true;
    }

    const actionName = await applyRoleAction(targetMember, roleId, custom.config.roleAction.action);
    const vars = {
      ...(buildVariableContext({ guild: message.guild, targetMember })),
      TargetMention: `<@${targetMember.id}>`,
      ActionName: actionName,
      RoleName: role.name
    };
    const confirmation = formatTemplate(custom.config.roleAction.confirmationTemplate, vars);
    const responseMode = custom.config.roleAction.responseMode === 'message' ? 'message' : 'panel';

    if (responseMode === 'message') {
      const compact = String(confirmation || '').trim();
      await sendManagedResponse(message.channel, {
        content: compact || 'Action effectuee.',
        allowedMentions: { parse: [], repliedUser: false }
      }, behavior);
      if (behavior.deleteCommand) await safeDelete(message);
      return true;
    }

    const responseEmbed = cloneRoleActionEmbedConfig(custom.config.roleAction.responseEmbed);
    const outputConfig = {
      ...responseEmbed,
      title: formatTemplate(responseEmbed.title || '{ActionName} de role', vars),
      description: formatTemplate(responseEmbed.description || '{ConfirmationMessage}', {
        ...vars,
        ConfirmationMessage: confirmation
      }),
      footer: formatTemplate(responseEmbed.footer || '', vars),
      authorName: formatTemplate(responseEmbed.authorName || '', vars),
      thumbnailUrl: formatTemplate(responseEmbed.thumbnailUrl || '', vars),
      imageUrl: formatTemplate(responseEmbed.imageUrl || '', vars)
    };

    await sendManagedResponse(message.channel, buildCustomEmbedOutputPayload(custom.name, outputConfig), behavior);
    if (behavior.deleteCommand) await safeDelete(message);
    return true;
  }

  if (custom.type === 'selector') {
    if (!custom.config.selector.roleIds.length) {
      await message.channel.send(buildExecutionFailedPayload('Aucun rôle défini dans le sélecteur.'));
      return true;
    }
    await sendManagedResponse(message.channel, buildSelectorPanelPayload(custom, message.guild), behavior);
    if (behavior.deleteCommand) await safeDelete(message);
    return true;
  }

  return true;
}

async function handleCustomSelectorInteraction(interaction, context) {
  if (!interaction.customId.startsWith('custom:selector:')) return false;
  if (!interaction.isRoleSelectMenu() && !interaction.isStringSelectMenu()) return false;

  const customId = interaction.customId.split(':')[2];
  const custom = context.customStore.getById(interaction.guild.id, customId);
  if (!custom) {
    await interaction.reply({
      ...buildExecutionFailedPayload('Ce sélecteur n\'est plus disponible.'),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return true;
  }

  const allowedSet = new Set(custom.config.selector.roleIds || []);
  if (allowedSet.size === 0) {
    await interaction.reply({
      ...buildExecutionFailedPayload('Aucun rôle n\'est configuré pour ce sélecteur.'),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return true;
  }

  const selected = new Set(interaction.values.filter((id) => allowedSet.has(id)));
  const member = interaction.member;
  const toAdd = [];
  const toRemove = [];

  for (const roleId of allowedSet) {
    const hasRole = member.roles.cache.has(roleId);
    if (selected.has(roleId) && !hasRole) toAdd.push(roleId);
    if (!selected.has(roleId) && hasRole) toRemove.push(roleId);
  }

  try {
    if (toAdd.length) await member.roles.add(toAdd);
    if (toRemove.length) await member.roles.remove(toRemove);
  } catch {
    await interaction.reply({
      ...buildExecutionFailedPayload('Impossible de modifier vos rôles (permissions manquantes).'),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return true;
  }

  await interaction.reply({
    ...buildNoticePayload({
      title: '# Roles mis à jour',
      body: `> Ajoutés: ${toAdd.length} | Retirés: ${toRemove.length}`
    }),
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
  });
  return true;
}

async function handleCustomEmbedButtonInteraction(interaction, context) {
  if (!interaction.isButton()) return false;
  const isSingle = interaction.customId.startsWith('custom:embedbtn:role:');
  const isMulti = interaction.customId.startsWith('custom:embedbtn:roles:');
  if (!isSingle && !isMulti) return false;

  const rawTarget = interaction.customId.split(':')[3] || '';
  const roleIds = isMulti ? rawTarget.split('.').filter((id) => /^\d{15,20}$/.test(id)) : [rawTarget].filter((id) => /^\d{15,20}$/.test(id));
  if (!roleIds.length) {
    await interaction.reply({
      ...buildExecutionFailedPayload('Bouton invalide.'),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return true;
  }

  const missing = roleIds.filter((id) => !interaction.guild.roles.cache.has(id));
  if (missing.length === roleIds.length) {
    await interaction.reply({
      ...buildExecutionFailedPayload('Le ou les rôles configurés n\'existent plus.'),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return true;
  }

  const member = interaction.member;
  const toAdd = roleIds.filter((id) => interaction.guild.roles.cache.has(id) && !member.roles.cache.has(id));
  if (!toAdd.length) {
    await interaction.reply({
      ...buildNoticePayload({
        title: '# Bouton role',
        body: '> Vous avez déjà tous les rôles configurés.'
      }),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return true;
  }

  try {
    await member.roles.add(toAdd);
  } catch {
    await interaction.reply({
      ...buildExecutionFailedPayload('Impossible d\'ajouter un ou plusieurs rôles (permissions manquantes).'),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    });
    return true;
  }

  await interaction.reply({
    ...buildNoticePayload({
      title: '# Bouton role',
      body: `> Rôles ajoutés: ${toAdd.map((id) => `<@&${id}>`).join(', ')}`
    }),
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
  });
  return true;
}

function hasPermission(custom, member, context) {
  if (context?.accessStore?.isSys?.(member?.id)) return true;
  const roleIds = custom.permissions.roleIds || [];
  const userIds = custom.permissions.userIds || [];
  if (!roleIds.length && !userIds.length) return true;
  if (userIds.includes(member.id)) return true;
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}

function getCustomBehavior(custom) {
  const raw = custom?.config?.behavior || {};
  return {
    deleteBotResponse: raw.deleteBotResponse === true,
    deleteCommand: raw.deleteCommand === true,
    targetAnotherMember: raw.targetAnotherMember === true
  };
}

async function sendManagedResponse(channel, payload, behavior) {
  const sent = await channel.send(payload);
  if (behavior && behavior.deleteBotResponse === true) {
    setTimeout(async () => {
      await safeDeleteMessage(sent);
    }, 15_000).unref();
  }
  return sent;
}

async function safeDeleteMessage(message) {
  try {
    await message.delete();
  } catch {
    // Silently ignore when bot cannot delete.
  }
}

async function fetchGuildMember(message, userId) {
  if (!message?.guild || !userId) return null;
  if (message.member?.user && String(message.member.id) === String(userId)) return message.member;
  return message.guild.members.fetch({ user: userId, force: false }).catch(() => null);
}

async function resolveDynamicTargetMember(message, behavior) {
  const fallbackId = message.author?.id;
  if (!behavior?.targetAnotherMember) {
    return (await fetchGuildMember(message, fallbackId)) || message.member || null;
  }

  const mentionMember = message.mentions.members.first();
  if (mentionMember?.user) return mentionMember;

  const mentionUser = message.mentions.users.first();
  if (mentionUser) {
    const fetched = await fetchGuildMember(message, mentionUser.id);
    if (fetched) return fetched;
  }

  return (await fetchGuildMember(message, fallbackId)) || message.member || null;
}

async function resolveRoleActionTarget(message, targetMode) {
  if (targetMode === 'author') {
    return (await fetchGuildMember(message, message.author?.id)) || message.member || null;
  }

  const mentionMember = message.mentions.members.first();
  if (mentionMember?.user) return mentionMember;

  const mentionUser = message.mentions.users.first();
  if (mentionUser) {
    const fetched = await fetchGuildMember(message, mentionUser.id);
    if (fetched) return fetched;
  }

  return (await fetchGuildMember(message, message.author?.id)) || message.member || null;
}

async function applyRoleAction(member, roleId, action) {
  const hasRole = member.roles.cache.has(roleId);

  if (action === 'add') {
    if (!hasRole) await member.roles.add(roleId);
    return 'Ajout';
  }
  if (action === 'remove') {
    if (hasRole) await member.roles.remove(roleId);
    return 'Retrait';
  }
  if (hasRole) {
    await member.roles.remove(roleId);
    return 'Retrait';
  }
  await member.roles.add(roleId);
  return 'Ajout';
}

function stripUpdateFlags(payload) {
  return {
    components: payload.components,
    allowedMentions: payload.allowedMentions
  };
}

function scheduleNameInputTimeout(context, sessionId, channelId, userId, panelMessageId) {
  setTimeout(async () => {
    const pending = context.sessionStore.getPendingNameInput(channelId, userId);
    if (!pending || pending.sessionId !== sessionId) return;
    context.sessionStore.clearPendingNameInput(channelId, userId);
    const session = context.sessionStore.getPanelSession(sessionId);
    if (!session) return;

    try {
      const channel = await context.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) return;
      const panel = await channel.messages.fetch(panelMessageId);
      const customs = context.customStore.listGuildCustoms(session.guildId);
      await panel.edit(stripUpdateFlags(buildExecutionFailedPayload('Temps écoulé: création annulée.')));
      await panel.edit(stripUpdateFlags(buildCustomListPayload({ sessionId, customs })));
    } catch {
      // If the panel no longer exists, ignore.
    }
  }, 90_000).unref();
}

async function safeDelete(message) {
  try {
    await message.delete();
  } catch {
    // Silently ignore when bot cannot delete.
  }
}

function cloneEmbedConfig(embedConfig) {
  return {
    title: String(embedConfig?.title || ''),
    description: String(embedConfig?.description || ''),
    accentColor: String(embedConfig?.accentColor || ''),
    footer: String(embedConfig?.footer || ''),
    thumbnailUrl: String(embedConfig?.thumbnailUrl || ''),
    imageRightUrl: String(embedConfig?.imageRightUrl || ''),
    pictureUrl: String(embedConfig?.pictureUrl || embedConfig?.imageUrl || ''),
    buttonMode: String(embedConfig?.buttonMode || 'none'),
    buttonTarget: String(embedConfig?.buttonTarget || ''),
    buttonContentMode: String(embedConfig?.buttonContentMode || 'text'),
    buttonLabel: String(embedConfig?.buttonLabel ?? 'Bouton'),
    buttonColor: String(embedConfig?.buttonColor || 'none'),
    buttonEmoji: String(embedConfig?.buttonEmoji || ''),
    authorName: String(embedConfig?.authorName || '')
  };
}

function cloneRoleActionEmbedConfig(embedConfig) {
  return {
    title: String(embedConfig?.title || ''),
    description: String(embedConfig?.description || '{ConfirmationMessage}'),
    footer: String(embedConfig?.footer || ''),
    thumbnailUrl: String(embedConfig?.thumbnailUrl || ''),
    imageUrl: String(embedConfig?.imageUrl || ''),
    authorName: String(embedConfig?.authorName || '')
  };
}

function isValidUrl(value) {
  return /^https?:\/\/\S+$/i.test(String(value || '').trim());
}

function isValidHexColor(value) {
  return /^#?[0-9a-f]{6}$/i.test(String(value || '').trim());
}

function extractSnowflake(value) {
  const match = String(value || '').match(/\d{15,20}/);
  return match ? match[0] : '';
}

function extractSnowflakes(value) {
  const matches = String(value || '').match(/\d{15,20}/g) || [];
  return [...new Set(matches)];
}

function parseButtonModeChoice(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (value === '0' || value === 'cancel' || value === 'annuler') return 'cancel';
  if (value === '1' || value === 'server' || value === 'serveur' || value === 'server_url') return 'server_url';
  if (value === '2') return 'channel';
  if (value === '3') return 'role_add';
  if (value === '4' || value === 'lien' || value === 'link' || value === 'url') return 'url';
  return '';
}

function parseButtonContentChoice(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (value === '0' || value === 'cancel' || value === 'annuler') return 'cancel';
  if (value === '1' || value === 'emoji') return 'emoji';
  if (value === '2' || value === 'texte' || value === 'text') return 'text';
  if (value === '3' || value === 'emoji+texte' || value === 'emoji + texte' || value === 'both') return 'both';
  return '';
}

function parseButtonColor(raw) {
  const value = String(raw || '').trim().toLowerCase();
  const allowed = new Set(['none', 'primary', 'success', 'danger']);
  if (!allowed.has(value)) return '';
  return value;
}

function parseButtonLabelAndColor(raw, fallbackLabel) {
  const input = String(raw || '').trim();
  if (!input) return null;
  const allowed = new Set(['none', 'primary', 'success', 'danger']);

  let rawLabel = '';
  let rawColor = '';

  if (input.includes('|')) {
    [rawLabel, rawColor] = input.split('|').map((part) => String(part || '').trim());
  } else {
    const spaceParts = input.split(/\s+/);
    const maybeColor = String(spaceParts[spaceParts.length - 1] || '').toLowerCase();
    if (allowed.has(maybeColor) && spaceParts.length > 1) {
      rawColor = maybeColor;
      rawLabel = spaceParts.slice(0, -1).join(' ').trim();
    } else if (allowed.has(input.toLowerCase())) {
      rawColor = input.toLowerCase();
      rawLabel = '';
    } else {
      rawLabel = input;
      rawColor = 'none';
    }
  }

  const label = (rawLabel || fallbackLabel || 'Bouton').slice(0, 80);
  const color = (rawColor || 'none').toLowerCase();
  if (!allowed.has(color)) return null;
  return { label, color };
}

module.exports = {
  runCustomPanelCommand,
  handlePendingCustomNameInput,
  handlePendingEmbedFieldInput,
  handleCustomPanelInteraction,
  handleCustomModal,
  tryExecuteDynamicCustom,
  handleCustomSelectorInteraction,
  handleCustomEmbedButtonInteraction
};

