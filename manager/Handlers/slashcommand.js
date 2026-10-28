const Discord = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord.js');
const path = require('path');
const { readJsonConfig } = require('../Utils/tokenVault');

module.exports = async (bot) => {
  let commands = [];

  bot.slashcommand.forEach((command) => {
    let slashCommand = new Discord.SlashCommandBuilder()
      .setName(command.name)
      .setDescription(command.description)
      .setDMPermission(command.dm)
      .setDefaultMemberPermissions(
        command.permission === 'Aucune' ? null : command.permission
      );

    if (command.subcommands?.length >= 1) {
      for (const subcommand of command.subcommands) {
        slashCommand = slashCommand.addSubcommand((sub) => {
          sub.setName(subcommand.name).setDescription(subcommand.description);

          if (subcommand.options?.length >= 1) {
            for (const subcommandOption of subcommand.options) {
              if (subcommandOption.type === 'string') {
                sub.addStringOption((option) => {
                  option
                    .setName(subcommandOption.name)
                    .setDescription(subcommandOption.description)
                    .setAutocomplete(subcommandOption.autocomplete)
                    .setRequired(subcommandOption.required);
                  if (subcommandOption.choices) {
                    option.addChoices(
                      ...subcommandOption.choices.map((choice) => ({
                        name: choice.name,
                        value: choice.value,
                      }))
                    );
                  }
                  return option;
                });
              } else if (subcommandOption.type === 'number') {
                sub.addNumberOption((option) =>
                  option
                    .setName(subcommandOption.name)
                    .setDescription(subcommandOption.description)
                    .setRequired(subcommandOption.required)
                );
              } else if (subcommandOption.type === 'user') {
                sub.addUserOption((option) =>
                  option
                    .setName(subcommandOption.name)
                    .setDescription(subcommandOption.description)
                    .setRequired(subcommandOption.required)
                );
              } else {
                const optionTypeName =
                  subcommandOption.type.slice(0, 1).toUpperCase() +
                  subcommandOption.type.slice(1, subcommandOption.type.length);
                sub[`add${optionTypeName}Option`]((option) =>
                  option
                    .setName(subcommandOption.name)
                    .setDescription(subcommandOption.description)
                    .setRequired(subcommandOption.required)
                );
              }
            }
          }

          return sub;
        });
      }
    } else if (command.options?.length >= 1) {
      for (let i = 0; i < command.options.length; i++) {
        const currentOption = command.options[i];

        if (currentOption.type === 'string') {
          slashCommand.addStringOption((option) => {
            option
              .setName(currentOption.name)
              .setDescription(currentOption.description)
              .setAutocomplete(currentOption.autocomplete)
              .setRequired(currentOption.required);

            if (currentOption.choices) {
              option.addChoices(
                ...currentOption.choices.map((choice) => ({
                  name: choice.name,
                  value: choice.value,
                }))
              );
            }

            return option;
          });
        } else if (currentOption.type === 'number') {
          slashCommand.addNumberOption((option) =>
            option
              .setName(currentOption.name)
              .setDescription(currentOption.description)
              .setRequired(currentOption.required)
          );
        } else if (currentOption.type === 'user') {
          slashCommand.addUserOption((option) =>
            option
              .setName(currentOption.name)
              .setDescription(currentOption.description)
              .setRequired(currentOption.required)
          );
        } else {
          const optionTypeName =
            currentOption.type.slice(0, 1).toUpperCase() +
            currentOption.type.slice(1, currentOption.type.length);
          slashCommand[
            `add${optionTypeName}Option`
          ]((option) =>
            option
              .setName(currentOption.name)
              .setDescription(currentOption.description)
              .setRequired(currentOption.required)
          );
        }
      }
    }
    commands.push(slashCommand.toJSON());
  });

  const rest = new REST({ version: '10' }).setToken(readJsonConfig(path.join(__dirname, '..', 'config.json'), { migrateToken: true })?.token);

  await rest.put(Routes.applicationCommands(bot.user.id), { body: commands });
  console.log('Les slash commands sont chargés avec succès !');
};
