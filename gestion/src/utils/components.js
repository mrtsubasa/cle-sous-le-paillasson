const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  RoleSelectMenuBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
  UserSelectMenuBuilder,
  ModalBuilder
} = require('discord.js');

function withV2(payload) {
  return {
    ...payload,
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false }
  };
}

const TITLELESS_NOTICE_TITLES = new Set([
  'session expiree',
  'session expirée',
  'action refusee',
  'action refusée',
  'erreur',
  'acces refuse',
  'accès refusé'
]);

function makeBasicContainer(title, accentColor = '#5865F2') {
  const container = new ContainerBuilder();
  const safeTitle = normalizeNoticeText(title);

  if (safeTitle) {
    container
      .addTextDisplayComponents((text) => text.setContent(safeTitle))
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
  }

  return container;
}

function compactSessionId(sessionId) {
  return String(sessionId || '').slice(0, 8);
}

function buildNoticePayload({ title, body, accentColor = '#5865F2' }) {
  const safeTitle = normalizeNoticeText(title);
  const safeBody = normalizeNoticeText(body);

  if (shouldHideNoticeTitle(safeTitle)) {
    return buildFramedNoticePayload(safeBody);
  }

  const container = makeBasicContainer(safeTitle, accentColor);
  if (safeBody) {
    container.addTextDisplayComponents((text) => text.setContent(safeBody));
  }

  return withV2({ components: [container] });
}

function buildFramedNoticePayload(body) {
  const container = new ContainerBuilder()
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(toQuotedNoticeBody(body)))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));

  return withV2({ components: [container] });
}

function buildButtonRoleTargetPickerPayload({ sessionId, selectedRoleIds = [] }) {
  const panelSessionId = compactSessionId(sessionId);
  const roleIds = Array.isArray(selectedRoleIds)
    ? selectedRoleIds.map((id) => String(id)).filter((id) => /^\d{15,20}$/.test(id)).slice(0, 4)
    : [];

  const container = makeBasicContainer('# Cible du bouton')
    .addTextDisplayComponents((text) =>
      text.setContent('> Sélectionnez 1 à 4 rôles à ajouter au clic du bouton.')
    )
    .addActionRowComponents((row) =>
      row.setComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(`custom:panel:${panelSessionId}:button_roles`)
          .setPlaceholder('Choisir un ou plusieurs rôles')
          .setMinValues(1)
          .setMaxValues(4)
          .setDefaultRoles(...roleIds)
      )
    )
    .addTextDisplayComponents((text) =>
      text.setContent('> Astuce: vous pouvez aussi envoyer des IDs/mentions de rôles dans le salon.')
    );

  return withV2({ components: [container] });
}

function buildCustomListPayload({ prefix, sessionId, customs, disabled = false, accentColor = '#5865F2' }) {
  const panelSessionId = compactSessionId(sessionId);
  const list = customs.length
    ? customs
        .slice(0, 30)
        .map((custom, index) => `> ${index + 1}er custom : \`${custom.name}\``)
        .join('\n')
    : '> Aucun custom pour le moment.';

  const container = makeBasicContainer('## Custom Panel', accentColor)
    .addTextDisplayComponents((text) => text.setContent('> Gérez/créer grâce au menu ci-dessous'))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(list))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));

  if (customs.length > 0) {
    const customOptions = customs.slice(0, 25).map((custom) => ({
      label: custom.name,
      value: custom.id,
      description: `Type: ${humanType(custom.type)}`
    }));

    container.addActionRowComponents((row) =>
      row.setComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`custom:panel:${panelSessionId}:open`)
          .setPlaceholder('Ouvrir une custom')
          .setMinValues(1)
          .setMaxValues(1)
          .setDisabled(disabled)
          .setOptions(customOptions)
      )
    );
    container.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
  }

  container.addActionRowComponents((row) =>
    row.setComponents(
      new ButtonBuilder()
        .setCustomId(`custom:panel:${panelSessionId}:create`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji({ id: '1491120473688244346' })
        .setDisabled(disabled)
    )
  );

  return withV2({ components: [container] });
}

function buildAwaitCustomNamePayload({ sessionId, disabled = false, accentColor = '#5865F2' }) {
  const panelSessionId = compactSessionId(sessionId);
  const container = makeBasicContainer('## Crée ta Custom !', accentColor)
    .addTextDisplayComponents((text) => text.setContent('> Ecrivez le nom de votre commande custom'))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents((row) =>
      row.setComponents(
        new ButtonBuilder()
          .setCustomId(`custom:panel:${panelSessionId}:cancel_create`)
          .setEmoji({ id: '1491118191483818145' })
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled)
      )
    );
  return withV2({ components: [container] });
}

