const Discord = require('discord.js');

const MAX_FILE_SIZE = 24 * 1024 * 1024;
const MAX_FILES = 8;

function sanitizeFilename(name, fallback = 'file') {
  return String(name || fallback)
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 90) || fallback;
}

function getAttachmentUrl(attachment) {
  return attachment?.url || attachment?.proxyURL || null;
}

function getAttachmentName(attachment, index, prefix) {
  const extension = String(attachment?.contentType || '').split('/')[1]?.split(';')[0];
  const fallback = extension ? `${prefix}-${index + 1}.${extension}` : `${prefix}-${index + 1}`;
  return sanitizeFilename(attachment?.name, fallback);
}

async function createAttachmentFile(attachment, index, prefix = 'message-file') {
  const url = getAttachmentUrl(attachment);
  if (!url) return null;
  if (attachment.size && attachment.size > MAX_FILE_SIZE) return null;

  const response = await fetch(url).catch(() => null);
  if (!response?.ok) return null;

  const arrayBuffer = await response.arrayBuffer().catch(() => null);
  if (!arrayBuffer || arrayBuffer.byteLength > MAX_FILE_SIZE) return null;

  const name = getAttachmentName(attachment, index, prefix);
  return {
    name,
    attachment: new Discord.AttachmentBuilder(Buffer.from(arrayBuffer), {
      name,
      description: attachment?.description || undefined,
    }),
  };
}

async function createMessageAttachmentFiles(messages, options = {}) {
  const list = Array.isArray(messages) ? messages : [messages].filter(Boolean);
  const limit = Math.min(options.limit || MAX_FILES, MAX_FILES);
  const files = [];
  const seenUrls = new Set();
  const seenNames = new Set();

  for (const message of list) {
    for (const attachment of message?.attachments?.values?.() || []) {
      if (files.length >= limit) return files;
      const url = getAttachmentUrl(attachment);
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);

      const file = await createAttachmentFile(
        attachment,
        files.length,
        options.prefix || `message-${message?.id || 'deleted'}`,
      );
      if (file) {
        const baseName = file.name;
        let nextName = baseName;
        let suffix = 2;
        while (seenNames.has(nextName)) {
          const dotIndex = baseName.lastIndexOf('.');
          nextName = dotIndex > 0
            ? `${baseName.slice(0, dotIndex)}-${suffix}${baseName.slice(dotIndex)}`
            : `${baseName}-${suffix}`;
          suffix += 1;
        }
        seenNames.add(nextName);
        file.name = nextName;
        file.attachment.setName(nextName);
        files.push(file);
      }
    }
  }

  return files;
}

function addFileComponents(container, files) {
  for (const file of files || []) {
    container.addFileComponents(
      new Discord.FileBuilder().setURL(`attachment://${file.name}`),
    );
  }

  return container;
}

module.exports = {
  addFileComponents,
  createMessageAttachmentFiles,
};
