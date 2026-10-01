# Brawl v2 completion audit — 2026-10-01

Final production entry: `dist/assets/index-Ci_0Y1ch.js`; battle chunk `controller-BymiAr61.js`. The same final build was served during the visual and browser regression checks, then copied into `pet-app/dist`. The local development server was restarted on port 3000 to load v2 server rules.

| User requirement | Shipped behavior | Evidence |
| --- | --- | --- |
| Extended battlefield | 5120-pixel continuous worlds with four encounter areas; no teleport on advance | v2-mechanics-report.json, maximum transition movement 6 pixels |
| Following camera | Smooth player tracking, directional lookahead, world bounds; background is in world coordinates | Three normal-speed campaign recordings and zone screenshots; camera travel 5,277–7,181 pixels |
| Visible effects | 48-frame original painted VFX, slash/impact/wind/cyclone/stomp/dust, charge trails and pickups | Three fighters' live skill screenshots in quality-final/ |
| Impact | Brief hit stop, buffered quick taps, victim flash, knockback and launches, hit sparks, heavy shake, damage numbers, combo feedback | Shared mechanics tests, actual normal-speed gameplay video, 416 campaign hit feedback events |
| Sound | Fourteen original cached Foley buffers, positional playback, battle music, visible mute and separate volume controls | Actual post-master RMS 0.00863; mute RMS zero; decoded stereo Opus recording and MP4 preview |
| Playable finished mode | Tutorial, practice, AI duel, three campaigns, three difficulty settings, enemy roles and boss patterns, current-wave retry and settlement | Three full real-time campaign wins: 83.6 / 108.1 / 117.1 seconds, all four areas traversed |
| Fun and readability | Larger characters, rush and aerial attacks, held three-hit chains, MP gain on hits, health/mana drops, knockdown recovery; painted ground matched to movement band | Final screenshots reviewed; minimum sampled desktop FPS 55.2 / 56.6 / 57.3 |
| Save and rewards | Exact input replay saves, legacy v1 support, ownership/unlock checks, capped daily rewards, duplicate-safe settlement | Unit matrix, legacy worker replay, reload/failed-network/retry/ledger tests |
| Desktop and touch | Keyboard and simultaneous stick/action pointers, pointer cancellation, landscape layout, portrait pause | Windows Chrome at 1440×900, 1180×820, 1024×768 and 768×1024 |

Evidence lives in `artifacts/pet-playtest/brawl-v2/`: `final-build-evidence.json`, `simulation-report.json`, `v2-mechanics-report.json`, `browser-report.json`, and `quality-final/quality-report.json`. The final original recording contains real VP8 video at 1280×720 and stereo Opus audio; `gameplay-preview.mp4` is a decoded H.264/AAC excerpt. No gameplay test changes HP, positions, seeds, actors or outcomes to produce a victory.

Validation also passed TypeScript, the existing pet module suite and all four production coin-pusher artifact checks. Deliberate failed requests in the recovery suite were the only expected network errors; no browser JavaScript or console errors occurred in the normal-speed quality test.

Physical iPad hardware and PostgreSQL execution were not available for validation on this workstation. The touch checks used Chrome emulation and reward transactions used an isolated JSON fixture. No online multiplayer was part of this release.

New raster scenery and VFX used the built-in image_gen tool. Original and shipping paths plus the full prompt set are recorded in `art-source/brawl-v2-prompts.json` and `art-source/brawl-v2-effects-prompt.md`.
