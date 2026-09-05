# Wackdonalds — issue #1

He throws. You eat. Not salad. NOW WORK.

## Current game

Trigger a mine in the existing local harness, select CLOCK IN, and use Left/Right, A/D, or the touch arrows. The minigame fills the browser viewport. Its kitchen scene has no track or lanes; throws land at continuous positions across the screen. The giant player portrait sits at the bottom. The compact food, time and strikes scoreboard sits in the bottom control strip, leaving the top clear for the worker. Below 960px it uses its own row above the buttons; the play area reserves space for both rows. Escape or Return to board cancels through the host.

Survive 30 seconds with at least 48 points. Burgers score 2, fries 1 and shakes 3. One of each completes a meal for +6 and resets the recipe. Three plants or a mystery-bag bomb loses immediately. The clock-in screen explicitly shows the 48-point minimum, zero pay on failure and the actual health loss calculated by the host rules for the current player. The HUD labels the food target and switches to GOAL MET after reaching it. During the final 10 seconds below target, feedback shows the points still needed and the health/no-pay penalty. Missed items have no penalty. Actual food eaten grows the portrait from 160 to 240 logical units across 12 foods, smoothly at 24 units/second. Bonus points do not cause extra growth. A larger mouth catches more easily and leaves less dodging room; growth does not shorten warning time.

One mystery bag appears in 35% of shifts, replacing a normal delivery. It gives +25 points with 80% probability or instant failure with 20% probability. All randomness repeats for the same encounter seed. The host owns health, XP and persistence; these are minigame points, not additional host currency. Integrated main through 5c74fb7, preserving the Drillants Battle registration: the game reads the encounter seed from the immutable context and returns only its outcome. Successful shifts submit final XP through playerStats: the normal floor reward (35 + floor x 5) plus 1 XP per 2 food points above 48, capped at 20 bonus XP. On floor 1, scores of 48 / 68 / 88 earn 40 / 50 / 60 XP. Failure pays zero, even after reaching the target. The shared XP cap still applies; health is not overridden, preserving armor-adjusted failure damage. The board applies the submitted final XP instead of adding its normal reward again.

## Framing and pacing

The presentation camera shows logical x100..700 and y0..380 in an unmarked kitchen scene. Continuous landing points lie between x140 and x660. The next aim moves 130–260 units from the last, leaving enough space to avoid a paired plant. All targets remain reachable at maximum player size. Steering reaches a maximum of 600 units/second with 0.1-second acceleration, faster reversal and roughly 0.06-second braking from top speed. Walls clear outward velocity. There is no pause button or automatic break. The clock starts at CLOCK IN and continues through focus loss, hidden tabs and long frames. Blur clears held controls and momentum. When browser rendering resumes, the engine catches up elapsed time with neutral controls for gaps over 250ms, including completing a shift that expired in the background.

The throwing worker is approximately 20% smaller and higher, with its hand and throw origin anchored at logical y76. The animated worker releases food from near the hand. Throws grow from 60% to 125% sprite scale and follow a shallow arc into the mouth. Their final projected position matches the actual catch coordinate at y352. The first four deliveries are safe. Later every third eligible delivery adds a plant at the previous target. Throw intervals ramp from 0.98 toward 0.78 seconds; travel time from 2.8 toward 2.15 seconds. No new throws occur after 27 seconds.

Eating blends into and out of the closed-mouth pose over 0.30 seconds and a points cue for 0.55 seconds. Throw poses blend over 0.36 seconds, and the points cue fades out rather than vanishing. Worker pose, chomp and cue lifetime use simulation time. Animations advance with elapsed shift time, including catch-up after hidden tabs. Reduced-motion preferences remove supplemental tossing and text motion. Terminal results report immediately, preventing cancellation from erasing a bomb loss; the host supplies the ending message.

The eating-and-growing loop takes inspiration from Feeding Frenzy (https://www.ea.com/games/feeding-frenzy/feeding-frenzy). The restaurant setting, artwork, wording and mechanics here are original for this minigame. No assets from another game were copied.

## Files and validation

- `engine.ts`: continuous throws, projection, growth, odds, scoring and timing.
- `index.tsx` / `wackdonalds.css`: fullscreen scene, HUD, characters, animation and controls.
- `public/assets/minigames/eeron36/`: original art. Only `minigames/registry.ts` changes outside this module and art folder. No dependency or host-contract changes.

Current checks after integrating main 5c74fb7 on 2026-09-05: all 17 upstream player-stat tests passed with npm run test:player-stats, including outcome-only normal rewards and damage. All 31 minigame tests passed with `node --test minigames/eeron36/engine.test.mjs`; minigame/registry lint and TypeScript checks passed; production build passed with the existing large-bundle warning. The earlier independent read-only review covered the 27-test version; the newer payout and no-pause changes have focused reward, cap, damage and elapsed-time regression checks. A simple bot won 100/100 seeds; that demonstrates attainability, not human difficulty.

Whole-project lint has existing errors in untouched shared files. The user reported that controls work well and difficulty feels fine before the no-pause/payout change. Automated browser coverage, the revised no-pause runtime behavior, zoom and magnifier acceptance remain unverified. A final playtest of payout, failure and cancellation plus a focused PR with testing notes remain necessary before the issue is finished. The pull request is intended to stay in draft until the remaining manual checks are complete.

## Art provenance

All PNGs were generated for this project with OpenAI image generation on 2026-09-05; no stock pack, third-party reference image or actual restaurant logo was used. Applicable OpenAI service terms govern generated art; no separate third-party asset licence is asserted.

- `food-sprites.png`: 1774 x 887 transparent 4 x 2 sheet: burger, fries, shake, broccoli / apple, salad, mystery bag, former box.
- `mascot.png`: 1254 x 1254 transparent earlier full-body mascot, retained but unused in the current player view.
- `animation-sprites.png`: 1254 x 1254 transparent 2 x 2 sheet: open-mouth portrait, chomp portrait, worker wind-up and worker throw. One reference-read attempt failed before generation; the final asset used a matching text description.
- `kitchen.png`: 1536 x 1024 background: sparse cream/red kitchen service frame, peripheral shelves, clear central play area. No characters, text, track or lane markings.
