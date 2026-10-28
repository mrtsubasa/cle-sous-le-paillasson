const { noCard } = require('../utils/cards');
const { checkAllowedChannel, hasPermissionForCommand } = require('../utils/permissions');
const { data } = require('../utils/state');
const configCommand = require('../commands/config');
const specialCommand = require('../commands/special');
const permsCommand = require('../commands/perms');
const helpallCommand = require('../commands/helpall');
const otherCommand = require('../commands/other');
const limitsCommand = require('../commands/limits');
const banlistCommand = require('../commands/banlist');
const addroleCommand = require('../commands/addrole');
const delroleCommand = require('../commands/delrole');
const allbotsCommand = require('../commands/allbots');
const alladminsCommand = require('../commands/alladmins');
const helpCommand = require('../commands/help');
const sanctionsCommand = require('../commands/sanctions');
const mutelistCommand = require('../commands/mutelist');
const tolistCommand = require('../commands/tolist');
const rolemembersCommand = require('../commands/rolemembers');
const gwCommand = require('../commands/gw');
const tempmuteCommand = require('../commands/tempmute');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command || !command.executeSlash) {
                return;
            }

            if (!hasPermissionForCommand(interaction.member, interaction.commandName)) {
                return interaction.reply({ content: "<:non:1519424807580733635> Vous n'avez pas la permission", ephemeral: true });
            }

            const allowed = checkAllowedChannel(interaction.guild, interaction.channelId, interaction.user.id, interaction.member);
            if (!allowed) {
                const allowedChannelId = data.allowedChannel[String(interaction.guild.id)];
                const message = allowedChannelId ? `Les commandes sont restreintes au salon <#${allowedChannelId}>` : 'Les commandes sont restreintes \u00e0 un salon sp\u00e9cifique';
                return interaction.reply({ ...noCard(message), ephemeral: true });
            }

            try {
                await command.executeSlash(interaction, client);
            } catch (error) {
                console.error(`Slash command error ${interaction.commandName}:`, error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ ...noCard('Une erreur est survenue'), ephemeral: true });
                }
            }
            return;
        }

        if (interaction.isButton()) {
            if (interaction.customId && interaction.customId.startsWith('banlist_')) {
                return banlistCommand.handleButton(interaction);
            }
            if (interaction.customId && interaction.customId.startsWith('help_')) {
                return helpCommand.handleButton(interaction);
            }
            if (interaction.customId && interaction.customId.startsWith('sanctions_')) {
                return sanctionsCommand.handleButton(interaction);
            }
            if (interaction.customId && interaction.customId.startsWith('mutelist_')) {
                return mutelistCommand.handleButton(interaction);
            }
            if (interaction.customId && interaction.customId.startsWith('tolist_')) {
                return tolistCommand.handleButton(interaction);
            }
            if (interaction.customId && interaction.customId.startsWith('rolemembers_')) {
                return rolemembersCommand.handleButton(interaction);
            }
            if (interaction.customId && interaction.customId.startsWith('allbots_')) {
                return allbotsCommand.handleButton(interaction);
            }
            if (interaction.customId && interaction.customId.startsWith('alladmins_')) {
                return alladminsCommand.handleButton(interaction);
            }
            if (interaction.customId && interaction.customId.startsWith('special_list_')) {
                return specialCommand.handleButton(interaction, client);
            }
            if (interaction.customId && interaction.customId.startsWith('gw_')) {
                return gwCommand.handleButton(interaction, client);
            }
        }

        if (interaction.isStringSelectMenu() || interaction.isRoleSelectMenu() || interaction.isUserSelectMenu() || interaction.isChannelSelectMenu()) {
            const customId = interaction.customId;

            if (customId === 'config_action' || customId.startsWith('config_')) {
                return configCommand.handleMenu(interaction, client);
            }

            if (customId.startsWith('other_')) {
                return otherCommand.handleMenu(interaction, client);
            }

            if (customId.startsWith('limits_')) {
                return limitsCommand.handleMenu(interaction, client);
            }

            if (customId.startsWith('special_')) {
                return specialCommand.handleMenu(interaction, client);
            }

            if (customId.startsWith('perms_')) {
                return permsCommand.handleMenu(interaction, client);
            }

            if (customId.startsWith('helpall_')) {
                return helpallCommand.handleMenu(interaction, client);
            }

            if (customId.startsWith('gw_')) {
                return gwCommand.handleMenu(interaction, client);
            }

            if (customId.startsWith('tempmute_')) {
                return tempmuteCommand.handleMenu(interaction, client);
            }

            if (customId.startsWith('addrole_')) {
                return addroleCommand.handleMenu(interaction, client);
            }

            if (customId.startsWith('delrole_')) {
                return delroleCommand.handleMenu(interaction, client);
            }
        }
    }
};
