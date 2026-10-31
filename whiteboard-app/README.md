# Whiteboard classroom verification

Both student URLs share the acknowledged vector-checkpoint pipeline. The two
teacher pages retain their distinct controls and use invalidation-based canvas
painting. Room ownership and audience checks apply to restored rooms too.

Run from the repository root:

```sh
npm run check:whiteboard
npm --prefix whiteboard-app/client run lint
npm --prefix whiteboard-app/client run build
npm run check:whiteboard-live
npm run check:classroom-mixed-load
```

The final command runs for 30 real minutes by default. Use
`node scripts/test-classroom-mixed-load.mjs --seconds=60 --output=tmp/mixed-smoke`
for a shorter smoke check. Both use isolated fake accounts and databases. They do
not change the normal development database or connect to a production database.

See [the implementation and validation scope](../docs/whiteboard-performance-recovery-20261030.md)
for persistence intervals, restart behavior, workload coverage and limitations.
