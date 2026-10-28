const ms = require('ms');

const UNIT_TO_MS = {
  ms: 1,
  msec: 1,
  milliseconde: 1,
  millisecondes: 1,
  s: 1000,
  sec: 1000,
  secs: 1000,
  seconde: 1000,
  secondes: 1000,
  m: 60 * 1000,
  min: 60 * 1000,
  mins: 60 * 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  h: 60 * 60 * 1000,
  hr: 60 * 60 * 1000,
  hrs: 60 * 60 * 1000,
  heure: 60 * 60 * 1000,
  heures: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  j: 24 * 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  jour: 24 * 60 * 60 * 1000,
  jours: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
  semaine: 7 * 24 * 60 * 60 * 1000,
  semaines: 7 * 24 * 60 * 60 * 1000,
  mo: 30 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  months: 30 * 24 * 60 * 60 * 1000,
  mois: 30 * 24 * 60 * 60 * 1000,
  y: 365 * 24 * 60 * 60 * 1000,
  yr: 365 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
  years: 365 * 24 * 60 * 60 * 1000,
  an: 365 * 24 * 60 * 60 * 1000,
  ans: 365 * 24 * 60 * 60 * 1000,
  année: 365 * 24 * 60 * 60 * 1000,
  années: 365 * 24 * 60 * 60 * 1000,
};

const TOKEN_REGEX = /(\d+(?:[.,]\d+)?)\s*(millisecondes?|msec|ms|secondes?|secs?|sec|minutes?|mins?|min|heures?|hrs?|hr|jours?|days?|day|semaines?|weeks?|week|months?|month|mois|années?|annees?|année|annee|ans?|an|yr|years?|year|mo|w|h|d|j|m|s|y)/iy;

function normalizeDurationInput(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/,/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDuration(value) {
  const input = normalizeDurationInput(value);
  if (!input) return false;

  const direct = ms(input);
  if (direct && !Number.isNaN(direct)) {
    return direct;
  }

  let total = 0;
  let cursor = 0;

  while (cursor < input.length) {
    while (cursor < input.length && /[\s,+-]/.test(input[cursor])) {
      cursor += 1;
    }

    if (cursor >= input.length) {
      break;
    }

    TOKEN_REGEX.lastIndex = cursor;
    const match = TOKEN_REGEX.exec(input);
    if (!match || match.index !== cursor) {
      return false;
    }

    const amount = Number.parseFloat(match[1]);
    const unit = match[2];
    const factor = UNIT_TO_MS[unit];

    if (!Number.isFinite(amount) || !factor) {
      return false;
    }

    total += amount * factor;
    cursor = TOKEN_REGEX.lastIndex;
  }

  return total > 0 ? Math.floor(total) : false;
}

module.exports = parseDuration;
