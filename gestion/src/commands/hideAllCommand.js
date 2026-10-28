const { buildExecutionFailedPayload, buildNoticePayload } = require('../utils/components');

const BATCH_SIZE = 20;
const REASON = '+hideall (sys)';

/**
 * Denies ViewChannel for @everyone on all guild channels (parallel batches for speed).
 */
async function runHideAllCommand(message, context) {
  const guild = message.guild;
  await guild.channels.fetch().catch(() => null);

  const everyoneId = guild.roles.everyone.id;
  const channels = [...guild.channels.cache.values()].filter((ch) => ch?.permissionOverwrites?.edit);

  if (!channels.length) {
    await message.channel.send(buildExecutionFailedPayload('Aucun salon a modifier.'));
    return;
  }

  let ok = 0;
  const errors = [];

  for (let i = 0; i < channels.length; i += BATCH_SIZE) {
    const batch = channels.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map((ch) =>
        ch.permissionOverwrites.edit(everyoneId, { ViewChannel: false }, { reason: REASON })
      )
    );

    for (let j = 0; j < settled.length; j++) {
      const r = settled[j];
      if (r.status === 'fulfilled') ok += 1;
      else {
        const name = batch[j]?.name || batch[j]?.id || '?';
        errors.push(String(name));
      }
    }
  }

  const body =
    `> Salons traités: \`${ok}\` / \`${channels.length}\`` +
    (errors.length ? `\n> Echecs (permissions / limite API): \`${errors.length}\`` : '');

  await message.channel.send(
    buildNoticePayload({
      title: '# Hideall',
      body
    })
  );

  await context.logger.log(
    guild,
    '# Hideall',
    `> Auteur: <@${message.author.id}>\n> OK: ${ok}/${channels.length}\n> Echecs: ${errors.length}`
  );
}

module.exports = { runHideAllCommand };
