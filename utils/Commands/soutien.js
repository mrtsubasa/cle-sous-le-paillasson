const {
  ContainerBuilder, ButtonStyle, MessageFlags,
  ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  RoleSelectMenuBuilder
} = require('discord.js');

exports.help = {
  name: 'soutien',
  aliases: ['sou'],
  type: 'owner',
  description: 'Panel configuration rôle de soutien',
};

exports.run = async (bot, message) => {
  if (!bot.functions.checkPerm(bot, message, 'owner')) return;

  let guildData = await bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(message.guild.id);

  if (!guildData) {
   //console.log('[SUPPORT] Création des données guild par défaut');
    await bot.db.prepare(
      'INSERT INTO guilds (id, supportRoles, supportKeywords, supportEnabled) VALUES (?, ?, ?, ?)'
    ).run(message.guild.id, JSON.stringify([]), JSON.stringify([]), 1);

    guildData = { supportRoles: '[]', supportKeywords: '[]', supportEnabled: 1 };
  }

  let roles = JSON.parse(guildData.supportRoles || '[]');
  let keywords = JSON.parse(guildData.supportKeywords || '[]');
  let isSupportEnabled = guildData.supportEnabled !== 0;
  let isEditing = false;

  const getStatusText = (member) =>
    member?.presence?.activities?.find(a => a.type === 4)?.state?.toLowerCase() || '';

  const syncSupportRoles = async () => {
    if (!roles.length || !keywords.length) return;

    const members = await message.guild.members.fetch({ withPresences: true }).catch(() => null);
    if (!members) return;

    for (const member of members.values()) {
      if (!member || member.user.bot) continue;

      const statusText = getStatusText(member);
      if (!statusText) continue;

      const hasKeyword = keywords.some(k => statusText.includes(k.toLowerCase()));
      if (!hasKeyword) continue;

      for (const roleId of roles) {
        if (!member.roles.cache.has(roleId)) {
          await member.roles.add(roleId).catch(() => {});
        }
      }
    }
  };

  const buildPanel = () => {
    return new ContainerBuilder()
      .addTextDisplayComponents(t => t.setContent('# Panel Soutien Status'))
      .addTextDisplayComponents(t =>
        t.setContent(
          `> Rôles : ${roles.length ? roles.map(r => `<@&${r}>`).join(', ') : 'Aucun défini'}\n` +
          `> Mots-clés : ${keywords.length ? keywords.map(k => `\`${k}\``).join(', ') : 'Aucun défini'}\n` +
          `> Statut : ${isSupportEnabled ? 'Activé' : 'Désactivé'}`
        )
      )
      .addSeparatorComponents(s => s)

      .addTextDisplayComponents(t => t.setContent('# Sélection des rôles'))
      .addActionRowComponents(row =>
        row.setComponents(
          new RoleSelectMenuBuilder()
            .setCustomId('support:roles')
            .setPlaceholder('Choisir un ou plusieurs rôles')
            .setMinValues(0)
            .setMaxValues(5)
            .setDisabled(isEditing)
        )
      )
      .addSeparatorComponents(s => s)

      .addSectionComponents(section =>
        section
          .addTextDisplayComponents(t => t.setContent('# Mots-clés / URL'))
          .addTextDisplayComponents(t => t.setContent('> Détecte si le status contient un mot-clé'))
          .setButtonAccessory(btn =>
            btn
              .setCustomId('support:keywords')
              .setLabel('Modifier')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(isEditing)
          )
      )
      .addSeparatorComponents(s => s)
      .addSectionComponents(section =>
        section
          .addTextDisplayComponents(t => t.setContent('# Activation / désactivation du système de soutien'))
          .addTextDisplayComponents(t =>
          t.setContent('> Permet d’activer ou désactiver le module du panel soutien')
           )
          .setButtonAccessory(btn =>
            btn
              .setCustomId('support:toggle')
              .setLabel(isSupportEnabled ? 'Désactiver' : 'Activer')
              .setStyle(isSupportEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
              .setDisabled(isEditing)
          )
      )
      .addSeparatorComponents(s => s)
  };

  const msg = await message.reply({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });

  const collector = msg.createMessageComponentCollector({ time: 300000 });

  collector.on('collect', async interaction => {
    if (interaction.user.id !== message.author.id) return;

    if (interaction.customId === 'support:roles') {
      roles = interaction.values || [];
     // console.log('[SUPPORT] Rôles mis à jour:', roles);
      await bot.db.prepare('UPDATE guilds SET supportRoles = ? WHERE id = ?').run(JSON.stringify(roles), message.guild.id);
      await interaction.update({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });
    }

    if (interaction.customId === 'support:keywords') {
      const modal = new ModalBuilder()
        .setCustomId('support:keywordsModal')
        .setTitle('Mots-clés de soutien')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('keywordsInput')
              .setLabel('Mots-clés / URL (séparés par des virgules)')
              .setStyle(TextInputStyle.Short)
              .setValue(keywords.join(', '))
              .setRequired(false)
          )
        );
      await interaction.showModal(modal);
    }

    if (interaction.customId === 'support:toggle') {
      isSupportEnabled = !isSupportEnabled;
     //console.log('[SUPPORT] Toggle changé. Nouveau statut:', isSupportEnabled ? 'Activé' : 'Désactivé');
      await bot.db.prepare('UPDATE guilds SET supportEnabled = ? WHERE id = ?')
        .run(isSupportEnabled ? 1 : 0, message.guild.id);
      await interaction.update({ components: [buildPanel()], flags: MessageFlags.IsComponentsV2 });

      if (isSupportEnabled) {
        await syncSupportRoles();
      }
    }
  });

  bot.on('interactionCreate', async modal => {
    if (!modal.isModalSubmit()) return;
    if (modal.customId !== 'support:keywordsModal') return;
    if (modal.user.id !== message.author.id) return;

    keywords = modal.fields.getTextInputValue('keywordsInput')
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length);

   //console.log('[SUPPORT] Mots-clés mis à jour:', keywords);
    await bot.db.prepare('UPDATE guilds SET supportKeywords = ? WHERE id = ?')
      .run(JSON.stringify(keywords), message.guild.id);

    await modal.reply({ content: `> Mots-clés mis à jour : ${keywords.join(', ') || 'Aucun'}`, flags: 64 });
    await msg.edit({ components: [buildPanel()] });
  });
};
