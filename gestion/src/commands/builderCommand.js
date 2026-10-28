const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  ComponentType,
  MessageFlags,
  RoleSelectMenuBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
} = require('discord.js');
const { withV2, buildExecutionFailedPayload } = require('../utils/components');

const BUILDER_TIMEOUT = 10 * 60 * 1000;
const MAX_BLOCKS = 20;
const MAX_BUTTONS_PER_GROUP = 5;

// Stocke les role IDs des rolemenus par un ID court pour éviter de dépasser
// la limite de 100 caractères des customId Discord.
const rolemenuRegistry = new Map();

function registerRolemenu(roleIds) {
  const menuId = Math.random().toString(16).slice(2, 10);
  rolemenuRegistry.set(menuId, [...roleIds]);
  return menuId;
}

// ─── Helpers de base ─────────────────────────────────────────────────────────

function makeSeparator(size) {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(size === 'large' ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
}

function describeTarget(channel) {
  return channel ? `${channel}` : 'ce salon';
}

function parseHexColor(input) {
  const normalized = input.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return Number.parseInt(normalized, 16);
}

function formatAccentColor(color) {
  if (color === null || color === undefined) return 'Aucune';
  return `#${color.toString(16).padStart(6, '0').toUpperCase()}`;
}

function applyAccentColor(container, color) {
  if (typeof color === 'number') {
    container.setAccentColor(color);
  } else {
    container.clearAccentColor();
  }
  return container;
}

function createPromptEmbed(title, description) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents((text) => text.setContent(`## ${title}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(description))
    .addTextDisplayComponents((text) => text.setContent('-# Tapez "annuler" pour annuler'));

  return withV2({ components: [container] });
}

function countBlocks(blocks) {
  return {
    total: blocks.length,
    texts: blocks.filter((b) => b.type === 'text').length,
    separators: blocks.filter((b) => b.type === 'separator').length,
    rolemenus: blocks.filter((b) => b.type === 'rolemenu').length,
    button_groups: blocks.filter((b) => b.type === 'button_group').length,
  };
}

// ─── Preview ──────────────────────────────────────────────────────────────────

function buildPreviewContainer(state) {
  const container = applyAccentColor(new ContainerBuilder(), state.accentColor);

  container.addTextDisplayComponents((text) => text.setContent('## Apercu du message'));
  container.addTextDisplayComponents((text) =>
    text.setContent(
      state.targetChannel
        ? `Le message final sera envoye dans ${describeTarget(state.targetChannel)}.`
        : 'Le salon d envoi sera choisi au moment de cliquer sur Envoyer.'
    )
  );
  container.addSeparatorComponents(makeSeparator('small'));

  if (state.statusText) {
    container.addTextDisplayComponents((text) => text.setContent(state.statusText));
    container.addSeparatorComponents(makeSeparator('small'));
  }

  if (state.blocks.length === 0) {
    container.addTextDisplayComponents((text) => text.setContent('*Aucun contenu pour le moment.*'));
  } else {
    let firstTextDone = false;
    for (const block of state.blocks) {
      if (block.type === 'text') {
        container.addTextDisplayComponents((text) =>
          text.setContent(firstTextDone ? block.content : `## ${block.content}`)
        );
        firstTextDone = true;
      } else if (block.type === 'separator') {
        container.addSeparatorComponents(makeSeparator(block.size));
      } else if (block.type === 'rolemenu') {
        const roleList = block.roles.map((r) => `<@&${r.id}>`).join(', ') || '*(aucun role)*';
        container.addTextDisplayComponents((text) =>
          text.setContent(
            `-# [Selecteur de roles] "${block.placeholder}" | Roles : ${roleList} | Max : ${block.maxValues}`
          )
        );
      } else if (block.type === 'button_group') {
        const btnDesc = block.buttons
          .map((b) => (b.subtype === 'link' ? `[Lien] ${b.label}` : `[Role] ${b.label}`))
          .join(' • ');
        container.addTextDisplayComponents((text) =>
          text.setContent(`-# [Groupe de boutons (${block.buttons.length})] ${btnDesc}`)
        );
      }
    }
  }

  const counts = countBlocks(state.blocks);
  container.addSeparatorComponents(makeSeparator('small'));
  container.addTextDisplayComponents((text) =>
    text.setContent(
      `-# Blocs : ${counts.total}/${MAX_BLOCKS} | Textes : ${counts.texts} | Sep : ${counts.separators} | RoleMenus : ${counts.rolemenus} | BtnGroupes : ${counts.button_groups} | Couleur : ${formatAccentColor(state.accentColor)}`
    )
  );

  return container;
}

