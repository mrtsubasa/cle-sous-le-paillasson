const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  FileUploadBuilder,
  LabelBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SlashCommandBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActivityType,
  escapeMarkdown,
} = require("discord.js");
const {
  buildPresencePayload,
  cacheProfileState,
  getProfileState,
  normalizeActivityType,
  normalizeStatus,
  readProfileState,
  saveProfileAsset,
  saveProfileState,
} = require("../core/bot-profile");

const fetch = globalThis.fetch || require("node-fetch").default;

function buildCdnImageUrl(type, id, hash) {
  if (!hash) return null;
  const ext = hash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/${type}/${id}/${hash}.${ext}?size=1024`;
}

function buildErrorReply(message) {
  const container = new ContainerBuilder()
    .setAccentColor(0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# **Erreur**"),
      new TextDisplayBuilder().setContent(message),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

function buildSuccessReply(message) {
  const container = new ContainerBuilder()
    .setAccentColor(0x57f287)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# **Profil mis à jour**"),
      new TextDisplayBuilder().setContent(message),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

function getTargets(ctx) {
  const targets = [];
  const controlClient = ctx.client;

  if (controlClient?.user) {
    targets.push({
      key: "control",
      label: controlClient.user.username,
      mention: controlClient.user.toString(),
      client: controlClient,
      kind: "contrôle",
    });
  }

  for (const bot of ctx.pool?.bots || []) {
    if (!bot?.client?.user) continue;
    targets.push({
      key: `music:${bot.id}`,
      label: bot.client.user.username || bot.label || `Music ${bot.id + 1}`,
      mention: bot.client.user.toString(),
      client: bot.client,
      kind: `musique #${bot.id + 1}`,
    });
  }

  return targets;
}

function getTargetByKey(ctx, key) {
  return getTargets(ctx).find((target) => target.key === key) || null;
}

function formatTargetChoice(target) {
  return {
    name: `${target.label} • ${target.kind}`.slice(0, 100),
    value: target.key,
  };
}

function buildActivityText(activity) {
  if (!activity) return "> Aucune activité définie";

  const labels = {
    [ActivityType.Playing]: "Playing",
    [ActivityType.Streaming]: "Streaming",
    [ActivityType.Listening]: "Listening",
    [ActivityType.Watching]: "Watching",
    [ActivityType.Custom]: "Custom",
    [ActivityType.Competing]: "Competing",
  };

  const emojiPart = activity.type === ActivityType.Custom && activity.emoji
    ? `${activity.emoji} `
    : "";

  const urlPart = activity.type === ActivityType.Streaming && activity.url
    ? `\n> **URL**: ${activity.url}`
    : "";

  return `> **Type**: ${labels[activity.type] || `Type ${activity.type}`}\n> **Texte**: ${emojiPart}${activity.name || ""}${urlPart}`;
}

function getEffectiveProfile(target, state) {
  const presence = target.client.user?.presence || null;
  const activities = presence?.activities || [];
  const current = activities[0] || null;

  if (state) {
    return {
      ...state,
      username: typeof state.username === "string" && state.username.trim()
        ? state.username
        : target.client.user.username,
    };
  }

  const activityType = current?.type ?? ActivityType.Custom;
  return {
    username: target.client.user.username,
    status: normalizeStatus(presence?.status || "idle"),
    activityType: normalizeActivityType(activityType),
    activityName: activityType === ActivityType.Custom
      ? (current?.state || current?.name || "")
      : (current?.name || ""),
    activityUrl: current?.url || "",
    activityEmoji: activityType === ActivityType.Custom
      ? (current?.emoji?.name || "")
      : "",
  };
}

async function getProfileSnapshot(target, stateOverride = null) {
  const visuals = await syncBotProfile(target);
  const profile = getEffectiveProfile(target, stateOverride || getProfileState(target.key));

  return {
    username: target.client.user.username,
    status: profile.status,
    activityType: profile.activityType,
    activityName: profile.activityName,
    activityUrl: profile.activityUrl,
    activityEmoji: profile.activityEmoji,
    avatar: visuals.avatar,
    banner: visuals.banner,
  };
}

async function fetchAttachmentBuffer(attachment) {
  if (!attachment?.url) throw new Error("Aucun fichier fourni.");
  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error("Impossible de télécharger le fichier.");

  const contentType = attachment.contentType || response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error("Le fichier doit être une image.");
  }

  return Buffer.from(await response.arrayBuffer());
}