function buildCustomManagePayload({ sessionId, custom, guildRolesCount, disabled = false }) {
  const panelSessionId = compactSessionId(sessionId);
  const permissionRoles = custom.permissions.roleIds.length ? custom.permissions.roleIds.map((id) => `<@&${id}>`).join(', ') : 'Aucun rôle';
  const permissionUsers = custom.permissions.userIds.length ? custom.permissions.userIds.map((id) => `<@${id}>`).join(', ') : 'Aucun membre';
  const behavior = custom.config.behavior || {
    deleteBotResponse: false,
    deleteCommand: false,
    targetAnotherMember: false
  };
  const behaviorOptions = [
    {
      label: 'Supprimer la réponse du bot (apres 15s)',
      value: 'delete_response',
      default: behavior.deleteBotResponse === true
    },
    {
      label: 'Supprimer la commande',
      value: 'delete_command',
      default: behavior.deleteCommand === true
    },
    {
      label: 'Cibler sur un autre membre',
      value: 'target_other_member',
      default: behavior.targetAnotherMember === true
    }
  ];

  const typeOptions = [
    { label: 'Embed', value: 'embed', default: custom.type === 'embed' },
    { label: 'Ajout de rôle / enlèvement de rôle', value: 'role_action', default: custom.type === 'role_action' },
    { label: 'Message', value: 'message', default: custom.type === 'message' },
    { label: 'Sélecteur', value: 'selector', default: custom.type === 'selector' }
  ];

  const container = makeBasicContainer('# Commandes')
    .addTextDisplayComponents((text) => text.setContent('> Gérez votre custom ci-dessous'))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent(`**Commande:** \`${custom.name}\`\n**Type:** ${humanType(custom.type)}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent('> Choissisez certaines options pour la custom :'))
    .addActionRowComponents((row) =>
      row.setComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`custom:panel:${panelSessionId}:behavior_options`)
          .setPlaceholder('Selectionnez les options')
          .setMinValues(0)
          .setMaxValues(3)
          .setOptions(behaviorOptions)
      )
    )
    .addTextDisplayComponents((text) => text.setContent(`> Options actives: ${formatBehaviorSummary(behavior)}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent('> Autoriser les rôles qui ont accès à la custom'))
    .addActionRowComponents((row) =>
      row.setComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(`custom:panel:${panelSessionId}:roles`)
          .setPlaceholder('Sélectionnez les rôles autorisés')
          .setMinValues(0)
          .setMaxValues(Math.min(25, Math.max(1, guildRolesCount)))
          .setDisabled(disabled)
          .setDefaultRoles(...custom.permissions.roleIds.slice(0, 25))
      )
    )
    .addTextDisplayComponents((text) => text.setContent(`> Rôles actuels: ${permissionRoles}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent('> Choisir les membres qui ont accès à la custom'))
    .addActionRowComponents((row) =>
      row.setComponents(
        new UserSelectMenuBuilder()
          .setCustomId(`custom:panel:${panelSessionId}:users`)
          .setPlaceholder('Sélectionnez les membres autorisés')
          .setMinValues(0)
          .setMaxValues(25)
          .setDisabled(disabled)
          .setDefaultUsers(...custom.permissions.userIds.slice(0, 25))
      )
    )
    .addTextDisplayComponents((text) => text.setContent(`> Membres actuels: ${permissionUsers}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent('> A quoi la custom servira'))
    .addActionRowComponents((row) =>
      row.setComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`custom:panel:${panelSessionId}:type`)
          .setPlaceholder('Choisir le type de custom')
          .setMinValues(1)
          .setMaxValues(1)
          .setDisabled(disabled)
          .setOptions(typeOptions)
      )
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addSectionComponents((section) =>
      section
        .addTextDisplayComponents((text) => text.setContent(buildTypeSummary(custom)))
        .setButtonAccessory((button) =>
          button
            .setCustomId(`custom:panel:${panelSessionId}:configure`)
            .setLabel('Configurer')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled)
        )
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents((row) =>
      row.setComponents(
        new ButtonBuilder()
          .setCustomId(`custom:panel:${panelSessionId}:back`)
          .setEmoji({ id: '1491311378168938638' })
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`custom:panel:${panelSessionId}:delete_custom`)
          .setEmoji({ id: '1491310064726708294' })
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled)
      )
    );

  return withV2({ components: [container] });
}

function buildCustomSessionEndedPayload() {
  return buildNoticePayload({
    title: '# Session expirée',
    body: 'Le panneau custom a expiré. Relancez la commande `+custom`.',
  });
}

function buildPermissionDeniedPayload() {
  return buildNoticePayload({
    title: '# Accès refusé',
    body: '> Vous n\'avez pas la permission d\'utiliser cette custom.',
  });
}

function buildExecutionFailedPayload(message) {
  return buildFramedNoticePayload(message);
}

function buildHelpPayload({ sessionId, page, disabled = false }) {
  const pages = getHelpPages();
  const current = pages[page] || pages[0];

  const container = makeBasicContainer(`# ${current.title}`, '#5865F2');
  for (const block of current.blocks) {
    container
      .addTextDisplayComponents((text) => text.setContent(`\`${block.variable}\`\n> ${block.description}\n> Exemple: ${block.example}`))
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
  }

  container.addActionRowComponents((row) =>
    row.setComponents(
      new ButtonBuilder()
        .setCustomId(`help:page:${sessionId}:left`)
        .setEmoji('<:gauche:1519430324319289537>')
        .setLabel(' ')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || page === 0),
      new ButtonBuilder()
        .setCustomId(`help:page:${sessionId}:right`)
        .setEmoji('<:droite:1519430261190955028>')
        .setLabel(' ')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || page === pages.length - 1)
    )
  );

  return withV2({ components: [container] });
}

