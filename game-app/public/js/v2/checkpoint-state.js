export function resolveCheckpoint(checkpoints, state = {}) {
  if (!Array.isArray(checkpoints) || !checkpoints.length) return null;
  const explicitId = typeof state.checkpoint === 'string' ? state.checkpoint : state.checkpoint?.id;
  const explicitAltitude = Number(state.checkpoint?.altitude);
  // A checkpoint is authoritative only after its flag collision was recorded
  // and echoed back by the server. Altitude and route progress deliberately do
  // not infer checkpoint ownership: a player may pass beside or above a flag.
  return checkpoints.find(checkpoint => checkpoint.id === explicitId)
    || (Number.isFinite(explicitAltitude)
      ? checkpoints.find(checkpoint => checkpoint.altitude === explicitAltitude)
      : null)
    || checkpoints[0];
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
