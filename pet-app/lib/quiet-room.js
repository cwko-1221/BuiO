'use strict';

const LEASE_MS = 6000;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

function settings(body) {
  const result = {};
  for (const [key, min, max] of [['durationSeconds', 10, 7200], ['threshold', 1, 100], ['reward', 1, 10000], ['penalty', 1, 10000]]) {
    const value = body?.[key];
    if (!Number.isInteger(value) || value < min || value > max) fail(`${key}: ${min}–${max}`);
    result[key] = value;
  }
  return result;
}

// A short monitoring lease prevents an unattended/closed browser earning unmonitored coins.
function advance(session, now) {
  if (session.status !== 'running') return;
  const elapsed = Math.max(0, now - session.lastTick);
  session.remainingMs = Math.max(0, session.remainingMs - Math.min(elapsed, LEASE_MS));
  session.lastTick = now;
  if (!session.remainingMs) session.status = 'completed';
  else if (elapsed > LEASE_MS) session.status = 'paused';
}

function transition(session, action, now, eventId) {
  advance(session, now);
  if (!['heartbeat', 'pause', 'resume', 'noise', 'cancel'].includes(action)) fail('Unknown quiet room action');
  if (session.status === 'completed' || session.status === 'cancelled') return;
  if (action === 'pause') session.status = 'paused';
  if (action === 'resume' && session.status === 'paused') { session.status = 'running'; session.lastTick = now; }
  if (action === 'cancel') session.status = 'cancelled';
  if (action === 'noise' && session.status === 'running') {
    if (typeof eventId !== 'string' || !eventId || eventId.length > 120) fail('Invalid noise event');
    if (session.events.includes(eventId)) return;
    // The client also waits for quiet before rearming. This bounds duplicate bursts server-side.
    if (session.lastNoiseAt !== null && now - session.lastNoiseAt < 1500) return;
    session.events.push(eventId);
    session.lastNoiseAt = now;
    session.breaches += 1;
    session.remainingReward = Math.max(0, session.remainingReward - session.penalty);
  }
}

module.exports = { LEASE_MS, settings, advance, transition, fail };