function buildSelectorPanelPayload(custom, guild) {
  const container = buildCustomEmbedOutputContainer(custom.config.selector.title, custom.config.selector);

  const roleIds = Array.isArray(custom.config.selector.roleIds) ? custom.config.selector.roleIds : [];
  const maxValues = Number(custom.config.selector.maxValues) || roleIds.length || 1;
  const description = custom.config.selector.description || '> Sélectionnez vos rôles';
  
  if (roleIds.length > 0 && guild) {
    const options = roleIds.slice(0, 25).map((id) => {
      const role = guild.roles.cache.get(id);
      return {
        label: role ? role.name : `Rôle inconnu`,
        value: id
      };
    });
  
    const safeMaxValues = Math.max(1, Math.min(options.length, maxValues === 1 ? options.length : maxValues));

    container
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents((row) =>
        row.setComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`custom:selector:${custom.id}`)
            .setPlaceholder(custom.config.selector.placeholder || 'Sélectionnez vos rôles')
            .setMinValues(0)
            .setMaxValues(safeMaxValues)
            .setOptions(options)
        )
      );
  }

  return withV2({ components: [container] });
}

function buildEmbedConfiguratorPayload({ sessionId, customName, draft, actionPrefix = 'embed' }) {
  const panelSessionId = compactSessionId(sessionId);
  const safeDraft = {
    title: String(draft?.title || ''),
    description: String(draft?.description || ''),
    accentColor: String(draft?.accentColor || ''),
    footer: String(draft?.footer || ''),
    thumbnailUrl: String(draft?.thumbnailUrl || ''),
    imageRightUrl: String(draft?.imageRightUrl || ''),
    pictureUrl: String(draft?.pictureUrl || draft?.imageUrl || ''),
    buttonMode: String(draft?.buttonMode || 'none'),
    buttonTarget: String(draft?.buttonTarget || ''),
    buttonContentMode: String(draft?.buttonContentMode || 'text'),
    buttonLabel: String(draft?.buttonLabel ?? 'Bouton'),
    buttonColor: String(draft?.buttonColor || 'none'),
    buttonEmoji: String(draft?.buttonEmoji || ''),
    authorName: String(draft?.authorName || '')
  };

  const options = [
    { label: 'Titre', value: 'title', description: 'Définir le titre' },
    { label: 'Description', value: 'description', description: 'Définir la description' },
    { label: 'Couleurs', value: 'accentColor', description: 'Couleur de la pastille (#5865F2)' },
    { label: 'Footer', value: 'footer', description: 'Définir le footer' },
    { label: 'Thumbnail URL', value: 'thumbnailUrl', description: 'URL de la miniature (sur le titre)' },
    { label: 'Image URL', value: 'imageRightUrl', description: 'URL en haut a droite de la description' },
    { label: 'Picture URL', value: 'pictureUrl', description: 'URL image large en bas' },
    { label: 'Bouton', value: 'button', description: '1 Emoji, 2 Texte, 3 Emoji+Texte' },
    { label: 'Auteur', value: 'authorName', description: 'Nom de l\'auteur' }
  ];

  const container = makeBasicContainer('## Configuration Embed', '#5865F2')
    .addTextDisplayComponents((text) =>
      text.setContent(`Custom: \`${customName}\`\nSélectionnez un champ à modifier, puis envoyez la valeur dans le salon.`)
    )
    .addTextDisplayComponents((text) => text.setContent('Astuce: écrivez `(separator)` dans un texte pour ajouter un séparateur comp v2.'))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents((row) =>
      row.setComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`custom:panel:${panelSessionId}:${actionPrefix}_field`)
          .setPlaceholder('Choisir un champ de l\'embed')
          .setMinValues(1)
          .setMaxValues(1)
          .setOptions(options)
      )
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent(
        `**Aperçu config actuelle**\n` +
          `Titre: ${valueOrDash(safeDraft.title)}\n` +
          `Description: ${valueOrDash(safeDraft.description)}\n` +
          `Couleur: ${valueOrDash(safeDraft.accentColor)}\n` +
          `Footer: ${valueOrDash(safeDraft.footer)}\n` +
          `Auteur: ${valueOrDash(safeDraft.authorName)}\n` +
          `Thumbnail: ${valueOrDash(safeDraft.thumbnailUrl)}\n` +
          `Image: ${valueOrDash(safeDraft.imageRightUrl)}\n` +
          `Picture: ${valueOrDash(safeDraft.pictureUrl)}\n` +
          `Bouton contenu: ${valueOrDash(safeDraft.buttonContentMode)}\n` +
          `Bouton nom: ${valueOrDash(safeDraft.buttonLabel)}\n` +
          `Bouton couleur: ${valueOrDash(safeDraft.buttonColor)}\n` +
          `Bouton type: ${valueOrDash(safeDraft.buttonMode)}\n` +
          `Bouton cible: ${valueOrDash(safeDraft.buttonTarget)}\n` +
          `Bouton emoji: ${valueOrDash(safeDraft.buttonEmoji)}`
      )
    )
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents((row) =>
      row.setComponents(
        new ButtonBuilder()
          .setCustomId(`custom:panel:${panelSessionId}:${actionPrefix}_confirm`)
          .setEmoji({ id: '1489712005358026944' })
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`custom:panel:${panelSessionId}:${actionPrefix}_cancel`)
          .setEmoji({ id: '1489711999226085430' })
          .setStyle(ButtonStyle.Secondary)
      )
    );

  if (safeDraft.thumbnailUrl && isLikelyUrl(safeDraft.thumbnailUrl)) {
    container.addSectionComponents((section) =>
      section
        .addTextDisplayComponents((text) => text.setContent('Thumbnail configuré'))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(safeDraft.thumbnailUrl))
    );
  }

  if (safeDraft.pictureUrl && isLikelyUrl(safeDraft.pictureUrl)) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(safeDraft.pictureUrl))
    );
  }

  return withV2({ components: [container] });
}

