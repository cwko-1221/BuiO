# Game Quiz iPad touch and question layout

The student page installs `touch-guard.js` in the head before loading shared UI,
Socket.IO, Phaser or the game modules. Gesture protection therefore runs while
those resources are delayed. Capture listeners cover canvas, movement controls,
questions, disabled answers and transitions between targets. Repeated taps keep
their history instead of resetting after the second tap. Pointer-based movement
and double jump continue to work. Multi-touch starts, WebKit gestures and keyboard
or trackpad zoom shortcuts are also intercepted.

The previous guard excluded canvas and movement controls and only covered taps
less than 300ms apart. CSS alone is insufficient across Safari versions; WebKit
records an [absolute-positioned double-tap exception](https://bugs.webkit.org/show_bug.cgi?id=218015).
This does not identify which gesture caused the reported classroom incident.

Image questions use two columns in landscape. `QuestionLayout` measures the
complete card, then scales it to the visual viewport and safe-area padding.
Text wraps without truncation; the card has no scroll area. Image completion,
feedback, countdown changes, fonts, rotation and visual-viewport changes refit it.

The old CSS reproduces a clipped continue button at 1024 × 500: a 468px card
contains 632px of content, with lower answers and the continue button below the
visible area. The old page also prevents the touch drag needed to scroll it.

Run `npm run check:game-ipad-ui` for isolated Chromium and WebKit browser checks.
Install the test browser first with `npx playwright install webkit` if needed.
The fixture serves the real client and delayed question/answer/image responses;
it does not load school credentials or modify student data. Screenshots and the
report go to `tmp/game-ipad-ui-20261012`, overridable with `GAME_IPAD_QA_OUT`.
Checks include long and unbroken text, text-only questions, feedback and continue,
double/triple taps, double jump, simultaneous direction/jump in Chromium,
rotation and a visual viewport changing independently of the layout viewport.

Desktop WebKit with a touch viewport is not physical iPad Safari. Native iOS
gesture behavior still needs device verification. OS accessibility zoom and
browser-menu zoom are outside a web page's gesture controls.
