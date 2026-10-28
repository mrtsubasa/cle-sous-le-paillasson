const {
  runCustomPanelCommand,
  handlePendingCustomNameInput,
  handlePendingEmbedFieldInput,
  tryExecuteDynamicCustom
} = require('../commands/customCommand');
const { runHelpMessageCommand } = require('../commands/helpMessageCommand');
const { runConfigCommand } = require('../commands/configCommands');
const { runPanelCommand } = require('../commands/panelCommand');
const { runHelpCommand } = require('../commands/helpCommand');
const { runSayCommand } = require('../commands/sayCommand');
const { runOwnerCommand } = require('../commands/ownerCommand');
const { runHideAllCommand } = require('../commands/hideAllCommand');
const { runHideChannelCommand, runUnhideChannelCommand } = require('../commands/hideChannelCommand');
const { runVerifCommand } = require('../commands/verifCommand');
const { runCreateCommand } = require('../commands/createCommand');
const { runBanInfoCommand } = require('../commands/banInfoCommand');
const { runBanCommand } = require('../commands/banCommand');
const { runUnbanCommand } = require('../commands/unbanCommand');
const { runBanListCommand } = require('../commands/banListCommand');
const { runRenewCommand } = require('../commands/renewCommand');
const { runClearCommand } = require('../commands/clearCommand');
const { runRenameCommand } = require('../commands/renameCommand');
const { runSyncCommand } = require('../commands/syncCommand');
const { runLockCommand, runUnlockCommand } = require('../commands/lockCommand');
const { runLockAllCommand } = require('../commands/lockAllCommand');
const { runSecureCommand } = require('../commands/secureCommand');
const {
  runAddRoleCommand,
  runDelRoleCommand,
  runDerankCommand,
  runMuteRoleCommand,
  runMuteCommand
} = require('../commands/roleToolsCommand');
const {
  runUnmuteCommand,
  runUncmuteCommand,
  runMuteListCommand,
  runUnmuteAllCommand
} = require('../commands/muteManagementCommand');
const {
  runWarnCommand,
  runSanctionsCommand,
  runDelSanctionCommand,
  runClearSanctionsCommand,
  runClearAllSanctionsCommand,
  runPicOnlyCommand,
  runDelPermCommand,
  runClearPermsCommand,
  runSlowmodeCommand,
  runBringAllCommand,
  runVoiceMoveCommand,
  runWhitelistCommand,
  runSnipeCommand
} = require('../commands/moderationExtrasCommand');
const {
  runJoinSettingsCommand,
  runBadWordsCommand,
  runPicCommand,
  runBannerCommand,
  runSoutienCommand,
  runAllBotsCommand,
  runAllAdminsCommand,
  runBotAdminsCommand,
  runRoleMembersCommand,
  runServerInfoCommand
} = require('../commands/infoSettingsCommands');
const { runBuilderCommand } = require('../commands/builderCommand');
const { runChangeCommand } = require('../commands/changeCommand');
const { runPrefixCommand } = require('../commands/prefixCommand');
const { runBotProfileCommand } = require('../commands/botProfileCommand');
const { runMyBotCommand } = require('../commands/myBotCommand');
const {
  handleGiveawayMessage,
  runBlGwCommand,
  runCheckGiveawayCommand,
  runGiveawayCommand,
  runPanelGwCommand,
  runUnblGwCommand
} = require('../commands/giveawayCommands');
const { maybeHandleBadWords, maybeHandlePicOnly } = require('../services/automationService');
const { buildGrantedExecutionContext } = require('../utils/access');
const { buildExecutionFailedPayload, buildNoticePayload } = require('../utils/components');

