import { MATERIALS, materialById } from './data.js';

// A deterministic, qualitative thermal model. Units of time are simulated
// seconds, NOT measured cooking times. Meshes never own scientific state.
export function freshSample(id) {
  const d = materialById[id];
  if (!d) throw new Error('Unknown material');
  return { id, temperature: d.initial, liquid: 0, cooked: 0, burned:0, frozen: 0, location: 'bench', held:false, observations:{hot:null,cold:null},
    elapsed: 0, heated: false, cooled: false, transformedOnce:false, hot: null, cold: null,
    record: null, visits: 0, cycles: 0 };
}
export class ChangeSimulation {
  constructor() { this.samples = Object.fromEntries(MATERIALS.map(d => [d.id, freshSample(d.id)])); this.activeId=null; }
  isSelectable(id) { return !this.activeId || this.activeId===id; }
  move(id, location) {
    if (!['heat', 'cool', 'freeze', 'bench'].includes(location)) throw new Error('Unknown station');
    const sample = this.samples[id];
    if (!sample) throw new Error('Unknown sample');
    if (!this.isSelectable(id)) throw new Error('Complete the active material record first');
    // A station has one safe working position. The previous sample stays warm
    // or cold as it is returned; selecting a new material never resets it.
    const displaced = Object.values(this.samples).find(s => s.id !== id && s.location === location && location !== 'bench');
    if (displaced) displaced.location = 'bench';
    if (sample.location !== location) sample.visits++;
    if (location === 'heat' && sample.cooled && materialById[id].kind!=='burn') { sample.cycles++; sample.cooled = false; sample.heated=false; sample.hot=null; sample.cold=null; sample.record=null; sample.observations={hot:null,cold:null}; }
    if(location!=='bench' && !sample.record) this.activeId=id;
    sample.location = location;
    sample.held=false;
    return displaced?.id ?? null;
  }
  reset(id) { this.samples[id] = freshSample(id); }
  serialize() { return structuredClone({version:1,samples:this.samples,activeId:this.activeId}); }
  restore(saved) {
    if(saved?.version!==1 || !saved.samples || typeof saved.samples!=='object')return false;
    const finite=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
    for(const d of MATERIALS){
      const raw=saved.samples[d.id];if(!raw || raw.id!==d.id)continue;
      if(!finite(raw.temperature,-12,720) || !['liquid','cooked','burned','frozen'].every(k=>finite(raw[k],0,1)))continue;
      const s=freshSample(d.id);
      for(const k of ['temperature','liquid','cooked','burned','frozen'])s[k]=raw[k];
      for(const k of ['elapsed','visits','cycles'])if(finite(raw[k],0,1e9))s[k]=raw[k];
      for(const k of ['heated','cooled','transformedOnce'])s[k]=raw[k]===true;
      s.location=!raw.held && ['bench','heat','cool','freeze'].includes(raw.location)?raw.location:'bench';
      for(const k of ['hot','cold']){
        const evidence=raw[k];
        if(evidence && finite(evidence.temperature,-12,720) && ['liquid','cooked','burned','frozen'].every(field=>finite(evidence[field],0,1)) && finite(evidence.elapsed,0,1e9))s[k]=snapshot({...evidence,location:['bench','heat','cool','freeze'].includes(evidence.location)?evidence.location:'bench'});
      }
      s.heated=Boolean(s.heated&&s.hot);s.cooled=Boolean(s.heated&&s.cooled&&s.cold);
      const expected=this.expected(d.id);
      for(const k of ['hot','cold'])if(s[k] && raw.observations?.[k]===expected[k])s.observations[k]=expected[k];
      if(s.heated&&s.cooled&&raw.record && ['hot','cold','verdict'].every(k=>raw.record[k]===expected[k]))s.record={...expected,hotEvidence:{...s.hot},coldEvidence:{...s.cold}};
      this.samples[d.id]=s;
    }
    this.activeId=materialById[saved.activeId] && !this.samples[saved.activeId].record?saved.activeId:null;
    if(!this.activeId)this.activeId=Object.values(this.samples).find(s=>!s.record&&(s.heated||s.location!=='bench'))?.id??null;
    const occupied=new Set();
    const ordered=Object.values(this.samples).sort((a,b)=>Number(b.id===this.activeId)-Number(a.id===this.activeId));
    for(const s of ordered){if(s.location==='bench')continue;if(occupied.has(s.location))s.location='bench';else occupied.add(s.location);}
    return true;
  }
  hold(id,held) { if(!this.isSelectable(id)) return false; this.samples[id].held=held; return true; }
  tick(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid simulation duration');
    // Bound each integration step, so changing time scale or frame rate does
    // not jump past latent-heat plateaus or cooking thresholds.
    for (let left = seconds; left > 0; left -= 1) {
      const dt = Math.min(1, left);
      for (const s of Object.values(this.samples)) this.advance(s, dt);
    }
  }
  advance(s, dt) {
    const d = materialById[s.id];
    // Intentional teaching pause: off-station samples retain their exact state
    // for close inspection. This does not model ambient heat exchange.
    if (s.location === 'bench' || s.held) return;
    s.elapsed += dt;
    const target = s.location === 'heat' ? d.heat : s.location === 'freeze' ? -12 : 20;
    const conductance = .006;
    const change = (target - s.temperature) * (1 - Math.exp(-conductance * dt));
    if (d.kind === 'melt') {
      const warming = target > d.melt && (s.temperature >= d.melt - .05 || s.temperature + change >= d.melt);
      const chilling = target < d.melt && (s.temperature <= d.melt + .05 || s.temperature + change <= d.melt);
      if (warming && s.liquid < 1) {
        s.temperature = d.melt;
        // Teaching-model pacing: at the default ×90, the ice phase transition
        // takes about two seconds. This is not a measured melting duration.
        s.liquid = Math.min(1, s.liquid + (d.meltDuration ? dt/d.meltDuration : (target - d.melt) * dt / d.latent));
      } else if (chilling && s.liquid > 0) {
        s.temperature = d.melt;
        s.liquid = Math.max(0, s.liquid - (d.melt - target) * dt / d.latent);
      } else s.temperature += change;
    } else {
      // Egg white contains water: it can freeze, without reversing protein
      // coagulation. The -2°C plateau is illustrative for this mixture, not a
      // measured universal freezing point or a food-texture prediction.
      if (d.kind === 'cook' && target < -2 && s.temperature + change <= -2 && s.frozen < 1) {
        s.temperature = -2; s.frozen = Math.min(1, s.frozen + (-2-target)*dt/3000);
      } else if (d.kind === 'cook' && target > -2 && s.temperature + change >= -2 && s.frozen > 0) {
        s.temperature = -2; s.frozen = Math.max(0, s.frozen - (target+2)*dt/3000);
      } else s.temperature += change;
      if (d.kind === 'cook' && s.temperature > 63)
        s.cooked = Math.min(1, s.cooked + (s.temperature - 63) * dt / 6500);
      if (d.kind === 'toast' && s.temperature > 125)
        s.cooked = Math.min(1, s.cooked + (s.temperature - 125) * dt / 7000);
      // Air is supplied by the dedicated combustion furnace. This is a
      // qualitative ignition/burnout sequence, not a measured ignition point.
      // Heating water, cooling, freezing or a hot off-station sample cannot
      // ignite this sample. Burnout never decreases and no liquid is formed.
      if(d.kind==='burn' && s.location==='heat' && s.temperature>380)
        s.burned=Math.min(1,s.burned+dt/450);
    }
    const transformed = d.kind === 'melt' ? s.liquid >= .999 : d.kind==='burn'?s.burned>=.999:s.cooked >= .999;
    if (!s.heated && s.location === 'heat' && transformed) {
      s.heated = true;
      s.transformedOnce=true;
      s.hot = snapshot(s);
    }
    // Both cooling routes are valid evidence. Record the route and actual
    // temperature rather than calling a frozen sample "back at 20°C".
    const atStart = Math.abs(s.temperature - d.initial) < 1.5;
    const changedBack = d.kind !== 'melt' || s.liquid < .001;
    const roomComparison = s.id !== 'ice' && s.location === 'cool' && atStart;
    const frozenComparison = s.location === 'freeze' && s.temperature < -10.5 && (d.kind !== 'cook' || s.frozen > .999);
    if (s.heated && !s.cooled && (roomComparison || frozenComparison) && changedBack) {
      s.cooled = true;
      s.cold = snapshot(s);
    }
  }
  canRecord(id) { const s = this.samples[id]; return Boolean(s.heated && s.cooled && s.hot && s.cold); }
  questionStage(id) {
    const s=this.samples[id];
    if(s.record) return null;
    if(s.heated && !s.observations.hot) return 'hot';
    if(s.cooled && !s.observations.cold) return 'cold';
    if(s.cooled && s.observations.hot && s.observations.cold) return 'verdict';
    return null;
  }
  observe(id,group,value) {
    const s=this.samples[id];
    if(!this.isSelectable(id) || !['hot','cold'].includes(group) || !s[group] || this.questionStage(id)!==group) return {ok:false};
    if(this.expected(id)[group]!==value) return {ok:false};
    s.observations[group]=value;
    return {ok:true};
  }
  expected(id) {
    const d = materialById[id];
    return { hot: d.kind === 'melt' ? 'liquidChoice' : d.kind === 'cook' ? 'setChoice' : d.kind==='burn'?'ashChoice':'toastChoice',
      cold: d.kind === 'melt' ? 'solidChoice' : d.kind === 'cook' ? 'cookedChoice' : d.kind==='burn'?'ashRemains':'breadChoice',
      verdict: d.kind === 'melt' ? 'reversible' : 'irreversible' };
  }
  record(id, answers) {
    if(!this.isSelectable(id)) return {ok:false,reason:'finishRecord'};
    if (!this.canRecord(id)) return { ok: false, reason: 'recordWait' };
    const assessment = this.assess(id, answers);
    if (!assessment.ok) return { ...assessment, reason: 'revise' };
    const s = this.samples[id];
    s.record = { ...answers, hotEvidence: { ...s.hot }, coldEvidence: { ...s.cold } };
    if(this.activeId===id) this.activeId=null;
    return { ok: true };
  }
  assess(id, answers) {
    const expected = this.expected(id);
    const fields = Object.fromEntries(Object.keys(expected).map(key => [key, expected[key] === answers[key]]));
    return { ok: Object.values(fields).every(Boolean), fields, expected };
  }
  records() { return Object.values(this.samples).filter(s => s.record); }
  canAnalyse() { const records = this.records(); return !this.activeId && records.length >= 3 && records.some(s => ['charcoal','egg', 'bread'].includes(s.id)); }
}
export function snapshot(s) { return { temperature: Math.round(s.temperature * 10) / 10, liquid: s.liquid, cooked: s.cooked, burned:s.burned, frozen: s.frozen, location:s.location, elapsed: Math.round(s.elapsed) }; }
export function stateKey(s) {
  const d = materialById[s.id];
  if(d.kind==='burn') return s.burned>.999?'charcoalAsh':s.burned>.001?'charcoalBurning':'charcoalSolid';
  if (d.kind === 'cook') return s.frozen > .99 ? (s.cooked > .99 ? 'frozenCookedEgg' : 'frozenRawEgg') : s.frozen > .01 ? 'freezingWhite' : s.cooked > .99 ? 'cookedEgg' : s.cooked > .03 ? 'cookingEgg' : 'rawEgg';
  if (d.kind === 'toast') return s.cooked > .99 ? 'toasted' : s.cooked > .03 ? 'toasting' : 'freshBread';
  return s.liquid < .01 ? 'solid' : s.liquid > .99 ? 'liquid' : s.location === 'heat' ? 'melting' : 'setting';
}
