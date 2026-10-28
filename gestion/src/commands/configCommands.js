const {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder
} = require('discord.js');
const { randomUUID } = require('node:crypto');
const { CONFIGURABLE_COMMANDS, COMMAND_DESCRIPTIONS } = require('../constants/commands');
const { buildExecutionFailedPayload } = require('../utils/components');

const CONFIG_PAGE_SIZE = 25;
const configSessions = new Map();

function withV2(payload) {
  return {
    ...payload,
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false }
  };
}

async function runConfigCommand(message, context) {
  const isOwner = context.accessStore.isOwner(message.guild.id, message.author.id);
  const isSys = context.accessStore.isSys(message.author.id);

  if (!isOwner && !isSys) {
    await message.channel.send(buildExecutionFailedPayload('Tu peux pas faire cette commande'));
    return;
  }

  const sessionId = randomUUID();
  const session = {
    id: sessionId,
    guildId: message.guild.id,
    ownerId: message.author.id,
    expiresAt: Date.now() + 10 * 60 * 1000,
    view: 'main',
    selectedCommand: null,
    pendingAdd: [],
    pendingRemove: [],
    commandPage: 0
  };

  configSessions.set(sessionId, session);

  const payload = buildConfigPayload(session, context);
  const sent = await message.channel.send(payload);
  session.messageId = sent.id;

  setTimeout(() => {
    configSessions.delete(sessionId);
  }, 10 * 60 * 1000).unref();
}

function buildConfigPayload(session, context) {
  const container = new ContainerBuilder();
  const commandPages = chunkCommands(CONFIGURABLE_COMMANDS, CONFIG_PAGE_SIZE);
  const currentPage = Math.max(0, Math.min(session.commandPage || 0, Math.max(0, commandPages.length - 1)));

  if (session.view === 'main') {
    container
      .addTextDisplayComponents((text) => text.setContent('## Config Commandes'))
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) => text.setContent("> Choisissez l'option sur le menu deroulant ci-dessous"))
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents((row) =>
        row.setComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`admin:config:${session.id}:mainMenu`)
            .setPlaceholder('Choisissez une option')
            .addOptions(
              { label: 'Liste des commandes attribuees', value: 'list' },
              { label: 'Attribuer une commande', value: 'assign' }
            )
        )
      );
  } else if (session.view === 'list') {
    container
      .addTextDisplayComponents((text) => text.setContent('## Commandes Attribuees'))
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));

    const allRoles = context.accessStore.getAllCommandRoles(session.guildId) || {};
    const lines = CONFIGURABLE_COMMANDS
      .map((cmd) => {
        const roles = allRoles[cmd] || [];
        if (roles.length === 0) return '';
        return `\`+${cmd}\` : ${roles.map((roleId) => `<@&${roleId}>`).join(', ')}`;
      })
      .filter(Boolean);

    container
      .addTextDisplayComponents((text) =>
        text.setContent(lines.length ? lines.join('\n') : "Aucune commande n'a de role specifiquement attribue.")
      )
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents((row) =>
        row.setComponents(
          new ButtonBuilder()
            .setCustomId(`admin:config:${session.id}:home`)
            .setEmoji('<:icons8home24:1519432188553068627>')
            .setStyle(ButtonStyle.Secondary)
        )
      );
  } else if (session.view === 'assign') {
    const pageCommands = commandPages[currentPage] || [];

    container
      .addTextDisplayComponents((text) => text.setContent('## Attribuer une commande'))
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) =>
        text.setContent(`> Choisissez la commande a configurer\n> Page: \`${currentPage + 1}/${Math.max(1, commandPages.length)}\``)
      )
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents((row) =>
        row.setComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`admin:config:${session.id}:pickCmd`)
            .setPlaceholder('Choisissez la commande')
            .addOptions(
              pageCommands.map((cmd) => ({
                label: `+${cmd}`.slice(0, 100),
                value: cmd,
                description: String(COMMAND_DESCRIPTIONS[cmd] || 'Aucune description').slice(0, 100)
              }))
            )
        )
      );

    if (commandPages.length > 1) {
      container
        .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents((row) =>
          row.setComponents(
            new ButtonBuilder()
              .setCustomId(`admin:config:${session.id}:cmdprev`)
              .setStyle(ButtonStyle.Secondary)
              .setLabel('Precedent')
              .setDisabled(currentPage === 0),
            new ButtonBuilder()
              .setCustomId(`admin:config:${session.id}:cmdnext`)
              .setStyle(ButtonStyle.Secondary)
              .setLabel('Suivant')
              .setDisabled(currentPage >= commandPages.length - 1)
          )
        );
    }

    container
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents((row) =>
        row.setComponents(
          new ButtonBuilder()
            .setCustomId(`admin:config:${session.id}:home`)
            .setEmoji('<:icons8home24:1519432188553068627>')
            .setStyle(ButtonStyle.Secondary)
        )
      );
  } else if (session.view === 'configure') {
    container
      .addTextDisplayComponents((text) => text.setContent(`## ${session.selectedCommand}`))
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) => text.setContent('> Choisissez les roles qui auront acces a cette commande :'))
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents((row) =>
        row.setComponents(
          new RoleSelectMenuBuilder()
            .setCustomId(`admin:config:${session.id}:addRoles`)
            .setPlaceholder('Ajouter des roles')
            .setMinValues(0)
            .setMaxValues(25)
        )
      )
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) => text.setContent("> Choisissez les roles qui n'auront plus acces a cette commande :"));

    const currentRoles = context.accessStore.getCommandRoles(session.guildId, session.selectedCommand) || [];
    if (currentRoles.length > 0) {
      container.addActionRowComponents((row) => {
        const removeSelect = new StringSelectMenuBuilder()
          .setCustomId(`admin:config:${session.id}:removeRoles`)
          .setPlaceholder('Retirer des roles')
          .setMinValues(0)
          .setMaxValues(Math.min(currentRoles.length, 25));

        removeSelect.addOptions(
          currentRoles.map((roleId) => ({
            label: `Role ${roleId}`.slice(0, 100),
            value: roleId
          }))
        );

        return row.setComponents(removeSelect);
      });
    } else {
      container.addTextDisplayComponents((text) => text.setContent('*Aucun role actuellement attribue*'));
    }

    container
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents((row) =>
        row.setComponents(
          new ButtonBuilder()
            .setCustomId(`admin:config:${session.id}:valid`)
            .setEmoji('<:oui:1519424733618110504>')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`admin:config:${session.id}:backassign`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel('Retour')
        )
      );
  } else if (session.view === 'saved') {
    container
      .addTextDisplayComponents((text) => text.setContent('## Commande sauvgardee'))
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) => text.setContent(`> \`+${session.selectedCommand}\` a ete mise a jour.`))
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents((row) =>
        row.setComponents(
          new ButtonBuilder()
            .setCustomId(`admin:config:${session.id}:assign`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel('Autre commande'),
          new ButtonBuilder()
            .setCustomId(`admin:config:${session.id}:home`)
            .setEmoji('<:icons8home24:1519432188553068627>')
            .setStyle(ButtonStyle.Secondary)
        )
      );
  }

  return withV2({ components: [container] });
}

