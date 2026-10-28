const { ButtonStyle, ChannelType, SeparatorSpacingSize } = require('discord.js');

const DEFAULT_GLOBAL_DATA = () => ({
  owners: [],
});

const DEFAULT_GUILD_CONFIG = () => ({
  allowedRoleIds: [],
  allowedCategoryId: null,
  requiredCustomStatus: null,
  blacklistUserIds: [],
  activeGiveawayIds: [],
});

const DEFAULT_GIVEAWAYS_DATA = () => ({
  records: {},
});

const GIVEAWAY_MODE_OPTIONS = [
  {
    value: 'BUTTON',
    label: 'Bouton',
    description: 'Participation par bouton.',
  },
  {
    value: 'TEXT',
    label: 'Texte',
    description: 'Participation par texte personnalise.',
  },
  {
    value: 'REACTION',
    label: 'Reaction',
    description: 'Participation par reaction.',
  },
];

const GIVEAWAY_MODE_LABELS = {
  BUTTON: 'Bouton',
  TEXT: 'Texte',
  REACTION: 'Reaction',
};

const GIVEAWAY_REACTION_SYMBOL = '\u2713';

const CUSTOM_IDS = {
  PANEL_ROLES: 'panel:roles',
  PANEL_CATEGORY: 'panel:category',
  PANEL_STATUS_EDIT: 'panel:status_edit',
  PANEL_STATUS_MODAL: 'panel:modal:status',
  PANEL_CLEAR_ROLES: 'panel:clear_roles',
  PANEL_CLEAR_CATEGORY: 'panel:clear_category',
  PANEL_CLEAR_STATUS: 'panel:clear_status',
  PANEL_REFRESH: 'panel:refresh',
  OWNER_ADD: 'owner:add',
  OWNER_REMOVE: 'owner:remove',
  OWNER_REFRESH: 'owner:refresh',
};

const BUTTONS = {
  SECONDARY: ButtonStyle.Secondary,
};

const SELECT_CHANNEL_TYPES = [ChannelType.GuildCategory];
const GIVEAWAY_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

const SEPARATOR_SPACING = SeparatorSpacingSize.Small;

module.exports = {
  BUTTONS,
  CUSTOM_IDS,
  DEFAULT_GLOBAL_DATA,
  DEFAULT_GIVEAWAYS_DATA,
  DEFAULT_GUILD_CONFIG,
  GIVEAWAY_CHANNEL_TYPES,
  GIVEAWAY_MODE_LABELS,
  GIVEAWAY_MODE_OPTIONS,
  GIVEAWAY_REACTION_SYMBOL,
  SELECT_CHANNEL_TYPES,
  SEPARATOR_SPACING,
};
