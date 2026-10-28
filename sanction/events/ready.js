const { cleanUpRoles } = require('../utils/roleCleanup');
const { cleanUpChannels } = require('../utils/channelCleanup');
const { restoreTempMutes } = require('../utils/muteManager');
const gwCommand = require('../commands/gw');
const { readProfile, saveProfile, buildPresencePayload } = require('../utils/botProfile');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        console.log(`\x1b[32mConnect\u00e9 en tant que : ${client.user.tag}\x1b[0m`);
        const profile = readProfile();
        client.user.setPresence(buildPresencePayload(profile));
        saveProfile(profile);

        const slashCommands = [];
        for (const command of client.commands.values()) {
            if (command.slashData && command.slashData.toJSON) {
                slashCommands.push(command.slashData.toJSON());
            }
        }

        try {
            const registered = await client.application.commands.set(slashCommands);
            console.log(`Commandes en / synchro : ${registered.size}`);
        } catch (error) {
            console.error('Erreur synchro commandes en / :', error);
        }

        for (const guild of client.guilds.cache.values()) {
            cleanUpRoles(guild);
            cleanUpChannels(guild);
        }

        restoreTempMutes(client);

        try {
            await gwCommand.restoreActiveGiveaways(client);
        } catch (error) {
            console.error('Erreur restauration giveaways :', error);
        }
    }
};
