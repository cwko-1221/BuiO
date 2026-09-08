'use strict';

/**
 * One answer to "what may this student be asked, and what may they see?".
 *
 * The grade curriculum and the teacher's tier switches have to agree across the
 * quiz engine, the tag picker and every stats endpoint — a child locked out of
 * 鑽石 questions must also stop seeing a 鑽 radar. Resolving both in one place is
 * what keeps those two from drifting apart.
 */

const users = require('../repositories/users.repo');
const tierPolicy = require('../repositories/tier-policy.repo');
const { tagsForScope } = require('./classTags');

async function scopeForStudent(studentId) {
  const u = await users.findByIdSummary(studentId);
  const classname = u?.classname || '';
  const mathGroup = u?.mathgroup || '';
  const disabledTiers = await tierPolicy.disabledTiersFor(classname, mathGroup);
  return { classname, mathGroup, disabledTiers, tags: tagsForScope(classname, disabledTiers) };
}

module.exports = { scopeForStudent };
