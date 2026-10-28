const { getMemberCustomStatus, normalizeStatusText } = require('../utils/formatters');

class EligibilityService {
  constructor(storage) {
    this.storage = storage;
  }

  matchesCustomStatus(member, requiredCustomStatus) {
    if (!requiredCustomStatus?.trim()) {
      return true;
    }

    const memberStatus = getMemberCustomStatus(member);

    if (!memberStatus) {
      return false;
    }

    return normalizeStatusText(memberStatus) === normalizeStatusText(requiredCustomStatus);
  }

  checkJoin(member, guildConfig) {
    if (!member) {
      return {
        ok: false,
        message: '> Utilisateur introuvable',
      };
    }

    if (member.user.bot) {
      return {
        ok: false,
        message: '> Les bots ne peuvent pas participer',
      };
    }

    if (guildConfig.blacklistUserIds.includes(member.id)) {
      return {
        ok: false,
        message: '> Utilisateur blacklist',
      };
    }

    return {
      ok: true,
      message: '> Giveaway rejoint',
    };
  }

  checkFinal(member, guildConfig) {
    const joinCheck = this.checkJoin(member, guildConfig);

    if (!joinCheck.ok) {
      return joinCheck;
    }

    if (!this.matchesCustomStatus(member, guildConfig.requiredCustomStatus)) {
      return {
        ok: false,
        message: '> Statut non valide',
      };
    }

    return {
      ok: true,
      message: '> Giveaway rejoint',
    };
  }

  checkMember(member, guildConfig) {
    return this.checkFinal(member, guildConfig);
  }
}

module.exports = EligibilityService;
