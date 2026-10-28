const { permissionCard, noCard, yesCard } = require('../utils/cards');
const { hasPermissionForCommand, isBotOwner } = require('../utils/permissions');
const { resolveMember } = require('../utils/resolvers');

function safeOptionLabel(role) {
  const raw = role && typeof role.name == 'string' ? role.name : '';
  const trimmed = raw.trim();
  if (!trimmed) return `Role ${role && role.id ? role.id : 'inconnu'}`;
  return trimmed.slice(0, 100);
}

function buildRolesCard(title, roles, customId) {
  const options = roles.map((role) => ({
  label: safeOptionLabel(role),
  value: role.id
  })).slice(0, 25);

  return {
  flags: 32768,
  components: [{
  type: 17,
  components: [
  { type: 10, content: `# ${title}\n> Vous ne pouvez qu'enlever des r\u00f4les qui sont \`en dessous\` de votre r\u00f4le le plus haut` },
  { type: 14, divider: true },
  { type: 10, content: `> ### Choisissez le ou les r\u00f4les que vous voulez enlever au membre choisi` },
  { type: 14, divider: true },
  {
  type: 1,
  components: [{
  type: 3,
  custom_id: customId,
  placeholder: 'Choisir des r\u00f4les',
  options,
  min_values: 1,
  max_values: Math.min(options.length, 25)
  }]
  }
  ]
  }]
  };
}

module.exports = {
  name: 'delrole',
  async executePrefix(message, args) {
  if (!hasPermissionForCommand(message.member, 'delrole')) {
  return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const member = await resolveMember(message, args[0]);
  if (!member) {
  return message.reply({ ...noCard('Membre non trouv\u00e9'), allowedMentions: { parse: [] }, mentionRepliedUser: false }); } const actor = message.member; const isBuyer = isBotOwner(message.author.id); const maxPos = (message.author.id == message.guild.ownerId || isBuyer) ? Infinity : actor.roles.highest.position;
  const roles = member.roles.cache
  .filter((role) => role.id != message.guild.id)
  .filter((role) => role.position < maxPos)
  .filter((role) => !role.managed)
  .map((role) => role);

  if (!roles.length) {
  return message.reply({ ...noCard('Aucun r\u00f4le \u00e0 retirer'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const customId = `delrole_select_${member.id}_${message.author.id}`;
  const card = buildRolesCard(`Retirer des r\u00f4les \u00e0 ${member.user.tag}`, roles, customId);
  return message.reply({ ...card, allowedMentions: { parse: [] }, mentionRepliedUser: false });
  },
  async handleMenu(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  const parts = interaction.customId.split('_');
  if (parts[0] != 'delrole' || parts[1] != 'select') return;

  const targetId = parts[2];
  const actorId = parts[3];
  if (interaction.user.id != actorId) {
  return interaction.reply({ content: "<:non:1519424807580733635> Vous n'\u00eates pas l'auteur de cette commande", flags: 64, allowedMentions: { parse: [] } });
  }

  const member = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!member) {
  return interaction.update({ ...noCard('Membre non trouv\u00e9'), allowedMentions: { parse: [] } });
  }

  const actor = await interaction.guild.members.fetch(actorId).catch(() => null);
  if (!actor) {
  return interaction.update({ ...noCard('Auteur introuvable'), allowedMentions: { parse: [] } }); } const isBuyer = isBotOwner(actor.id); const maxPos = (actor.id == interaction.guild.ownerId || isBuyer) ? Infinity : actor.roles.highest.position;
  const roleIds = interaction.values.filter((roleId) => {
  const role = interaction.guild.roles.cache.get(roleId);
  return role && role.position < maxPos && !role.managed;
  });

  if (!roleIds.length) {
  return interaction.update({ ...noCard('Aucun r\u00f4le valide'), allowedMentions: { parse: [] } });
  }

  try {
  await member.roles.remove(roleIds, `Delrole par ${actor.user.tag}`);
  } catch {
  return interaction.update({ ...noCard("Je n'ai pas la permission de modifier les r\u00f4les"), allowedMentions: { parse: [] } }); } const roleLabels = roleIds.map((roleId) => `<@&${roleId}>`).join(', '); const card = yesCard(`R\u00f4les retir\u00e9s \u00e0 ${member} : ${roleLabels}`);
  return interaction.update({ ...card, allowedMentions: { parse: [] } });
  }
};
