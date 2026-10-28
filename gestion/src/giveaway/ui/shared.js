const {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} = require('discord.js');
const { SEPARATOR_SPACING } = require('../config/constants');

function createSeparator() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SEPARATOR_SPACING);
}

function createText(content) {
  return new TextDisplayBuilder().setContent(normalizeSimpleText(content));
}

function quoteContainerBody(body) {
  return normalizeSimpleText(body)
    .split('\n')
    .map((line) => (line.trim().length ? `> ${line}` : '>'))
    .join('\n');
}

function createContainer(title, body) {
  return new ContainerBuilder()
    .addTextDisplayComponents(createText(`## ${title}`))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createText(quoteContainerBody(body)));
}

function buildView(container, controls = []) {
  return {
    components: [container, ...controls],
  };
}

function buildSimpleSectionView(text) {
  return {
    components: [createSeparator(), createText(ensureQuotedText(text)), createSeparator()],
  };
}

function applyV2Flags(view, { ephemeral = false } = {}) {
  let flags = MessageFlags.IsComponentsV2;

  if (ephemeral) {
    flags |= MessageFlags.Ephemeral;
  }

  return {
    ...view,
    flags,
    allowedMentions: { parse: [], repliedUser: false }
  };
}

function simpleContent(content, ephemeral = true) {
  return applyV2Flags(buildSimpleSectionView(content), { ephemeral });
}

function normalizeSimpleText(content) {
  return String(content || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|[^\d])\.(?=\s|$)/g, '$1').replace(/\s+$/g, ''))
    .join('\n')
    .trim();
}

function ensureQuotedText(content) {
  const safe = normalizeSimpleText(content);
  if (!safe) return '> Y a une erreur hhh';

  return safe
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '>';
      return trimmed.startsWith('>') ? trimmed : `> ${trimmed}`;
    })
    .join('\n');
}

module.exports = {
  applyV2Flags,
  buildSimpleSectionView,
  buildView,
  createContainer,
  createSeparator,
  createText,
  simpleContent,
};
