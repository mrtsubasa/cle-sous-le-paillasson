const Discord = require('discord.js');
const {
  getMessageEmbedDeleteWebhookUrl,
  getMessageLogTarget,
} = require('../Utils/logsGuildConfig');
const {
  addFileComponents,
  createMessageAttachmentFiles,
} = require('../Utils/messageFileLogs');

function cleanBlock(value) {
  const text = String(value || '').replace(/```/g, "'''").trim();
  return text || 'Aucun contenu disponible';
}

function cutBlock(value, max = 1700) {
  const text = cleanBlock(value);
  return text.length > max ? `${text.slice(0, max - 20)}\n... contenu coupe` : text;
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractUrls(text) {
  return String(text || '').match(/https?:\/\/[^\s<>()]+/gi) || [];
}

function getMessageLinks(message) {
  const links = [];

  for (const attachment of message.attachments?.values?.() || []) {
    links.push(attachment.url, attachment.proxyURL);
  }

  for (const sticker of message.stickers?.values?.() || []) {
    links.push(sticker.url);
  }

  for (const embed of message.embeds || []) {
    links.push(
      embed.url,
      embed.image?.url,
      embed.thumbnail?.url,
      embed.video?.url,
      embed.author?.url,
      embed.provider?.url,
      embed.footer?.iconURL,
      embed.author?.iconURL,
    );
  }

  links.push(...extractUrls(message.content));

  return uniq(links);
}

function formatChannel(channel) {
  return channel?.name ? `\`${channel.name}\`` : '`salon inconnu`';
}

function cloneButton(component) {
  const button = {
    type: component.type,
    style: component.style,
    label: component.label,
    emoji: component.emoji,
  };

  if (component.url) {
    button.url = component.url;
  } else if (component.custom_id || component.customId) {
    button.custom_id = component.custom_id || component.customId;
    button.disabled = true;
  }

  if (component.sku_id || component.skuId) button.sku_id = component.sku_id || component.skuId;

  return Object.fromEntries(Object.entries(button).filter(([, value]) => value !== undefined));
}

function cloneSelect(component) {
  const select = {
    type: component.type,
    custom_id: component.custom_id || component.customId,
    placeholder: component.placeholder,
    min_values: component.min_values ?? component.minValues,
    max_values: component.max_values ?? component.maxValues,
    options: component.options,
    channel_types: component.channel_types || component.channelTypes,
    default_values: component.default_values || component.defaultValues,
    disabled: true,
  };

  return Object.fromEntries(Object.entries(select).filter(([, value]) => value !== undefined));
}

function cloneComponent(component) {
  const data = typeof component.toJSON === 'function' ? component.toJSON() : component;

  if (data.type === 2) return cloneButton(data);
  if ([3, 5, 6, 7, 8].includes(data.type)) return cloneSelect(data);

  return null;
}

function cloneMessageComponents(message) {
  return (message.components || [])
    .slice(0, 5)
    .map((row) => {
      const data = typeof row.toJSON === 'function' ? row.toJSON() : row;
      return {
        type: data.type,
        components: (data.components || []).map(cloneComponent).filter(Boolean),
      };
    })
    .filter((row) => row.components?.length);
}

function buildDeleteLog(message, files = []) {
  const timestamp = Math.floor(Date.now() / 1000);
  const author = message.author?.id ? `<@${message.author.id}>` : 'Utilisateur inconnu';
  const channel = formatChannel(message.channel);
  const links = getMessageLinks(message);
  const content = message.content || '';
  const extraLinks = links.filter((link) => !content.includes(link));
  const contentParts = [content, ...extraLinks].filter(Boolean);
  const contentText = contentParts.join('\n') || (message.partial ? 'Message partiel, contenu indisponible.' : 'Aucun contenu texte.');

  const container = new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `<:ee:1434328162426294436> ${author} a supprimé son message dans ${channel} !\n\n- Contenu :\n\`\`\`\n${cutBlock(contentText)}\n\`\`\``,
      ),
    ); 

  if (files.length) {
    container
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('- Fichier(s) :'),
      );
    addFileComponents(container, files);
  }

  return container
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

function buildEmbedDeletePayload(message) {
  const author = message.author?.id ? `<@${message.author.id}>` : 'Utilisateur inconnu';
  const channel = formatChannel(message.channel);
  const headerEmbed = new Discord.EmbedBuilder()
    .setColor(0x2b2d31)
    .setDescription(`<:ee:1434328162426294436> Un embed de ${author} a été supprimé dans ${channel} !`);
  const embeds = (message.embeds || [])
    .slice(0, 9)
    .map((embed) => Discord.EmbedBuilder.from(embed));
  const components = cloneMessageComponents(message);

  return {
    embeds: [headerEmbed, ...embeds],
    components,
    allowedMentions: { parse: [] },
  };
}

async function sendEmbedDeleteLog(bot, message) {
  if (!message.author?.bot || !message.embeds?.length) return false;

  const route = bot.db
    ?.prepare(`
      SELECT *
      FROM guilds
      WHERE mainLogsGuildId = ?
        AND secondaryLogsGuildId IS NOT NULL
        AND TRIM(secondaryLogsGuildId) != ''
      LIMIT 1
    `)
    .get(message.guild.id);
  const webhookUrl = getMessageEmbedDeleteWebhookUrl(bot, route?.secondaryLogsGuildId)
    || getMessageEmbedDeleteWebhookUrl(bot, route?.id)
    || getMessageEmbedDeleteWebhookUrl(bot, message.guild.id);
  if (!webhookUrl) return true;

  const payload = buildEmbedDeletePayload(message);

  const webhook = new Discord.WebhookClient({ url: webhookUrl });
  await webhook.send(payload).catch((error) => {
    console.error(`Erreur webhook embed delete : ${error?.message || error}`);
    if (payload.components?.length) {
      return webhook.send({ ...payload, components: [] }).catch((fallbackError) => {
        console.error(`Erreur webhook embed delete fallback : ${fallbackError?.message || fallbackError}`);
      });
    }
  });

  return true;
}

module.exports = {
  name: 'messageDelete',
  async execute(message, bot) {
    if (!message?.guild || !message.channel) return;
    if (await sendEmbedDeleteLog(bot, message)) return;
    if (message.author?.bot) return;

    const target = getMessageLogTarget(bot, message.guild.id, 'delete');
    if (!target) return;

    const destinationGuild = bot.guilds.cache.get(target.secondaryGuildId)
      || await bot.guilds.fetch(target.secondaryGuildId).catch(() => null);
    if (!destinationGuild) return;

    const logChannel = destinationGuild.channels.cache.get(target.channelId)
      || await destinationGuild.channels.fetch(target.channelId).catch(() => null);
    if (!logChannel?.isTextBased?.()) return;

    const files = await createMessageAttachmentFiles(message, {
      prefix: `message-delete-${message.id || Date.now()}`,
    });

    await logChannel.send({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [buildDeleteLog(message, files)],
      files: files.map((file) => file.attachment),
      allowedMentions: { parse: [] },
    }).catch((error) => {
      console.error(`Erreur log message delete : ${error?.message || error}`);
    });
  },
};
