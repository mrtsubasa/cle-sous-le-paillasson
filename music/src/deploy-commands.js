const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");
const config = require("./core/config");

async function deployCommands(guildIds = []) {
  if (!config.controlToken) {
    throw new Error("CONTROL_TOKEN est manquant dans .env");
  }
  if (!config.clientId) {
    throw new Error("CLIENT_ID est manquant et impossible à déduire depuis CONTROL_TOKEN");
  }

  const commandsPath = path.join(__dirname, "commands");
  const files = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));

  const commands = [];
  for (const file of files) {
    const command = require(path.join(commandsPath, file));
    commands.push(command.data.toJSON());
  }

  const rest = new REST({ version: "10" }).setToken(config.controlToken);

  await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
  console.log("Anciennes commandes globales supprimées pour éviter les doublons.");

  const targetGuildIds = [...new Set([
    config.guildId,
    ...guildIds,
  ].filter(Boolean).map(String))];

  for (const guildId of targetGuildIds) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, guildId),
        { body: commands },
      );
      console.log(`Commandes également déployées sur le serveur ${guildId}.`);
    } catch (error) {
      console.error(`[Slash] Déploiement impossible sur le serveur ${guildId}:`, error);
    }
  }
}

module.exports = {
  deployCommands,
};

if (require.main === module) {
  deployCommands().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
