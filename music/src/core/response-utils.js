const {
  ActionRowBuilder,
  ContainerBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const config = require("./config");

function buildTextContainer(title, message, accentColor = 0x5865f2) {
  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# **${title}**`),
      new TextDisplayBuilder().setContent(message),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function buildErrorContainer(title, message, hint = null, accentColor = 0xed4245) {
  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# **${title}**`),
      new TextDisplayBuilder().setContent(message),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1),
    );

  if (hint) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(hint),
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

function buildEphemeralTextContainer(title, message, accentColor = 0x5865f2) {
  return {
    ...buildTextContainer(title, message, accentColor),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

function buildJoinBotContainer({ alreadyConnected = false, voiceChannel = null } = {}) {
  const title = alreadyConnected ? "Bot déjà prêt" : "Bot connecté";
  const message = alreadyConnected
    ? "Le bot est déjà dans ton salon vocal."
    : "Le bot a rejoint ton salon vocal et le panel est prêt.";
  const channelLine = voiceChannel ? `**Salon**: ${voiceChannel}` : "**Salon**: vocal";
  const hint = alreadyConnected
    ? "Tu peux lancer une musique avec `/play`."
    : "Clique sur `/play` pour démarrer la lecture.";

  const container = new ContainerBuilder()
    .setAccentColor(0x57f287)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# **🎧 ${title}**`),
      new TextDisplayBuilder().setContent(message),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(channelLine),
      new TextDisplayBuilder().setContent(hint),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("> Le panel de musique va se mettre à jour automatiquement."),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

function buildObtainBotContainer() {
  const supportUrl = config.supportUrl || null;
  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# **Obtenir un bot**"),
      new TextDisplayBuilder().setContent("> Pour obtenir un bot, va d'abord sur le serveur support puis reviens ici pour le faire rejoindre ton vocal"),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "**Pourquoi passer par le support ?**",
          "• Ça permet de voir les infos et les éventuelles annonces du bot",
          "• Tu peux y demander de l’aide si un problème arrive",
          "• C’est aussi l’endroit recommandé pour récupérer les infos du bot",
        ].join("\n"),
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1),
    );

  const row = new ActionRowBuilder().addComponents(
    supportUrl
      ? new ButtonBuilder()
          .setLabel("Rejoindre le support")
          .setEmoji("🛟")
          .setStyle(ButtonStyle.Link)
          .setURL(supportUrl)
      : new ButtonBuilder()
          .setLabel("Support indisponible")
          .setEmoji("🛟")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
  );

  container.addActionRowComponents(row);

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

function buildBotBusyContainer(bots = []) {
  const container = new ContainerBuilder()
    .setAccentColor(0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# **Aucun bot libre**"),
      new TextDisplayBuilder().setContent("> Tous les bots sont déjà utilisés par d'autres serveurs"),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        bots.length
          ? bots.map((bot, index) => {
              const voicePlace = bot.voiceChannelId ? `<#${bot.voiceChannelId}>` : null;
              const voiceLabel = bot.voiceChannelName
                ? `#${bot.voiceChannelName}`
                : bot.voiceChannelId
                  ? `#${bot.voiceChannelId}`
                  : null;
              const status = voicePlace
                ? `\`occupé sur\` ${voicePlace}${voiceLabel ? ` \`${voiceLabel}\`` : ""}`
                : bot.assignedGuildName
                  ? `\`occupé sur\` **${bot.assignedGuildName}**`
                  : bot.assignedGuildId
                    ? `\`occupé sur\` \`${bot.assignedGuildId}\``
                  : "`libre`";
              return `${String(index + 1).padStart(2, "0")}. ${bot.label || `@Music${index + 1}`} - ${status}`;
            }).join("\n")
          : "> Aucun bot n'est configuré",
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "**Que faire ?**",
          "• Attends qu’un serveur libère un bot",
          "• Clique sur `Obtenir un bot` pour rejoindre le support",
          "• Puis réessaie `Faire rejoindre un bot`",
        ].join("\n"),
      ),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

function buildHelpContainer() {
  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# **Comment utiliser le bot ?**"),
      new TextDisplayBuilder().setContent("> Voici un guide complet pour comprendre le bot, le panel et les commandes principales"),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "**Démarrage rapide**",
          "• Rejoins un salon vocal",
          "• Clique sur `Obtenir un bot` pour faire rejoindre le bot",
          "• Lance une musique avec `/play`",
          "• Le panel s’actualise automatiquement pendant la lecture",
        ].join("\n"),
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "**Boutons du panel**",
          "• `🎫 Obtenir un bot` : ouvre la carte d’aide et le bouton pour rejoindre le support",
          "• `🎧 Faire rejoindre un bot` : fait rejoindre le bot dans ton vocal",
          "• `❓ Comment utiliser le bot ?` : ouvre cette aide détaillée",
          "• `⏮️` : revient au morceau précédent quand c’est possible",
          "• `⏯️` : met la lecture en pause ou la reprend",
          "• `⏭️` : passe au morceau suivant",
          "• `🔁 / ♾️` : change le mode loop",
          "• `📃` : affiche la file de lecture",
        ].join("\n"),
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "**Commandes de lecture**",
          "• `/play` : lance une musique ou ajoute un morceau à la file. C’est la commande principale pour démarrer l’écoute",
          "• `/pause` : met la musique en pause sans quitter le vocal",
          "• `/resume` : reprend la lecture exactement là où elle s’était arrêtée",
          "• `/skip` : passe au morceau suivant si la file contient déjà d’autres titres",
          "• `/stop` : coupe la musique et fait quitter le salon vocal au bot",
          "• `/loop` : change le mode de répétition. Utile si tu veux rejouer un morceau ou refaire toute la file",
          "• `/shuffle` : mélange les morceaux en attente pour changer l’ordre de lecture",
        ].join("\n"),
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "**Playlists**",
          "Les playlists servent à sauvegarder des morceaux pour les retrouver plus tard sans retaper les mêmes liens",
          "• `/playlist-create` : crée une nouvelle playlist personnelle",
          "• `/playlist-add` : ajoute le morceau en cours ou un lien dans une playlist",
          "• `/playlist-list` : affiche toutes tes playlists enregistrées",
          "• `/playlist-play` : lance toute une playlist d’un coup",
          "• `/playlist-remove` : enlève un morceau précis d’une playlist",
        ].join("\n"),
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "**À quoi sert chaque partie ?**",
          "• Le panel principal sert à voir quels bots sont disponibles et à utiliser les actions rapides sans taper de commande",
          "• Le bouton `Obtenir un bot` sert seulement à faire rejoindre le bot dans ton salon vocal",
          "• Les boutons `Pause`, `Skip`, `Loop` et `Queue` servent à contrôler la lecture déjà en cours",
          "• Les commandes playlist servent à préparer des morceaux à l’avance et à gagner du temps",
          "",
          "**Exemple simple**",
          "1. Tu rejoins un vocal",
          "2. Tu cliques sur `Obtenir un bot`",
          "3. Tu tapes `/play` avec un lien ou un titre",
          "4. Tu utilises `Pause`, `Skip` ou `Loop` depuis le panel si besoin",
        ].join("\n"),
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "**Si ça ne marche pas**",
          "• Vérifie que tu es bien dans un salon vocal",
          "• Vérifie qu’un bot est disponible dans le panel",
          "• Si aucun bot n’est libre, attends qu’un autre serveur finisse sa lecture",
          "• Si le bot est déco, clique à nouveau sur `Obtenir un bot`",
        ].join("\n"),
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(1),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("> Si tu vois un problème sur le bot ou si quelque chose ne fonctionne pas, contacte <@189718516176388107> `85my` (`189718516176388107`) pour signaler le souci"),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  buildBotBusyContainer,
  buildErrorContainer,
  buildObtainBotContainer,
  buildJoinBotContainer,
  buildHelpContainer,
  buildEphemeralTextContainer,
  buildTextContainer,
};
