function extractMemberId(input) {
  if (!input) return null;
  const id = String(input).replace(/[<@!>]/g, '').trim();
  if (!/^\d{17,20}$/.test(id)) return null;
  return id;
}

function extractRoleId(input) {
  if (!input) return null;
  const id = String(input).replace(/[<@&>]/g, '').trim();
  if (!/^\d{17,20}$/.test(id)) return null;
  return id;
}

function normalizeRoleName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/<a?:\w+:\d+>/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

async function resolveMember(message, input) {
  if (!message || !message.guild) return null;

  if (message.mentions && message.mentions.members && message.mentions.members.first()) {
    return message.mentions.members.first();
  }

  if (message.reference && message.reference.messageId && message.channel) {
    const cached = message.channel.messages.cache.get(message.reference.messageId);
    if (cached && cached.member) return cached.member;

    const fetched = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    if (fetched && fetched.member) return fetched.member;
  }

  const id = extractMemberId(input);
  if (id) {
    const cachedMember = message.guild.members.cache.get(id);
    if (cachedMember) return cachedMember;

    return message.guild.members.fetch(id).catch(() => null);
  }

  const raw = String(input || '').trim();
  if (!raw) return null;
  const target = raw.toLowerCase();

  const fromCache = message.guild.members.cache.find((member) => {
    const username = String(member.user && member.user.username ? member.user.username : '').toLowerCase();
    const tag = String(member.user && member.user.tag ? member.user.tag : '').toLowerCase();
    const display = String(member.displayName || '').toLowerCase();
    return username == target || tag == target || display == target;
  });
  if (fromCache) return fromCache;

  const searched = await message.guild.members.search({ query: raw, limit: 25 }).catch(() => null);
  if (searched && searched.size) {
    const exact = searched.find((member) => {
      const username = String(member.user && member.user.username ? member.user.username : '').toLowerCase();
      const tag = String(member.user && member.user.tag ? member.user.tag : '').toLowerCase();
      const display = String(member.displayName || '').toLowerCase();
      return username == target || tag == target || display == target;
    });
    if (exact) return exact;
  }

  return null;
}

function resolveChannel(message, input) {
  if (!input) return null;
  const mention = message.mentions.channels.first();
  if (mention) return mention;
  const id = input.replace(/[<#>]/g, '');
  return message.guild.channels.cache.get(id) || null;
}

async function resolveRole(message, input) {
  if (!message || !message.guild || !input) return null;

  const mention = message.mentions.roles.first();
  if (mention) return mention;

  const id = extractRoleId(input);
  if (id) {
    const cachedRole = message.guild.roles.cache.get(id);
    if (cachedRole) return cachedRole;

    const fetchedRole = await message.guild.roles.fetch(id).catch(() => null);
    if (fetchedRole) return fetchedRole;
  }

  const raw = String(input || '').trim();
  if (!raw) return null;

  const lowered = raw.toLowerCase();
  const normalizedInput = normalizeRoleName(raw);
  if (!normalizedInput) return null;

  const roles = Array.from(message.guild.roles.cache.values())
    .sort((a, b) => b.position - a.position);

  const exactByName = roles.find((role) => String(role.name || '').toLowerCase() === lowered);
  if (exactByName) return exactByName;

  return roles.find((role) => normalizeRoleName(role.name) === normalizedInput) || null;
}

module.exports = {
  resolveMember,
  resolveChannel,
  resolveRole
};