function buildRoleActionEmbedConfiguratorPayload({ sessionId, customName, draft }) {
  return buildEmbedConfiguratorPayload({ sessionId, customName, draft, actionPrefix: 'role_embed' });
}

function buildCustomEmbedOutputContainer(commandName, embedConfig) {
  const cfg = {
    title: String(embedConfig?.title || '').trim(),
    description: String(embedConfig?.description || '').trim(),
    accentColor: String(embedConfig?.accentColor || '').trim(),
    footer: String(embedConfig?.footer || '').trim(),
    thumbnailUrl: String(embedConfig?.thumbnailUrl || '').trim(),
    imageRightUrl: String(embedConfig?.imageRightUrl || '').trim(),
    pictureUrl: String(embedConfig?.pictureUrl || embedConfig?.imageUrl || '').trim(),
    buttonMode: String(embedConfig?.buttonMode || 'none').trim().toLowerCase(),
    buttonTarget: String(embedConfig?.buttonTarget || '').trim(),
    buttonContentMode: String(embedConfig?.buttonContentMode || 'text').trim().toLowerCase(),
    buttonLabel: String(embedConfig?.buttonLabel ?? 'Bouton').trim(),
    buttonColor: String(embedConfig?.buttonColor || 'none').trim().toLowerCase(),
    buttonEmoji: String(embedConfig?.buttonEmoji || '').trim(),
    authorName: String(embedConfig?.authorName || '').trim()
  };

  let header = '';
  let bodyBlocks = [];

  if (cfg.title) {
    header = cfg.title;
    bodyBlocks = buildSeparatorBlocks(cfg.description || '> Description non définie.');
  } else {
    const descriptionBlocks = buildSeparatorBlocks(cfg.description);
    const firstDescriptionText = extractFirstTextBlock(descriptionBlocks);
    if (firstDescriptionText) {
      header = firstDescriptionText;
      bodyBlocks = removeFirstTextBlockKeepSeparators(descriptionBlocks);
    } else {
      header = commandName || 'Custom Embed';
      bodyBlocks = buildSeparatorBlocks('> Description non définie.');
    }
  }

  const container = new ContainerBuilder();
  const startsWithSeparator = Array.isArray(bodyBlocks) && bodyBlocks[0] && bodyBlocks[0].type === 'separator';

  if (cfg.thumbnailUrl && isLikelyUrl(cfg.thumbnailUrl)) {
    container.addSectionComponents((section) => {
      section.addTextDisplayComponents((text) => text.setContent(header));
      return section.setThumbnailAccessory(new ThumbnailBuilder().setURL(cfg.thumbnailUrl));
    });
    if (cfg.imageRightUrl && isLikelyUrl(cfg.imageRightUrl)) {
      if (startsWithSeparator) {
        container.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
      }
      container.addSectionComponents((section) => {
        const firstBodyText = extractFirstTextBlock(bodyBlocks) || '\u200b';
        section.addTextDisplayComponents((text) => text.setContent(firstBodyText));
        return section.setThumbnailAccessory(new ThumbnailBuilder().setURL(cfg.imageRightUrl));
      });
      const remainingBlocks = removeFirstTextBlock(bodyBlocks);
      if (remainingBlocks.length) {
        container.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
        appendBlocks(container, remainingBlocks);
      }
    } else {
      appendBlocks(container, bodyBlocks);
    }
  } else {
    container.addTextDisplayComponents((text) => text.setContent(header));
    if (cfg.imageRightUrl && isLikelyUrl(cfg.imageRightUrl)) {
      if (startsWithSeparator) {
        container.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
      }
      container.addSectionComponents((section) => {
        const firstBodyText = extractFirstTextBlock(bodyBlocks) || '\u200b';
        section.addTextDisplayComponents((text) => text.setContent(firstBodyText));
        return section.setThumbnailAccessory(new ThumbnailBuilder().setURL(cfg.imageRightUrl));
      });
      const remainingBlocks = removeFirstTextBlock(bodyBlocks);
      if (remainingBlocks.length) {
        container.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
        appendBlocks(container, remainingBlocks);
      }
    } else {
      appendBlocks(container, bodyBlocks);
    }
    if (cfg.authorName) {
      container.addTextDisplayComponents((text) => text.setContent(`Auteur: ${cfg.authorName}`));
    }
  }

  if (cfg.footer) {
    container.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
    appendTextWithSeparators(container, `> ${cfg.footer}`);
  }

  if (cfg.pictureUrl && isLikelyUrl(cfg.pictureUrl)) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(cfg.pictureUrl))
    );
  }

  const actionButton = buildEmbedActionButton(cfg, commandName, embedConfig?.guildId);
  if (actionButton) {
    container.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
    container.addActionRowComponents((row) => row.setComponents(actionButton));
  }

  return container;
}

