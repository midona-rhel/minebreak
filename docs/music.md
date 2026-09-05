# Lanterns at Low Tide

An original, 120-second instrumental composed for Minebreak. Its harbor character comes from a lilting 6/8 meter, recorder phrasing, plucked strings, a warm bass, and a small acoustic ensemble. The pitches, rhythms, harmony, counterphrases, and instrument models were written for this task. No Port Sarim/Sea Shanty melody, reference MIDI, external recording, sample pack, or prior music task's files were used.

## Musical form

56 bars at dotted-quarter = 56, centered on G major with a contrasting E-minor passage. All melody bars are explicitly notated in `lib/audio/score.ts`; `-` means a rest and durations are eighth notes. The main theme returns with deliberate variations. Seeded noise is used only for timbre and breath, never for pitch or rhythm selection.

| Time      | Bars  | Section              | Arrangement                                                                          |
| --------- | ----- | -------------------- | ------------------------------------------------------------------------------------ |
| 0:00–0:09 | 1–4   | Harbor lights        | Open lute, bass, one bell, recorder pickup                                           |
| 0:09–0:34 | 5–16  | Along the quay       | Twelve-bar recorder theme, soft strings, frame drum                                  |
| 0:34–1:00 | 17–28 | Sails in the morning | Higher answering melody, moving bass, lute responses                                 |
| 1:00–1:17 | 29–36 | The sheltered cove   | E minor; lower recorder, longer bass, percussion rests; B7–Em then D leads home      |
| 1:17–1:43 | 37–48 | Homeward lanterns    | Varied reprise and the strongest dynamic arch                                        |
| 1:43–2:00 | 49–56 | The turning tide     | Shortened phrases, thinning texture, suspended dominant resolving into the opening G |

Recorder attacks use breath noise, pressure shaping, a slight pitch settling, delayed shallow vibrato, and written rests. Lute and bass use damped string modes with pluck-position weighting and faster decay for upper partials. The two-course strings enter slowly; bells appear only five times. Stereo placement is narrow enough for a game mix. A damped chamber adds space without washing out the lead.

## Integration for Assets/Scenery

- Mount **one** `<MusicPlayer />`. This PR adds just its import and mount after `{children}` in `app/layout.tsx`. `components/minebreak-game.tsx`, global styles, game state, package files, and visual assets are untouched.
- `components/music-player.tsx` is self-contained; all styling is in its CSS module. It currently sits in normal document flow below the game, so it cannot cover the board or an encounter. Assets/Scenery can move that one mount into its future toolbar/footer, keeping it above route or encounter boundaries so track position survives game changes. Remove the layout mount if moving it.
- Do not start music from game mount, a mine click, a saved preference, scene transitions, or an effect. Only the player's explicit Play button starts/resumes audio. Enter/Space on that button is also a gesture. New visits always begin silent.
- Volume and mute are independent of playback and persisted under `minebreak:music:v1`; blocked or corrupt storage falls back safely. A pressed “Mute music” toggle means mute is on. The native range input has a spoken percentage and keyboard support. Buttons have visible focus and 44px minimum targets.
- The music owns its own `AudioContext`. Future effects should keep their own mix controls; do not connect additional sources to this music gain or assume its headroom applies to combined effects. There is no combat ducking or game event dependency in this change.
- Keep the render worker as a bundled, same-origin module. The existing Vite build handles `new Worker(new URL(..., import.meta.url))`. A custom CSP must permit same-origin workers (`worker-src 'self'`). No API key, network audio request, audio dependency, or separately shipped recording is needed.

## Playback and resource behavior

