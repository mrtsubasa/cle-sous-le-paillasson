const Discord = require('discord.js');
const path = require('path');
const { loginManagedBot } = require('../../Utils/botApiBootstrap');
const bot = new Discord.Client({ intents: 3276799, partials: [Discord.Partials.Channel, Discord.Partials.Message, Discord.Partials.User, Discord.Partials.GuildMember, Discord.Partials.Reaction, Discord.Partials.ThreadMember, Discord.Partials.GuildScheduledEvent] });
bot.commands = new Discord.Collection();
bot.slashCommands = new Discord.Collection();
bot.setMaxListeners(70);

const anticrashHandler = require('./Handler/anticrash.js');
anticrashHandler(bot);
bot.db = require('./Handler/database.js')(bot);
bot.functions = require('./Utils/bot.js');

const commandHandler = require('./Handler/Commands.js')(bot);
const slashcommandHandler = require('./Handler/slashCommands.js')(bot);
const eventdHandler = require('./Handler/Events.js')(bot);

const storageId = process.env.BOT_STORAGE_ID || path.basename(__dirname);

loginManagedBot(bot, storageId)
  .then(() => {
    console.log(`[!] — Logged in as ${bot.user.tag} (${bot.user.id})`);
  })
  .catch((error) => {
    console.log(`\x1b[31m[!] — Login failed: ${error?.message || 'Please configure a valid bot token'}\x1b[0m`);
    if (error) console.log(error);
  });
