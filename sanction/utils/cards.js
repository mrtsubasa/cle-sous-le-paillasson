const emojis = require('./emojis');

function createCard(content) {
  return {
  flags: 32768,
  components: [
  {
  type: 17,
  components: [{ type: 10, content }]
  }
  ]
  };
}

function normalizeMessage(message) {
  return String(message).replace(/\.\s*$/, '');
}

function yesCard(message) {
  return createCard(`${emojis.oui} ${normalizeMessage(message)}`);
}

function noCard(message) {
  return createCard(`*${emojis.non} ${normalizeMessage(message)}*`);
}

function permissionCard() {
  return noCard("Vous n'avez pas la permission d'utiliser cette commande");
}

module.exports = {
  createCard,
  yesCard,
  noCard,
  permissionCard
};