async function syncBotProfile(target) {
  try {
    const userData = await target.client.rest.get("/users/@me");
    return {
      avatar: buildCdnImageUrl("avatars", target.client.user.id, userData.avatar)
        || target.client.user.displayAvatarURL({ size: 1024 }),
      banner: buildCdnImageUrl("banners", target.client.user.id, userData.banner),
    };
  } catch (error) {
    console.error("Erreur sync profil bot:", error);
    return {
      avatar: target.client.user.displayAvatarURL({ size: 1024 }),
      banner: target.client.user.bannerURL({ size: 1024 }),
    };
  }
}

async function canManageProfile(interaction, ctx) {
  if (!interaction.guild) return false;

  const buyerId = ctx?.config?.buyerId || null;
  if (buyerId && interaction.user.id === buyerId) {
    return true;
  }

  if (interaction.guild.ownerId) {
    return interaction.guild.ownerId === interaction.user.id;
  }

  const guild = await interaction.guild.fetch().catch(() => null);
  return guild?.ownerId === interaction.user.id;
}

function buildPanelContainer(ctx, targetKey, snapshot) {
  const target = getTargetByKey(ctx, targetKey) || getTargets(ctx)[0] || null;
  if (!target) return null;

  const profile = snapshot || {};
  const displayName = profile.username || target.client.user.username;
  const currentAvatarUrl = profile.avatar || null;
  const currentBannerUrl = profile.banner || null;

  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# **Panel de gestion du bot**"),
      new TextDisplayBuilder().setContent("> Modifie le nom, la pp, la banner, le statut et l activité en temps reel"),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(1))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# **Infos actuelles**"),
      new TextDisplayBuilder().setContent(
        `> **Nom :** \`${displayName}\`\n> **Status :** \`${profile.status || "idle"}\`\n${buildActivityText({
          type: profile.activityType,
          name: profile.activityName,
          url: profile.activityUrl,
          emoji: profile.activityEmoji,
        })}`,
      ),
    );

  if (currentAvatarUrl || currentBannerUrl) {
    const gallery = new MediaGalleryBuilder();
    if (currentAvatarUrl) {
      gallery.addItems(new MediaGalleryItemBuilder().setURL(currentAvatarUrl));
    }
    if (currentBannerUrl) {
      gallery.addItems(new MediaGalleryItemBuilder().setURL(currentBannerUrl));
    }
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents((text) => text.setContent("# Apercu visuel"));
    container.addMediaGalleryComponents(gallery);
  }

  if (currentBannerUrl) {
    container
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents((text) => text.setContent("# Banner"))
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL(currentBannerUrl),
        ),
      );
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("uhqprofil_name")
          .setLabel("Modifier nom")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("uhqprofil_avatar")
          .setLabel("Modifier pp")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("uhqprofil_banner")
          .setLabel("Modifier banner")
          .setStyle(ButtonStyle.Secondary),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("uhqprofil_activity")
          .setLabel("Modifier activité")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("uhqprofil_status")
          .setLabel("Modifier status")
          .setStyle(ButtonStyle.Secondary),
      ),
    );

  return container;
}