function buildCustomEmbedOutputPayload(commandName, embedConfig) {
  const container = buildCustomEmbedOutputContainer(commandName, embedConfig);
  return withV2({ components: [container] });
}

function buildEmbedConfigModal(sessionId, customId, defaults) {
  const modalSessionId = compactSessionId(sessionId);
  return new ModalBuilder()
    .setCustomId(`custom:modal:embed:${modalSessionId}`)
    .setTitle('Configuration Embed')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('title')
          .setLabel('Titre')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(false)
          .setValue(defaults.title || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Description')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(2000)
          .setRequired(false)
          .setValue(defaults.description || '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('accentColor')
          .setLabel('Couleur (#5865F2)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(7)
          .setRequired(false)
          .setValue(defaults.accentColor || '#5865F2')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('footer')
          .setLabel('Footer (optionnel)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(200)
          .setRequired(false)
          .setValue(defaults.footer || '')
      )
    );
}

function buildMessageConfigModal(sessionId, customId, defaults) {
  const modalSessionId = compactSessionId(sessionId);
  return new ModalBuilder()
    .setCustomId(`custom:modal:message:${modalSessionId}`)
    .setTitle('Configuration Message')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Message de la custom')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(2000)
          .setValue(defaults.content || '')
      )
    );
}

function buildRoleActionConfigModal(sessionId, customId, defaults) {
  const modalSessionId = compactSessionId(sessionId);
  return new ModalBuilder()
    .setCustomId(`custom:modal:role_action:${modalSessionId}`)
    .setTitle('Configuration Role Action')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('confirmationTemplate')
          .setLabel('Texte de confirmation')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
          .setValue(defaults.confirmationTemplate || 'Action `{ActionName}` effectuée sur {TargetMention}.')
      )
    );
}

function buildSelectorConfigModal(sessionId, customId, defaults) {
  const modalSessionId = compactSessionId(sessionId);
  return new ModalBuilder()
    .setCustomId(`custom:modal:selector:${modalSessionId}`)
    .setTitle('Configuration Sélecteur')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('title')
          .setLabel('Titre')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
          .setValue(defaults.title || 'Choisissez vos rôles')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Description')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
          .setValue(defaults.description || 'Sélectionnez vos rôles ci-dessous.')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('accentColor')
          .setLabel('Couleur (#2B2D31)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(7)
          .setValue(defaults.accentColor || '#2B2D31')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('placeholder')
          .setLabel('Placeholder du menu')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(100)
          .setValue(defaults.placeholder || 'Sélectionnez vos rôles')
      )
    );
}

