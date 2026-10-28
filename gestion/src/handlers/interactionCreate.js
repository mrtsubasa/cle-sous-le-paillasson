const {
  handleCustomModal,
  handleCustomPanelInteraction,
  handleCustomSelectorInteraction,
  handleCustomEmbedButtonInteraction
} = require('../commands/customCommand');
const { handleBuilderInteraction } = require('../commands/builderCommand');
const { handleHelpCommandInteraction } = require('../commands/helpCommand');
const { handleHelpInteraction } = require('../commands/helpMessageCommand');
const { handleInfoSettingsInteraction, handleInfoSettingsModal } = require('../commands/infoSettingsCommands');
const { handlePanelInteraction, handlePanelModalSubmission } = require('../commands/panelCommand');
const { handleVerifInteraction } = require('../commands/verifCommand');
const { handleBanListInteraction } = require('../commands/banListCommand');
const { handleConfigInteraction } = require('../commands/configCommands');
const { handleHelpAllInteraction } = require('../commands/helpAllCommand');
const { handleSecureInteraction } = require('../commands/secureCommand');
const { handleRoleToolsInteraction } = require('../commands/roleToolsCommand');
const { handleGiveawayInteraction, handleGiveawayModalSubmission } = require('../commands/giveawayCommands');
const { buildExecutionFailedPayload } = require('../utils/components');
const { MessageFlags } = require('discord.js');

function createInteractionHandler(context) {
  return async (interaction) => {
    if (!interaction.guild) return;

    try {
      if (interaction.isModalSubmit()) {
        const handledModal = await handleCustomModal(interaction, context);
        if (handledModal) return;

        const handledInfoSettingsModal = await handleInfoSettingsModal(interaction, context);
        if (handledInfoSettingsModal) return;

        const handledPanelModal = await handlePanelModalSubmission(interaction, context);
        if (handledPanelModal) return;

        const handledGiveawayModal = await handleGiveawayModalSubmission(interaction, context);
        if (handledGiveawayModal) return;
      }

      if (
        interaction.isButton() ||
        interaction.isStringSelectMenu() ||
        interaction.isRoleSelectMenu() ||
        interaction.isUserSelectMenu() ||
        interaction.isChannelSelectMenu() ||
        interaction.isMentionableSelectMenu()
      ) {
        const handledEmbedButton = await handleCustomEmbedButtonInteraction(interaction, context);
        if (handledEmbedButton) return;

        const handledBuilder = await handleBuilderInteraction(interaction, context);
        if (handledBuilder) return;

        const handledCustomPanel = await handleCustomPanelInteraction(interaction, context);
        if (handledCustomPanel) return;

        const handledInfoSettings = await handleInfoSettingsInteraction(interaction, context);
        if (handledInfoSettings) return;

        const handledHelpCommand = await handleHelpCommandInteraction(interaction, context);
        if (handledHelpCommand) return;

        const handledHelp = await handleHelpInteraction(interaction, context);
        if (handledHelp) return;

        const handledHelpAll = await handleHelpAllInteraction(interaction, context);
        if (handledHelpAll) return;

        const handledSecure = await handleSecureInteraction(interaction, context);
        if (handledSecure) return;

        const handledVerif = await handleVerifInteraction(interaction, context);
        if (handledVerif) return;

        const handledRoleTools = await handleRoleToolsInteraction(interaction, context);
        if (handledRoleTools) return;

        const handledBanList = await handleBanListInteraction(interaction, context);
        if (handledBanList) return;

        const handledGiveaway = await handleGiveawayInteraction(interaction, context);
        if (handledGiveaway) return;

        const handledPanel = await handlePanelInteraction(interaction, context);
        if (handledPanel) return;

        const handledConfig = await handleConfigInteraction(interaction, context);
        if (handledConfig) return;

        const handledSelector = await handleCustomSelectorInteraction(interaction, context);
        if (handledSelector) return;
      }
    } catch (error) {
      const errorCode = Number(error?.code || error?.rawError?.code || 0);
      if (errorCode !== 40060) {
        console.error('[INTERACTION_HANDLER_ERROR]', error);
      }

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          ...buildExecutionFailedPayload('Une erreur est survenue pendant cette interaction.'),
          flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
        }).catch(() => null);
      }
    }
  };
}

module.exports = { createInteractionHandler };