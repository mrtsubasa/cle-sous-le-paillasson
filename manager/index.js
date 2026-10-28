const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const path = require('path');
const bot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildEmojisAndStickers, GatewayIntentBits.GuildInvites ], partials: [ Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember, Partials.Reaction, Partials.ThreadMember, Partials.GuildScheduledEvent ] });
const { readJsonConfig } = require('./Utils/tokenVault');

bot.slashcommand = new Collection();
const eventdHandler = require('./Handlers/event')(bot);
const slashcommandHandler = require('./Handlers/loadslashcommand.js')(bot);
const DataBase = require('./Handlers/loginDatabase');
DataBase.connectDatabase(bot);
const anticrashHandler = require('./Handlers/anticrash.js');
anticrashHandler(bot);

bot.once('clientReady', () => {
  require('./Handlers/apiServer')(bot);
});

const rootConfig = readJsonConfig(path.join(__dirname, 'config.json'), { migrateToken: true });
bot.login(rootConfig?.token);