function buildTypeConfigControlsPayload({ sessionId, custom, guildRolesCount }) {
  const panelSessionId = compactSessionId(sessionId);
  const base = makeBasicContainer(`# Configuration type: ${humanType(custom.type)}`)
    .addTextDisplayComponents((text) => text.setContent(`**Custom:** \`${custom.name}\`\n**Type:** ${humanType(custom.type)}`))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));

  if (custom.type === 'embed') {
    base.addTextDisplayComponents((text) => text.setContent('Configurez l\'embed avec un menu interactif'))
      .addActionRowComponents((row) =>
        row.setComponents(
          new ButtonBuilder()
            .setCustomId(`custom:panel:${panelSessionId}:embed_editor`)
            .setLabel('Ouvrir éditeur embed')
            .setStyle(ButtonStyle.Primary)
        )
      );
  } else if (custom.type === 'message') {
    base.addTextDisplayComponents((text) => text.setContent('Configurez le message avec variables supportées.'))
      .addActionRowComponents((row) =>
        row.setComponents(
          new ButtonBuilder()
            .setCustomId(`custom:panel:${panelSessionId}:open_modal_message`)
            .setLabel('Configurer Message')
            .setStyle(ButtonStyle.Primary)
        )
      );
  } else if (custom.type === 'role_action') {
    const action = custom.config.roleAction;
    const actionOptions = [
      { label: 'Ajout', value: 'add', default: action.action === 'add' },
      { label: 'Retrait', value: 'remove', default: action.action === 'remove' },
      { label: 'Toggle', value: 'toggle', default: action.action === 'toggle' }
    ];
    const targetOptions = [
      { label: 'Auteur de la commande', value: 'author', default: action.targetMode === 'author' },
      { label: 'Mentionné sinon auteur', value: 'mention_or_author', default: action.targetMode === 'mention_or_author' }
    ];
    const responseOptions = [
      { label: 'Embed', value: 'panel', default: action.responseMode === 'panel' },
      { label: 'Message compact', value: 'message', default: action.responseMode === 'message' }
    ];

    base
      .addTextDisplayComponents((text) => text.setContent('Choisissez le rôle cible, l\'action et le type de réponse.'))
      .addActionRowComponents((row) =>
        row.setComponents(
          new RoleSelectMenuBuilder()
            .setCustomId(`custom:panel:${panelSessionId}:role_pick`)
            .setPlaceholder('Rôle à ajouter/retirer')
            .setMinValues(1)
            .setMaxValues(1)
            .setDefaultRoles(...(action.roleId ? [action.roleId] : []))
        )
      )
      .addActionRowComponents((row) =>
        row.setComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`custom:panel:${panelSessionId}:role_action_pick`)
            .setPlaceholder('Action')
            .setMinValues(1)
            .setMaxValues(1)
            .setOptions(actionOptions)
        )
      )
      .addActionRowComponents((row) =>
        row.setComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`custom:panel:${panelSessionId}:role_target_pick`)
            .setPlaceholder('Cible')
            .setMinValues(1)
            .setMaxValues(1)
            .setOptions(targetOptions)
        )
      )
      .addActionRowComponents((row) =>
        row.setComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`custom:panel:${panelSessionId}:role_response_pick`)
            .setPlaceholder('Type de réponse')
            .setMinValues(1)
            .setMaxValues(1)
            .setOptions(responseOptions)
        )
      )
      .addActionRowComponents((row) =>
        row.setComponents(
          new ButtonBuilder()
            .setCustomId(`custom:panel:${panelSessionId}:open_modal_role_action`)
            .setLabel('Configurer texte de confirmation')
            .setStyle(ButtonStyle.Primary)
        )
      )
      .addActionRowComponents((row) =>
        row.setComponents(
          new ButtonBuilder()
            .setCustomId(`custom:panel:${panelSessionId}:role_embed_editor`)
            .setLabel('Configurer embed de réponse')
            .setStyle(ButtonStyle.Secondary)
        )
      )
      .addTextDisplayComponents((text) => text.setContent(`Rôle: ${action.roleId ? `<@&${action.roleId}>` : 'Non défini'} | Action: ${action.action} | Cible: ${action.targetMode} | Réponse: ${action.responseMode}`));

    if (guildRolesCount === 0) {
      base.addTextDisplayComponents((text) => text.setContent('Aucun rôle détecté dans ce serveur.'));
    }
  } else if (custom.type === 'selector') {
    const maxRoleValues = Math.min(25, Math.max(1, guildRolesCount));
    const defaultSelectorRoles = (custom.config.selector.roleIds || []).slice(0, maxRoleValues);
    base
      .addTextDisplayComponents((text) => text.setContent('Configurez le panneau + sélection des rôles de self-role.'))
      .addActionRowComponents((row) =>
        row.setComponents(
          (() => {
            const menu = new RoleSelectMenuBuilder()
              .setCustomId(`custom:panel:${panelSessionId}:selector_roles`)
              .setPlaceholder('Rôles affichés dans le sélecteur')
              .setMinValues(1)
              .setMaxValues(maxRoleValues);
            if (defaultSelectorRoles.length) menu.setDefaultRoles(...defaultSelectorRoles);
            return menu;
          })()
        )
      )
      .addActionRowComponents((row) =>
        row.setComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`custom:panel:${panelSessionId}:selector_max`)
            .setPlaceholder('Nombre max de rôles sélectionnables')
            .setMinValues(1)
            .setMaxValues(1)
            .setOptions(
              [1, 2, 3, 5, 10, 25].map((value) => ({
                label: value === 25 ? 'Tous les rôles' : `${value} rôles`,
                value: String(value),
                default: Number(custom.config.selector.maxValues) === value
              }))
            )
        )
      )
      .addActionRowComponents((row) =>
        row.setComponents(
          new ButtonBuilder()
            .setCustomId(`custom:panel:${panelSessionId}:selector_embed_editor`)
            .setLabel('Configurer l\'embed (et bouton)')
            .setStyle(ButtonStyle.Primary)
        )
      );
  } else {
    base.addTextDisplayComponents((text) => text.setContent('Choisissez un type dans le panneau de gestion.'));
  }

  base
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents((row) =>
      row.setComponents(
        new ButtonBuilder()
          .setCustomId(`custom:panel:${panelSessionId}:back_manage`)
          .setEmoji({ id: '1491118191483818145' })
          .setStyle(ButtonStyle.Secondary)
      )
    );

  return withV2({ components: [base] });
}

function buildDeletedCustomPayload() {
  const container = new ContainerBuilder()
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent("> L'embed a bien ete supprime"))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));

  return withV2({ components: [container] });
}

function humanType(type) {
  if (type === 'embed') return 'Embed';
  if (type === 'message') return 'Message';
  if (type === 'role_action') return 'Ajout de rôle / enlèvement de rôle';
  if (type === 'selector') return 'Sélecteur';
  return 'Non défini';
}

function buildTypeSummary(custom) {
  const behavior = custom.config.behavior || {};
  if (custom.type === 'embed') {
    return `**Type:** Embed\nTitre: ${valueOrDash(custom.config.embed.title)}\nDescription: ${valueOrDash(custom.config.embed.description)}\nCouleur: ${valueOrDash(custom.config.embed.accentColor)}`;
  }
  if (custom.type === 'message') {
    return `**Type:** Message\nContenu: ${valueOrDash(custom.config.message.content)}`;
  }
  if (custom.type === 'role_action') {
    const cfg = custom.config.roleAction;
    return `**Type:** Ajout de rôle / enlèvement de rôle\nRôle: ${cfg.roleId ? `<@&${cfg.roleId}>` : 'Non défini'}\nAction: ${cfg.action}\nCible: ${cfg.targetMode}\nRéponse: ${cfg.responseMode}\nOptions: ${formatBehaviorSummary(behavior)}`;
  }
  if (custom.type === 'selector') {
    const cfg = custom.config.selector;
    return `**Type:** Sélecteur\nTitre: ${valueOrDash(cfg.title)}\nDescription: ${valueOrDash(cfg.description)}\nRôles: ${(cfg.roleIds || []).length}`;
  }
  return '**Type:** Non défini. Choisissez un type puis cliquez sur Configurer.';
}

