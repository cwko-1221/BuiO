'use strict';

/**
 * One answer to "what may this student be asked, and what may they see?".
 *
 * The grade curriculum and the teacher's tier/topic switches have to agree across
 * the quiz engine, the tag picker and every stats endpoint — a child locked out
 * of 鑽石 questions must also stop seeing a 鑽 radar. Resolving this in one place
 * keeps those surfaces from drifting apart.
 */

const users = require('../repositories/users.repo');
const tierPolicy = require('../repositories/tier-policy.repo');
const questionTypePolicy = require('../repositories/question-type-policy.repo');
const topicPolicy = require('../repositories/topic-policy.repo');
const { tagsForScope } = require('./classTags');

async function scopeForStudent(studentId) {
  const u = await users.findByIdSummary(studentId);
  const classname = u?.classname || '';
  const mathGroup = u?.mathgroup || '';
  const [disabledTiers, topicRule] = await Promise.all([
    tierPolicy.disabledTiersFor(classname, mathGroup),
    topicPolicy.ruleFor(classname, mathGroup),
  ]);
  const disabledQuestionTypes = topicRule.configured
    ? []
    : await questionTypePolicy.disabledQuestionTypesFor(classname, mathGroup);
  const baseTags = tagsForScope(classname, disabledTiers, disabledQuestionTypes);
  const disabledTags = new Set(topicRule.disabledTags);
  const topicFilteredTags = topicRule.configured
    ? baseTags.filter(tag => !disabledTags.has(tag))
    : baseTags;
  return {
    classname,
    mathGroup,
    disabledTiers,
    disabledQuestionTypes,
    disabledTags: topicRule.disabledTags,
    topicPolicyConfigured: topicRule.configured,
    // Guard against stale/hand-edited policy data locking a student out.
    tags: topicFilteredTags.length ? topicFilteredTags : baseTags,
  };
}

module.exports = { scopeForStudent };
