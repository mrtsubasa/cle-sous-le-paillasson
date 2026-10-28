const Discord = require('discord.js');
const buildPanel = require('./buildPanel');

function capitalize(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildExpiredPanel(botId, botName, options = {}) {
  const entityLabel = options.entityLabel || 'bot';
  const title = options.title || `# ${capitalize(entityLabel)} expiré`;
  const displayName = botName && botName !== botId ? botName : botId;
  const container = buildPanel(title, [
    botId
      ? `> **Votre ${entityLabel} ${displayName}** (\`${botId}\`) a expiré`
      : `> **Votre ${entityLabel} a expiré.**`,
    '> *Clique sur le bouton ci-dessous pour ouvrir un ticket*',
  ]);

  container.addActionRowComponents(
    new Discord.ActionRowBuilder().addComponents(
      new Discord.ButtonBuilder()
        .setLabel('Ouvrir un ticket')
        .setStyle(Discord.ButtonStyle.Link)
        .setURL('https://discord.gg/nYApyw6mXR')
        .setEmoji('<:tickets:1503489867961729065>')
    )
  );

  return container;
}

module.exports = buildExpiredPanel;