function getHelpPages() {
  return [
    {
      title: 'Variables en lien avec un membre',
      blocks: [
        { variable: '{MemberMention}', description: 'Mention du membre ciblé.', example: '@Pseudo' },
        { variable: '{MemberName}', description: 'Nom du compte Discord.', example: 'airfo' },
        { variable: '{MemberFullName}', description: 'Nom + discrim/tag.', example: 'airfo#0001' },
        { variable: '{MemberDisplayName}', description: 'Pseudo visible dans le serveur.', example: 'Airfo Dev' },
        { variable: '{MemberJoinedAt}', description: 'Date d\'arrivée sur le serveur.', example: '2026-04-07 14:30' },
        { variable: '{MemberCreatedAt}', description: 'Date de création du compte.', example: '2023-11-20 12:00' },
        { variable: '{MemberID}', description: 'ID Discord du membre.', example: '123456789012345678' },
        { variable: '{MemberPic}', description: 'URL de l\'avatar du membre.', example: 'https://cdn.discordapp.com/...' }
      ]
    },
    {
      title: 'Variables en lien avec le serveur',
      blocks: [
        { variable: '{ServerName}', description: 'Nom du serveur.', example: 'Mon Serveur' },
        { variable: '{ServerID}', description: 'ID du serveur.', example: '123456789012345678' },
        { variable: '{ServerPic}', description: 'URL de l icone du serveur.', example: 'https://cdn.discordapp.com/...' },
        { variable: '{ServerBoostsCount}', description: 'Nombre de boosts.', example: '14' },
        { variable: '{ServerLevel}', description: 'Niveau de boost actuel.', example: '2' },
        { variable: '{ServerMembersCount}', description: 'Nombre total de membres.', example: '352' },
        { variable: '{VocalMembersCount}', description: 'Membres en vocal.', example: '17' },
        { variable: '{MuteMembersCount}', description: 'Membres muted en vocal.', example: '2' },
        { variable: '{DeafMembersCount}', description: 'Membres deafened.', example: '3' },
        { variable: '{StreamMembersCount}', description: 'Membres en stream.', example: '4' },
        { variable: '{VideoMembersCount}', description: 'Membres avec caméra.', example: '6' },
        { variable: '{OnlineMembersCount}', description: 'Membres en ligne.', example: '120' },
        { variable: '{OfflineMembersCount}', description: 'Membres hors ligne.', example: '232' },
        { variable: '{ServerRolesCount}', description: 'Nombre de rôles.', example: '48' },
        { variable: '{ServerChannelsCount}', description: 'Nombre de salons.', example: '23' }
      ]
    }
  ];
}

function formatBehaviorSummary(behavior) {
  const values = [];
  if (behavior.deleteBotResponse === true) values.push('Réponse supprimée après 15s');
  if (behavior.deleteCommand === true) values.push('Commande supprimée');
  if (behavior.targetAnotherMember === true) values.push('Cible: autre membre');
  return values.length ? values.join(' | ') : 'Aucune';
}

function valueOrDash(value) {
  const clean = String(value || '').trim();
  return clean.length ? clean : '—';
}

function isLikelyUrl(value) {
  return /^https?:\/\/\S+$/i.test(String(value || '').trim());
}

