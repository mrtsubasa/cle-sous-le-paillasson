function parseDurationInput(input) {
  if (!input) {
    return null;
  }

  const normalized = input.trim().toLowerCase();
  const match = normalized.match(/^(\d+)\s*([smh])$/);

  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  const unit = match[2];

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
  };

  return {
    input: `${value}${unit}`,
    value,
    unit,
    ms: value * multipliers[unit],
  };
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];

  if (hours) {
    parts.push(`${hours} h`);
  }

  if (minutes) {
    parts.push(`${minutes} m`);
  }

  if (seconds || parts.length === 0) {
    parts.push(`${seconds} s`);
  }

  return parts.join(' ');
}

module.exports = {
  formatDuration,
  parseDurationInput,
};
