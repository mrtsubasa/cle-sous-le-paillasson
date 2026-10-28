const { ContainerBuilder, MessageFlags } = require('discord.js');

const createContainer = (text) => new ContainerBuilder()
    .addTextDisplayComponents((textDisplay) => textDisplay.setContent(text));

module.exports = {
    name: 'owner',
    dm: false,
    description: "Owner un utilisateur",
    type: 1,
    options: [
        {
            name: 'type',
            description: 'Owner un utilisateur',
            required: true,
            type: 3,
            choices: [
                {
                    name: 'add',
                    value: 'add'
                },
                {
                    name: 'remove',
                    value: 'remove'
                },
                {
                    name: 'list',
                    value: 'list'
                },
            ],
        },
        {
            name: 'user',
            description: 'user',
            type: 6,
            required: false,
        }
    ],

    go: async (client, db, config, interaction, args) => {
        const
            user = interaction.options.getUser('user'),
            type = interaction.options.getString('type'),
            privilegedIds = config.buyers || [];

        if (type === 'add') {
            if (!privilegedIds.includes(interaction.user.id) && interaction.user.id !== interaction.guild.ownerId) return interaction.reply({ content: `Vous devez être \`owner\` pour executer cette commande.`, ephemeral: true })

            if (user === null) return interaction.reply({ content: `Vous devez assigner un utilisateur pour faire ceci.`, ephemeral: true })

            if (db.get(`Owner_${interaction.guild.id}-${user.id}`) === null) {
                db.set(`Owner_${interaction.guild.id}-${user.id}`, { AuthorTag: interaction.user.tag, AuthorID: interaction.user.id, Date: `<t:${Math.floor(Date.now() / 1000)}:R>` })
                interaction.reply({
                    components: [createContainer(`> ${user} a bien été ajouté dans la liste des Owners !`)],
                    flags: MessageFlags.IsComponentsV2,
                })
            } else {
                interaction.reply({ content: `L'utilisateur est déjà dans la liste des Owners.`, ephemeral: true })
            }
        }
        if (type === 'remove') {
            if (!privilegedIds.includes(interaction.user.id) && interaction.user.id !== interaction.guild.ownerId) return interaction.reply({ content: `Vous devez être \`owner\` pour executer cette commande.`, ephemeral: true })

            if (user === null) return interaction.reply({ content: `Vous devez assigner un utilisateur pour faire ceci.`, ephemeral: true })
            if (db.get(`Owner_${interaction.guild.id}-${user.id}`) !== null) {
                db.delete(`Owner_${interaction.guild.id}-${user.id}`)
                interaction.reply({
                    components: [createContainer(`> ${user} a bien été retiré de la liste des Owners !`)],
                    flags: MessageFlags.IsComponentsV2,
                })
            } else {
                interaction.reply({ content: `Cet utilisateur n'est pas owner.`, ephemeral: true })
            }
        }
        if (type === 'list') {
            if (!privilegedIds.includes(interaction.user.id) && interaction.user.id !== interaction.guild.ownerId) return interaction.reply({ content: `Vous devez être \`owner\` pour executer cette commande.`, ephemeral: true })
            if (user !== null) {
                if (db.get(`Owner_${interaction.guild.id}-${user.id}`) !== null) {
                    let infoData = db.get(`Owner_${interaction.guild.id}-${user.id}`)
                    interaction.reply({
                        ephemeral: true,
                        components: [
                            new ContainerBuilder()
                                .addTextDisplayComponents((textDisplay) =>
                                    textDisplay.setContent('## Informations Owners'),
                                )
                                .addSeparatorComponents((separator) => separator)
                                .addTextDisplayComponents((textDisplay) =>
                                    textDisplay.setContent(`**Auteur**\nNom d'utilisateur : <@${infoData.AuthorID}>\nIdentifiant : \`${infoData.AuthorID}\`\n\n**Utilisateur**\nNom d'utilisateur : ${user}\nIdentifiant : \`${user.id}\`\n\n**Information supplémentaire**\nDate : ${infoData.Date}`),
                                )
                                .addSeparatorComponents((separator) => separator),
                        ],
                        flags: MessageFlags.IsComponentsV2,
                    })
                } else {
                    interaction.reply({ content: `L'utilisateur n'est pas owner.`, ephemeral: true })
                }
            }
            if (user === null) {
                if (!privilegedIds.includes(interaction.user.id) && interaction.user.id !== interaction.guild.ownerId) return interaction.reply({ content: `Vous devez être \`owner\` pour executer cette commande.`, ephemeral: true })
                var content = ""
                const owners = db
                    .all()
                    .filter((data) => data.ID.startsWith(`Owner_${interaction.guild.id}-`))
                    .sort((a, b) => b.data - a.data);
                for (let i in owners) {
                    if (owners[i].data === null) owners[i].data = 0;
                    let userData = await client.users.fetch(owners[i].ID.split(`-`)[1])

                    const t = db.get(`Owner_${interaction.guild.id}-${userData.id}`)
                    await client.users.fetch(t.AuthorID)

                    content += `

                        <@${userData.id}> | \`${userData.id}\``
                }
                interaction.reply({
                    components: [
                        new ContainerBuilder()
                            .addTextDisplayComponents((textDisplay) => textDisplay.setContent('## Owner'))
                            .addSeparatorComponents((separator) => separator)
                            .addTextDisplayComponents((textDisplay) => textDisplay.setContent(content || '> Aucun owner enregistré.'))
                            .addSeparatorComponents((separator) => separator),
                    ],
                    flags: MessageFlags.IsComponentsV2,
                })
            }
        }
    }
};