function buildEmbedActionButton(cfg, commandName, guildId) {
  const mode = String(cfg.buttonMode || 'none').toLowerCase();
  if (!mode || mode === 'none') return null;

  const contentMode = String(cfg.buttonContentMode || 'text').toLowerCase();
  const label = String(cfg.buttonLabel || '').trim().slice(0, 80);
  const button = new ButtonBuilder();
  const emoji = parseButtonEmoji(cfg.buttonEmoji);
  if (emoji) button.setEmoji(emoji);

  if (contentMode === 'emoji') {
    if (!emoji) return null;
  } else if (label) {
    button.setLabel(label);
  } else if (!emoji) {
    button.setLabel(String(commandName || 'Bouton').trim().slice(0, 80) || 'Bouton');
  }

  if (mode === 'url' || mode === 'server_url') {
    if (!isLikelyUrl(cfg.buttonTarget)) return null;
    return button.setStyle(ButtonStyle.Link).setURL(cfg.buttonTarget);
  }

  if (mode === 'channel') {
    const channelId = extractSnowflake(cfg.buttonTarget);
    if (!channelId || !guildId) return null;
    return button.setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${guildId}/${channelId}`);
  }

  if (mode === 'role_add') {
    const roleIds = extractSnowflakeList(cfg.buttonTarget).slice(0, 4);
    if (!roleIds.length) return null;
    return button.setStyle(resolveButtonStyle(cfg.buttonColor)).setCustomId(`custom:embedbtn:roles:${roleIds.join('.')}`);
  }

  return null;
}

function resolveButtonStyle(rawColor) {
  const color = String(rawColor || 'none').trim().toLowerCase();
  if (color === 'primary' || color === 'bleu' || color === 'blue') return ButtonStyle.Secondary;
  if (color === 'success' || color === 'vert' || color === 'green') return ButtonStyle.Secondary;
  if (color === 'danger' || color === 'rouge' || color === 'red') return ButtonStyle.Secondary;
  return ButtonStyle.Secondary;
}

function isLikelyUnicodeEmoji(raw) {
  const value = String(raw || '').trim();
  if (!value) return false;
  if (/\s/.test(value)) return false;
  if (/[<>]/.test(value)) return false;
  if (/:/.test(value)) return false;
  if (/[A-Za-z]/.test(value)) return false;
  if (/\d/.test(value) && !/^[0-9#*]\uFE0F?\u20E3$/u.test(value)) return false;
  if (/^[\u{1F1E6}-\u{1F1FF}]{2}$/u.test(value)) return true;
  if (/^[0-9#*]\uFE0F?\u20E3$/u.test(value)) return true;
  return /\p{Extended_Pictographic}/u.test(value);
}

function parseButtonEmoji(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return null;

  const customEmoji = raw.match(/^<(a?):(\w+):(\d+)>$/);
  if (customEmoji) {
    return {
      id: customEmoji[3],
      name: customEmoji[2],
      animated: Boolean(customEmoji[1])
    };
  }
  if (/^\d{15,20}$/.test(raw)) return { id: raw };
  if (!isLikelyUnicodeEmoji(raw)) return null;
  return raw;
}

function extractSnowflake(value) {
  const match = String(value || '').match(/\d{15,20}/);
  return match ? match[0] : '';
}

function extractSnowflakeList(value) {
  const matches = String(value || '').match(/\d{15,20}/g) || [];
  return [...new Set(matches)];
}

function normalizeNoticeText(input) {
  return String(input || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|[^\d])\.(?=\s|$)/g, '$1').replace(/\s+$/g, ''))
    .join('\n')
    .trim();
}

function shouldHideNoticeTitle(title) {
  const safeTitle = normalizeNoticeText(title).replace(/^#+\s*/, '').trim().toLowerCase();
  return TITLELESS_NOTICE_TITLES.has(safeTitle);
}

function toQuotedNoticeBody(body) {
  const safeBody = normalizeNoticeText(body);
  if (!safeBody) return '> Y a une erreur hhh';

  return safeBody
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('>') || trimmed.startsWith('```') || trimmed.startsWith('#')) return trimmed;
      return `> ${trimmed}`;
    })
    .filter(Boolean)
    .join('\n');
}

function buildSeparatorBlocks(input) {
  const parts = String(input || '').split(/\(separator\)/gi);
  const blocks = [];

  for (let index = 0; index < parts.length; index += 1) {
    const text = parts[index].trim();
    if (text.length) {
      blocks.push({ type: 'text', value: text });
    }
    if (index < parts.length - 1) {
      blocks.push({ type: 'separator' });
    }
  }

  if (!blocks.length) {
    const fallback = String(input || '').trim();
    if (fallback.length) blocks.push({ type: 'text', value: fallback });
  }

  return blocks;
}

function appendBlocks(container, blocks) {
  for (const block of blocks) {
    if (block.type === 'separator') {
      container.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));
      continue;
    }
    container.addTextDisplayComponents((text) => text.setContent(block.value));
  }
}

function appendTextWithSeparators(container, input) {
  appendBlocks(container, buildSeparatorBlocks(input));
}

function extractFirstTextBlock(blocks) {
  const first = (Array.isArray(blocks) ? blocks : []).find((block) => block.type === 'text');
  return first ? first.value : '';
}

function removeFirstTextBlock(blocks) {
  const source = Array.isArray(blocks) ? blocks : [];
  const next = [];
  let removed = false;

  for (const block of source) {
    if (!removed && block.type === 'text') {
      removed = true;
      continue;
    }
    next.push(block);
  }

  while (next.length && next[0].type === 'separator') {
    next.shift();
  }

  return next;
}

function removeFirstTextBlockKeepSeparators(blocks) {
  const source = Array.isArray(blocks) ? blocks : [];
  const next = [];
  let removed = false;

  for (const block of source) {
    if (!removed && block.type === 'text') {
      removed = true;
      continue;
    }
    next.push(block);
  }

  return next;
}

module.exports = {
  withV2,
  buildNoticePayload,
  buildButtonRoleTargetPickerPayload,
  buildCustomListPayload,
  buildAwaitCustomNamePayload,
  buildCustomManagePayload,
  buildCustomSessionEndedPayload,
  buildPermissionDeniedPayload,
  buildExecutionFailedPayload,
  buildHelpPayload,
  buildSelectorPanelPayload,
  buildEmbedConfiguratorPayload,
  buildRoleActionEmbedConfiguratorPayload,
  buildCustomEmbedOutputPayload,
  buildEmbedConfigModal,
  buildMessageConfigModal,
  buildRoleActionConfigModal,
  buildSelectorConfigModal,
  buildTypeConfigControlsPayload,
  buildDeletedCustomPayload
};
