// Used only by the isolated load harness. No diagnostic endpoint is exposed.
const { monitorEventLoopDelay } = require('node:perf_hooks');
const delay = monitorEventLoopDelay({ resolution: 20 }); delay.enable();
let cpu = process.cpuUsage(), at = performance.now();
require('../../server');
const timer = setInterval(() => {
  const next = process.cpuUsage(), now = performance.now(), memory = process.memoryUsage();
  process.send?.({ type: 'metrics', cpuPercent: (next.user-cpu.user+next.system-cpu.system)/(now-at)/10,
    rss: memory.rss, heap: memory.heapUsed, eventLoopP95: delay.percentile(95)/1e6, eventLoopMax: delay.max/1e6 });
  cpu = next; at = now; delay.reset();
},1000); timer.unref();
