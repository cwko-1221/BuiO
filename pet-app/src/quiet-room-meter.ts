/** Device-relative microphone index (not calibrated physical dB). */
export function microphoneLevel(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  const rms = Math.sqrt(sum / samples.length);
  return Math.round(Math.max(0, Math.min(100, (20 * Math.log10(Math.max(rms, 0.00001)) + 60) / 60 * 100)));
}

/** One penalty per sustained burst; rearm after 1 second below threshold with hysteresis. */
export class NoiseGate {
  private loudSince: number | null = null;
  private quietSince: number | null = null;
  private armed = true;
  reset() { this.loudSince = null; this.quietSince = null; this.armed = true; }
  sample(level: number, threshold: number, now: number): boolean {
    if (level > threshold) {
      this.quietSince = null;
      if (this.loudSince === null) this.loudSince = now;
      if (this.armed && now - this.loudSince >= 650) {
        this.armed = false;
        return true;
      }
    } else {
      this.loudSince = null;
      if (level <= Math.max(0, threshold - 3)) {
        if (this.quietSince === null) this.quietSince = now;
        if (now - this.quietSince >= 1000) this.armed = true;
      } else this.quietSince = null;
    }
    return false;
  }
}
