export function timedHazardActive(hazard, timeMs) {
  const cycleMs=Math.max(1,Number(hazard?.cycleMs ?? 4000));
  const activeMs=Math.max(0,Math.min(cycleMs,Number(hazard?.activeMs ?? 2000)));
  const phaseMs=Number(hazard?.phaseMs)||0;
  const phase=((timeMs+phaseMs)%cycleMs+cycleMs)%cycleMs;
  return phase<activeMs;
}

export function timedHazardState(hazard, timeMs) {
  const cycleMs=Math.max(1,Number(hazard?.cycleMs ?? 4000));
  const active=timedHazardActive(hazard,timeMs);
  const phaseMs=Number(hazard?.phaseMs)||0;
  const phase=((timeMs+phaseMs)%cycleMs+cycleMs)%cycleMs;
  const activeMs=Math.max(0,Math.min(cycleMs,Number(hazard?.activeMs ?? 2000)));
  const remainingMs=active ? activeMs-phase : cycleMs-phase;
  return {active,phaseMs:phase,remainingMs};
}
