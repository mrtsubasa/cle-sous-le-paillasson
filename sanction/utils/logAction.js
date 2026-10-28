const { time } = require('discord.js');
const { data } = require('./state');

async function logAction(guild, actionType, author, target, reason, duration) {
    if (!guild) return;

    const guildId = String(guild.id);
    const logChannelId = data.logs[guildId];
    if (!logChannelId) return;

    const logChannel = guild.channels.cache.get(String(logChannelId));
    if (!logChannel) return;

    const authorName = author ? (author.tag || author.user?.tag || `${author}`) : 'Syst\u00e8me';
    const authorId = author ? author.id : 'Syst\u00e8me';
    const targetName = target ? (target.tag || target.user?.tag || target.username || target.user?.username || `${target}`) : 'Inconnu';
    const targetId = target ? target.id : 'Inconnu';

    const details = [
        `Victime : ${targetName}`,
        `ID : ${targetId}`,
        `Raison : ${reason || 'Aucune raison sp\u00e9cifi\u00e9e'}`
    ];

    if (duration) {
        details.push(`Dur\u00e9e : ${duration}`);
    }

    const card = {
        flags: 32768,
        components: [
            {
                type: 17,
                components: [
                    { type: 10, content: `# ${actionType}` },
                    { type: 14 },
                    { type: 10, content: `**Auteur :**\n\`\`\`Nom : ${authorName}\nID : ${authorId}\`\`\`` },
                    { type: 10, content: `**Infos :**\n\`\`\`${details.join('\n')}\`\`\`` },
                    { type: 14 },
                    { type: 10, content: time(new Date(), 'F') }
                ]
            }
        ]
    };

    await logChannel.send({ ...card, allowedMentions: { parse: [] } });
}

module.exports = {
    logAction
};
