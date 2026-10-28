const snipeCache = new Map();
const messageCache = new Map();

function recordMessage(message) {
    if (!message || !message.id) return;

    const cacheId = String(message.id);
    const authorTag = message.author ? message.author.tag : 'Inconnu';
    const authorId = message.author ? message.author.id : null;
    const content = typeof message.content === 'string' ? message.content : '';
    const attachments = message.attachments
        ? Array.from(message.attachments.values()).map((attachment) => attachment.url).filter(Boolean)
        : [];
    const stickers = message.stickers
        ? Array.from(message.stickers.values()).map((sticker) => sticker.name).filter(Boolean)
        : [];
    const embeds = Array.isArray(message.embeds)
        ? message.embeds.map((embed) => ({
            title: embed.title || null,
            description: embed.description || null,
            url: embed.url || null
        }))
        : [];

    messageCache.set(cacheId, {
        authorTag,
        authorId,
        content,
        attachments,
        stickers,
        embeds
    });

    while (messageCache.size > 500) {
        const oldestKey = messageCache.keys().next().value;
        if (!oldestKey) break;
        messageCache.delete(oldestKey);
    }
}

function getCachedMessage(messageId) {
    return messageCache.get(String(messageId)) || null;
}

async function recordSnipe(message) {
    try {
        const fetched = await message.fetch().catch(() => null);
        const target = fetched || message;
        const channelId = String(target.channel.id);
        const cached = getCachedMessage(target.id);

        const authorTag = target.author ? target.author.tag : (cached ? cached.authorTag : 'Inconnu');
        const authorId = target.author ? target.author.id : (cached ? cached.authorId : null);
        const content = typeof target.content === 'string' && target.content.length > 0
            ? target.content
            : (cached ? cached.content : '');
        const attachments = target.attachments && target.attachments.size > 0
            ? Array.from(target.attachments.values()).map((attachment) => attachment.url).filter(Boolean)
            : (cached ? cached.attachments : []);
        const stickers = target.stickers && target.stickers.size > 0
            ? Array.from(target.stickers.values()).map((sticker) => sticker.name).filter(Boolean)
            : (cached ? cached.stickers : []);
        const embeds = Array.isArray(target.embeds) && target.embeds.length > 0
            ? target.embeds.map((embed) => ({
                title: embed.title || null,
                description: embed.description || null,
                url: embed.url || null
            }))
            : (cached ? cached.embeds : []);

        let deleterTag = 'Inconnu';
        let deleterId = null;
        try {
            const logs = await target.guild.fetchAuditLogs({ type: 72, limit: 6 });
            const now = Date.now();
            const channelIdMatch = String(target.channel.id);
            const authorIdMatch = authorId ? String(authorId) : null;

            const entry = logs.entries.find((log) => {
                if (!log) return false;
                if (now - log.createdTimestamp > 10000) return false;

                const targetId = log.target ? String(log.target.id) : null;
                const auditChannelId = log.extra && log.extra.channel ? String(log.extra.channel.id) : null;

                if (authorIdMatch && targetId && targetId !== authorIdMatch) return false;
                if (auditChannelId && auditChannelId !== channelIdMatch) return false;
                return true;
            });

            const picked = entry || logs.entries.find((log) => now - log.createdTimestamp < 10000);
            if (picked) {
                deleterTag = picked.executor ? picked.executor.tag : 'Inconnu';
                deleterId = picked.executor ? picked.executor.id : null;
            }
        } catch {
        }

        snipeCache.set(channelId, {
            content,
            attachments,
            stickers,
            embeds,
            authorTag,
            authorId,
            deleterTag,
            deleterId,
            createdAt: Date.now()
        });
    } catch {
    }
}

function getSnipe(channelId) {
    return snipeCache.get(String(channelId)) || null;
}

module.exports = {
    recordMessage,
    recordSnipe,
    getSnipe
};

