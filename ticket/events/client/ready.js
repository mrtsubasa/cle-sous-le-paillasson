const { refreshLeaderboardMessage } = require('../../utils/leaderboard');
const { ContainerBuilder, MessageFlags } = require('discord.js');
const { resolveTicketConfig } = require('../../utils/ticket-core');
const {
    DEFAULT_PRESENCE_STATE,
    loadSavedPresenceState,
    presenceStateToPayload,
    savePresenceState,
} = require('../../utils/bot-profile-panel');

const TICKET_REMINDER_DELAY_MS = 10 * 60 * 1000;

module.exports = (client, db, config) => {
    client.box(`[BOT] => ON [${client.user.tag}]`);
    const savedPresence = loadSavedPresenceState();
    const initialPresence = savedPresence || { ...DEFAULT_PRESENCE_STATE };
    client.user.setPresence(presenceStateToPayload(initialPresence));
    savePresenceState(initialPresence);

    void sweepTicketReminders(client, db);
    setInterval(() => {
        runLeaderboardMaintenance(client, db);
    }, 5 * 60 * 1000);

    setInterval(() => {
        void sweepTicketReminders(client, db);
    }, 60 * 1000);

    setTimeout(() => {
        runLeaderboardMaintenance(client, db);
    }, 5000);
};

async function sweepTicketReminders(client, db) {
    const rows = db.all();

    for (const row of rows) {
        if (!row?.ID?.startsWith('ticket_opened_at_')) continue;

        const channelId = row.ID.replace('ticket_opened_at_', '');
        const openedAt = Number(row.data);
        if (!Number.isFinite(openedAt)) continue;

        if (Date.now() - openedAt < TICKET_REMINDER_DELAY_MS) continue;

        const reminderSent = db.get(`ticket_reminder_sent_${channelId}`) === 'sent';
        if (reminderSent) continue;

        const claimedBy = db.get(`ticket_claim_${channelId}`);
        if (claimedBy) {
            db.set(`ticket_reminder_sent_${channelId}`, 'sent');
            continue;
        }

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel?.isTextBased?.() || !channel.guild) {
            db.set(`ticket_reminder_sent_${channelId}`, 'sent');
            continue;
        }

        const ticketTypeRaw = db.get(`ticket_type_${channelId}`);
        const ticketConfig = resolveTicketConfig(db, channel.guild.id, ticketTypeRaw);
        if (!ticketConfig?.role) {
            continue;
        }

            const reminderContainer = new ContainerBuilder()
                .addTextDisplayComponents((textDisplay) =>
                    textDisplay.setContent('## Rappel ticket'),
                )
                .addSeparatorComponents((separator) => separator)
                .addTextDisplayComponents((textDisplay) =>
                    textDisplay.setContent(
                        `> Le Ticket est laisser a l'abandon depuis 10 Minutes depechez vous <@&${ticketConfig.role}>`
                    ),
                );

        await channel.send({
                components: [reminderContainer],
                flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [], roles: [ticketConfig.role] },
        }).catch(() => null);

        db.set(`ticket_reminder_sent_${channelId}`, 'sent');
    }
}

async function runLeaderboardMaintenance(client, db) {
    for (const guild of client.guilds.cache.values()) {
        try {
            await refreshLeaderboardMessage({
                client,
                db,
                guildId: guild.id,
            });
        } catch (error) {
            console.error(`Erreur maintenance leaderboard (${guild.id}):`, error);
        }
    }
}
