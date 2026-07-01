'use strict';

// Maps a student's classname (P1–P6) to the math tags that are appropriate
// for their grade level. The adaptive engine restricts the question pool
// to these tags for a given student. Tweak here to reshape the curriculum
// without touching engine code.
//
// Tags come from math-app/engine/questionGenerator.js.

const CLASS_TAGS = {
  P1: [
    'add_2d_nc',
    'sub_2d_nc',
  ],
  P2: [
    'add_2d_nc', 'add_2d_c',
    'sub_2d_nc', 'sub_2d_b',
  ],
  P3: [
    'add_2d_nc', 'add_2d_c', 'add_3d_nc',
    'sub_2d_nc', 'sub_2d_b', 'sub_3d_b',
    'mul_2x1',
  ],
  P4: [
    'add_2d_nc', 'add_2d_c', 'add_3d_nc', 'add_3d_c',
    'sub_2d_nc', 'sub_2d_b', 'sub_3d_b', 'sub_3d_z_mid',
    'mul_2x1', 'mul_3x1',
    'div_2d_1d',
  ],
  P5: [
    'add_2d_nc', 'add_2d_c', 'add_3d_nc', 'add_3d_c',
    'sub_2d_nc', 'sub_2d_b', 'sub_3d_b', 'sub_3d_z_mid',
    'mul_2x1', 'mul_3x1', 'mul_2x2_nc_nc',
    'div_2d_1d', 'div_3d_1d_z0_mid', 'div_3d_1d_z0_end',
  ],
  P6: [
    // All tags — full curriculum
    'add_2d_nc', 'add_2d_c', 'add_3d_nc', 'add_3d_c',
    'sub_2d_nc', 'sub_2d_b', 'sub_3d_b', 'sub_3d_z_mid',
    'mul_2x1', 'mul_3x1', 'mul_2x2_nc_nc', 'mul_2x2_c_c',
    'div_2d_1d', 'div_3d_1d_z0_mid', 'div_3d_1d_z0_end', 'div_3d_2d',
  ],
};

const { ALL_TAGS } = require('./questionGenerator');

function normalizeClassname(name) {
  const s = String(name || '').trim().toUpperCase();
  // Accept 'P1', 'P1A', 'P2B' etc — grade is determined by the first two chars.
  const m = s.match(/^P([1-6])/);
  return m ? `P${m[1]}` : null;
}

// Return the allow-list for a given classname. Unknown / graduated / staff →
// fall back to ALL_TAGS so nothing breaks.
function tagsForClass(classname) {
  const grade = normalizeClassname(classname);
  if (grade && CLASS_TAGS[grade]) return CLASS_TAGS[grade];
  return ALL_TAGS;
}

module.exports = { CLASS_TAGS, tagsForClass, normalizeClassname };
