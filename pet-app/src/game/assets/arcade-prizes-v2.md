# Arcade toy prizes, version 2

Original Blender-authored artwork, not downloaded stock models. Four prize categories,
eight variations: brilliant-cut ruby, cream cat, caramel puppy, satin bow, flower hat,
sage sofa and mushroom lamp. No coin plinths. The lamp foot and hat brim are parts of
the actual objects, not generic prize stands.

Source: `scripts/build-arcade-prize-art.py`, run inside Blender Python (validated on
Blender 4.5.5 LTS through MCP). It creates a separate atelier and preserves earlier
drafts and the user's existing scene. Export only that scene; do not export all scenes.

Runtime collection: `arcade-prizes-v2.glb`, 715,004 bytes after glTF Transform `dedup`
and `prune`. Texture-free standard PBR, shared palette, parts batched by material.
No decoder, transmission shader, external textures, animations or third-party assets.

Contract: eight named roots `Prize_<kind>_<variant>`, variant 0/1. Y-up after glTF
export; front +Z; local bottom exactly -.22. Geometry fits a .25-radius, .22-half-height
proxy, including radial corners. Physics, prize identity and wallet rules are unchanged.
The runtime caches only source bytes; each cabinet owns and disposes its GPU resources.

Validation: 19 coin-pusher/prize tests, production build, eight-model browser gallery,
desktop/iPad-landscape/phone real-game captures, model-fetch failure/retry, WebGL recovery,
real trough catches, one exact ruby +50 credit, three voucher redemptions, and the full
existing student-flow regression. All tests use isolated student data.