// ─── Éditeur ──────────────────────────────────────────────────────────────────

function buildEditorContainer(state, disabled = false) {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents((text) => text.setContent('## Builder'));
  container.addTextDisplayComponents((text) =>
    text.setContent('Utilisez les menus et boutons ci dessous pour construire le message.')
  );
  container.addSeparatorComponents(makeSeparator('small'));
  container.addActionRowComponents(...buildEditorComponents(state, disabled));
  return container;
}

function buildEditorComponents(state, disabled = false) {
  const canRemove = state.blocks.length > 0 && !disabled;
  const canSend = state.blocks.length > 0 && !disabled;
  const canAdd = state.blocks.length < MAX_BLOCKS && !disabled;

  const lastBlock = state.blocks[state.blocks.length - 1];
  const lastGroupHasRoom =
    lastBlock?.type === 'button_group' && lastBlock.buttons.length < MAX_BUTTONS_PER_GROUP;

  const actionOptions = [
    { label: 'Ajouter un texte', value: 'add_text', description: 'Ajoute un bloc texte au message' },
    { label: 'Ajouter un separateur', value: 'add_separator', description: 'Choisis ensuite petit ou grand' },
    {
      label: 'Ajouter un selecteur de roles',
      value: 'add_rolemenu',
      description: 'Menu deroulant pour prendre/retirer des roles',
    },
    { label: 'Ajouter un bouton lien', value: 'add_button_link', description: 'Bouton qui ouvre une URL' },
    {
      label: 'Ajouter un bouton role',
      value: 'add_button_role',
      description: 'Bouton qui donne/retire un role au clic',
    },
    { label: 'Changer la couleur', value: 'set_color', description: 'Definis la couleur a gauche du message' },
  ];

  const actionSelect = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('builder_action')
      .setPlaceholder('Choisis une action')
      .setDisabled(disabled || !canAdd)
      .addOptions(actionOptions)
  );

  const footerButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('builder_remove_last')
      .setLabel('Supprimer le dernier bloc')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!canRemove),
    new ButtonBuilder()
      .setCustomId('builder_reset')
      .setLabel('Reinitialiser')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!canRemove),
    new ButtonBuilder()
      .setCustomId('builder_send')
      .setLabel('Envoyer')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canSend),
    new ButtonBuilder()
      .setCustomId('builder_close')
      .setLabel('Fermer')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );

  const rows = [actionSelect];

  if (state.awaitingSeparatorChoice && !disabled) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('builder_separator_size')
          .setPlaceholder('Choisis la taille du separateur')
          .addOptions(
            { label: 'Petit separateur', value: 'small', description: 'Espacement compact' },
            { label: 'Grand separateur', value: 'large', description: 'Espacement large' }
          )
      )
    );
  }

  if (state.awaitingRoleMenuRoles && !disabled) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('builder_rolemenu_roles')
          .setPlaceholder('Choisis les roles du selecteur')
          .setMinValues(1)
          .setMaxValues(25)
      )
    );
  }

  if (state.awaitingButtonRoleTarget && !disabled) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('builder_button_role_pick')
          .setPlaceholder('Choisis le role a donner/retirer')
          .setMinValues(1)
          .setMaxValues(1)
      )
    );
  }

  if (state.awaitingButtonGroupAction && lastGroupHasRoom && !disabled) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('builder_button_group_action')
          .setPlaceholder('Que faire avec ce groupe de boutons ?')
          .addOptions(
            {
              label: 'Ajouter un autre bouton dans ce groupe',
              value: 'add_more',
              description: 'Jusqu\'a 5 boutons par ligne',
            },
            {
              label: 'Terminer ce groupe',
              value: 'finalize',
              description: 'Passe au prochain bloc',
            }
          )
      )
    );
  }

  if (state.awaitingChannelChoice && !disabled) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('builder_channel_select')
          .setPlaceholder('Choisis le salon d envoi')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      )
    );
  }

  rows.push(footerButtons);
  return rows;
}

