const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { createId, createShortCode } = require('../utils/ids');
const { parseDurationInput } = require('../utils/duration');
const { buildGiveawayDraftView } = require('../ui/giveawayViews');
const { applyV2Flags, buildView, createContainer, simpleContent } = require('../ui/shared');

class GiveawayCreationManager {
  constructor(storage, giveawayManager) {
    this.storage = storage;
    this.giveawayManager = giveawayManager;
    this.sessions = new Map();
  }

  clearUserSessions(guildId, userId) {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.guildId === guildId && session.userId === userId) {
        this.sessions.delete(sessionId);
      }
    }
  }

  createSession(guildId, userId, channelId) {
    this.clearUserSessions(guildId, userId);

    const session = {
      id: createId('draft'),
      guildId,
      userId,
      channelId,
      prize: '',
      winnerCount: 1,
      durationMs: 60 * 60 * 1000,
      durationInput: '1h',
      mode: 'BUTTON',
      joinText: `participer ${createShortCode(6)}`,
      forcedWinnerIds: [],
      createdAt: Date.now(),
    };

    this.sessions.set(session.id, session);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) ?? null;
  }

  deleteSession(sessionId) {
    this.sessions.delete(sessionId);
  }

  hasAccess(interaction, session) {
    return Boolean(session) && session.userId === interaction.user.id && session.guildId === interaction.guildId;
  }

  async updateDraft(interaction, session) {
    const guildConfig = await this.storage.getGuildConfig(session.guildId);
    await interaction.update(buildGiveawayDraftView(session, guildConfig));
  }

  buildSimpleView(title, body) {
    return buildView(createContainer(title, body));
  }

  buildModal(type, session) {
    const modal = new ModalBuilder().setCustomId(`gcfg:modal:${type}:${session.id}`);
    const input = new TextInputBuilder().setCustomId('value').setStyle(TextInputStyle.Short);

    if (type === 'prize') {
      modal.setTitle('Prix');
      input.setLabel('Prix').setPlaceholder('Exemple : Nitro 1 mois').setRequired(true).setValue(session.prize);
    }

    if (type === 'winners') {
      modal.setTitle('Gagnants');
      input
        .setLabel('Nombre de gagnants')
        .setPlaceholder('Exemple : 2')
        .setRequired(true)
        .setValue(String(session.winnerCount));
    }

    if (type === 'duration') {
      modal.setTitle('Duree');
      input
        .setLabel('Duree')
        .setPlaceholder('Exemple : 30s, 15m, 2h')
        .setRequired(true)
        .setValue(session.durationInput);
    }

    if (type === 'text') {
      modal.setTitle('Texte');
      input
        .setLabel('Texte de participation')
        .setPlaceholder('Exemple : participer abc123')
        .setRequired(true)
        .setValue(session.joinText);
    }

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return modal;
  }

  async start(interaction) {
    const session = this.createSession(interaction.guildId, interaction.user.id, interaction.channelId);
    const guildConfig = await this.storage.getGuildConfig(interaction.guildId);
    await interaction.reply(applyV2Flags(buildGiveawayDraftView(session, guildConfig), { ephemeral: true }));
  }

  async handleSelect(interaction, action, sessionId) {
    const session = this.getSession(sessionId);

    if (!this.hasAccess(interaction, session)) {
      await interaction.reply(simpleContent('> Session giveaway invalide'));
      return true;
    }

    if (action === 'edit') {
      const selection = interaction.values[0];

      if (selection === 'publish') {
        if (!session.prize.trim()) {
          await interaction.reply(simpleContent('> Le prix est obligatoire'));
          return true;
        }

        let giveaway;

        try {
          giveaway = await this.giveawayManager.createGiveaway(session);
        } catch {
          await interaction.reply(simpleContent('> Impossible d envoyer le giveaway dans ce salon'));
          return true;
        }

        this.deleteSession(sessionId);
        await interaction.update(this.buildSimpleView('Giveaway', `Giveaway publie dans <#${giveaway.channelId}>.`));
        return true;
      }

      if (selection === 'cancel') {
        this.deleteSession(sessionId);
        await interaction.update(this.buildSimpleView('Giveaway', 'Creation annulee.'));
        return true;
      }

      await interaction.showModal(this.buildModal(selection, session));
      return true;
    }

    if (action === 'mode') {
      session.mode = interaction.values[0];
      await this.updateDraft(interaction, session);
      return true;
    }

    if (action === 'channel') {
      session.channelId = interaction.values[0];
      await this.updateDraft(interaction, session);
      return true;
    }

    if (action === 'forced') {
      session.forcedWinnerIds = [...interaction.values];
      await this.updateDraft(interaction, session);
      return true;
    }

    return false;
  }

  async handleModal(interaction, type, sessionId) {
    const session = this.getSession(sessionId);

    if (!this.hasAccess(interaction, session)) {
      await interaction.reply(simpleContent('> Session giveaway invalide'));
      return true;
    }

    const value = interaction.fields.getTextInputValue('value').trim();

    if (type === 'prize') {
      session.prize = value.slice(0, 100);
      await this.updateDraft(interaction, session);
      return true;
    }

    if (type === 'winners') {
      const winnerCount = Number(value);

      if (!Number.isInteger(winnerCount) || winnerCount <= 0 || winnerCount > 50) {
        await interaction.reply(simpleContent('> Nombre de gagnants invalide'));
        return true;
      }

      session.winnerCount = winnerCount;
      await this.updateDraft(interaction, session);
      return true;
    }

    if (type === 'duration') {
      const parsed = parseDurationInput(value);

      if (!parsed) {
        await interaction.reply(simpleContent('> Duree invalide. Utilise 30s, 15m ou 2h'));
        return true;
      }

      session.durationInput = parsed.input;
      session.durationMs = parsed.ms;
      await this.updateDraft(interaction, session);
      return true;
    }

    if (type === 'text') {
      if (!value.length) {
        await interaction.reply(simpleContent('> Texte de participation invalide'));
        return true;
      }

      session.joinText = value.slice(0, 80);
      await this.updateDraft(interaction, session);
      return true;
    }

    return false;
  }

  async handleInteraction(interaction) {
    const customId = interaction.customId;

    if (!customId || !customId.startsWith('gcfg:')) {
      return false;
    }

    const parts = customId.split(':');

    if (parts[1] === 'modal' && interaction.isModalSubmit()) {
      return this.handleModal(interaction, parts[2], parts[3]);
    }

    if (interaction.isAnySelectMenu()) {
      return this.handleSelect(interaction, parts[1], parts[2]);
    }

    return false;
  }
}

module.exports = GiveawayCreationManager;
