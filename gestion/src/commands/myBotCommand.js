const Discord = require('discord.js');

const API_BASE = process.env.BOTS_API_URL || 'http://127.0.0.1:3000';
const API_KEY = process.env.BOTS_API_KEY || '';
const PAGE_SIZE = 5;

function buildPanel(title, lines = [], footer = null) {
  const container = new Discord.ContainerBuilder()
    .addSeparatorComponents(
      new Discord.SeparatorBuilder()
        .setSpacing(Discord.SeparatorSpacingSize.Small)
        .setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(title),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder()
        .setSpacing(Discord.SeparatorSpacingSize.Small)
        .setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(lines.join('\n') || '> Aucun bot trouvé.'),
    );

  if (footer) {
    container
      .addSeparatorComponents(
        new Discord.SeparatorBuilder()
          .setSpacing(Discord.SeparatorSpacingSize.Small)
          .setDivider(true),
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(footer),
      );
  }

  return container;
}

function getAuthorizeLink(botId) {
  if (!/^\d{17,20}$/.test(String(botId || ''))) return null;
  return `https://discord.com/api/oauth2/authorize?client_id=${botId}&permissions=8&scope=bot%20applications.commands`;
}

function formatTime(bot) {
  const unix = Number(bot.time) || Math.floor(Date.now() / 1000);
  return bot.expired ? 'expiré' : `<t:${unix}:R>`;
}

async function fetchMyBots(ownerId) {
  const url = new URL('/bots/list', API_BASE);
  url.searchParams.set('ownerId', String(ownerId));
  url.searchParams.set('page', '1');
  url.searchParams.set('limit', '100');

  const response = await fetch(url, {
    headers: API_KEY ? { 'x-api-key': API_KEY } : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`API indisponible (${response.status}): ${text || response.statusText}`);
  }

  const payload = await response.json();
  return Array.isArray(payload?.data) ? payload.data : [];
}

function formatBotLine(bot, index) {
  const name = Discord.escapeMarkdown(String(bot.name || bot.botId || 'Bot inconnu'));
  const type = Discord.escapeMarkdown(String(bot.type || 'inconnu'));
  const authorizeLink = getAuthorizeLink(bot.botId);
  const label = authorizeLink ? `[**\`${name}\`**](${authorizeLink})` : `**\`${name}\`**`;

  return `\`${index}.\` ${label} (\`${type}\`) : ${formatTime(bot)}`;
}

function buildMyBotView(rows, authorName, page) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageIndex = Math.min(Math.max(page, 1), totalPages);
  const start = (pageIndex - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);
  const lines = pageRows.length
    ? pageRows.map((row, index) => formatBotLine(row, start + index + 1))
    : ['> Aucun bot trouvé.'];
  const footer = totalPages > 1
    ? `**Page**: ${pageIndex}/${totalPages}\n**Total**: ${rows.length} bot${rows.length > 1 ? 's' : ''}`
    : null;
  const container = buildPanel(
    `# Bots de ${Discord.escapeMarkdown(authorName)}`,
    ['> Voici la liste de tes bots', '', ...lines],
    footer,
  );

  if (totalPages > 1) {
    container.addActionRowComponents(
      new Discord.ActionRowBuilder().addComponents(
        new Discord.ButtonBuilder()
          .setCustomId('gestion_mybot_prev')
          .setLabel('⬅')
          .setStyle(Discord.ButtonStyle.Secondary)
          .setDisabled(pageIndex <= 1),
        new Discord.ButtonBuilder()
          .setCustomId('gestion_mybot_next')
          .setLabel('➡')
          .setStyle(Discord.ButtonStyle.Secondary)
          .setDisabled(pageIndex >= totalPages),
      ),
    );
  }

  return { container, totalPages, pageIndex };
}

async function runMyBotCommand(message) {
  try {
    const rows = await fetchMyBots(message.author.id);
    if (!rows.length) {
      return message.reply({
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [buildPanel('# Bots', ['> *Aucun bot trouvé.*'])],
        allowedMentions: { parse: [] },
      });
    }

    let page = 1;
    const render = () => buildMyBotView(rows, message.author.username, page);
    const initial = render();
    const reply = await message.reply({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [initial.container],
      allowedMentions: { parse: [] },
    });

    if (initial.totalPages <= 1) return reply;

    const collector = reply.createMessageComponentCollector({
      time: 300000,
      filter: (interaction) =>
        interaction.user.id === message.author.id
        && ['gestion_mybot_prev', 'gestion_mybot_next'].includes(interaction.customId),
    });

    collector.on('collect', async (interaction) => {
      if (interaction.customId === 'gestion_mybot_prev') {
        page = Math.max(1, page - 1);
      } else {
        page = Math.min(initial.totalPages, page + 1);
      }

      await interaction.deferUpdate().catch(() => null);
      const view = render();
      await reply.edit({
        components: [view.container],
        allowedMentions: { parse: [] },
      }).catch(() => null);
    });

    return reply;
  } catch (error) {
    return message.reply({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [buildPanel('API indisponible', [`> *${error.message || 'Impossible de charger tes bots.'}*`])],
      allowedMentions: { parse: [] },
    });
  }
}

module.exports = { runMyBotCommand };
