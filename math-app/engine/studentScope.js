'use strict';

/**
 * One answer to "what may this student be asked, and what may they see?".
 *
 * The grade curriculum and the teacher's tier/type switches have to agree across
 * the quiz engine, the tag picker and every stats endpoint — a child locked out
 * of 鑽石 questions must also stop seeing a 鑽 radar. Resolving all three in one
 * place keeps those surfaces from drifting apart.
 */

const users = require('../repositories/users.repo');
const tierPolicy = require('../repositories/tier-policy.repo');
const questionTypePolicy = require('../repositories/question-type-policy.repo');
const { tagsForScope } = require('./classTags');

async function scopeForStudent(studentId) {
  const u = await users.findByIdSummary(studentId);
  const classname = u?.classname || '';
  const mathGroup = u?.mathgroup || '';
  const disabledTiers = await tierPolicy.disabledTiersFor(classname, mathGroup);
  const disabledQuestionTypes = await questionTypePolicy.disabledQuestionTypesFor(classname, mathGroup);
  return {
    classname,
    mathGroup,
    disabledTiers,
    disabledQuestionTypes,
    tags: tagsForScope(classname, disabledTiers, disabledQuestionTypes),
  };
}

module.exports = { scopeForStudent };
