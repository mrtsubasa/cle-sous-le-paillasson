const { ContainerBuilder, MessageFlags } = require('discord.js');

const STARS_EMOJI = '<:lb:1519429807455342602>';
const PARIS_TIMEZONE = 'Europe/Paris';
const WEEKDAY_TO_INDEX = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
};

const getStatsKey = (guildId, userId) => `lb_stats_${guildId}_${userId}`;
const getLastResetKey = (guildId) => `lb_last_reset_${guildId}`;
const getLeaderboardChannelKey = (guildId) => `leaderboard_channel_${guildId}`;
const getLeaderboardMessageKey = (guildId) => `leaderboard_message_${guildId}`;

function getStaffStats(db, guildId, userId) {
    const stats = db.get(getStatsKey(guildId, userId));

    return {
        claims: Number(stats?.claims || 0),
        closes: Number(stats?.closes || 0),
        ratingsSum: Number(stats?.ratingsSum || 0),
        ratingsCount: Number(stats?.ratingsCount || 0),
    };
}

function setStaffStats(db, guildId, userId, stats) {
    db.set(getStatsKey(guildId, userId), {
        claims: Number(stats.claims || 0),
        closes: Number(stats.closes || 0),
        ratingsSum: Number(stats.ratingsSum || 0),
        ratingsCount: Number(stats.ratingsCount || 0),
    });
}

function addClaimStat(db, guildId, userId) {
    const stats = getStaffStats(db, guildId, userId);
    stats.claims += 1;
    setStaffStats(db, guildId, userId, stats);
}

function addCloseStat(db, guildId, userId) {
    const stats = getStaffStats(db, guildId, userId);
    stats.closes += 1;
    setStaffStats(db, guildId, userId, stats);
}

function addRatingStat(db, guildId, userId, stars) {
    const rating = Math.max(1, Math.min(5, Number(stars || 0)));
    const stats = getStaffStats(db, guildId, userId);
    stats.ratingsSum += rating;
    stats.ratingsCount += 1;
    setStaffStats(db, guildId, userId, stats);
}

function decodeDbEntryData(data) {
    if (data && typeof data === 'object') return data;
    if (typeof data !== 'string') return {};

    try {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === 'object') return parsed;
    } catch (error) {
        return {};
    }

    return {};
}

function listGuildStats(db, guildId) {
    const prefix = `lb_stats_${guildId}_`;

    return db
        .all()
        .filter((entry) => entry.ID.startsWith(prefix))
        .map((entry) => {
            const data = decodeDbEntryData(entry.data);

            return {
                userId: entry.ID.slice(prefix.length),
                claims: Number(data.claims || 0),
                closes: Number(data.closes || 0),
                ratingsSum: Number(data.ratingsSum || 0),
                ratingsCount: Number(data.ratingsCount || 0),
            };
        });
}

function getAverageRating(stats) {
    if (!stats.ratingsCount) return null;
    return stats.ratingsSum / stats.ratingsCount;
}

function getTopLeaderboard(db, guildId, limit = 10) {
    return listGuildStats(db, guildId)
        .sort((a, b) => {
            if (b.closes !== a.closes) return b.closes - a.closes;
            if (b.claims !== a.claims) return b.claims - a.claims;

            const avgA = getAverageRating(a) || 0;
            const avgB = getAverageRating(b) || 0;
            return avgB - avgA;
        })
        .slice(0, limit)
        .map((entry) => ({
            ...entry,
            average: getAverageRating(entry),
        }));
}

function getParisParts(date) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: PARIS_TIMEZONE,
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    });

    const parts = Object.fromEntries(
        formatter
            .formatToParts(date)
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value]),
    );

    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
        second: Number(parts.second),
        weekdayIndex: WEEKDAY_TO_INDEX[parts.weekday],
    };
}

function addDaysToYmd(year, month, day, days) {
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() + days);

    return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
    };
}

function parisLocalToUtc(year, month, day, hour, minute, second = 0) {
    const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    const guessParis = getParisParts(utcGuess);

    const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    const guessAsUtc = Date.UTC(
        guessParis.year,
        guessParis.month - 1,
        guessParis.day,
        guessParis.hour,
        guessParis.minute,
        guessParis.second,
    );

    return new Date(utcGuess.getTime() + (targetAsUtc - guessAsUtc));
}

function getNextWeeklyReset(referenceDate = new Date()) {
    const parisNow = getParisParts(referenceDate);
    let daysUntilSunday = (7 - parisNow.weekdayIndex) % 7;

    let targetDate = addDaysToYmd(parisNow.year, parisNow.month, parisNow.day, daysUntilSunday);
    let targetUtc = parisLocalToUtc(targetDate.year, targetDate.month, targetDate.day, 21, 0, 0);

    if (targetUtc <= referenceDate) {
        targetDate = addDaysToYmd(targetDate.year, targetDate.month, targetDate.day, 7);
        targetUtc = parisLocalToUtc(targetDate.year, targetDate.month, targetDate.day, 21, 0, 0);
    }

    return targetUtc;
}

function formatRemainingTime(targetDate, nowDate = new Date()) {
    let remainingMs = Math.max(0, targetDate.getTime() - nowDate.getTime());

    const days = Math.floor(remainingMs / 86400000);
    remainingMs -= days * 86400000;

    const hours = Math.floor(remainingMs / 3600000);
    remainingMs -= hours * 3600000;

    const minutes = Math.floor(remainingMs / 60000);

    return `${days} jours ${hours} heures ${minutes} minutes`;
}