async function handleConfigInteraction(interaction, context) {
  if (!interaction.customId.startsWith('admin:config:')) return false;

  const [, , sessionId, action] = interaction.customId.split(':');
  const session = configSessions.get(sessionId);
  if (!session) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({
        ...buildExecutionFailedPayload('Session expiree relance `+config`'),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      }).catch(() => null);
    }
    return true;
  }

  if (String(interaction.user.id) !== session.ownerId) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({
        ...buildExecutionFailedPayload('Tu peux pas utiliser ce menu'),
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      }).catch(() => null);
    }
    return true;
  }

  if (action === 'mainMenu') {
    session.view = interaction.values[0];
  } else if (action === 'home') {
    session.view = 'main';
    session.selectedCommand = null;
  } else if (action === 'assign') {
    session.view = 'assign';
  } else if (action === 'cmdprev') {
    session.commandPage = Math.max(0, (session.commandPage || 0) - 1);
  } else if (action === 'cmdnext') {
    session.commandPage = Math.min(chunkCommands(CONFIGURABLE_COMMANDS, CONFIG_PAGE_SIZE).length - 1, (session.commandPage || 0) + 1);
  } else if (action === 'pickCmd') {
    session.view = 'configure';
    session.selectedCommand = interaction.values[0];
    session.pendingAdd = [];
    session.pendingRemove = [];
  } else if (action === 'backassign') {
    session.view = 'assign';
  } else if (action === 'addRoles') {
    session.pendingAdd = interaction.values;
    await interaction.deferUpdate();
    return true;
  } else if (action === 'removeRoles') {
    session.pendingRemove = interaction.values;
    await interaction.deferUpdate();
    return true;
  } else if (action === 'valid') {
    session.view = 'saved';

    let current = context.accessStore.getCommandRoles(session.guildId, session.selectedCommand) || [];
    current = [...current];

    for (const roleId of session.pendingAdd) {
      if (!current.includes(roleId)) current.push(roleId);
    }

    current = current.filter((roleId) => !session.pendingRemove.includes(roleId));
    context.accessStore.setCommandRoles(session.guildId, session.selectedCommand, current);
  }

  const payload = buildConfigPayload(session, context);
  if (!interaction.deferred && !interaction.replied) {
    await interaction.update(payload).catch(async () => {
      await interaction.message.edit(payload).catch(() => null);
    });
  } else {
    await interaction.message.edit(payload).catch(() => null);
  }
  return true;
}

function chunkCommands(commands, size) {
  const output = [];
  for (let index = 0; index < commands.length; index += size) {
    output.push(commands.slice(index, index + size));
  }
  return output.length ? output : [[]];
}

module.exports = {
  runConfigCommand,
  handleConfigInteraction
};
