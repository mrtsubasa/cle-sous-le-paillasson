const Discord = require('discord.js');

exports.help = {
    name: 'uhqlock',
    aliases: [],
    type: 'sys',
    description: "Verrouille ou déverrouille un vocal"
};

exports.run = async (bot, message) => {
    if (!message.guild) return;
    if (!bot.functions.checkPerm(bot, message, 'sys')) return;

    const authorId = message.author.id;

    const req = bot.functions.checkGuild(bot, message.guild.id);
    let uhqLockData;
    try {
        uhqLockData = req?.uhqLock ? JSON.parse(req.uhqLock) : {};
        if (typeof uhqLockData !== 'object' || Array.isArray(uhqLockData)) uhqLockData = {};
    } catch {
        uhqLockData = {};
    }
    bot.uhqLockData = bot.uhqLockData || {};
    bot.uhqLockData[message.guild.id] = uhqLockData;

    const sendEphemeral = async (interaction, content) => {
        const container = new Discord.ContainerBuilder()
            .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(content));
        const payload = {
            flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
            components: [container],
            allowedMentions: { parse: [] }
        };
        if (interaction.replied || interaction.deferred) return interaction.followUp(payload);
        else return interaction.reply(payload);
    };

    let page = 1;
    const itemsPerPage = 10;

    const buildPanel = (page = 1) => {
        const lockedList = Object.keys(bot.uhqLockData[message.guild.id] || {});
        const pageTotal = Math.ceil(lockedList.length / itemsPerPage) || 1;
        const start = (page - 1) * itemsPerPage;
        const end = page * itemsPerPage;

        const list = lockedList.slice(start, end)
            .map((id, i) => `> ${start + i + 1}) <#${id}> (\`${id}\`)`)
            .join('\n') || '> Aucun channel verrouillé';

        const selectOptions = [
            { label: 'Ajouter un vocal', value: 'add', emoji: '➕' },
            { label: 'Supprimer un vocal', value: 'remove', emoji: '➖' }
        ];

        if (lockedList.length > itemsPerPage) {
            selectOptions.push(
                { label: 'Page précédente', value: 'prev', emoji: '<', disabled: page <= 1 },
                { label: 'Page suivante', value: 'next', emoji: '>', disabled: page >= pageTotal }
            );
        }

        const select = new Discord.StringSelectMenuBuilder()
            .setCustomId('uhqPanel')
            .setPlaceholder('Gérer les vocaux verrouillés')
            .addOptions(selectOptions);

        return new Discord.ContainerBuilder()
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent("# Panel UHQ Lock"))
            .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(`> Nombre de channels verrouillés: ${lockedList.length}`))
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(list))
            .addActionRowComponents(new Discord.ActionRowBuilder().addComponents(select))
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true));
    };

    const msg = await message.reply({
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [buildPanel(page)],
        allowedMentions: { parse: [] }
    });

    const collector = msg.createMessageComponentCollector({ time: 300000 });

    collector.on('collect', async i => {
        if (i.user.id !== authorId) return sendEphemeral(i, "> Ce panel n'est pas pour toi fdp !");
        await i.deferUpdate();

        const action = i.values[0];
        const lockedList = Object.keys(bot.uhqLockData[message.guild.id] || {});
        const pageTotal = Math.ceil(lockedList.length / itemsPerPage) || 1;

        if (action === 'prev' && page > 1) page--;
        if (action === 'next' && page < pageTotal) page++;

        if (action === 'prev' || action === 'next') {
            return i.update({
                flags: Discord.MessageFlags.IsComponentsV2,
                components: [buildPanel(page)],
                allowedMentions: { parse: [] }
            });
        }

        await sendEphemeral(i, "> Mentionnez le channel vocal ou mettez son ID :");
        const filter = m => m.author.id === authorId;
        const collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(() => null);
        if (!collected || !collected.first()) return sendEphemeral(i, "> Temps écoulé");

        const response = collected.first();
        const channel = message.guild.channels.cache.get(response.mentions.channels.first()?.id || response.content);
        await response.delete().catch(() => null);

        if (!channel || channel.type !== Discord.ChannelType.GuildVoice)
            return sendEphemeral(i, "> Channel invalide");

        if (action === 'add') {
            if (bot.uhqLockData[message.guild.id][channel.id]) return sendEphemeral(i, "> Channel déjà verrouillé");
            bot.uhqLockData[message.guild.id][channel.id] = true;
        }

        if (action === 'remove') {
            if (!bot.uhqLockData[message.guild.id][channel.id]) return sendEphemeral(i, "> Channel pas verrouillé");
            delete bot.uhqLockData[message.guild.id][channel.id];
        }

        await bot.db.prepare(`UPDATE guilds SET uhqLock = ? WHERE id = ?`)
            .run(JSON.stringify(bot.uhqLockData[message.guild.id]), message.guild.id);

        await sendEphemeral(i, `> Action effectuée sur <#${channel.id}>`);
        await msg.edit({ flags: Discord.MessageFlags.IsComponentsV2, components: [buildPanel(page)] });
    });

    if (!bot.uhqLockListener) {
        bot.uhqLockListener = async (oldState, newState) => {
            const cid = newState.channelId;
            const gid = newState.guildId;
            if (!cid || !gid || !bot.uhqLockData?.[gid]?.[cid]) return;
            const member = newState.member;

            const reqSys = bot.functions.getGuildData(bot, gid);
            const sys = reqSys?.sys ? JSON.parse(reqSys.sys) : [];

            const isBuyer = Array.isArray(reqSys?.buyers)
              ? reqSys.buyers.includes(member.id)
              : JSON.parse(reqSys?.buyers || '[]').includes(member.id);
            const isSys = sys.some(u => u.id === member.id);

            if (!isSys && !isBuyer) {
                try {
                    await newState.disconnect("Non autorisé dans le vocal verrouillé");
                } catch (err) { console.error("Impossible de kick:", err); }
            }
        };
        bot.on('voiceStateUpdate', bot.uhqLockListener);
    }

    bot.on('channelDelete', async channel => {
        if (!channel || channel.type !== Discord.ChannelType.GuildVoice) return;
        const guildId = channel.guildId;
        if (guildId && bot.uhqLockData?.[guildId]?.[channel.id]) {
            delete bot.uhqLockData[guildId][channel.id];
            await bot.db.prepare(`UPDATE guilds SET uhqLock = ? WHERE id = ?`)
                .run(JSON.stringify(bot.uhqLockData[guildId]), guildId);
        }
    });
};
