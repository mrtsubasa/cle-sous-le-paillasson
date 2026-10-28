const Discord = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, bot, config) {
    if (interaction.isCommand()) {
      const cmd = bot.slashCommands.get(interaction.commandName);
         
      const args = [];

      for (let option of interaction.options.data) {
          if (option.type === 1) {
              if (option.name) args.push(option.name);
              option.options?.forEach((x) => {
                  if (x.value) args.push(x.value);
              });
          } else if (option.value) args.push(option.value);
      }
      cmd.run(bot, interaction, args, config);
      return;
    }

    if (interaction.isButton() && interaction.customId === 'test_open_user_modal') {
      const modal = new Discord.ModalBuilder()
        .setCustomId('user_modal')
        .setTitle('User Chooser')
        .addLabelComponents(
          new Discord.LabelBuilder()
            .setLabel('Choose your users')
            .setUserSelectMenuComponent(
              new Discord.UserSelectMenuBuilder()
                .setCustomId('user_selected')
                .setMaxValues(5)
                .setRequired(true),
            ),
        );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'user_modal') {
      const selectedUsers = interaction.fields.getSelectedUsers('user_selected', true);
      const usersList = selectedUsers.map((user) => `<@${user.id}>`).join(', ');

      await interaction.reply({
        content: `Utilisateurs selectionnes : ${usersList}`,
        flags: Discord.MessageFlags.Ephemeral,
      });
    }
  },
};