async function applyProfileChange(target, action, modal) {
  const user = target.client.user;
  const currentState = getEffectiveProfile(target, getProfileState(target.key));

  if (action === "name") {
    const newName = modal.fields.getTextInputValue("profile_name").trim();
    await user.setUsername(newName);
    return saveProfileState(target.key, {
      ...currentState,
      username: newName,
    });
  }

  if (action === "status") {
    const rawStatus = modal.fields.getTextInputValue("profile_status").trim().toLowerCase();
    const status = normalizeStatus(rawStatus === "offline" ? "invisible" : rawStatus);
    const nextState = { ...currentState, status };
    cacheProfileState(target.key, nextState);
    await user.setPresence(buildPresencePayload(nextState));
    return saveProfileState(target.key, nextState);
  }

  if (action === "activity") {
    const rawType = modal.fields.getTextInputValue("activity_type").trim();
    const activityText = modal.fields.getTextInputValue("activity_text").trim();
    const activityUrl = modal.fields.getTextInputValue("activity_url").trim();
    const activityEmoji = modal.fields.getTextInputValue("activity_emoji").trim();
    const type = Number.parseInt(rawType, 10);

    if (!Number.isInteger(type) || type < 0 || type > 5) {
      throw new Error("Type invalide. Utilise un nombre entre 0 et 5.");
    }

    if (!activityText) {
      throw new Error("Le texte de l'activité ne peut pas être vide.");
    }

    if (type === ActivityType.Streaming && !activityUrl) {
      throw new Error("Le type Streaming demande une URL.");
    }

    const nextState = {
      ...currentState,
      activityType: type,
      activityName: activityText,
      activityUrl: type === ActivityType.Streaming ? activityUrl : "",
      activityEmoji: type === ActivityType.Custom ? activityEmoji : "",
    };

    cacheProfileState(target.key, nextState);
    await user.setPresence(buildPresencePayload(nextState));
    return saveProfileState(target.key, nextState);
  }

  if (action === "avatar" || action === "banner") {
    const fileId = action === "avatar" ? "profile_avatar" : "profile_banner";
    const uploadedFiles = modal.fields.getUploadedFiles(fileId, true);
    const file = uploadedFiles?.first();
    if (!file) throw new Error("Aucune image fournie.");

    const buffer = await fetchAttachmentBuffer(file);
    if (action === "avatar") {
      await user.setAvatar(buffer);
      saveProfileAsset(target.key, "avatar", buffer);
    } else {
      await user.setBanner(buffer);
      saveProfileAsset(target.key, "banner", buffer);
    }

    return saveProfileState(target.key, currentState);
  }

  throw new Error("Action inconnue.");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("uhqprofil")
    .setDescription("Panel de gestion du profil du bot")
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("bot")
        .setDescription("Bot à modifier")
        .setAutocomplete(true)
        .setRequired(false),
    ),

  autocomplete(interaction, _playlists, ctx) {
    const focused = interaction.options.getFocused(true);
    if (focused?.name !== "bot") return [];

    return getTargets(ctx)
      .filter((target) => {
        const needle = String(focused.value || "").toLowerCase();
        if (!needle) return true;
        return target.label.toLowerCase().includes(needle) || target.kind.toLowerCase().includes(needle);
      })
      .slice(0, 25)
      .map(formatTargetChoice);
  },

  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    if (!(await canManageProfile(interaction, ctx))) {
      return interaction.reply(
        buildErrorReply("> Seul le propriétaire du serveur ou le buyer peut utiliser cette commande."),
      );
    }

    const targets = getTargets(ctx);
    if (!targets.length) {
      return interaction.reply(buildErrorReply("> Aucun bot musique n'est disponible."));
    }

    const selectedTargetKey = interaction.options.getString("bot", false) || targets[0].key;
    const panelId = `uhqprofil:${interaction.id}`;
    let targetPanelMessage = null;
    const selectedTarget = getTargetByKey(ctx, selectedTargetKey) || targets[0] || null;

    if (!selectedTarget) {
      return interaction.reply(buildErrorReply("> Aucun bot musique n'est disponible."));
    }

    const syncPanelProfile = async () => {
      return getProfileSnapshot(selectedTarget);
    };

    const refreshPanel = async (stateOverride = null) => {
      const liveSnapshot = await syncPanelProfile();
      const snapshot = stateOverride
        ? {
            ...liveSnapshot,
            ...stateOverride,
            avatar: liveSnapshot.avatar,
            banner: liveSnapshot.banner,
          }
        : liveSnapshot;
      const container = buildPanelContainer(ctx, selectedTarget.key, snapshot);
      if (!container || !targetPanelMessage) return;

      await targetPanelMessage.edit({
        components: [container],
        allowedMentions: { parse: [] },
      }).catch(() => null);
    };

    const modalHandler = async (modal) => {
      if (!modal.isModalSubmit()) return;
      if (modal.user.id !== interaction.user.id) return;
      if (!modal.customId.startsWith(panelId)) return;

      const payload = modal.customId.slice(`${panelId}:`.length);
      const actionSeparator = payload.indexOf(":");
      const action = actionSeparator >= 0 ? payload.slice(0, actionSeparator) : payload;
      const target = getTargetByKey(ctx, selectedTarget.key) || targets[0] || null;
      if (!target) {
        return modal.reply(buildErrorReply("> Le bot sélectionné est introuvable."));
      }

      await modal.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);

      try {
        const savedState = await applyProfileChange(target, action, modal);
        await refreshPanel(savedState);
        return modal.editReply(
          buildSuccessReply(`> Le profil de **${escapeMarkdown(target.label)}** a été mis à jour.`),
        );
      } catch (error) {
        console.error("[uhqprofil] Erreur de mise à jour:", error);
        return modal.editReply(
          buildErrorReply(error?.message || "> Impossible de modifier le profil pour le moment."),
        );
      }
    };

    ctx.client.on("interactionCreate", modalHandler);

    try {
      const snapshot = await syncPanelProfile();
      const container = buildPanelContainer(ctx, selectedTarget.key, snapshot);
      await interaction.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
      targetPanelMessage = await interaction.fetchReply();

      const collector = targetPanelMessage.createMessageComponentCollector({
        time: 300000,
        filter: (componentInteraction) => componentInteraction.user.id === interaction.user.id,
      });

      collector.on("collect", async (componentInteraction) => {
        if (!componentInteraction.isButton()) return;

        const target = getTargetByKey(ctx, selectedTarget.key) || targets[0];
        if (!target) return;

        if (componentInteraction.customId === "uhqprofil_name") {
          const modal = new ModalBuilder()
            .setCustomId(`${panelId}:name:${target.key}`)
            .setTitle("Modifier le nom")
            .addLabelComponents(
              new LabelBuilder()
                .setLabel("Nouveau nom")
                .setDescription("Saisis le nouveau nom du bot.")
                .setTextInputComponent(
                  new TextInputBuilder()
                    .setCustomId("profile_name")
                    .setStyle(TextInputStyle.Short)
                    .setValue(target.client.user.username)
                    .setRequired(true),
                ),
            );

          return componentInteraction.showModal(modal);
        }

        if (componentInteraction.customId === "uhqprofil_avatar") {
          const modal = new ModalBuilder()
            .setCustomId(`${panelId}:avatar:${target.key}`)
            .setTitle("Modifier la pp")
            .addLabelComponents(
              new LabelBuilder()
                .setLabel("Upload de la pp")
                .setDescription("Envoie une image pour remplacer la photo de profil.")
                .setFileUploadComponent(
                  new FileUploadBuilder()
                    .setCustomId("profile_avatar")
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setRequired(true),
                ),
            );

          return componentInteraction.showModal(modal);
        }

        if (componentInteraction.customId === "uhqprofil_banner") {
          const modal = new ModalBuilder()
            .setCustomId(`${panelId}:banner:${target.key}`)
            .setTitle("Modifier la banner")
            .addLabelComponents(
              new LabelBuilder()
                .setLabel("Upload de la banner")
                .setDescription("Envoie une image pour remplacer la banner.")
                .setFileUploadComponent(
                  new FileUploadBuilder()
                    .setCustomId("profile_banner")
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setRequired(true),
                ),
            );

          return componentInteraction.showModal(modal);
        }

        if (componentInteraction.customId === "uhqprofil_activity") {
          const current = getEffectiveProfile(target, readProfileState(target.key));
          const modal = new ModalBuilder()
            .setCustomId(`${panelId}:activity:${target.key}`)
            .setTitle("Modifier l'activité")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("activity_type")
                  .setLabel("Type 0-5")
                  .setStyle(TextInputStyle.Short)
                  .setValue(String(current.activityType ?? ActivityType.Custom))
                  .setRequired(true),
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("activity_text")
                  .setLabel("Texte de l'activité")
                  .setStyle(TextInputStyle.Paragraph)
                  .setValue(current.activityName || "")
                  .setRequired(true),
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("activity_url")
                  .setLabel("URL streaming si besoin")
                  .setStyle(TextInputStyle.Short)
                  .setValue(current.activityUrl || "")
                  .setRequired(false),
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("activity_emoji")
                  .setLabel("Emoji custom")
                  .setStyle(TextInputStyle.Short)
                  .setValue(current.activityEmoji || "")
                  .setRequired(false),
              ),
            );

          return componentInteraction.showModal(modal);
        }

        if (componentInteraction.customId === "uhqprofil_status") {
          const current = getEffectiveProfile(target, readProfileState(target.key));
          const modal = new ModalBuilder()
            .setCustomId(`${panelId}:status:${target.key}`)
            .setTitle("Modifier le status")
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId("profile_status")
                  .setLabel("online / idle / dnd / invisible / offline")
                  .setStyle(TextInputStyle.Short)
                  .setValue(current.status === "invisible" ? "offline" : (current.status || "idle"))
                  .setRequired(true),
              ),
            );

          return componentInteraction.showModal(modal);
        }
      });

      collector.on("end", () => {
        ctx.client.off("interactionCreate", modalHandler);
      });
    } catch (error) {
      ctx.client.off("interactionCreate", modalHandler);
      console.error("[uhqprofil] Impossible d'ouvrir le panneau:", error);
      if (interaction.deferred || interaction.replied) {
        return interaction.followUp(buildErrorReply(error?.message || "> Impossible d'ouvrir le panneau."));
      }
      return interaction.reply(buildErrorReply(error?.message || "> Impossible d'ouvrir le panneau."));
    }
  },
};
