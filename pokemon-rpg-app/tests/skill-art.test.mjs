import test from 'node:test';
import assert from 'node:assert/strict';
import {getSkillArt,getEnabledSkillArt} from '../src/data/skillArt.mjs';

test('named approved strike cannot leak into another move sharing its vfx key',()=>{
  assert.ok(getSkillArt('thunder_bolt','thunderbolt').src.includes('thunder-bolt-v1'));
  assert.equal(getSkillArt('thunder_bolt','volt_tackle').delivery,'charge','Approved body charge keeps its own delivery');
  assert.equal(getSkillArt('thunder_bolt'),undefined,'The shared family key alone cannot pick the wrong move profile');
  assert.equal(getSkillArt('fire_wheel','flame_wheel').fitCaster,true,'Reviewed charge family uses actual caster extent');
  assert.equal(getSkillArt('water_jet','water_gun'),undefined,'Unreviewed water trial remains outside the main registry');
  assert.ok(Object.values(getEnabledSkillArt()).some(a=>a.src.includes('thunder-bolt-v1')));
});

test('explicit localhost trial distinguishes vertical strike from electric charge',()=>{
  const previous=globalThis.location;
  try{
    globalThis.location={hostname:'localhost',pathname:'/pokemon-rpg/preview',search:'?skill-trial=effects-v2'};
    assert.equal(getSkillArt('thunder_bolt','thunderbolt').delivery,'strike');
    const charge=getSkillArt('thunder_bolt','volt_tackle');
    assert.equal(charge.delivery,'charge');assert.equal(charge.actorMotion,'charge');
    assert.ok(charge.src.includes('electric-charge'));
    globalThis.location={...globalThis.location,hostname:'example.com'};
    assert.equal(getSkillArt('thunder_bolt','volt_tackle').delivery,'charge','Approved named move is available outside the local trial');
    assert.equal(getSkillArt('water_jet','water_gun'),undefined,'Remote hosts cannot activate unfinished family art');
  }finally{if(previous===undefined)delete globalThis.location;else globalThis.location=previous;}
});
