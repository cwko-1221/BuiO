/** Device-relative microphone index, shifted down about 30 points (not physical dB). */
export function microphoneLevel(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  const rms = Math.sqrt(sum / samples.length);
  return Math.round(Math.max(0, Math.min(100, (20 * Math.log10(Math.max(rms, 0.00001)) + 36) / 60 * 100)));
}

/** Trigger at the limit on the first sample; rearm after 1 quiet second with hysteresis. */
export class NoiseGate {
  private quietSince: number | null = null;
  private armed = true;
  reset() { this.quietSince = null; this.armed = true; }
  sample(level: number, threshold: number, now: number): boolean {
    if (level >= threshold) {
      this.quietSince = null;
      if (this.armed) {
        this.armed = false;
        return true;
      }
    } else {
      if (level <= Math.max(0, threshold - 3) && level < threshold) {
        if (this.quietSince === null) this.quietSince = now;
        if (now - this.quietSince >= 1000) this.armed = true;
      } else this.quietSince = null;
    }
    return false;
  }
}
