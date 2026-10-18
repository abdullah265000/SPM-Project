const { z } = require('zod');

// Role constants — single source of truth used by middleware + routes.
const ROLES = Object.freeze({
  MEMBER: 'member',
  TRAINER: 'trainer',
  MANAGEMENT: 'management',
  ADMIN: 'admin',
});

const roleEnum = z.enum([ROLES.MEMBER, ROLES.TRAINER, ROLES.MANAGEMENT, ROLES.ADMIN]);

module.exports = { ROLES, roleEnum };
