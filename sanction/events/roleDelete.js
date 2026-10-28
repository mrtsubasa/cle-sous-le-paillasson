const { cleanUpRoles } = require('../utils/roleCleanup');

module.exports = {
  name: 'roleDelete',
  async execute(role) {
  cleanUpRoles(role.guild);
  }
};