function createMessageHandler(context) {
  return async (message) => {
    if (message.author.bot || !message.guild) return;

    const consumedByPendingFlow = await handlePendingCustomNameInput(message, context);
    if (consumedByPendingFlow) return;

    const consumedByEmbedFieldFlow = await handlePendingEmbedFieldInput(message, context);
    if (consumedByEmbedFieldFlow) return;

    const [rawCommand, ...args] = String(message.content || '').trim().split(/\s+/);
    if (!rawCommand) {
      const consumedByPicOnly = await maybeHandlePicOnly(message, context);
      if (consumedByPicOnly) return;
      const consumedByGiveaway = await handleGiveawayMessage(message, context);
      if (consumedByGiveaway) return;
      await maybeHandleBadWords(message, context);
      return;
    }
    if (!rawCommand.startsWith(context.config.prefix)) {
      const consumedByPicOnly = await maybeHandlePicOnly(message, context);
      if (consumedByPicOnly) return;
      const consumedByGiveaway = await handleGiveawayMessage(message, context);
      if (consumedByGiveaway) return;
      await maybeHandleBadWords(message, context);
      return;
    }

    const command = rawCommand.toLowerCase();
    const cmdName = command.slice(context.config.prefix.length);
    const firstArg = String(args[0] || '').trim().toLowerCase();
    const secondArg = String(args[1] || '').trim().toLowerCase();
    const accessCommandName =
      cmdName === 'clear' && firstArg === 'all' && secondArg === 'sanctions'
        ? 'clear all sanctions'
        : cmdName === 'clear' && firstArg === 'sanctions'
          ? 'clear sanctions'
          : cmdName === 'clear' && firstArg === 'perms'
            ? 'clear perms'
            : cmdName === 'clear' && firstArg === 'badwords'
              ? 'badwords'
              : cmdName === 'del' && firstArg === 'sanction'
                ? 'del sanction'
                : cmdName === 'del' && firstArg === 'perm'
                  ? 'del perm'
                  : cmdName === 'piv'
                    ? 'pic'
                    : cmdName;

    const execContext = buildGrantedExecutionContext(message, context, accessCommandName);

    const canManageCommands = execContext.accessStore?.canUseAdminCommands?.(message.guild.id, message.author.id) === true;
    const isSys = execContext.accessStore?.isSys?.(message.author.id) === true;
    const isOwnerUser = execContext.accessStore?.isOwner?.(message.guild.id, message.author.id) === true;

    try {
      if (command === `${execContext.config.prefix}helpall`) {
        await require('../commands/helpAllCommand').runHelpAllCommand(message, execContext);
        return;
      }
      if (command === `${execContext.config.prefix}mybot`) {
        await runMyBotCommand(message);
        return;
      }
      if (command === `${execContext.config.prefix}giveaway`) {
        await runGiveawayCommand(message, execContext);
        return;
      }
      if (command === `${execContext.config.prefix}panelgw`) {
        await runPanelGwCommand(message, execContext);
        return;
      }
      if (command === `${execContext.config.prefix}check`) {
        await runCheckGiveawayCommand(message, args, execContext);
        return;
      }
      if (command === `${execContext.config.prefix}blgw`) {
        await runBlGwCommand(message, args, execContext);
        return;
      }
      if (command === `${execContext.config.prefix}unblgw`) {
        await runUnblGwCommand(message, args, execContext);
        return;
      }
      if (command === `${execContext.config.prefix}setperm`) {
        await require('../commands/setpermCommand').runSetPermCommand(message, args, execContext);
        return;
      }
      if (command === `${execContext.config.prefix}perms` || command === `${execContext.config.prefix}perm`) {
        await require('../commands/permsCommand').runPermsCommand(message, execContext);
        return;
      }
      if (command === `${execContext.config.prefix}config`) {
        await runConfigCommand(message, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}prefix`) {
        await runPrefixCommand(message, args, execContext);
        return;
      }

      if ([
        `${execContext.config.prefix}uhqprofil`,
        `${execContext.config.prefix}profilbot`,
        `${execContext.config.prefix}botprofile`,
      ].includes(command)) {
        await runBotProfileCommand(message, execContext);
        return;
      }

      if (
        command === `${execContext.config.prefix}badwords` ||
        (command === `${execContext.config.prefix}clear` && String(args[0] || '').trim().toLowerCase() === 'badwords')
      ) {
        const badWordsArgs = command === `${execContext.config.prefix}badwords` ? args : args.slice(1);
        await runBadWordsCommand(message, badWordsArgs, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}help`) {
        await runHelpCommand(message, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}panel`) {
        if (!isOwnerUser && !isSys) {
          await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys.'));
          return;
        }
        await runPanelCommand(message, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}custom`) {
        if (!canManageCommands) {
          await message.channel.send(buildExecutionFailedPayload('Commande reservee au sys/owners/buyers.'));
          return;
        }
        await runCustomPanelCommand(message, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}helpmessage`) {
        if (!canManageCommands) {
          await message.channel.send(buildExecutionFailedPayload('Commande reservee au sys/owners/buyers.'));
          return;
        }
        await runHelpMessageCommand(message, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}verif`) {
        if (!canManageCommands) {
          await message.channel.send(buildExecutionFailedPayload('Commande reservee au sys/owners/buyers.'));
          return;
        }
        await runVerifCommand(message, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}say`) {
        if (!canManageCommands) {
          await message.channel.send(buildExecutionFailedPayload('Commande reservee au sys/owners/buyers.'));
          return;
        }
        await runSayCommand(message, rawCommand, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}builder`) {
        if (!isOwnerUser && !isSys) {
          await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys.'));
          return;
        }
        await runBuilderCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}change`) {
        if (!isOwnerUser && !isSys) {
          await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys.'));
          return;
        }
        await runChangeCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}create`) {
        await runCreateCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}secure`) {
        if (!isOwnerUser && !isSys) {
          await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys.'));
          return;
        }
        await runSecureCommand(message, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}baninfo`) {
        await runBanInfoCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}ban`) {
        await runBanCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}banlist`) {
        const isOwner = execContext.accessStore.isOwner(message.guild.id, message.author.id);
        if (!isOwner && !isSys) {
          await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys.'));
          return;
        }
        await runBanListCommand(message, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}renew`) {
        const isOwner = execContext.accessStore.isOwner(message.guild.id, message.author.id);
        if (!isOwner && !isSys) {
          await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys.'));
          return;
        }
        await runRenewCommand(message, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}clear` && firstArg === 'all' && secondArg === 'sanctions') {
        await runClearAllSanctionsCommand(message, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}clear` && firstArg === 'sanctions') {
        await runClearSanctionsCommand(message, args.slice(1), execContext);
        return;
      }

      if (command === `${execContext.config.prefix}clear` && firstArg === 'perms') {
        await runClearPermsCommand(message, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}clear`) {
        await runClearCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}del` && firstArg === 'sanction') {
        await runDelSanctionCommand(message, args.slice(1), execContext);
        return;
      }

      if (command === `${execContext.config.prefix}del` && firstArg === 'perm') {
        await runDelPermCommand(message, args.slice(1), execContext);
        return;
      }

      if (command === `${execContext.config.prefix}addrole`) {
        await runAddRoleCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}delrole`) {
        await runDelRoleCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}derank`) {
        await runDerankCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}joinsettings`) {
        await runJoinSettingsCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}muterole`) {
        await runMuteRoleCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}mute`) {
        await runMuteCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}unmute`) {
        await runUnmuteCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}uncmute`) {
        await runUncmuteCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}mutelist`) {
        await runMuteListCommand(message, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}unmuteall`) {
        await runUnmuteAllCommand(message, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}warn`) {
        await runWarnCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}sanctions`) {
        await runSanctionsCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}piconly`) {
        await runPicOnlyCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}slowmode`) {
        await runSlowmodeCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}bringall`) {
        await runBringAllCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}voicemove`) {
        await runVoiceMoveCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}wl`) {
        await runWhitelistCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}snipe`) {
        await runSnipeCommand(message, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}pic` || command === `${execContext.config.prefix}piv`) {
        await runPicCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}banner`) {
        await runBannerCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}soutien`) {
        await runSoutienCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}allbots`) {
        await runAllBotsCommand(message, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}alladmins`) {
        await runAllAdminsCommand(message, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}botadmins`) {
        await runBotAdminsCommand(message, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}rolemembers`) {
        await runRoleMembersCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}serverinfo`) {
        await runServerInfoCommand(message, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}rename`) {
        await runRenameCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}sync`) {
        if (!isOwnerUser && !isSys) {
          await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners/sys.'));
          return;
        }
        await runSyncCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}unban`) {
        await runUnbanCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}lockall`) {
        if (!isSys) {
          await message.channel.send(buildExecutionFailedPayload('Commande reservee au sys.'));
          return;
        }
        await runLockAllCommand(message, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}lock`) {
        if (!isOwnerUser && !isSys) {
          await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners.'));
          return;
        }
        await runLockCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}unlock`) {
        if (!isOwnerUser && !isSys) {
          await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners.'));
          return;
        }
        await runUnlockCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}owner`) {
        if (!isSys) {
          await message.channel.send(buildExecutionFailedPayload('Commande reservee au sys.'));
          return;
        }
        await runOwnerCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}hideall`) {
        if (!isSys) {
          await message.channel.send(buildExecutionFailedPayload('Commande reservee au sys.'));
          return;
        }
        await runHideAllCommand(message, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}hide`) {
        if (!isOwnerUser) {
          await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners.'));
          return;
        }
        await runHideChannelCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}unhide`) {
        if (!isOwnerUser) {
          await message.channel.send(buildExecutionFailedPayload('Commande reservee aux owners.'));
          return;
        }
        await runUnhideChannelCommand(message, args, execContext);
        return;
      }

      if (command === `${execContext.config.prefix}clearcustom`) {
        if (!isSys) {
          await message.channel.send(buildExecutionFailedPayload('Commande reservee au sys.'));
          return;
        }

        const removedCount = execContext.customStore.clearGuildCustoms(message.guild.id);
        await message.channel.send(
          buildNoticePayload({
            title: '# Customs supprimees',
            body: `> ${removedCount} custom(s) supprimee(s).`
          })
        );
        await execContext.logger.log(
          message.guild,
          '# Customs',
          `> Action: clearcustom\n> Supprimees: ${removedCount}\n> Auteur: <@${message.author.id}>`
        );
        return;
      }

      if (command === `${execContext.config.prefix}delcustom`) {
        if (!canManageCommands) {
          await message.channel.send(buildExecutionFailedPayload('Commande reservee au sys/owners/buyers.'));
          return;
        }

        const targetInput = String(args[0] || '').trim();
        if (!targetInput) {
          await message.channel.send(buildExecutionFailedPayload('Format invalide. Utilisez `+delcustom <nom|numero>`.'));
          return;
        }

        const target = resolveCustomDeleteTarget(execContext, message.guild.id, targetInput, execContext.config.prefix);
        if (!target) {
          await message.channel.send(buildExecutionFailedPayload('Custom introuvable. Utilisez un nom exact ou un numero de la liste.'));
          return;
        }

        const deleted = execContext.customStore.deleteCustom(message.guild.id, target.id);
        if (!deleted) {
          await message.channel.send(buildExecutionFailedPayload('Impossible de supprimer cette custom.'));
          return;
        }

        await message.channel.send(
          buildNoticePayload({
            title: '# Custom supprimée',
            body: `> \`${target.name}\` a été supprimée.`
          })
        );
        await execContext.logger.log(
          message.guild,
          '# Customs',
          `> Action: delcustom\n> Cible: \`${target.name}\`\n> Auteur: <@${message.author.id}>`
        );
        return;
      }

      const custom = execContext.customStore.getByName(message.guild.id, command);
      if (custom) {
        const handledCustom = await tryExecuteDynamicCustom(message, command, args, execContext);
        if (handledCustom) {
          await execContext.logger.log(
            message.guild,
            '# Customs',
            `> Commande: \`${command}\`\n> Auteur: <@${message.author.id}>\n> Resultat : traitee`
          );
          return;
        }
      }

      await maybeHandleBadWords(message, execContext);
    } catch (error) {
      console.error('[MESSAGE_HANDLER_ERROR]', error);
      if (message.channel && message.channel.isTextBased()) {
        await message.channel.send(buildExecutionFailedPayload('Une erreur est survenue pendant le traitement de la commande.')).catch(() => null);
      }
      if (isSys || canManageCommands) {
        await execContext.logger.log(message.guild, '# Erreur commande', `> \`${command}\`\n> ${String(error.message || error)}`);
      }
    }
  };

}

module.exports = { createMessageHandler };

function resolveCustomDeleteTarget(execContext, guildId, rawInput, prefix) {
  const input = String(rawInput || '').trim();
  if (!input) return null;

  if (/^\d+$/.test(input)) {
    const index = Number.parseInt(input, 10);
    if (index <= 0) return null;
    const customs = execContext.customStore.listGuildCustoms(guildId);
    return customs[index - 1] || null;
  }

  const byRaw = execContext.customStore.getByName(guildId, input);
  if (byRaw) return byRaw;

  const prefixed = input.startsWith(prefix) ? input : `${prefix}${input}`;
  return execContext.customStore.getByName(guildId, prefixed);
}
