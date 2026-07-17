const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;

export function resolveCheckpoint(checkpoints, state = {}) {
  if (!Array.isArray(checkpoints) || !checkpoints.length) return null;
  const explicitId = typeof state.checkpoint === 'string' ? state.checkpoint : state.checkpoint?.id;
  const explicitAltitude = finite(state.checkpoint?.altitude);
  const progress = finite(state.progress) ?? 0;
  const altitude = finite(state.altitude);
  const reached = [checkpoints[0]];

  for (const checkpoint of checkpoints) {
    if (checkpoint.id === explicitId || (explicitAltitude !== null && checkpoint.altitude === explicitAltitude)) reached.push(checkpoint);
    if (checkpoint.progress <= progress + 1e-7) reached.push(checkpoint);
    // Checkpoint sensors are intentionally generous. This altitude fallback
    // makes the recovery state reliable even if a fast jump crosses a sensor
    // between two Matter steps or a preview/reconnect starts above it.
    if (altitude !== null && checkpoint.altitude <= altitude + 3) reached.push(checkpoint);
  }

  return reached.reduce((latest, checkpoint) => checkpoint.altitude > latest.altitude ? checkpoint : latest, reached[0]);
}

export function checkpointPayload(checkpoint) {
  if (!checkpoint) return null;
  return {
    id:checkpoint.id,
    altitude:checkpoint.altitude,
    progress:checkpoint.progress,
    x:checkpoint.x,
    y:checkpoint.y
  };
}
