const { Client, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { loginManagedBot } = require('../../Utils/botApiBootstrap');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Message, Partials.Channel]
});

client.commands = new Map();
client.setMaxListeners(70);

const commandsPath = path.join(__dirname, 'commands');
const eventsPath = path.join(__dirname, 'events');

const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command && command.name) {
    client.commands.set(command.name, command);
  }
}

const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));
for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

const storageId = process.env.BOT_STORAGE_ID || path.basename(__dirname);

loginManagedBot(client, storageId)
  .then(() => {
    console.log(`[!] — Logged in as ${client.user.tag} (${client.user.id})`);
  })
  .catch((error) => {
    console.log(`\x1b[31m[!] — Login failed: ${error?.message || 'Please configure a valid bot token'}\x1b[0m`);
    if (error) console.log(error);
  });
