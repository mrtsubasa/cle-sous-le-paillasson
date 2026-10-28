const { hasPermissionForCommand } = require('../utils/permissions');

function parseChannelArg(guild, input) {
    const raw = String(input || '').trim();
    if (!raw) return null;

    const mentionMatch = raw.match(/^<#(\d+)>$/);
    if (mentionMatch) {
        return guild.channels.cache.get(String(mentionMatch[1])) || null;
    }

    if (/^\d{16,21}$/.test(raw)) {
        return guild.channels.cache.get(String(raw)) || null;
    }

    return null;
}

module.exports = {
    name: 'rename',
    async executePrefix(message, args) {
        if (!hasPermissionForCommand(message.member, 'rename')) {
            return message.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande", allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        let channel = message.channel;
        let newName = args.join(' ').trim();

        if (!newName) {
            return message.reply({ content: 'Utilisation : -rename <nouveau nom> ou -rename #salon/id <nouveau nom>', allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const targetedChannel = parseChannelArg(message.guild, args[0]);
        if (targetedChannel) {
            channel = targetedChannel;
            newName = args.slice(1).join(' ').trim();
        } else if (/^(<#\d+>|\d{16,21})$/.test(String(args[0] || '').trim())) {
            return message.reply({ content: 'Salon introuvable', allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        if (!newName) {
            return message.reply({ content: 'Utilisation : -rename <nouveau nom> ou -rename #salon/id <nouveau nom>', allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        if (newName.length > 100) {
            return message.reply({ content: 'Le nom du salon ne peut pas depasser 100 caracteres', allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        try {
            await channel.setName(newName, `Rename salon par ${message.author.tag}`);
        } catch {
            return message.reply({ content: "Je n'ai pas la permission de renommer ce salon", allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        return message.reply({ content: `Le salon a \u00e9t\u00e9 renomm\u00e9 en \`${newName}\``, allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }
};
