const { ContainerBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');

async function runPermCommand(message, context) {
  const perms = context.accessStore.getAllPerms(message.guild.id);
  const cmdToPerm = {};

  for (let i = 1; i <= 9; i += 1) {
    const perm = perms[i] || perms[String(i)];
    if (!perm || !Array.isArray(perm.commands)) continue;
    for (const cmd of perm.commands) {
      cmdToPerm[String(cmd || '').toLowerCase()] = String(i);
    }
  }

  const allUserPerms = context.accessStore.getAllUserPerms(message.guild.id);
  for (const cmds of Object.values(allUserPerms)) {
    for (const cmd of cmds) {
      const safeCmd = String(cmd || '').toLowerCase();
      if (!safeCmd) continue;
      cmdToPerm[safeCmd] = 'user';
    }
  }

  const entries = Object.entries(cmdToPerm).sort((a, b) => a[0].localeCompare(b[0]));

  const container = new ContainerBuilder().addTextDisplayComponents((text) =>
    text.setContent('## Liste des permissions')
  );

  if (entries.length === 0) {
    container
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) => text.setContent('> Aucune permissions'));
  } else {
    for (const [cmd, perm] of entries) {
      container
        .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents((text) => text.setContent(`+${cmd} : Permission ${perm}`));
    }
  }

  container.addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));

  await message.channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false }
  });
}

module.exports = { runPermCommand };
