const anticrashHandler = (bot) => {
  bot.on('error', (err) => {
    console.log('Une erreur non-capturée est survenue:', err);
  });

  bot.on('warn', (warning) => {
    console.log('Avertissement Discord:', warning);
  });

  bot.on('shardError', (error, shardId) => {
    console.log(`Erreur shard ${shardId}:`, error);
  });

  bot.on('shardDisconnect', (closeEvent, shardId) => {
    console.log(`Shard ${shardId} déconnecté:`, closeEvent?.code, closeEvent?.reason);
  });

  process.on('uncaughtExceptionMonitor', (err, origin) => {
    console.log(err, origin);
  });

  process.on('rejectionHandled', (err) => {
    console.log(err);
  });

  process.on('warning', (warning) => {
    console.log(warning);
  });

  process.on('uncaughtException', (error) => {
    console.log('Une erreur non-capturée est survenue:', error);
  });

  process.on('unhandledRejection', (reason) => {
    if (reason && typeof reason === 'object' && (reason.code === 'ABORT_ERR' || reason.name === 'AbortError')) {
      return;
    }
    console.log(reason);
  });

  process.on('exit', (code) => {
    console.log(`Processus terminé avec le code ${code}`);
  });
};

module.exports = anticrashHandler;
