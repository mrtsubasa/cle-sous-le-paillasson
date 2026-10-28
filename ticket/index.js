const path = require("path");
const DataBase = require("./database/src/index.js");
const Client = require("./utils/client.js");
const handler = require("./utils/handler.js");
const { loadManagedBotConfig } = require("../../Utils/botApiBootstrap");

const db = new DataBase("./database/data/data.sqlite");
const configPath = path.join(__dirname, "utils", "config.json");
const storageId = process.env.BOT_STORAGE_ID || path.basename(__dirname);

(async () => {
    const config = await loadManagedBotConfig(storageId, {
        fallbackConfigPath: configPath,
    });

    const client = new Client(config);

    await handler(client, db, config);
    await client.login(config.token);
})().catch((error) => {
    console.error(error);
});
