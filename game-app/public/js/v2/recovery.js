export const RAPID_FALL_METRES = 100;
export const RAPID_FALL_WINDOW_MS = 2400;

// Tracks the highest altitude seen inside a short rolling window. The map may
// contain ordinary downward hops, so recovery only fires when the player loses
// a full 100 metres before the oldest sample leaves the window.
export class RapidFallTracker {
  constructor({threshold=RAPID_FALL_METRES,windowMs=RAPID_FALL_WINDOW_MS}={}) {
    this.threshold=threshold;
    this.windowMs=windowMs;
    this.samples=[];
  }

  reset(time=0,altitude=0) {
    this.samples=[{time,altitude}];
  }

  update(time,altitude) {
    const cutoff=time-this.windowMs;
    while (this.samples.length&&this.samples[0].time<cutoff) this.samples.shift();
    this.samples.push({time,altitude});
    let peak=altitude;
    for (const sample of this.samples) peak=Math.max(peak,sample.altitude);
    return peak-altitude>=this.threshold;
  }
}
