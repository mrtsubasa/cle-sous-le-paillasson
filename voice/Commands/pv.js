const Discord = require('discord.js');

exports.help = {
    name: 'pv',
    aliases: [],
    type: 'owner',
    description: "Rendre le channel vocal actuel privé et gérer les accès"
}

exports.run = async (bot, message) => {

    if (!bot.functions.checkPerm(bot, message, 'owner')) return;

    if (!bot.pvData) bot.pvData = {};
    const authorId = message.author.id;
    let pvData = bot.pvData[authorId] || { allowed: [] };

    const memberVoice = message.member.voice.channel;
    if (!memberVoice) {
        const reply = new Discord.ContainerBuilder()
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder().setContent("> Vous devez être dans un vocal")
            );
        return await message.reply({ components: [reply], flags: Discord.MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
    }

    const channel = memberVoice;

    if (pvData.channelId === channel.id) {
        if (pvData.kickListener) bot.removeListener('voiceStateUpdate', pvData.kickListener);
        delete bot.pvData[authorId];

        const reply = new Discord.ContainerBuilder()
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder().setContent(`> Le channel <#${channel.id}> n'est plus privé`)
            );
        return await message.reply({ components: [reply], flags: Discord.MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
    }

    const sendEphemeral = async (interaction, content) => {
        const container = new Discord.ContainerBuilder()
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder().setContent(content)
            );
        const payload = {
            flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
            components: [container],
            allowedMentions: { parse: [] }
        };
        if (interaction.replied || interaction.deferred) return interaction.followUp(payload);
        else return interaction.reply(payload);
    };

    pvData.channelId = channel.id;
    pvData.allowed = pvData.allowed || [];
    bot.pvData[authorId] = pvData;

    const buildPanel = () => {
        const list = pvData.allowed.length > 0
            ? pvData.allowed.map((id, i) => `> ${i + 1}) <@${id}> (${id})`).join('\n')
            : '> Aucun utilisateur autorisé';

        const selectOptions = [
            { label: 'Ajouter un utilisateur', value: 'add', emoji: '➕' },
            { label: 'Supprimer un utilisateur', value: 'remove', emoji: '➖' }
        ];

        const select = new Discord.StringSelectMenuBuilder()
            .setCustomId('pvPanel')
            .setPlaceholder('Gérer votre vocal privée')
            .addOptions(selectOptions);

        return new Discord.ContainerBuilder()
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder().setContent("# Panel Vocal Privée")
            )
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder()
                    .setContent(`> Auteur: <@${authorId}>\n> Vocal: <#${pvData.channelId}>\n> Utilisateurs autorisés: \`${pvData.allowed.length}\``)
            )
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder().setContent(list)
            )
            .addActionRowComponents(new Discord.ActionRowBuilder().addComponents(select))
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true));
    };

    const msg = await message.reply({
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [buildPanel()],
        allowedMentions: { parse: [] }
    });

    const collector = msg.createMessageComponentCollector({ time: 300000 });

    collector.on('collect', async i => {
        if (i.user.id !== authorId) return sendEphemeral(i, "> Ce panel n'est que pour vous !");

        await i.deferUpdate();

        const action = i.values[0];

        if (action === 'add' || action === 'remove') {
            await sendEphemeral(i, "> Mentionnez un utilisateur ou mettez son ID :");
            const filter = m => m.author.id === authorId;
            const collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(() => null);
            if (!collected || !collected.first()) return sendEphemeral(i, "> Temps écoulé");

            const response = collected.first();
            const user = await bot.users.fetch(response.mentions.users.first()?.id || response.content).catch(() => null);
            await response.delete().catch(() => null);
            if (!user) return sendEphemeral(i, "> Utilisateur invalide");

            if (action === 'add') {
                if (!pvData.allowed.includes(user.id)) pvData.allowed.push(user.id);
                await sendEphemeral(i, `> <@${user.id}> (${user.id}) peut rejoindre le vocal`);
            }

            if (action === 'remove') {
                pvData.allowed = pvData.allowed.filter(id => id !== user.id);
                await sendEphemeral(i, `> <@${user.id}> (${user.id}) retiré du vocal`);
            }

            bot.pvData[authorId] = pvData;
        }

        await msg.edit({ flags: Discord.MessageFlags.IsComponentsV2, components: [buildPanel()] });
    });

    const kickListener = async (oldState, newState) => {
        if (!newState.channelId) return;
        if (newState.channelId !== pvData.channelId) return;

        if (newState.member.id === authorId) return;
        if (pvData.allowed.includes(newState.member.id)) return;

        try {
            await newState.disconnect("Non autorisé dans le vocal PV");
        } catch (err) {
            console.error("Impossible de kick:", err);
        }
    };

    pvData.kickListener = kickListener;
    bot.on('voiceStateUpdate', kickListener);
};