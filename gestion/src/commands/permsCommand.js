const { ContainerBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');

async function runPermsCommand(message, context) {
  if (!message.guild || message.author.bot) return;

  const container = new ContainerBuilder().addTextDisplayComponents((text) =>
    text.setContent('## Liste des permissions')
  );

  for (let i = 1; i <= 9; i += 1) {
    const permKey = String(i);
    const roleIds = context.accessStore.getPermRoles(message.guild.id, permKey) || [];

    const rolesText = roleIds.length
      ? roleIds.map((roleId) => `> <@&${roleId}> (\`${roleId}\`)`).join('\n')
      : '> Aucun role configure.';

    container
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) => text.setContent(`### Permission ${permKey}`))
      .addTextDisplayComponents((text) => text.setContent(rolesText));
  }

  const commandRoleAccess = context.accessStore.getAllCommandRoles(message.guild.id) || {};
  const userDirectAccess = context.accessStore.getAllUserPerms(message.guild.id) || {};

  const roleAccessLines = Object.entries(commandRoleAccess)
    .filter(([, roleIds]) => Array.isArray(roleIds) && roleIds.length > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([commandName, roleIds]) => {
      const roles = roleIds.map((roleId) => `<@&${roleId}>`).join(', ');
      return `> \`+${commandName}\` -> ${roles}`;
    });

  const usersByCommand = {};
  for (const [userId, commands] of Object.entries(userDirectAccess)) {
    if (!Array.isArray(commands) || commands.length === 0) continue;
    for (const commandName of commands) {
      const key = String(commandName || '').trim().toLowerCase();
      if (!key) continue;
      if (!usersByCommand[key]) usersByCommand[key] = [];
      usersByCommand[key].push(String(userId));
    }
  }

  const userAccessLines = Object.entries(usersByCommand)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([commandName, userIds]) => {
      const users = [...new Set(userIds)].map((userId) => `<@${userId}>`).join(', ');
      return `> \`+${commandName}\` -> ${users}`;
    });

  container
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent('### Permissions suplementaire'))
    .addTextDisplayComponents((text) => text.setContent('> Config (roles):'))
    .addTextDisplayComponents((text) => text.setContent(roleAccessLines.length ? roleAccessLines.join('\n') : '> Aucune commande ajoutee via config.'))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) => text.setContent('> Setperm (users):'))
    .addTextDisplayComponents((text) => text.setContent(userAccessLines.length ? userAccessLines.join('\n') : '> Aucune commande ajoutee via setperm.'))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small));

  await message.channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], repliedUser: false }
  });
}

module.exports = {
  runPermsCommand
};
