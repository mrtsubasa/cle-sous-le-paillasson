const Discord = require('discord.js');

exports.help = {
    name: 'paneluhq',
    aliases: [],
    type: 'sys',
    description: 'Configurer les limites horaires de bl et nobl'
};

exports.run = async (bot, message) => {
    if (!bot.functions.checkPerm(bot, message, 'sys')) return;

    const req = bot.functions.ensureGuildRow(bot, message.guild.id);
    let limits = bot.functions.getCommandLimits(req);

    const sendEphemeral = async (interaction, content) => {
        const payload = {
            flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
            components: [
                new Discord.ContainerBuilder().addTextDisplayComponents(
                    new Discord.TextDisplayBuilder().setContent(content)
                )
            ]
        };

        if (interaction.replied || interaction.deferred) {
            return interaction.followUp(payload);
        }

        return interaction.reply(payload);
    };

    const buildPanel = () => {
        const blButton = new Discord.ButtonBuilder()
            .setCustomId('paneluhq_bl')
            .setLabel('Configurer BL')
            .setStyle(Discord.ButtonStyle.Primary)
            .setEmoji({ id: '1488193340011712653', name: 'settings' });

        const noblButton = new Discord.ButtonBuilder()
            .setCustomId('paneluhq_nobl')
            .setLabel('Configurer NoBL')
            .setStyle(Discord.ButtonStyle.Secondary)
            .setEmoji({ id: '1488193340011712653', name: 'settings' });

        return new Discord.ContainerBuilder()
            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder().setContent('# UHQ Limits Panel')
            )
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder().setContent(
                    `> Ajuste les quotas horaires du bot sans toucher aux listes.\n> Les changements sont pris en compte immédiatement.`
                )
            )
            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder().setContent(
                    [
                        `**Blacklist**`,
                        `> Owner: \`${limits.bl.owner}/h\``,
                        `> Sys: \`${limits.bl.sys}/h\``,
                        `> WL: \`${limits.bl.wl}/h\``,
                        ``,
                        `**NoBL**`,
                        `> Owner: \`${limits.nobl.owner}/h\``,
                        `> Sys: \`${limits.nobl.sys}/h\``
                    ].join('\n')
                )
            )
            .addTextDisplayComponents(
                new Discord.TextDisplayBuilder().setContent(
                    `> Utilise les boutons ci-dessous pour ouvrir le formulaire de configuration.`
                )
            )
            .addActionRowComponents(
                new Discord.ActionRowBuilder().addComponents(blButton, noblButton)
            )
            .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
    };

    const msg = await message.reply({
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [buildPanel()],
        allowedMentions: { parse: [] }
    });

    const collector = msg.createMessageComponentCollector({ time: 300000 });

    collector.on('collect', async (i) => {
        if (i.user.id !== message.author.id) {
            return sendEphemeral(i, '> Pas pour toi fdp de merde!!');
        }

        if (i.customId !== 'paneluhq_bl' && i.customId !== 'paneluhq_nobl') {
            return;
        }

        const action = i.customId;
        const target = action === 'paneluhq_bl' ? 'bl' : 'nobl';
        const current = target === 'bl' ? limits.bl : limits.nobl;
        const fields = target === 'bl'
            ? ['owner', 'sys', 'wl']
            : ['owner', 'sys'];

        const labels = {
            owner: 'Limite owner / heure',
            sys: 'Limite sys / heure',
            wl: 'Limite wl / heure'
        };

        const modal = new Discord.ModalBuilder()
            .setCustomId(`paneluhq_${target}`)
            .setTitle(target === 'bl' ? 'Configurer les limites BL' : 'Configurer les limites NoBL')
            .addComponents(
                ...fields.map((field) => new Discord.ActionRowBuilder().addComponents(
                    new Discord.TextInputBuilder()
                        .setCustomId(field)
                        .setLabel(labels[field])
                        .setStyle(Discord.TextInputStyle.Short)
                        .setRequired(true)
                        .setValue(String(current[field]))
                        .setPlaceholder('Entrez un entier positif')
                ))
            );

        await i.showModal(modal);

        const submitted = await i.awaitModalSubmit({
            time: 60000,
            filter: (modalInteraction) =>
                modalInteraction.user.id === message.author.id &&
                modalInteraction.customId === `paneluhq_${target}`
        }).catch(() => null);

        if (!submitted) return;

        const values = {};
        for (const field of fields) {
            const raw = submitted.fields.getTextInputValue(field);
            const parsed = Number.parseInt(raw, 10);

            if (!Number.isInteger(parsed) || parsed <= 0) {
                return submitted.reply({
                    flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
                    components: [
                        new Discord.ContainerBuilder().addTextDisplayComponents(
                            new Discord.TextDisplayBuilder().setContent(`> La valeur "${raw}" pour ${field} doit être un entier positif.`)
                        )
                    ]
                });
            }

            values[field] = parsed;
        }

        const nextLimits = JSON.parse(JSON.stringify(limits));
        nextLimits[target] = values;

        await bot.functions.saveCommandLimits(bot, message.guild.id, nextLimits);
        limits = nextLimits;

        await submitted.reply({
            flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
            components: [
                new Discord.ContainerBuilder().addTextDisplayComponents(
                    new Discord.TextDisplayBuilder().setContent(
                        target === 'bl'
                            ? `> Limites BL mises à jour : owner ${values.owner}/h, sys ${values.sys}/h, wl ${values.wl}/h`
                            : `> Limites NoBL mises à jour : owner ${values.owner}/h, sys ${values.sys}/h`
                    )
                )
            ]
        });

        await msg.edit({
            flags: Discord.MessageFlags.IsComponentsV2,
            components: [buildPanel()],
            allowedMentions: { parse: [] }
        });
    });
};