function buildEditorPayload(state, disabled = false) {
  return withV2({
    components: [buildPreviewContainer(state), buildEditorContainer(state, disabled)],
  });
}

// ─── Message final ────────────────────────────────────────────────────────────

function buildFinalContainer(state) {
  const container = applyAccentColor(new ContainerBuilder(), state.accentColor);
  let firstTextDone = false;

  for (const block of state.blocks) {
    if (block.type === 'text') {
      container.addTextDisplayComponents((text) =>
        text.setContent(firstTextDone ? block.content : `## ${block.content}`)
      );
      firstTextDone = true;
    } else if (block.type === 'separator') {
      container.addSeparatorComponents(makeSeparator(block.size));
    } else if (block.type === 'rolemenu') {
      const roleOptions = block.roles.slice(0, 25).map((r) => ({
        label: r.label.slice(0, 100) || `Role ${r.id}`,
        value: r.id,
      }));
      if (roleOptions.length === 0) continue;

      const safeMax = Math.max(1, Math.min(roleOptions.length, block.maxValues || 1));
      const menuId = registerRolemenu(block.roles.map((r) => r.id));
      container.addActionRowComponents((row) =>
        row.setComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`builder:rolemenu:${menuId}`)
            .setPlaceholder(block.placeholder || 'Choisissez vos roles')
            .setMinValues(0)
            .setMaxValues(safeMax)
            .setOptions(roleOptions)
        )
      );
    } else if (block.type === 'button_group') {
      if (block.buttons.length === 0) continue;
      container.addActionRowComponents((row) => {
        for (const btn of block.buttons.slice(0, MAX_BUTTONS_PER_GROUP)) {
          const builder = new ButtonBuilder().setLabel(btn.label.slice(0, 80));
          if (btn.subtype === 'link') {
            builder.setStyle(ButtonStyle.Link).setURL(btn.url);
          } else {
            builder.setStyle(ButtonStyle.Secondary).setCustomId(`builder:rolebtn:${btn.roleId}`);
          }
          row.addComponents(builder);
        }
        return row;
      });
    }
  }

  return container;
}

// ─── Helper : finalise un bouton et l'insère dans le bon groupe ───────────────

function finalizeButtonAndAdd(state) {
  const newBtn = { ...state.pendingButton };
  state.pendingButton = null;

  const lastBlock = state.blocks[state.blocks.length - 1];

  if (lastBlock?.type === 'button_group' && lastBlock.buttons.length < MAX_BUTTONS_PER_GROUP) {
    lastBlock.buttons.push(newBtn);
  } else {
    state.blocks.push({ type: 'button_group', buttons: [newBtn] });
  }
}

// ─── Reset des flags d'état ────────────────────────────────────────────────────

function resetAwaitingFlags(state) {
  state.awaitingSeparatorChoice = false;
  state.awaitingRoleMenuRoles = false;
  state.awaitingButtonRoleTarget = false;
  state.awaitingButtonGroupAction = false;
  state.awaitingChannelChoice = false;
  state.awaitingMessageInput = null;
  state.pendingButton = null;
  state.pendingRoleMenu = null;
}

// ─── Commande principale ──────────────────────────────────────────────────────

