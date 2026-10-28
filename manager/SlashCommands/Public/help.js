const Discord = require('discord.js');
const buildPanel = require('../../Utils/buildPanel');
const { hasAdminAccess } = require('../../Utils/adminAccess');

function buildMention(name, id, subcommand = null) {
  if (!id) {
    return subcommand ? `/${name} ${subcommand}` : `/${name}`;
  }

  return subcommand ? `</${name} ${subcommand}:${id}>` : `</${name}:${id}>`;
}

function buildCommandLine(name, id, description, subcommand = null) {
  const mention = buildMention(name, id, subcommand);
  return `${mention} - *${description}*`;
}

module.exports = {
  name: 'help',
  description: 'Permet de voir la liste de commande du bot',
  permission: 'Aucune',
  dm: true,

  async run(bot, message) {
    const applicationCommands = await bot.application.commands.fetch().catch(() => null);
    const commandIdByName = new Map();
    if (applicationCommands) {
      applicationCommands.forEach((command) => {
        commandIdByName.set(command.name, command.id);
      });
    }

    const sortedCommands = Array.from(bot.slashcommand.values())
      .filter((command) => command?.name && command?.description && command.name !== 'help')
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

    const formatCommand = (command) => {
      const commandId = commandIdByName.get(command.name) || null;
      const subcommands = Array.isArray(command.subcommands) ? command.subcommands : [];

      if (subcommands.length > 0) {
        return subcommands.map((subcommand) => buildCommandLine(command.name, commandId, subcommand.description, subcommand.name));
      }

      return buildCommandLine(command.name, commandId, command.description);
    };

    const publicCommands = sortedCommands.filter((command) => command.category === 'Public');
    const adminCommands = sortedCommands.filter((command) => command.category === 'Admin');

    const isAdmin = hasAdminAccess(message);
    const publicBlock = publicCommands.flatMap(formatCommand).join('\n');
    const adminBlock = adminCommands.flatMap(formatCommand).join('\n');
    const lines = isAdmin
      ? [
          '> *Permet de voir la liste des commandes en fonction de vos permissions sur le bot*',
          '# Commandes publiques',
          publicBlock,
          '# Commandes admin',
          adminBlock,
        ]
      : [
          '> *Permet de voir la liste des commandes en fonction de vos permissions sur le bot*',
          '# Commandes publiques',
          publicBlock,
        ];

    const components = [buildPanel('# Help Menu', lines)];

    return message.reply({
      components,
      flags: Discord.MessageFlags.IsComponentsV2,
    });
  },
};
