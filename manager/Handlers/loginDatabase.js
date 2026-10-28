module.exports = {
  connectDatabase(bot) {
    const loadDatabase = require('./loadDatabase');

    bot.db = loadDatabase();
    console.log('\x1b[32mLa base SQLite a été initialisée avec succès.\x1b[0m');
  },
};