function getNextFiveMinuteUpdate(referenceDate = new Date()) {
    const stepMs = 5 * 60 * 1000;
    const nextTick = Math.ceil((referenceDate.getTime() + 1) / stepMs) * stepMs;
    return new Date(nextTick);
}

function toDiscordTimestamp(date, style = 'R') {
    const unix = Math.floor(date.getTime() / 1000);
    return `<t:${unix}:${style}>`;
}

function ensureWeeklyReset(db, guildId, nowDate = new Date()) {
    const key = getLastResetKey(guildId);
    const lastResetRaw = db.get(key);

    if (!lastResetRaw) {
        db.set(key, nowDate.toISOString());
        return false;
    }

    const lastResetDate = new Date(lastResetRaw);
    if (Number.isNaN(lastResetDate.getTime())) {
        db.set(key, nowDate.toISOString());
        return false;
    }

    const nextResetAfterLast = getNextWeeklyReset(new Date(lastResetDate.getTime() + 1000));

    if (nowDate < nextResetAfterLast) return false;

    const statsPrefix = `lb_stats_${guildId}_`;
    db.all()
        .filter((entry) => entry.ID.startsWith(statsPrefix))
        .forEach((entry) => db.delete(entry.ID));

    db.set(key, nowDate.toISOString());
    return true;
}

function buildStarsText(average, ratingsCount) {
    if (!ratingsCount || average === null) return 'Aucune note';

    const rounded = Math.max(1, Math.min(5, Math.round(average)));
    const stars = Array.from({ length: rounded }, () => STARS_EMOJI).join(' ');

    return `${stars} ${average.toFixed(2)}/5`;
}

function formatRank(index) {
    if (index === 0) return '1er';
    return `${index + 1}eme`;
}

function buildLeaderboardContainer(db, guildId) {
    ensureWeeklyReset(db, guildId);

    const top = getTopLeaderboard(db, guildId, 10);
    const nextUpdate = getNextFiveMinuteUpdate();
    const nextReset = getNextWeeklyReset();
    const nextUpdateRelative = toDiscordTimestamp(nextUpdate, 'R');
    const nextUpdateFull = toDiscordTimestamp(nextUpdate, 'F');
    const nextResetRelative = toDiscordTimestamp(nextReset, 'R');
    const nextResetFull = toDiscordTimestamp(nextReset, 'F');

    const rankingText = top.length
        ? top
            .map((entry, index) => {
                const starsText = buildStarsText(entry.average, entry.ratingsCount);
                return `> ***\`${formatRank(index)}.\`*** <@${entry.userId}> - **${starsText}** **//** **Claim: ${entry.claims}** **//** **Close: ${entry.closes}**`;
            })
            .join('\n')
        : '> Aucun staff classé pour le moment.';

    return new ContainerBuilder()
        .addTextDisplayComponents((textDisplay) =>
            textDisplay.setContent('## LeaderBoard'),
        )
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents((textDisplay) =>
            textDisplay.setContent(`> Prochaine réinitialisation : ${nextResetRelative}`),
        )
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents((textDisplay) =>
            textDisplay.setContent(rankingText),
        );
}

async function refreshLeaderboardMessage({ client, db, guildId, channelId = null }) {
    if (!client || !db || !guildId) {
        return { updated: false, reason: 'invalid_context' };
    }

    ensureWeeklyReset(db, guildId);

    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
        return { updated: false, reason: 'guild_not_found' };
    }

    const leaderboardChannelKey = getLeaderboardChannelKey(guildId);
    const leaderboardMessageKey = getLeaderboardMessageKey(guildId);
    const targetChannelId = channelId || db.get(leaderboardChannelKey);

    if (!targetChannelId) {
        return { updated: false, reason: 'channel_not_configured' };
    }

    const channel = guild.channels.cache.get(targetChannelId) || await guild.channels.fetch(targetChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        return { updated: false, reason: 'channel_not_found' };
    }

    db.set(leaderboardChannelKey, channel.id);

    const leaderboardContainer = buildLeaderboardContainer(db, guild.id);
    const payload = {
        components: [leaderboardContainer],
        flags: MessageFlags.IsComponentsV2,
    };

    const leaderboardMessageId = db.get(leaderboardMessageKey);
    if (leaderboardMessageId) {
        const message = await channel.messages.fetch(leaderboardMessageId).catch(() => null);
        if (message) {
            await message.edit(payload).catch(() => null);
            return { updated: true, created: false, messageId: message.id, channelId: channel.id };
        }
    }

    const newMessage = await channel.send(payload).catch(() => null);
    if (!newMessage) {
        return { updated: false, reason: 'send_failed' };
    }

    db.set(leaderboardMessageKey, newMessage.id);
    return { updated: true, created: true, messageId: newMessage.id, channelId: channel.id };
}

module.exports = {
    STARS_EMOJI,
    addClaimStat,
    addCloseStat,
    addRatingStat,
    getTopLeaderboard,
    getNextFiveMinuteUpdate,
    getNextWeeklyReset,
    formatRemainingTime,
    ensureWeeklyReset,
    buildLeaderboardContainer,
    refreshLeaderboardMessage,
};