1. First Play constructs/resumes the audio context immediately inside the user gesture, then starts a worker. The worker renders stereo PCM at 32 kHz and transfers its arrays. A progress message and Cancel button remain available during preparation.
2. The finished PCM occupies about 30.7 MB. Worker working buffers and the temporary transfer add transient memory; on this Windows machine the Node render took about three seconds and the Chromium worker about five seconds. Low-end phones will take longer. The worker terminates after completion; normal playback does not synthesize on the game thread.
3. Eight-second sources are scheduled from the audio clock, looking twelve seconds ahead, with a 250ms housekeeping timer. At most three new chunks are scheduled per tick. The buffers overlap identical audio for 12ms using complementary fades, including across the 120-second join. Source resampling transients are masked without a volume bump.
4. Notes and room tails wrap into the beginning during rendering. There is no fade-out or added silence at the loop boundary. The score's final D harmony resolves into the opening G.
5. Pause fades down and suspends the context, preserving source positions. Hiding the page or leaving it suspends immediately and requires another Play gesture on return. An OS/device interruption also changes the UI to paused. A severe foreground stall beyond the lookahead skips missed material at the current musical position; it never queues a catch-up burst.
6. Cancel, worker error/timeout, scheduling failure, and unmount terminate work, stop/disconnect sources and envelopes, clear timers/listeners, close the context, and drop the PCM. Async generation guards reject stale completions. Rendering errors offer retry. Ordinary pause retains PCM for fast resume.

The clock and suspension behavior follow the [Web Audio specification](https://webaudio.github.io/web-audio-api/). The explicit hidden-page pause avoids depending on [background timer behavior](https://developer.chrome.com/blog/background_tabs).

## Validation and listening review

From the repository root, after `npm ci`:

```sh
node lib/audio/tests/run.mjs --render
npx tsc --noEmit --incremental false
npx oxlint lib/audio components/music-player.tsx
npm run build
```

The test runner uses the existing TypeScript dependency and Node's test runner; it adds no package dependencies or global configuration. Compiled test modules and generated audio are ignored under `work/`.

The tests cover the full score, single-player recorder phrasing and rests, deterministic timbres, finite samples, DC, stereo width, section dynamics, seam continuity, two hours of scheduling, long stalls, bounded/unique scheduling, mute/volume bounds, malformed preferences, duplicate play, pause/resume, hiding, cancellation, timeouts, interruptions, node failures, pending-resume disposal, and cleanup.

The optional **real Chromium** test exercises the production render worker and compares the production chunk graph across the 120-second boundary with a continuous native loop at 44.1 and 48 kHz:

```sh
node lib/audio/tests/browser.mjs "/absolute/path/to/chrome"
```

It starts its own muted headless browser, temporary profile, and localhost server, then tears them down. It does not use an existing browser session. Windows example: `node lib/audio/tests/browser.mjs "C:/Program Files/Google/Chrome/Application/chrome.exe"`.

The full render measured **−7.13 dBFS sample peak**, **−7.1 dB true peak**, **−18.7 LUFS integrated**, and **4.9 LU loudness range** using FFmpeg's EBU R128 analyzer. Normalization is a single gain across the entire stereo piece, including room tails, so section dynamics remain intact. User volume cannot boost above this master. Default volume is 55% with a squared gain curve. Native-loop comparison error was below 0.000003 sample amplitude at both tested output rates.

To repeat the independent loudness/true-peak measurement:

```sh
ffmpeg -hide_banner -nostats -i work/music/lanterns-at-low-tide.wav -af ebur128=peak=true:framelog=verbose -f null -
```

**Audition status: not listened to by the agent.** This environment supports numerical rendering and muted browser tests, but supplies no trustworthy audio monitoring to the agent. The measurements verify engineering properties, not musical taste or speaker balance. A full WAV is exported to `work/music/lanterns-at-low-tide.wav` for human review; the game uses the procedural arrangement, not that WAV.

For listening review, hear the whole two-minute form and the ending directly followed by the beginning. Check the lead's warmth, the cove-to-reprise lift, bass on small speakers, bell restraint, and repeated listening fatigue. Safari/iOS, mobile hardware output, screen-reader announcements, and perceived musical quality still need human/device review. Keep this PR open for that review; do not merge or publish from the music task.