async function runBuilderCommand(message, args, context) {
  try {
    const isOwnerUser = context.accessStore?.isOwner?.(message.guild.id, message.author.id) === true;
    const isSys = context.accessStore?.isSys?.(message.author.id) === true;

    if (!isOwnerUser && !isSys) {
      await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys.'));
      return;
    }

    const state = {
      targetChannel: null,
      blocks: [],
      awaitingSeparatorChoice: false,
      awaitingRoleMenuRoles: false,
      awaitingButtonRoleTarget: false,
      awaitingButtonGroupAction: false,
      awaitingChannelChoice: false,
      awaitingMessageInput: null, // 'text' | 'color' | 'rolemenu_placeholder' | 'rolemenu_max' | 'button_link_label' | 'button_link_url' | 'button_role_label'
      pendingButton: null,        // { subtype, label, url?, roleId? }
      pendingRoleMenu: null,      // { placeholder, roles, maxValues }
      accentColor: null,
      statusText: null,
    };

    let promptMessage = null;

    const editorMessage = await message.channel.send(buildEditorPayload(state));

    const collector = editorMessage.createMessageComponentCollector({
      componentType: ComponentType.MessageComponent,
      time: BUILDER_TIMEOUT,
    });

    const messageCollector = message.channel.createMessageCollector({
      filter: (m) => m.author.id === message.author.id,
      time: BUILDER_TIMEOUT,
    });

    async function deletePrompt() {
      if (promptMessage) {
        await promptMessage.delete().catch(() => {});
        promptMessage = null;
      }
    }

    async function sendPrompt(title, description) {
      await deletePrompt();
      promptMessage = await message.channel.send(createPromptEmbed(title, description));
    }

    // ── Interactions composants ───────────────────────────────────────────────

    collector.on('collect', async (interaction) => {
      try {
        if (interaction.user.id !== message.author.id) {
          await interaction.reply({
            ...buildExecutionFailedPayload('Seul l\'auteur de cette commande peut utiliser ce panneau.'),
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        // ── Menu principal ──
        if (interaction.customId === 'builder_action') {
          const choice = interaction.values[0];

          if (state.blocks.length >= MAX_BLOCKS && choice !== 'set_color') {
            state.statusText = '-# Limite atteinte : retire un bloc avant d en ajouter un autre.';
            await interaction.update(buildEditorPayload(state));
            return;
          }

          resetAwaitingFlags(state);

          switch (choice) {
            case 'add_text':
              state.awaitingMessageInput = 'text';
              state.statusText = '-# En attente du texte a ajouter.';
              await interaction.update(buildEditorPayload(state));
              await sendPrompt(
                'Ajout de texte',
                'Envoyez le texte a ajouter au message.\n\nLe premier texte sera utilise comme titre.\nEcrivez `annuler` pour annuler.'
              );
              break;

            case 'add_separator':
              state.awaitingSeparatorChoice = true;
              state.statusText = '-# Choisis la taille du separateur via le menu.';
              await interaction.update(buildEditorPayload(state));
              await deletePrompt();
              break;

            case 'add_rolemenu':
              state.pendingRoleMenu = { placeholder: '', roles: [], maxValues: 1 };
              state.awaitingMessageInput = 'rolemenu_placeholder';
              state.statusText = '-# En attente du placeholder du selecteur de roles.';
              await interaction.update(buildEditorPayload(state));
              await sendPrompt(
                'Selecteur de roles — Placeholder',
                'Envoyez le texte du placeholder qui s\'affichera dans le menu.\nExemple : `Choisissez vos roles`\nEcrivez `annuler` pour annuler.'
              );
              break;

            case 'add_button_link':
              state.pendingButton = { subtype: 'link', label: '', url: '' };
              state.awaitingMessageInput = 'button_link_label';
              state.statusText = '-# En attente du label du bouton lien.';
              await interaction.update(buildEditorPayload(state));
              await sendPrompt(
                'Bouton lien — Label',
                'Envoyez le texte a afficher sur le bouton (max 80 caracteres).\nEcrivez `annuler` pour annuler.'
              );
              break;

            case 'add_button_role':
              state.pendingButton = { subtype: 'role', label: '', roleId: '' };
              state.awaitingMessageInput = 'button_role_label';
              state.statusText = '-# En attente du label du bouton role.';
              await interaction.update(buildEditorPayload(state));
              await sendPrompt(
                'Bouton role — Label',
                'Envoyez le texte a afficher sur le bouton (max 80 caracteres).\nEcrivez `annuler` pour annuler.'
              );
              break;

            case 'set_color':
              state.awaitingMessageInput = 'color';
              state.statusText = '-# En attente de la couleur du message.';
              await interaction.update(buildEditorPayload(state));
              await sendPrompt(
                'Couleur du message',
                'Envoyez une couleur hexadecimale comme `#FF0000`.\nEnvoyez `reset` pour retirer la couleur.\nEcrivez `annuler` pour annuler.'
              );
              break;
          }
          return;
        }

        // ── Taille du separateur ──
        if (interaction.customId === 'builder_separator_size') {
          state.blocks.push({
            type: 'separator',
            size: interaction.values[0] === 'large' ? 'large' : 'small',
          });
          resetAwaitingFlags(state);
          state.statusText = `-# Separateur ${interaction.values[0] === 'large' ? 'grand' : 'petit'} ajoute.`;
          await interaction.update(buildEditorPayload(state));
          await deletePrompt();
          return;
        }

        // ── Roles du rolemenu ──
        if (interaction.customId === 'builder_rolemenu_roles') {
          const roles = interaction.values.map((id) => {
            const role = interaction.guild.roles.cache.get(id);
            return { id, label: role ? role.name.slice(0, 100) : `Role ${id}` };
          });

          if (!state.pendingRoleMenu) state.pendingRoleMenu = { placeholder: '', roles: [], maxValues: 1 };
          state.pendingRoleMenu.roles = roles;
          state.awaitingRoleMenuRoles = false;
          state.awaitingMessageInput = 'rolemenu_max';
          state.statusText = `-# ${roles.length} role(s) enregistres. En attente du nombre max selectionnables.`;
          await interaction.update(buildEditorPayload(state));
          await sendPrompt(
            'Selecteur de roles — Maximum',
            `${roles.length} role(s) configure(s).\nEnvoyez un nombre entre 1 et ${roles.length} pour le maximum selectionnables.\nEnvoyez \`tous\` pour tout autoriser.\nEcrivez \`annuler\` pour annuler.`
          );
          return;
        }

        // ── Role du bouton role ──
        if (interaction.customId === 'builder_button_role_pick') {
          if (!state.pendingButton) {
            resetAwaitingFlags(state);
            state.statusText = '-# Erreur de contexte. Recommence.';
            await interaction.update(buildEditorPayload(state));
            return;
          }

          const roleId = interaction.values[0];
          state.pendingButton.roleId = roleId;

          finalizeButtonAndAdd(state);

          state.awaitingButtonRoleTarget = false;
          state.awaitingButtonGroupAction = true;
          state.awaitingMessageInput = null;
          state.statusText = `-# Bouton role <@&${roleId}> ajoute. Veux-tu ajouter un autre bouton dans ce groupe ?`;
          await interaction.update(buildEditorPayload(state));
          await deletePrompt();
          return;
        }

        // ── Continuer ou finaliser le groupe ──
        if (interaction.customId === 'builder_button_group_action') {
          if (interaction.values[0] === 'finalize') {
            resetAwaitingFlags(state);
            state.statusText = '-# Groupe de boutons finalise.';
          } else {
            // add_more : reset juste awaitingButtonGroupAction, le reste se gère via le menu principal
            state.awaitingButtonGroupAction = false;
            state.statusText = '-# Choisis le type du prochain bouton dans le menu.';
          }
          await interaction.update(buildEditorPayload(state));
          await deletePrompt();
          return;
        }

        // ── Contrôles bas de l'éditeur ──
        if (interaction.customId === 'builder_remove_last') {
          state.blocks.pop();
          resetAwaitingFlags(state);
          state.statusText = '-# Dernier bloc supprime.';
          await interaction.update(buildEditorPayload(state));
          await deletePrompt();
          return;
        }

        if (interaction.customId === 'builder_reset') {
          state.blocks = [];
          resetAwaitingFlags(state);
          state.accentColor = null;
          state.statusText = '-# Message reinitialise.';
          await interaction.update(buildEditorPayload(state));
          await deletePrompt();
          return;
        }

        if (interaction.customId === 'builder_send') {
          resetAwaitingFlags(state);
          state.awaitingChannelChoice = true;
          state.statusText = '-# Choisis le salon ou envoyer le message.';
          await interaction.update(buildEditorPayload(state));
          await deletePrompt();
          return;
        }

        if (interaction.customId === 'builder_channel_select') {
          const channelId = interaction.values[0];
          const selectedChannel = message.guild.channels.cache.get(channelId);

          if (
            !selectedChannel ||
            ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(selectedChannel.type)
          ) {
            state.statusText = '-# Salon invalide.';
            await interaction.update(buildEditorPayload(state));
            return;
          }

          state.targetChannel = selectedChannel;
          state.awaitingChannelChoice = false;

          const finalContainer = buildFinalContainer(state);
          await state.targetChannel.send(withV2({ components: [finalContainer] }));

          state.statusText = `-# Message envoye dans ${describeTarget(state.targetChannel)}.`;
          await interaction.update(buildEditorPayload(state, true));
          collector.stop('sent');
          return;
        }

        if (interaction.customId === 'builder_close') {
          resetAwaitingFlags(state);
          state.statusText = '-# Builder ferme sans envoi.';
          await interaction.update(buildEditorPayload(state, true));
          await deletePrompt();
          collector.stop('closed');
        }
      } catch (err) {
        console.error('[builder collector]', err);
        if (!interaction.replied && !interaction.deferred) {
          await interaction
            .reply({
              ...buildExecutionFailedPayload('Une erreur est survenue pendant l\'edition du message.'),
              flags: MessageFlags.Ephemeral,
            })
            .catch(() => {});
        }
      }
    });

    // ── Collector messages texte ──────────────────────────────────────────────

    messageCollector.on('collect', async (m) => {
      if (!state.awaitingMessageInput) return;

      const content = m.content.trim();

      if (content.toLowerCase() === 'annuler') {
        resetAwaitingFlags(state);
        state.statusText = '-# Action annulee.';
        await editorMessage.edit(buildEditorPayload(state)).catch(() => {});
        await deletePrompt();
        await m.delete().catch(() => {});
        return;
      }

      // Texte normal
      if (state.awaitingMessageInput === 'text') {
        if (!content) { await m.delete().catch(() => {}); return; }
        if (state.blocks.length < MAX_BLOCKS) {
          state.blocks.push({ type: 'text', content });
          state.statusText = '-# Bloc texte ajoute.';
        } else {
          state.statusText = '-# Limite atteinte.';
        }
        resetAwaitingFlags(state);
        await editorMessage.edit(buildEditorPayload(state)).catch(() => {});
        await deletePrompt();
        await m.delete().catch(() => {});
        return;
      }

      // Couleur
      if (state.awaitingMessageInput === 'color') {
        if (content.toLowerCase() === 'reset') {
          state.accentColor = null;
          state.statusText = '-# Couleur retiree.';
          resetAwaitingFlags(state);
        } else {
          const parsed = parseHexColor(content);
          if (parsed === null) {
            state.statusText = '-# Couleur invalide : utilisez un format comme #FF0000.';
            await editorMessage.edit(buildEditorPayload(state)).catch(() => {});
            await m.delete().catch(() => {});
            return;
          }
          state.accentColor = parsed;
          state.statusText = `-# Couleur definie sur ${formatAccentColor(parsed)}.`;
          resetAwaitingFlags(state);
        }
        await editorMessage.edit(buildEditorPayload(state)).catch(() => {});
        await deletePrompt();
        await m.delete().catch(() => {});
        return;
      }

      // Placeholder du rolemenu
      if (state.awaitingMessageInput === 'rolemenu_placeholder') {
        if (!state.pendingRoleMenu) state.pendingRoleMenu = { placeholder: '', roles: [], maxValues: 1 };
        state.pendingRoleMenu.placeholder = content.slice(0, 150);
        state.awaitingMessageInput = null;
        state.awaitingRoleMenuRoles = true;
        state.statusText = '-# Placeholder enregistre. Choisis les roles via le selecteur.';
        await editorMessage.edit(buildEditorPayload(state)).catch(() => {});
        await deletePrompt();
        await m.delete().catch(() => {});
        return;
      }

      // Nombre max du rolemenu
      if (state.awaitingMessageInput === 'rolemenu_max') {
        if (!state.pendingRoleMenu) {
          resetAwaitingFlags(state);
          state.statusText = '-# Erreur de contexte. Recommence.';
          await editorMessage.edit(buildEditorPayload(state)).catch(() => {});
          await deletePrompt();
          await m.delete().catch(() => {});
          return;
        }

        const totalRoles = state.pendingRoleMenu.roles.length;
        let maxVal;

        if (content.toLowerCase() === 'tous') {
          maxVal = totalRoles;
        } else {
          maxVal = Number.parseInt(content, 10);
          if (!Number.isInteger(maxVal) || maxVal < 1 || maxVal > totalRoles) {
            state.statusText = `-# Valeur invalide. Entrez un nombre entre 1 et ${totalRoles}, ou "tous".`;
            await editorMessage.edit(buildEditorPayload(state)).catch(() => {});
            await m.delete().catch(() => {});
            return;
          }
        }

        if (state.blocks.length < MAX_BLOCKS) {
          state.blocks.push({
            type: 'rolemenu',
            placeholder: state.pendingRoleMenu.placeholder,
            roles: state.pendingRoleMenu.roles,
            maxValues: maxVal,
          });
          state.statusText = `-# Selecteur de roles ajoute (${totalRoles} role(s), max ${maxVal}).`;
        } else {
          state.statusText = '-# Limite atteinte.';
        }

        resetAwaitingFlags(state);
        await editorMessage.edit(buildEditorPayload(state)).catch(() => {});
        await deletePrompt();
        await m.delete().catch(() => {});
        return;
      }

      // Label bouton lien
      if (state.awaitingMessageInput === 'button_link_label') {
        if (!content) { await m.delete().catch(() => {}); return; }
        state.pendingButton.label = content.slice(0, 80);
        state.awaitingMessageInput = 'button_link_url';
        state.statusText = '-# Label enregistre. En attente de l URL du lien.';
        await editorMessage.edit(buildEditorPayload(state)).catch(() => {});
        await deletePrompt();
        await sendPrompt(
          'Bouton lien — URL',
          'Envoyez l URL du lien (doit commencer par `https://`).\nEcrivez `annuler` pour annuler.'
        );
        await m.delete().catch(() => {});
        return;
      }

      // URL bouton lien
      if (state.awaitingMessageInput === 'button_link_url') {
        if (!/^https?:\/\/\S+/.test(content)) {
          state.statusText = '-# URL invalide. Elle doit commencer par https://.';
          await editorMessage.edit(buildEditorPayload(state)).catch(() => {});
          await m.delete().catch(() => {});
          return;
        }
        state.pendingButton.url = content.slice(0, 512);
        finalizeButtonAndAdd(state);
        state.awaitingMessageInput = null;
        state.awaitingButtonGroupAction = true;
        state.statusText = '-# Bouton lien ajoute. Veux-tu ajouter un autre bouton dans ce groupe ?';
        await editorMessage.edit(buildEditorPayload(state)).catch(() => {});
        await deletePrompt();
        await m.delete().catch(() => {});
        return;
      }

      // Label bouton role
      if (state.awaitingMessageInput === 'button_role_label') {
        if (!content) { await m.delete().catch(() => {}); return; }
        state.pendingButton.label = content.slice(0, 80);
        state.awaitingMessageInput = null;
        state.awaitingButtonRoleTarget = true;
        state.statusText = '-# Label enregistre. Choisis le role via le selecteur.';
        await editorMessage.edit(buildEditorPayload(state)).catch(() => {});
        await deletePrompt();
        await m.delete().catch(() => {});
        return;
      }

      await m.delete().catch(() => {});
    });

    // ── Fin du collector ──────────────────────────────────────────────────────

    collector.on('end', (_, reason) => {
      if (!editorMessage.editable) return;

      resetAwaitingFlags(state);
      state.statusText =
        reason === 'sent'
          ? `-# Message envoye dans ${describeTarget(state.targetChannel)}.`
          : reason === 'closed'
            ? '-# Builder ferme sans envoi.'
            : '-# Session du builder terminee.';

      editorMessage.edit(buildEditorPayload(state, true)).catch(() => {});
      if (promptMessage) { promptMessage.delete().catch(() => {}); promptMessage = null; }
      messageCollector.stop();
    });
  } catch (err) {
    console.error('[builder]', err);
    message.channel
      .send(buildExecutionFailedPayload('Une erreur est survenue lors de l\'ouverture du builder.'))
      .catch(() => {});
  }
}

// ─── Interactions sur le message final envoyé ─────────────────────────────────

async function handleBuilderInteraction(interaction) {
  // Bouton role (toggle)
  if (interaction.isButton() && interaction.customId.startsWith('builder:rolebtn:')) {
    const roleId = interaction.customId.split(':')[2];
    if (!roleId) return false;

    const member = interaction.member;
    if (!member) return false;

    try {
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);
        await interaction.reply({ content: `> Role <@&${roleId}> retire.`, flags: MessageFlags.Ephemeral });
      } else {
        await member.roles.add(roleId);
        await interaction.reply({ content: `> Role <@&${roleId}> ajoute.`, flags: MessageFlags.Ephemeral });
      }
    } catch (err) {
      console.error('[builder:rolebtn]', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction
          .reply({ content: '> Impossible de modifier ce role. Verifie les permissions du bot.', flags: MessageFlags.Ephemeral })
          .catch(() => {});
      }
    }

    return true;
  }

  // Sélecteur de roles
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('builder:rolemenu:')) {
    const menuId = interaction.customId.split(':')[2];
    const roleIdsInMenu = rolemenuRegistry.get(menuId) || [];
    const selectedIds = interaction.values;
    const member = interaction.member;
    if (!member) return false;

    try {
      const added = [];
      const removed = [];

      for (const roleId of roleIdsInMenu) {
        const hasCurrent = member.roles.cache.has(roleId);
        const wantsIt = selectedIds.includes(roleId);

        if (wantsIt && !hasCurrent) {
          await member.roles.add(roleId).catch(() => {});
          added.push(roleId);
        } else if (!wantsIt && hasCurrent) {
          await member.roles.remove(roleId).catch(() => {});
          removed.push(roleId);
        }
      }

      const parts = [];
      if (added.length) parts.push(`Ajoute : ${added.map((id) => `<@&${id}>`).join(', ')}`);
      if (removed.length) parts.push(`Retire : ${removed.map((id) => `<@&${id}>`).join(', ')}`);

      await interaction.reply({
        content: parts.length ? `> ${parts.join('\n> ')}` : '> Aucun changement.',
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      console.error('[builder:rolemenu]', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction
          .reply({ content: '> Impossible de modifier tes roles. Verifie les permissions du bot.', flags: MessageFlags.Ephemeral })
          .catch(() => {});
      }
    }

    return true;
  }

  return false;
}

module.exports = { runBuilderCommand, handleBuilderInteraction };