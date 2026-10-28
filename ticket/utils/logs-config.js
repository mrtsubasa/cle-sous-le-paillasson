const { ContainerBuilder, ChannelSelectMenuBuilder, ChannelType } = require('discord.js');

function getGeneralLogsChannelId(db, guildId) {
    return db.get(`logs_channel_${guildId}`) || db.get(`logs_create_${guildId}`) || db.get(`logs_close_${guildId}`) || null;
}

function getTranscriptLogsChannelId(db, guildId) {
    return db.get(`logs_transcript_${guildId}`) || db.get(`logs_close_${guildId}`) || null;
}

function setGeneralLogsChannelId(db, guildId, channelId) {
    db.set(`logs_channel_${guildId}`, channelId);
}

function setTranscriptLogsChannelId(db, guildId, channelId) {
    db.set(`logs_transcript_${guildId}`, channelId);
}

function migrateLegacyLogsConfig(db, guildId) {
    const hasGeneral = Boolean(db.get(`logs_channel_${guildId}`));
    const hasTranscript = Boolean(db.get(`logs_transcript_${guildId}`));

    if (!hasGeneral) {
        const legacyGeneral = db.get(`logs_create_${guildId}`) || db.get(`logs_close_${guildId}`);
        if (legacyGeneral) {
            setGeneralLogsChannelId(db, guildId, legacyGeneral);
        }
    }

    if (!hasTranscript) {
        const legacyTranscript = db.get(`logs_close_${guildId}`);
        if (legacyTranscript) {
            setTranscriptLogsChannelId(db, guildId, legacyTranscript);
        }
    }
}

function mentionOrNone(channelId) {
    return channelId ? `<#${channelId}>` : 'Non configure';
}

function buildLogsConfigContainer(db, guildId, notice = null) {
    const generalLogs = getGeneralLogsChannelId(db, guildId);
    const transcriptLogs = getTranscriptLogsChannelId(db, guildId);

    const container = new ContainerBuilder()
        .addTextDisplayComponents((textDisplay) =>
            textDisplay.setContent('# Logs'),
        )
        .addSeparatorComponents((separator) => separator);

    if (notice) {
        container.addTextDisplayComponents((textDisplay) =>
            textDisplay.setContent(`> ${notice}`),
        );
    }

    container
        .addTextDisplayComponents((textDisplay) =>
            textDisplay.setContent(`> Choissez le salon ou les logs vont passer :\n> Actuel: ${mentionOrNone(generalLogs)}`),
        )
        .addActionRowComponents((actionRow) =>
            actionRow.setComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('logs_channel_select')
                    .setPlaceholder('Selectionnez le salon de logs')
                    .setChannelTypes(ChannelType.GuildText)
                    .setMinValues(1)
                    .setMaxValues(1),
            ),
        )
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents((textDisplay) =>
            textDisplay.setContent(`> Choissez ou les transcripts des tickets seront mis :\n> Actuel: ${mentionOrNone(transcriptLogs)}`),
        )
        .addActionRowComponents((actionRow) =>
            actionRow.setComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('logs_transcript_select')
                    .setPlaceholder('Selectionnez le salon des transcripts')
                    .setChannelTypes(ChannelType.GuildText)
                    .setMinValues(1)
                    .setMaxValues(1),
            ),
        );

    return container;
}

module.exports = {
    getGeneralLogsChannelId,
    getTranscriptLogsChannelId,
    setGeneralLogsChannelId,
    setTranscriptLogsChannelId,
    migrateLegacyLogsConfig,
    buildLogsConfigContainer,
};
