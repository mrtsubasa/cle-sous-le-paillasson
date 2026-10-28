const { data, saveAllowedChannel, saveLogs, saveOtherConfig } = require('./state');

function cleanUpChannels(guild) {
    const guildId = String(guild.id);
    let modified = false;
    let otherModified = false;

    const allowed = data.allowedChannel[guildId];
    if (allowed && !guild.channels.cache.has(String(allowed))) {
        delete data.allowedChannel[guildId];
        modified = true;
        saveAllowedChannel();
    }

    const logs = data.logs[guildId];
    if (logs && !guild.channels.cache.has(String(logs))) {
        delete data.logs[guildId];
        modified = true;
        saveLogs();
    }

    const cfg = data.otherConfig[guildId];
    if (cfg) {
        const cleanList = (list) => (Array.isArray(list) ? list.filter((id) => guild.channels.cache.has(String(id))) : []);

        const fields = [
            'lockCategories',
            'lockChannels',
            'lockProtected',
            'hideCategories',
            'hideChannels',
            'hideProtected',
            'renewCategories',
            'renewProtected',
            'clearCategories',
            'clearChannels',
            'clearProtected',
            'lockAllChannels',
            'hideAllChannels'
        ];

        for (const field of fields) {
            const next = cleanList(cfg[field]);
            const current = Array.isArray(cfg[field]) ? cfg[field] : [];
            if (JSON.stringify(next) !== JSON.stringify(current)) {
                cfg[field] = next;
                otherModified = true;
            }
        }
    }

    if (otherModified) {
        saveOtherConfig();
        modified = true;
    }

    return modified;
}

module.exports = {
    cleanUpChannels
};
