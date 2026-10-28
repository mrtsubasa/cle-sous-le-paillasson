const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { loadConfig } = require('./src/config');
const { createJsonStore } = require('./src/storage/jsonStore');
const { createCustomStore } = require('./src/services/customStore');
const { createAccessStore } = require('./src/services/accessStore');
const { createLogger } = require('./src/services/logger');
const { createSessionStore } = require('./src/services/sessionStore');
const { applyDefaultBotPresence, applySavedBotPresence } = require('./src/services/botPresence');
const { createGiveawayRuntime } = require('./src/giveaway/runtime');
const {
  restoreAutomationState,
  handleGuildMemberAdd,
  handlePresenceUpdate,
  rememberDeletedMessage
} = require('./src/services/automationService');
const { createMessageHandler } = require('./src/handlers/messageCreate');
const { createInteractionHandler } = require('./src/handlers/interactionCreate');

async function bootstrap() {
  const config = loadConfig();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction]
  });

  const storage = createJsonStore();
  const customStore = createCustomStore(storage);
  const accessStore = createAccessStore(config);
  const logger = createLogger(client, accessStore);
  const sessionStore = createSessionStore(client);

  const context = {
    client,
    config,
    customStore,
    accessStore,
    logger,
    sessionStore
  };

  context.giveaway = await createGiveawayRuntime(context);

  client.on('messageCreate', createMessageHandler(context));
  client.on('interactionCreate', createInteractionHandler(context));
  client.on('guildMemberAdd', (member) => handleGuildMemberAdd(member, context).catch(() => null));
  client.on('presenceUpdate', (oldPresence, newPresence) => handlePresenceUpdate(oldPresence, newPresence, context).catch(() => null));
  client.on('messageDelete', (message) => rememberDeletedMessage(message).catch(() => null));
  client.on('voiceStateUpdate', (oldState, newState) => {
    context.giveaway.voiceTracker.handleUpdate(oldState, newState);
  });
  client.on('messageReactionAdd', (reaction, user) => {
    if (reaction.partial) {
      reaction.fetch().catch(() => null).finally(() => {
        context.giveaway.giveawayManager.handleReactionAdd(reaction, user).catch(() => null);
      });
      return;
    }

    context.giveaway.giveawayManager.handleReactionAdd(reaction, user).catch(() => null);
  });

  client.once('clientReady', async () => {
    console.log(`Bot on ${client.user.tag}`);

    try {
      const restored = await applySavedBotPresence(client);
      if (!restored) await applyDefaultBotPresence(client);
    } catch (error) {
      console.error('[BOT_PRESENCE_RESTORE_ERROR]', error);
    }

    try {
      await context.giveaway.voiceTracker.seed(client);
      await context.giveaway.giveawayManager.recover();
    } catch (error) {
      console.error('[GIVEAWAY_RESTORE_ERROR]', error);
    }

    restoreAutomationState(context).catch((error) => {
      console.error('[AUTOMATION_RESTORE_ERROR]', error);
    });
  });

  await client.login(config.token);
}

process.on('unhandledRejection', (error) => {
  console.error('[UNHANDLED_REJECTION]', error);
});

process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT_EXCEPTION]', error);
});

bootstrap().catch((error) => {
  console.error('[BOOTSTRAP_ERROR]', error);
  process.exit(1);
});
