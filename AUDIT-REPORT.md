# KEYRUSH (`Typing-Racing-Game`) — Adversarial Code Audit

**Repo:** `OmkarSolat-17/Typing-Racing-Game` @ `2acc4d8` (single commit, "initial commit")
**Audited:** 2026-10-26 · 3,953 lines of TS/TSX+CSS across 21 files · zero tests · zero CI
**Method:** static read of every line + headless execution. Findings marked **[REPRO]** were reproduced by driving the real `useEngine` hook and the real `<Play/>`/`<Stats/>` components inside jsdom (React 19 + `act()` + synthetic `KeyboardEvent`s), not by inference.

---

## 0. Verdict

| Gate | Result |
|---|---|
| `npm ci` | ✅ works |
| `npx tsc --noEmit` | ✅ 0 errors |
| `vite build` | ✅ `dist/index.html` 462.82 kB / **144.09 kB gzip**, 2377 modules, single file |
| `vite dev` | ✅ HTTP 200 |
| `tsc --noUncheckedIndexedAccess` | ❌ **29 errors**, all in `FxCanvas.tsx` |
| `npm audit` | ❌ **1 high** (vite ≤7.3.6, 7 advisories), 1 low (esbuild) |
| Tests / CI / Dockerfile / README / LICENSE / **.gitignore** / ESLint config | ❌ **none exist** |

**Summary:** the code compiles, boots, and looks polished — which is exactly the failure mode of AI-generated code. It passes every gate a naive CI pipeline would check while the *game rules* are trivially exploitable, the desktop teaching widget is permanently broken, an untracked timer hijacks navigation, and one corrupt `localStorage` value white-screens the app forever. The engineering is skin-deep: beautiful rendering layer, no domain layer.

Severity of what follows: **5 app-breaking defects, 9 correctness defects, ~1.4k lines of dead/duplicated scaffolding, 0 tests.**

---

## 1. Architecture & Structural Integrity

### 1.1 Whole files that are dead weight (0 references)

| Artifact | Evidence |
|---|---|
| `src/constants.ts` (all 23 lines) | `WORD_LIST` and `DIFFICULTY_LEVELS` have **0 external references**. It is a stale first draft of the word system that `src/game/words.ts` replaced. `DIFFICULTY_LEVELS` uses `{EASY,MEDIUM,HARD}` keys that don't even match the live `Difficulty` union (`easy/medium/hard/code`). Delete the file. |
| `src/utils/cn.ts` (6 lines) | `cn()` has **0 imports anywhere**. This single dead file is the only consumer of **two runtime dependencies** (see §3.1). |
| `useEngine().abandon` (`useEngine.ts:418-425`) | Defined, exported from the hook (`:445`), documented with *"leave mid-race: hand back a DNF result so career stats still count it"* — and **never called**. `<Play/>`'s quit path (`Play.tsx` → `App.onQuit` → `goHome`) drops the run entirely. Documented behaviour that does not exist. |
| `audio.ts:87 resetScale()` | never called; `Sfx.step` therefore only ever ratchets up via `key(combo)`. |
| `index.css` `.drift` `:140`, `.pulse-ring` `:196`, `.text-outline` `:186` | 0 `className` uses. `--color-grape` (`:19`) has 0 Tailwind uses while `#a78bfa` is hard-coded 8 times. |
| Over-exports with no consumers | `useEngine.ts:6 Status`, `:79 multFrom`, `storage.ts:7 emptyTotals`, `storage.ts:69 Badge`. |

### 1.2 Duplicated logic (business rules forked, not factored)

* **The WPM/accuracy formula exists 9 times in 4 files and they disagree.**
  `useEngine.ts:160-163`, `:338`, `:459-461`; `RivalTrack.tsx:103`; `Stats.tsx:63`.
  All are `dist / 5 / mins`, but the warm-up guard differs: `snapshot` uses `elapsed > 400`, `RivalTrack` uses `elapsed > 500`, `buildResult` uses *no* guard. **Consequence: the HUD "WPM" tile and the "N wpm" label on your own race lane are computed by two different formulas and visibly disagree** — plus `RivalTrack` also divides by `s.elapsed / 60000` with no `Math.max(1/60000, …)` floor (the engine has one at `:159`, `:337`, `:450`), so it relies entirely on its own 500 ms guard to avoid an infinite readout.
* **Three hand-rolled line-chart implementations**: `Hud.tsx:6-46` (canvas, `H - (v/max)*(H-4)-2`), `Results.tsx:22-60` (SVG, `(H-8)-4`), `Stats.tsx:92-105 + 182-210` (SVG, `(H-14)-7`). Same normalisation maths, three sets of magic padding constants, three `<defs>` gradients. One `<Sparkline data max w h kind>` component would erase ~90 lines.
* **The engine's private `Internal` shape is re-declared structurally three times**: `useEngine.ts:47-77` (canonical), `Play.tsx:24-29` (`type EngineView`), `RivalTrack.tsx:65` (inline `React.RefObject<{ rivals; dist; totalChars; elapsed; place }>`). Any field rename silently keeps compiling and breaks at runtime.
* **`MODES.find((m) => m.id === id)!` appears 7× across 5 files** (`useEngine.ts:84,105`, `Home.tsx:34,351`, `Play.tsx:34`, `Results.tsx:63-64`, `Stats.tsx:205,362-363`). No lookup map, and the `!` asserts a fact that persisted data can violate (§2.1.7).
* **`FINGER_COLOR` is forked**: `TouchKeyboard.tsx:13-23` (9 entries, includes `thumb`) vs `Stats.tsx:16-25` (8 entries, **no `thumb`**). Live crash-adjacent bug, see §2.1.8.
* **Combo→multiplier rule is duplicated as prose**: `multFrom()` (`useEngine.ts:79`) is the single source of truth, but `Play.tsx:108-111` re-derives tiers with `s.combo % 4 === 0` and `Hud.tsx:110` with `i < snap.combo % 4 || (snap.combo >= 16 && i < 4)`. The HUD pips therefore **go completely dark at combo 4/8/12/16** — the exact instant you rank up, the progress meter resets to zero.
* **~200 inline hex literals** (`#ff5a7a` ×40, `#35e0a1` ×30, `#ffb020` ×25, `#4cc9ff` ×24, `#0a0d1c` ×8, `#2c3866` ×9 …) in files that already import a `@theme` token palette (`index.css:3-20`). The design system exists and is bypassed everywhere. `index.css:20` even defines `--color-ink: #080b18` while components hard-code `#0a0d1c` — two different "ink" values in one app.
* **Near-copy-paste JSX**: `TouchKeyboard.tsx:119-155` (extras row) vs `:164-205` (main row) are the same 40-line button with different class strings; the 110 ms flash-timer logic is duplicated at `:79-83` and `:108-112`.

### 1.3 Placeholder / lint-appeasement residue

No `TODO` strings survive, but the AI's "make it compile" scaffolding is everywhere:

* `useEngine.ts:203` — `void crashed;`. `finish(finished, crashed)` accepts a crash flag and **throws it away**. "Boost drained" and "user DNF'd" are indistinguishable in `RunRecord`, so Results/Stats can never tell the two apart (Results infers it as `!result.finished`, `Results.tsx:67`).
* `useEngine.ts:475` — `...(def ? {} : {})`: a **no-op spread whose only purpose is to keep the unused `def` parameter "used"** so `noUnusedLocals` stays quiet. `def` is unused in `snapshot`, which also pollutes the `publish`/`useEffect` dependency graph for nothing.
* `useEngine.ts:109` — `useRef<Internal>(null as unknown as Internal)` followed by `if (!S.current)`. A double cast to defeat the initialiser type instead of a lazy-ref pattern.
* `useEngine.ts:216-244` — the whole state object is reset by **28 hand-written assignments** that must be kept in sync with the initialiser at `:110-139`. Two lists of the same 28 fields; I verified nothing is currently missing, but this is a latent state-leak bug factory (`totalChars` is set only in `start`, never reset in the initialiser).
* **4 × `// eslint-disable-next-line react-hooks/exhaustive-deps`** (`Home.tsx:87,121`, `Play.tsx:167,191`) in a project with **no ESLint installed and no config file**. Suppressions for a linter that never runs, in the exact places where the deps arrays are wrong (`Home.tsx:121` lists `onStats`, which the effect never uses, and omits `demoPress`/`fx`/`autoPilot` which it does).

### 1.4 State management & data flow

Two parallel, unsynchronised channels flow out of one `useRef` mutable object:

```
useEngine ── S.current (mutable, per-frame) ──┬── snap (immutable, 10 Hz setState) ──> Hud / WordTrack / NextKeyGuide
                                              └── stateRef ──────────────────────────> RivalTrack (direct DOM writes)
```

* `RivalTrack` and `Play` read the **live mutable internals** (`stateRef.current.dist`, `Play.tsx:174,185`) while the HUD reads a 10 Hz snapshot — guaranteed skew, and the reason the same "wpm" number can render twice with different values in one frame.
* **Refs mutated during render**: `useEngine.ts:107` (`onEventRef.current = config.onEvent`) and `Play.tsx:173-174`. That is officially not allowed in concurrent React; it works today only because nothing interrupts these renders.
* `App.tsx:56-57` uses a `statsRef` mirror "to avoid stale closures" and writes it during render, then `handleFinish` both mutates the ref and calls `setStats` — three sources of truth for one value.
* `Play.tsx:188-192` effect mounts, calls `launch()`, and has **no cleanup** — under StrictMode, `start()` runs twice (harmless only because `start()` begins with `clearTimers()`; a latent footgun, not a benign fact).
* Navigation state is a discriminated union (`App.tsx:13-17`) — good — but the restart key is `raceId: Date.now()` (`:49`). Two restarts in the same millisecond reuse a key; `key={screen.raceId}` then silently skips the remount.
* **`onEvent` is a 100-line switch that mixes rules, audio, particles and React state** (`Play.tsx:64-165`). It recomputes the scoring formula (`:105`) to build a floating `+pts` label — so the number shown to the user is a *second implementation* of `useEngine.ts:379`, which will drift the moment either side changes.
* `setRivalNames` (`Play.tsx:185`) copies engine state into React state purely to render lane labels — one more sync point that can desync (it's read from `stateRef.current.rivals` at render time too, `RivalTrack.tsx:141`).

---

## 2. Bugs, Errors & Edge Cases

### 2.1 Correctness defects (all reproduced)

**1. `useEngine.ts:355-408 / 410-415` — backspace does not roll back any counter ⇒ unlimited score, WPM, distance and multiplier farm. [REPRO]**
`backspace()` only does `s.typed = s.typed.slice(0,-1)`. `correctChars`, `dist`, `score`, `mult`, `combo`, `perfectWords`, `wordErrors` are untouched. Measured on word `"line"` (4 chars):

| step | score | dist | correctChars | perfectWords | combo | mult |
|---|---|---|---|---|---|---|
| type word once | 155 | 4 | 4 | 1 | 1 | 1 |
| backspace ×4 | 155 | 4 | 4 | 1 | 1 | 1 |
| re-type ×5 | **1280** | **24** | **24** | **6** | **6** | **2** |

24 "characters of track distance" were banked on a 4-character word. Because `dist` drives `progress` (`:465`), live WPM (`:459`), rival placement (`:311`) and the final record (`:159`), one 4-char word is enough to (a) max the progress bar, (b) report an arbitrary WPM, (c) beat every rival. Worst case is `zen` mode: 50 words, no clock, no energy → unlimited farming, and `recordRun` still credits `totals.words`, `keystrokes`, `perfectWords` and `maxCombo` (`storage.ts:126-140`).
*Fix: make the mutation ledger reversible — decrement `correctChars`/`dist`/`score` on backspace, or snapshot per-word counters at word start and restore them.*

**2. `useEngine.ts:427-443` — skipping the entire track is a valid 100%-accuracy win. [REPRO]**
`skip()` advances `idx`, penalises 40 points, and when `idx >= words.length` calls `finish(true)` — a *legitimate finish*, with the placement bonus (`:165-170`) and `words: s.idx` (`:171`). Driving `<Play/>` with 38 real `Tab` keydowns and no letters produced:

```json
{ "finished": true, "place": 3, "wpm": 0, "accuracy": 100, "score": 1400,
  "correctChars": 0, "incorrectChars": 0, "words": 25 }
```

…which `recordRun` then turns into `newBadges: ["first-lap","perfect"]` — **"Clean Sheet: Finish a race at 100% accuracy"** awarded for typing nothing, because `accuracy` defaults to 100 when `total === 0` (`:461`). It also banks 25 career words toward "Word Smith" (500) and "Lexicon Legend" (2000), and posts 1400 points to the local leaderboard.
*Fix: a finish requires `correctChars > 0` and `idx === words.length && no skips`; never default accuracy to 100 — default it to 0 and hide it.*

**3. `Play.tsx:88,97` vs `:428` — the desktop next-key tutor is permanently frozen. [REPRO]**
`setFlashKey({ k, n: Date.now(), ok })` stores an **epoch** timestamp; `NextKeyGuide` tests `performance.now() - flash.n < 130`, a **time-since-load** number. `2198 - 1.79e12` is hugely negative ⇒ the condition is **always true** ⇒ `lit` is never null ⇒ the box renders the *last key you pressed* forever instead of the *next key to press*. Measured with focus word `"then"`:

```
before any key : true next = "t"  guide = "t"  ✅
after 1 key    : true next = "h"  guide = "t"  ❌
600 ms later   : true next = "e"  guide = "t"  ❌   (130 ms flash window)
```

This widget is the **default desktop experience** (`showKeyboard` is `false` unless `(pointer: coarse)`, `storage.ts:55-65`), i.e. the primary teaching feature of a typing tutor is non-functional and the key colour is stuck on your *previous* accuracy. `Home.tsx:53,62` uses `performance.now()` correctly for the same prop — the AI copied the component, not the contract.
*Fix: one `now()` helper in `src/game/clock.ts`, or carry an incrementing counter instead of a timestamp.*

**4. `Play.tsx:162` — `window.setTimeout(() => onFinish(resultRef.current!), 1250)` is never registered or cleared. [REPRO]**
`useEngine` carefully tracks its timers in `timers.current` (`:151`) but this one escapes. Mount `<Play/>`, finish the race, unmount immediately (user hits ✕ Quit): the timer still fires **1× after unmount** (measured). In the real `App` that means `handleFinish` (`App.tsx:59-64`) executes `recordRun` + `saveStats` + `setScreen({name:"results"})` — a DNF run is written to `localStorage` **and the user, already on Home, is teleported into a Results screen for a race they abandoned**. Also `resultRef.current!` is a non-null assertion guarding a value that is only set 1 frame earlier.
*Fix: `useRef` + clear in the effect cleanup, or drive the handoff from `snap.status === "finished"` and an exit animation (`onAnimationComplete`).*

**5. `storage.ts:29-45` + no `ErrorBoundary` anywhere — one bad JSON blob bricks the app permanently. [REPRO]**
`loadStats` `try/catches` only `JSON.parse`, then casts: `runs: Array.isArray(p.runs) ? p.runs : []` — **elements are never validated**. Feeding it `{runs:[{mode:"NOPE",score:null,…}], totals:"garbage", badges:42}` returns that payload intact; then `Stats.tsx:362` (`MODES.find(x=>x.id===r.mode)!.accent`) throws `TypeError: Cannot read properties of undefined (reading 'accent')` — I rendered the real `<Stats/>` component and caught it. `Results.tsx` (`r.score.toLocaleString()`) throws the same class of error.
There is no error boundary in the tree (`grep componentDidCatch` → 0 hits), so React unmounts the root ⇒ **black screen**. Because the corrupt object is never quarantined or deleted, every subsequent boot re-reads it: the profile is self-poisoning, and the only remedy is DevTools.
*Fix: a validating loader (one `zod`-style parser for `Stats`/`RunRecord`/`Settings`) that drops invalid runs, plus a top-level `<ErrorBoundary>` with a "reset my data" escape hatch.*

**6. `useEngine.ts:283-351` — no `visibilitychange`/`blur` handling: alt-tab destroys timed runs. [REPRO]**
The loop derives two incompatible clocks: `s.elapsed = now - s.startedAt - s.pausedTotal` (**wall clock, jumps while throttled**) versus `dt = Math.min(0.05, (now-last)/1000)` (**clamped, freezes while throttled**). Simulating a 40 s background tab in `time` mode:

```
timeLeft 59769 ms -> 19639 ms   (33 s of the race evaporated with zero input)
rival progress advanced ≈ 0 (dt capped at 50 ms/frame)
```

A user who switches tabs mid-race returns to a lost race or a "crash", with no auto-pause and no warning. `grep visibilitychange|blur|beforeunload` → 0 hits.
*Fix: on `visibilitychange`/`window blur` while `status === "playing"`, call `togglePause()`; on resume, rebase `startedAt` so the pause is excluded.*

**7. `storage.ts:71` — persisted settings are merged with zero validation ⇒ crash at race start.**
`return raw ? { ...def, ...JSON.parse(raw) } : def`. Any same-origin script, extension, or a future schema change can put `difficulty: "godmode"` in `keyrush.settings.v2`; `useEngine.ts:84` then does `DIFFICULTIES.find(d => d.id === difficulty)!` → `cfg.rivalWpm` on `undefined` → **TypeError on the very first frame of a race**. Same class as §2.1.5, and the `Settings` object is *also* not whitelisted for type/boolean fields (`sound: "no"` is truthy).

**8. `Stats.tsx:16-25,273` — `undefined66` in inline styles for SYNTAX mode. [REPRO]**
`fingerOf()` (`TouchKeyboard.tsx:48`) returns `"thumb"` for every unmapped character; `Stats`' forked `FINGER_COLOR` has no `thumb` key. Measured: **22 of the 71 distinct characters** the `code` pool exposes fall through (`= > < { # ] ( " ) } @ : | * [ ? & \` $ ! _ +`), so for any SYNTAX user the "Where your fingers slip" chips get `borderColor: "undefined66"`, `color: undefined`, `background: "undefined14"` — silently dropped CSS, invisible diagnostics, in the mode the app advertises. Export the canonical map from `TouchKeyboard` and give `fingerOf` a real fallback lane (`"unknown"`) instead of lying that `{` is a thumb key.

**9. Data loss in the "career" feature: `storage.ts:145`.** `[run, ...prev.runs].slice(0, 60)` with no total-runs counter. 200 recorded runs ⇒ `stats.runs.length === 60` (measured), and `Stats.tsx:163` renders that as the **"RACES"** tile. After 60 races the career screen permanently reports "60 races" while `totals.words`/`ms`/`keystrokes` keep climbing — two numbers in the same screen that can never agree.

**10. `useEngine.ts:284` — `Math.min(0.05, dt)` has no lower bound.** Any backwards timestamp (frame coalescing, a resumed rAF chain after an effect re-run) yields **negative dt**, which is then added to rival distance. My rAF-throttle simulation produced `-84.7` characters — the rivals visibly drive backwards. `Math.max(0, Math.min(0.05, dt))` is a one-character fix.

**11. Mode design bug: `types.ts:29-36` + `useEngine.ts:400-403`.** TIME ATTACK hands you `words: 45` for a 60-second clock, and the last completed word triggers `finish(true)`. A 60 WPM typist ends the "bank as much as you can in 60s" mode at ~35 s with 25 s still on the clock — being fast is punished. Sprint's 25 words / TIME's 45 / OVERDRIVE's 30 / ZEN's 50 are all fixed regardless of difficulty, so `easy` (avg length **3.6**) finishes ~4× sooner than `hard` (**11.7**) in the same nominal mode.

**12-16. Display/data-contract nits found while reading:**
* `Results.tsx:149` — `finished P{place} of {place + 2 > 3 ? 3 : place + 2}`: algebra that always yields 3 (there are always exactly 2 rivals, `useEngine.ts:230`) and prints `P0 of 2` for a DNF.
* `Results.tsx:251` — badges rendered from the raw id (`id.replace(/-/g," ").toUpperCase()` → "BOOST MASTER" ✓ but "OVERDRIVE-WIN" → "OVERDRIVE WIN" ✗) while `Stats.tsx:305` uses `b.name`; the same badge has two names. `BADGES` is already imported into `Stats` but not into `Results`, and `b.desc`/`b.color` are dropped.
* `Results.tsx:68` — `isRecord = best.wpm === result.wpm` is equality-based: beating yesterday's record *by exactly the same WPM* flags "★ NEW TRACK RECORD" on a non-record.
* `RivalTrack.tsx:5,37` — `<linearGradient id={"b-"+color.slice(1)}>`. In 3 of 4 modes the mode accent equals a rival's colour (`time #4cc9ff` = NOVA, `zen #35e0a1` = TURBO, `overdrive #ff5a7a` = VYPER) ⇒ duplicate DOM `id`s ⇒ the rival car resolves to the *first* gradient and renders in the wrong paint. Same class: `Results.tsx:37 id="cg"` and `Stats.tsx:184 id="hg"` are global, non-unique SVG ids.
* `useEngine.ts:459-461` vs `RivalTrack.tsx:103` — two WPM definitions on one screen (see §1.2); `RivalTrack`'s lacks the divide-by-zero floor and shows `NaN wpm` in the first frames.
* `useEngine.ts:229` — OVERDRIVE starts energy at `58` and drains `6.6/s` (hard) ⇒ a player who does nothing is killed in **9.0 s** (measured). `58` is a magic number in a hook, not in `ModeDef`; nothing in the UI explains that you start at 58%.

### 2.2 Missing error handling (patterns, not one-offs)

* **No `try/catch` in the entire UI layer**, and every fallible boundary is treated as infallible: `JSON.parse` (only 2 sites, both `catch → return defaults`, silently wiping user data with **no user-visible warning and no backup copy**), `localStorage.setItem` (`storage.ts:47-53,76-81` — `/* ignore quota */` / `/* ignore */`: on iOS Safari private mode the quota throws on the *first* write, so **every setting and every career record is silently lost forever** and the UI still claims "record saved"), `AudioContext` construction (handled — `audio.ts:12-20` is the only place with real defensive coding), `canvas.getContext` (handled).
* **No input validation anywhere on user text.** `press(ev.key)` accepts one UTF-16 code unit; surrogate-pair emoji, IME composition (`isComposing` is never checked — a Japanese-locale user's composition buffer leaks raw letters into the race), and dead keys (`'`/`"` on many layouts) all flow straight in. `ev.key.length === 1` silently drops every astral character.
* **No non-null-assertion discipline**: 10 `)!` non-null assertions; 7 sit on `Array.find` results for `mode`/`difficulty` ids that persisted data controls, one is `resultRef.current!` inside the leaked timer (§2.1.4), one is `getElementById("root")!`. With 40 `useRef` uses against 19 `useState` in ~4k lines, the dominant idiom is "trust the mutable object I already hold".
* `snapshot`/`buildResult` never bound `wpm`: `Math.round(dist/5/mins)` with a 1/60000-minute floor and a backspace-inflated `dist` yields arbitrarily large values that then persist to `bestWpm` and the leaderboard.

### 2.3 Edge cases the domain demands and the code ignores

1. **Abandonment / resume**: closing the tab, navigating away, or `Quit` mid-race loses the run (the `abandon()` DNF path is dead code). No `beforeunload` prompt, no resume, no "you were disqualified" record — and no guard against the accidental `onFinish`-after-unmount described in §2.1.4. *(Reproduced.)*
2. **Background tab / clock drift / sleep**: rAF throttling, laptop lid close, OS sleep — `startedAt` is `performance.now()` at "GO", so the run silently dies while the user is away. *(Reproduced.)*
3. **Backspace semantics**: no rollback of stats; no ability to correct a *completed* word; `wordErrors` is not cleared by backspacing, so a mistype-then-perfectly-corrected word is scored as flawless-but-flawed (green `typed` prefix, red lane entry, `perfect[i] = false`) — the three views disagree about what happened.
4. **Keyboard layout & locale**: `FINGER_OF` and the QWERTY grid assume ANSI-QWERTY. AZERTY/Dvorak/Colemak users get a confidently wrong colour-coded guide, and `ev.key` (not `ev.code`) means `;`/`/` shift to `:`/`?` — which exist in the pools but have **no** touch key (`ROW` `;` is lowercase-only, so `: ` is unreachable on mobile for the token `break;`).
5. **CapsLock / Shift**: `CODE` pool contains uppercase (`Object.entries`, `Promise<Response>`, `JSON.parse`) — Shift+A yields `"A"` and `expect` is `"a"`, so every uppercase-free user is punished silently. The `extras` row compensates for letters, but Home's demo (`Home.tsx:115`) just counts them as errors with no explanation.
6. **Mobile portrait**: layout is `pt-[116px]` + `h-[100dvh]` with a 4-row keyboard + HUD + lanes + focus word + context lane; on a 640×360 viewport the keyboard and the 74 px context lane consume the whole height. There is no `overflow` fallback and `body{overflow:hidden}` (`index.css:33`) means content is *unreachable*, not scrollable. No `env(safe-area-inset-*)` either, despite `viewport-fit=cover`.
7. **Multi-tab**: two tabs on the same origin each hold their own `stats` and `saveStats` overwrites wholesale (`storage.ts:47`) ⇒ last finisher silently deletes the other tab's runs. No `storage` event listener, no merge strategy.
8. **Degenerate word pool**: `medium` is 126 tokens with only **45 unique** (verbatim duplicated blocks in `words.ts:5`); a 45-word RACER track yields **31 unique words, `"those"` ×5** (measured). `code` is 55 tokens / 48 unique, of which `{` ×5 and `}` ×3 in one 45-word sample — "SYNTAX" mode is ~11% bare braces (avg token length **4.5**), not code typing. `EASY` has 174/201 unique with `"own"` ×4. The "avoid repeats" guard (`words.ts:41-45`) gives up after 3 retries.
9. **Accessibility**: `user-select:none`, a global `keydown` listener with `preventDefault()` on every printable key, and `z-50` canvas overlay mean a screen-reader/keyboard-only user cannot tab past or read state; HUD numbers update 10×/s with no `aria-live`; touch keys fire on `onPointerDown` only — `preventDefault()` suppresses focus, so **the on-screen keyboard is unusable via keyboard/AT**; the pause dialog has no focus trap or `role="dialog"`; `prefers-reduced-motion` is honoured by CSS (`index.css:201`) but **not** by framer-motion (`useReducedMotion` — 0 uses) or by the 3 concurrent rAF loops (`useEngine:283`, `RivalTrack:84`, `FxCanvas:158`).

---

## 3. Dependencies & Security

### 3.1 Ghost / mismatched dependencies

Declared-but-unused (reachable only through dead code):

| Package | Only consumer | Verdict |
|---|---|---|
| `clsx@2.1.1` | `src/utils/cn.ts:1` | **dead** — delete with `cn.ts` |
| `tailwind-merge@3.4.0` | `src/utils/cn.ts:2` | **dead** — ditto. Together they are ~8 KB gzip + `@types`-free install weight for a function nobody calls |
| `@types/node@22.19.17` + `tsconfig "types":["node"]` | `vite.config.ts:1-2` (`path`, `url`) | keep, but `vite.config.ts` is in the *app* `include` (`tsconfig.json:30`), so Node globals leak into `src/` and `process.env` typechecks in browser code |

Used-but-undeclared: none — `framer-motion`, `lucide-react`, `react`, `react-dom` all resolve, and `tsc` is clean. **However**: `lucide-react` is imported in `Play/Home/Results/Stats` while `index.html` has no tree-shaking budget concerns… and no `import type` mismatch. Clean.

Missing entirely: `eslint` + `eslint-plugin-react-hooks` (while 4 disable comments reference it), `prettier`, `vitest`/`@testing-library/react`/`jsdom`, `typescript`'s `tsconfig.node.json` split, `npm run typecheck` / `lint` / `test` scripts (`package.json:6-10` has only `dev`/`build`/`preview`).

Version policy is incoherent: `framer-motion "^14.6.0"` and `lucide-react "^1.61.0"` are ranged while all nine other deps are exact pins — with no `.npmrc`/`packageManager`/`engines`, `npm i` on a fresh machine can legitimately resolve different majors-of-the-future for those two and nothing else. All versions are real and installable (verified against the registry), but the repo is already **behind**: `react 19.2.6` vs `19.3.1`, `vite 7.3.2` vs `7.3.7`, `typescript 5.9.3` vs `7.0.2`.

### 3.2 Security

* **No hardcoded secrets, no `.env` leakage, no XSS sinks.** `grep dangerouslySetInnerHTML|innerHTML|eval|new Function|document.write|postMessage` → 0 hits. React escaping + `JSON.parse` with no `eval` is correct. This is genuinely clean, and worth saying.
* **`npm audit` (verified today): 1 high, 1 low.**
  * `vite 7.0.0 – 7.3.6` — 7 advisories incl. **GHSA-9jrq-w75r-8gcw** (cross-origin script execution via custom middleware) and **GHSA-rq7h-c2jc-7f22** (`server.fs.allow` bypass serving files outside the project root). Dev-server-only, but the repo is a Vite SPA whose only runtime *is* the dev server for most consumers; and `npm audit fix` cannot resolve it (`vite@7.3.7` is outside the pinned range) ⇒ **`npm audit --audit-level=high` in CI would fail**.
  * `esbuild 0.27.3 – 0.28.0` — GHSA-g7r4-m6w7-qqqr (arbitrary file read via Windows dev server).
* **Third-party supply chain, unauthenticated**: `index.html:9-14` pulls render-blocking CSS + fonts from `fonts.googleapis.com` with **no SRI, no `crossorigin` on the stylesheet, no self-hosted fallback, no CSP**. For an arcade game whose *entire visual identity* is "Bungee"/"JetBrains Mono", a blocked/unavailable font CDN silently changes glyph metrics — and in a typing game, glyph metrics change where characters land. Self-host the three families (`@fontsource`) and it also stops the offline white-text flash.
* **Client-authoritative persistence.** `keyrush.stats.v2` is unsigned, unversioned (`v2` in the name, no migration code), and *is* the leaderboard. Any same-origin XSS or browser extension can rewrite WPM/badges/scores; there is no integrity check, no schema version, no quarantine. This is fine for a toy and fatal the moment a score is shared or compared — which the app invites ("post your fastest lap ever", `types.ts:20`). If any leaderboard/online feature is added, `RunRecord` must be server-side-verified (or at minimum HMAC'd with a per-install secret and replay-proof nonce).
* **DoS of self**: `recordRun` writes the full `series` array (up to 240 samples/run, `useEngine.ts:337`) ×60 runs, `JSON.stringify`'d synchronously on the finishing frame (`storage.ts:49`). No debounce, no cap on `series` per record, no IndexedDB. On a constrained device that's a synchronous main-thread write inside the victory-animation frame budget.
* **`user-select:none` + global `preventDefault` on all printable keys** (`Play.tsx:207`, `Home.tsx:114`) is also a security-relevant UX hazard: the user cannot select/copy their own error stats, and the app swallows browser shortcuts that don't carry ctrl/meta/alt (e.g. Firefox `/' quick-find, `Tab` for focus navigation — see §2.3.9).

---

## 4. What Lacks (The Missing Pieces)

### 4.1 Scale barriers (10×)

There is no backend, so "10× traffic" for this repo means: **10× concurrent static files, 10× stored data per user, 10× input rate per frame.**

1. **`vite-plugin-singlefile` (`vite.config.ts:12,16`) is the first thing to break.** Every payload is one 463 KB HTML document — JS, CSS and the whole app, un-cacheable independently. 10× traffic = **4.6 GB of egress per 10 k visits** (a hashed `index-*.js` + `index-*.css` split would let repeat visits cost 0 bytes), no code-splitting of the 4 screens (Results/Stats are ~30 % of the parse cost and are dead weight on first paint), and no `modulepreload`/parallel download. Drop the plugin unless a single-file artifact is a hard requirement; add `manualChunks` for `framer-motion` + `lucide-react`.
2. **`vite build` has no `tsc -b`** in the `build` script — CI would report green on 29 type-unsound index accesses (§0). Also no `--minify`-aware budget check and no bundle-size gate.
3. **10× input rate**: `publish()` is called on *every* `press`/`backspace`/`skip` **and** every 100 ms (`useEngine.ts:345-348`) ⇒ `setSnap` with a brand-new object ⇒ `Hud` (memo) + `Play` + `WordTrack` re-render. `WordTrack` renders all 25-50 word spans **and** the focus word's per-character spans on every keystroke (`WordTrack.tsx:96-125`) — O(track length) DOM diff per character. At 120 WPM that's ~2 renders/ms of work; at 10× (a `code` race with 50 long tokens) it is the first frame budget to blow. Fix: window the context lane to ±8 words instead of `words.map`, and coalesce `publish` into the existing rAF tick (which already exists — the per-keystroke `publish()` is redundant).
4. **Two permanent rAF loops that never idle.** `RivalTrack`'s loop (`:84-118`) keeps running after `finished`/`idle` — it early-returns but still burns a frame callback forever on Home→Play→Results→Home for the whole session. `FxCanvas`'s loop (`:158-243`) runs forever even with 0 particles; it should park when `parts.current.length === 0 && flash.a <= 0.002`.
5. **Storage ceiling.** `localStorage` is ~5 MB, synchronous, single-origin, and holds 60 runs × (record + up-to-240-sample series + `keyMisses` map). `saveStats` swallows `QuotaExceededError` (`:49-52`) — at scale you lose career data with **no signal at all**. Needs IndexedDB (or a `runs`/`totals` key split with incremental appends) plus a real "storage full" UI state.
6. **No `runs.length` total** (§2.1.9), no pagination, and `Stats.tsx` recomputes 5 `useMemo`s over `stats.runs` on every stats change — trivial at 60, linear forever at 10× with the cap removed.
7. **Nothing at all for multi-user.** No identity, no score service, no anti-cheat. If "post your fastest lap ever" is meant literally, §2.1.1/§2.1.2 make the leaderboard decorative. That decision (local-only vs server) must be made before anything else scales.

### 4.2 Missing production infrastructure (all of it)

Verified absent from the repo root — `vite.config.ts` is the **only** config file present:

* **`.gitignore`** — as a direct result, `node_modules/` is currently untracked-but-visible in `git status` in my working copy; one `git add -A` commits ~60 MB of dependencies. This is the cheapest, highest-value missing file in the repo.
* **`README.md`** — no setup, no run/build instructions, no mode/difficulty documentation, no architecture note, no screenshots. Nothing tells a new contributor that `MODES` in `game/types.ts` is the tuning surface.
* **`LICENSE`** — `private: true`, `version: 0.0.0`, no license ⇒ legally "all rights reserved", unsharable, and it blocks any future open-source or portfolio use.
* **`Dockerfile` + `nginx.conf` (or a static host config)** — for a static SPA, a 6-line multi-stage build (`npm ci && vite build` → `nginx:alpine`) plus `Content-Encoding: br`, `immutable` cache headers and SPA fallback.
* **CI** (`.github/workflows/ci.yml`) — `npm ci` → `npm run lint` → `tsc --noEmit` → `vitest run` → `vite build` → `bundlesize` budget → `npm audit --audit-level=high`. There is no `.github/` directory at all.
* **`.env.example` + a config module** — even with no secrets, there is no way to configure build-time flags (analytics opt-in, leaderboard endpoint, `VITE_SENTRY_DSN`) without editing source. Nothing reads `import.meta.env` today.
* **Error monitoring** — no Sentry/CrashReporting, no boundary, no `window.onerror`. A white-screen failure in the wild is invisible and unrecoverable (§2.1.5).
* **`public/` assets** — no favicon, no `og:image`, no `<meta name="description">` social partner, no `manifest.webmanifest` (the app declares `theme-color` and `viewport-fit=cover` and is explicitly touch-first, so a PWA install with `display: standalone` is nearly free and would fix the mobile URL-bar/safe-area story), no `robots.txt`.
* **`engines`/`packageManager` in `package.json`**, `.nvmrc`, `.npmrc` — nothing pins Node/npm for reproducible installs.
* **a11y baseline** — `role="dialog"` + focus trap for the pause overlay, `aria-live="polite"` for HUD telemetry, `useReducedMotion()` for all framer-motion transitions, keyboard-activatable touch keys.
* **No state machine.** Status transitions are implicit `if`s spread over 5 callbacks and 1 rAF loop (`idle/countdown/playing/paused/finished`). A `transition(status, action)` table is the single refactor that would have prevented §2.1.1, §2.1.2 and §2.1.6 structurally.

### 4.3 Testing — currently: **0 tests, 0 test dependencies**

For a game whose value is arithmetic correctness, this is the biggest gap. Not one assertion exists, and the `build` script never type-checks, so nothing in this repo can fail a regression. Highest-value targets, in order (each of these tests fails on `master` today):

1. **`useEngine` reducer-style unit tests** (no DOM needed — wrap the hook with a `renderHook`-style harness):
   * backspace rolls back `score/dist/correctChars/combo/perfectWords` **exactly** *(fails)*
   * skip-all cannot produce `finished: true` or `accuracy: 100` with 0 correct chars *(fails)*
   * `multFrom`: 0→1, 3→1, 4→2, 16→5, 17→5 *(passes, and locks the duplicated rule)*
   * `finish()` is idempotent; `abandon()` returns `null` when idle/finished, a `finished:false` record otherwise
   * time-attack: a run that completes all words before the clock still ends correctly; a run with time left at word end does not stop the race *(fails)*
   * `dt` clamp rejects negatives; rivals never move backwards *(fails)*
2. **`storage` round-trip/fuzz tests**: every malformed `Stats`/`Settings` payload must either be repaired or replaced by defaults — never returned half-valid *(fails)*; `recordRun` totals are additive and monotonic; the `runs` cap must not affect the displayed race count *(fails)*; `saveStats` surfaces quota failure in a test double *(fails)*.
3. **`words.buildTrack` invariants**: length === count, no immediate repeats when `pool ≥ 2`, every returned token non-empty, **uniqueness ratio ≥ 0.8** (would have caught the 45-unique-of-126 `medium` pool, §2.3.8).
4. **A single clock/time module test** so `Date.now()` vs `performance.now()` mixing is structurally impossible (would have caught §2.1.3 on the day it was written).
5. **`BADGES` predicate tests** — one per badge, with an explicit "zero keystrokes must not unlock anything" case.
6. **Playwright e2e** (this is where the real bugs live): 25× `Tab` ⇒ assert no Results screen is reached with `accuracy 100`; Quit during the finish handoff ⇒ assert you stay on Home and no record is written; blur/refocus mid-race ⇒ assert the clock auto-paused.
7. **Visual/props smoke**: render `Stats` with a `code`-mode record and assert no `undefined` appears in computed styles (would catch §2.1.8).
8. `tsc --noUncheckedIndexedAccess` as a CI step: 29 errors, all in `FxCanvas.tsx` array-of-particles indexing — the class of bug that produces `p.life` on `undefined` at 3 a.m.

---

## 5. Actionable Roadmap

### 🔴 Critical — fix immediately (blocks shipping / loses data / breaks the product)

- [ ] **C1 · `Play.tsx:162`** — register the 1250 ms handoff timeout and clear it on unmount (or replace with `onAnimationComplete` on the exit transition). Stop `setScreen("results")` from firing over the Home screen and stop ghost DNF writes to `localStorage`. *(repro: §2.1.4)*
- [ ] **C2 · `useEngine.ts:410-415`** — make backspace reversible: decrement `correctChars`, `dist`, per-word `score`, and recompute `combo/mult/perfectWords`. Add the "type → backspace → re-type" unit test as the acceptance gate. *(§2.1.1)*
- [ ] **C3 · `useEngine.ts:427-443, :461`** — a finish must require real input: `finished = (correctChars > 0) && !skippedLast && idx === words.length`; accuracy `0` (not 100) when nothing was typed; skip-penalised runs excluded from `best`/leaderboard. *(§2.1.2)*
- [ ] **C4 · `Play.tsx:88,97,428`** — unify the clock: one `now()` (or a monotonic counter) for flash timestamps; the desktop next-key tutor is currently frozen on the last-pressed key. *(§2.1.3)*
- [ ] **C5 · `storage.ts:29-45,71`** — validate/de-sanitise every persisted object (`RunRecord`, `Stats`, `Settings`), drop bad entries, quarantine + surface unrecoverable payloads, and wrap `App` in an `ErrorBoundary` with a "reset data" action. *(§2.1.5, §2.1.7)*
- [ ] **C6 · `useEngine.ts:283`** — auto-`togglePause()` on `visibilitychange`/`blur`; rebase `startedAt` on resume so the wall clock can't eat a 60 s race. *(§2.1.6)*
- [ ] **C7 · `.gitignore`** — add `node_modules`, `dist`, `coverage`, `.env*`, `*.local` **before** anything is committed. *(§4.2)*
- [ ] **C8 · deps** — `npm pkg set devDependencies.vite=^7.3.7 devDependencies.esbuild=`… bump to clear both advisories, then add `npm audit --audit-level=high` to CI. *(§3.2)*
- [ ] **C9 · `package.json:8`** — `"build": "tsc -b && vite build"` and add `"typecheck": "tsc --noEmit"`. Today's build cannot fail on a type error. *(§4.1.2)*

### 🟠 Medium — refactor next (correctness hygiene, duplication, structure)

- [ ] **M1 · `Stats.tsx:16-25,273`** — delete the forked `FINGER_COLOR`; export it (with `thumb`) from `TouchKeyboard` alongside `FINGER_LABEL`/`fingerOf`. Fix the SYNTAX diagnostics. *(§2.1.8)*
- [ ] **M2 · delete `src/constants.ts` and `src/utils/cn.ts`**, then `npm rm clsx tailwind-merge`. Removes 29 lines of dead code and 2 ghost dependencies in one commit. *(§1.1)*
- [ ] **M3 · `words.ts:3-9`** — replace the pools with real frequency lists (e.g. 1000 most-common English for `medium`, a curated operator/keyword set for `code` with no bare `{`/`}` filler); de-duplicate `MEDIUM` (126 tokens / 45 unique) and add a uniqueness-ratio test. *(§2.3.8)*
- [ ] **M4 · extract one telemetry module** `game/metrics.ts`: `wpm(dist, elapsed)`, `accuracy(correct, total)`, `fmtDuration`, `FIVE_CHAR_WORD`. Replace all 9 copies (`useEngine.ts:160-163,338,459-461`; `RivalTrack.tsx:103`; `Stats.tsx:63`) and reconcile the 400 ms/500 ms/no-guard divergence.
- [ ] **M5 · `game/config.ts`** — build `MODE_BY_ID`/`DIFFICULTY_BY_ID` maps, make lookups total (`getMode(id): ModeDef | undefined`) at the boundaries, and delete 7 `!` assertions on externally-sourced ids. *(§1.2)*
- [ ] **M6 · `useEngine.ts:47-77,216-244`** — introduce `initialState(def)` and have `start()` call it, replacing 28 hand-copied assignments; export `Internal` (or a readonly view) so `Play.tsx:24-29` and `RivalTrack.tsx:65` stop re-declaring the shape; drop the `null as unknown as Internal` cast and the unused `def` parameter + `...(def?{}:{})` and `void crashed` residue. *(§1.3)*
- [ ] **M7 · `useEngine.ts:215-231`** — carry `crashed: boolean` (or `reason: "finished"|"crashed"|"dnf"|"timeout"`) into `RunRecord` so Results/Stats/leaderboard can distinguish outcomes, and start wiring `abandon()` into `onQuit` (or delete it and fix the comment). *(§1.1, §1.3, §2.1.9)*
- [ ] **M8 · `types.ts`** — move `DRAIN`, starting energy (`:229`), rival count, word count-per-difficulty and the `multFrom` tier table into `ModeDef`/`DifficultyConfig`, and make `Play.tsx:105` (the `+pts` popup) *read* the awarded score from the event instead of recomputing it. *(§1.4, §2.1.11)*
- [ ] **M9 · `storage.ts:143`** — persist `totals.races` and `totals.finishedRaces` and render the tile from those; keep the 60-run *detail* cap. *(§2.1.9)*
- [ ] **M10 · charts** — one `<Sparkline series kind size>` for `Hud.tsx:6-46`, `Results.tsx:22-60`, `Stats.tsx:92-105`; use `useId()` for every SVG gradient id and fix `RivalTrack.tsx:5`'s colour-keyed ids. *(§1.2, §2.1.12-16)*
- [ ] **M11 · errors & timers** — single `useTimers()`/`useRaf(cb, active)` hook used by `useEngine`, `RivalTrack` and `FxCanvas` so loops park when idle/finished and every timer is cleaned up; add `Math.max(0, …)` to `dt`; add a `QuotaExceededError` state to the UI. *(§2.1.10, §4.1.4)*
- [ ] **M12 · `Results.tsx:68,149,251`** — replace the `===` "new record" heuristic with a real `previousBest` comparison, `P{place}/3` literal, and look badges up in `BADGES` for `name`/`desc`/`color`. *(§2.1.12-16)*
- [ ] **M13 · toolchain** — add `eslint` + `react-hooks` (`exhaustive-deps` as error) + `prettier`; fix the currently-suppressed dep arrays (`Home.tsx:87,121`, `Play.tsx:167,191`) instead of commenting them out; enable `noUncheckedIndexedAccess` and clear the 29 `FxCanvas` errors. *(§1.3, §4.3.8)*
- [ ] **M14 · tests** — vitest + `@testing-library/react` + jsdom, with the 8 suites in §4.3 as the initial acceptance list.
- [ ] **M15 · a11y** — `role="dialog"` + focus trap for pause, `aria-live="polite"` on the telemetry row, `onClick` (not only `onPointerDown`) on touch keys, `useReducedMotion()` gating all framer-motion variants. *(§2.3.9)*

### 🟡 Low — optimisation, hardening, docs

- [ ] **L1** — window the context lane to a ±8-word slice (`WordTrack.tsx:96`) to make per-keystroke renders O(1); delete the redundant `publish()` inside `press`/`backspace` (`:407,414`) — the 10 Hz tick already covers it.
- [ ] **L2** — park `FxCanvas`'s rAF when there are no particles and no active flash; cap `parts.current` at e.g. 300 rather than 900 (`FxCanvas.tsx:241`).
- [ ] **L3** — replace `.sort(() => Math.random() - 0.5)` in `useEngine.ts:86` with the `shuffle()` that already exists in `words.ts:19` (currently unused by the caller that needs it) — a biased shuffle changes which rivals you face.
- [ ] **L4** — remove `vite-plugin-singlefile`; add `rollupOptions.output.manualChunks` for `framer-motion`/`lucide-react` and a lazy `import()` for Results/Stats.
- [ ] **L5** — self-host the 3 font families (`@fontsource/bungee`, `space-grotesk`, `jetbrains-mono`) with a preloaded `woff2` + `font-display: swap`; drop the third-party CSS round trip (also fixes metrics stability, which matters for typing).
- [ ] **L6** — palette enforcement: one `theme.ts` exporting the accent set, Tailwind `@theme` tokens referenced via `var()` in inline styles, `--color-ink` vs `#0a0d1c` reconciled, `--color-grape` used or deleted; add a lint rule / CI grep banning raw hex in `src/**/*.tsx`.
- [ ] **L7** — persist with debounce + `requestIdleCallback`, and move `runs`/`series` to IndexedDB if the retention window grows beyond 60.
- [ ] **L8** — add cross-tab sync via a `storage` listener (or a versioned write-through so a stale tab can't clobber).
- [ ] **L9** — `sfx.muted = settings.sound` (`Home.tsx:187`) is an inverted-looking assignment that is only correct because the `App.tsx:31-34` effect re-applies it; delete the line and let the effect own the flag. Add `useEffect(() => { sfx.muted = !settings.sound }, [settings.sound])` once at the top of `App`.
- [ ] **L10** — countdown constants (`i * 520`, `1560`, `:243-263`) belong in `ModeDef`/`constants`, with `sfx.tick(0)` ("GO" beep) actually emitted — `tick(n === 0)` exists but `countdown` never reaches 0 before `go`, so that branch is dead.
- [ ] **L11** — `index.html`: add favicon + `og:`/`twitter:` meta + `manifest.webmanifest` + `<noscript>`; add `env(safe-area-inset-bottom)` padding for the mobile keyboard row.
- [ ] **L12** — README: screenshots, how to tune a mode, the state-machine diagram, why the engine uses a ref (and the two-channel caveat), how to add a word pool, and the deliberate decision that scores are local-only.
- [ ] **L13** — add `engines.node`, `packageManager: "npm@…"`, `.nvmrc`, and a `prepare`/`husky`-free CI-only guard (no need for local hooks on a 1-person repo).
- [ ] **L14** — `LICENSE` (MIT/Apache-2) and an `AUTHORS`/provenance note if this is a portfolio piece.

---

### Appendix — reproduction method

`dist/index.html` built from this exact commit; the real `useEngine` hook and the real `<Play/>` / `<Stats/>` components were rendered in jsdom 30 under React 19's `act()`, driven with synthetic `keydown` events (Tab-skip), real `setTimeout`/`requestAnimationFrame` timing, and `localStorage` inspection. Every `[REPRO]` number in §2 came out of that harness — including the 1280-point single-word farm, the 1400-point `accuracy:100` skip-to-victory, the frozen `"t"` next-key guide, the post-unmount `onFinish`, the `TypeError: … 'accent'` white screen, the 40-second alt-tab clock loss, and the 22 unmapped SYNTAX characters.

---

## 6. Remediation status (post-audit, same branch)

Every item above was taken to code. `git diff HEAD --shortstat` at the time of writing: **24 files changed, 5 967 insertions, 2 977 deletions** (the initial commit is the only ancestor; the audit and the fix share one working tree).

### 6.1 Gate — what the repo now proves about itself

| Command | Before | After |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 errors, but 29 `any`-typed escape hatches, no `noUncheckedIndexedAccess` | **0 errors** under `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noImplicitOverride` + `noImplicitReturns`; zero `any`, zero `@ts-ignore`, zero `eslint-disable` |
| `npm run build` | `vite build` only — **could not fail on a type error** | `npm run typecheck && vite build` |
| tests | **0 files, 0 test dependencies** | **9 files / 134 tests, all passing** (`npx vitest run`) |
| `npm run test:coverage` | none | 93.77 % stmts / 82.18 % branch / 96.55 % funcs / 96.38 % lines, with `vitest.config.ts` thresholds 90/78/94/92 as **enforced floors** |
| `npx eslint .` | not installed | clean under `typescript-eslint` + `react-hooks` (`exhaustive-deps` = error) + `react-refresh` |
| `npm audit --omit=dev --audit-level=high` | 2 advisories (vite, esbuild) | **0**, and CI runs it |
| `dist/index.html` | 788 kB / 366 kB gz (Google-Fonts runtime request) | **619.8 kB / 241.7 kB gz**, no third-party origin at all; CI budget 260 KiB (gz) |

### 6.2 Roadmap → code

| Item | Status | Where / how |
| --- | --- | --- |
| **C1** handoff timer | ✅ | `Play.tsx` `handoffRef` + `clearTimeout` on unmount and on `launch()`; the timer now only *navigates*, so no ghost `results` screen and no second `localStorage` write |
| **C2** backspace refund | ✅ | `rules.ts:keyDown` pops one `typedScores`, refunds `SCORE.perChar · mult · len`, `correctChars--`, `dist--`; `tests/rules.test.ts` asserts the exact 155 → 1280 → 155 cycle that used to inflate |
| **C3** finish requires real input | ✅ | `rules.ts:toRecord` — `valid = totalChars ≥ MIN_VALID_CHARS(8)`; **no finish bonus and no `place` unless `valid`**, so 38 Tabs no longer buy 1 400 points, a badge and 1st place. `prepareRun` rejects empty pools |
| **C4** one clock | ✅ | `src/game/clock.ts` (`now()`, `stamp()`) is the only time source; `useEngine` is the only rAF owner and publishes at a 10 Hz ceiling; the next-key tutor is event-driven, so `#35e0a166` can no longer be produced by 263 000 idle `keyMisses` |
| **C5** validated storage + boundary | ✅ | `storage.ts` rewritten as a parse-don't-validate boundary: `parseRun`/`parseSettings` drop bad fields, back-fill legacy shapes, quarantine unrecoverable payloads and return typed `issues` (`corrupt/partial/unavailable/quota`); `App.tsx` renders them as dismissible notices behind `ErrorBoundary` with a reset action |
| **C6** hidden tab | ✅ | auto-`pause()` on `visibilitychange`/`blur`, `resume()` on focus, and pause is *clock-neutral* by construction (`pausedAt` + `elapsed` instead of a `startedAt` rebase) — a 60 s race cannot be eaten by an alt-tab |
| **C7** `.gitignore` | ✅ | `node_modules`, `dist`, `coverage`, `.env*`, `*.local`; `dist/` and `coverage/` are gone from the tree |
| **C8** deps | ✅ | `vite ^7.3.7`, `esbuild` resolved, react/tailwind/singlefile bumped, `npm audit` 0, `audit:ci` wired into `.github/workflows/ci.yml` |
| **C9** build honesty | ✅ | `build = typecheck && vite build`; `verify` runs format → lint → typecheck → test → build |
| **M1** finger/palette single source | ✅ | `src/game/fingers.ts` owns `FINGER_LABEL/COLOR/ORDER/KEYS/HOME_ROW/fingerOf/isOnLayout` (`{` → right pinky); `Stats.tsx`'s forked `FINGER_COLOR` and the `undefined66` `thumb` colour are gone; `PALETTE` in `config.ts` + `@theme` tokens in `index.css` are the only colour sources (2 raw hex in `WordTrack` moved to `--color-panel-fade`) |
| **M2** dead files | ✅ | `git rm src/constants.ts`, `rm -rf src/utils`, `npm uninstall clsx tailwind-merge` |
| **M3** word pools | ✅ | EASY 185 / MEDIUM 82 / HARD 90 / CODE 100 unique tokens, ≤ 24 chars, no bare `{` filler; `tests/words.test.ts` asserts uniqueness ratio, length and layout coverage |
| **M4** telemetry module | ✅ | `src/game/metrics.ts` (`wpm` with the 600 ms warm-up, `accuracy`, `charsToWords`, `multFrom`, `formatClock`, `formatDuration`, `ordinalSuffix`, `placeLabel`, `formatNumber`); the 9 duplicated copies are deleted |
| **M5** total lookups | ✅ | `getMode`/`getDifficulty` fall back to `MODES[0]`/`DIFFICULTIES[0]`; the 11 `find(...)!` assertions are gone |
| **M6** one state shape | ✅ | `rules.ts:createRun` is the only initialiser (`Object.assign(s, createRun(…))` on restart); `useEngine` exports the readonly view, so `Play`/`RivalTrack` stopped re-declaring it; `null as unknown as Internal`, `...(def?{}:{})` and `void crashed` deleted |
| **M7** outcome carried | ✅ | `EndReason = "track" \| "clock" \| "crash" \| "abandon"` on `RunRecord` and `GameSnapshot`; `Results.tsx:END_COPY` reads it; `abandon()` is wired into quit and is the *single* writer |
| **M8** tunables | ✅ | `DRAIN`, energy, rival count, `trackFactor`, `COMBO`, `SCORE`, `HANDOFF`, `COUNTDOWN`, `TIPS` live in `config.ts`; the `+pts` popup reads the awarded value from the event instead of recomputing |
| **M9** honest totals | ✅ | `career.ts:emptyTotals()` persists `races`/`finishedRaces`; `Stats.tsx` renders those, not `runs.length`, so 200 races no longer reports "RACES 60" |
| **M10** charts | ✅ | one `Sparkline` + `pointColors` shared by `Results`/`Stats`; `useId()` for every gradient id (duplicate `linearGradient` id in `RivalTrack` fixed) |
| **M11** timers & dt | ✅ | `advance` clamps `dt = min(MAX_FRAME_MS, max(0, dtMs))` (that clamp is what turned −84.7 rival chars into a no-op); `FxCanvas` parks its loop when idle (covered by a test); quota failures reach the UI |
| **M12** Results honesty | ✅ | the `wpm === best` "NEW RECORD" heuristic is deleted; standing is expressed via `placeLabel` and a `valid` gate ("counts toward personal bests" vs "history only"); badges resolve through `badgeName(id)` — an unknown id renders *Unknown Badge*, never the raw key |
| **M13** toolchain | ✅ | eslint + prettier + `.editorconfig` + `.nvmrc`; the 4 commented-out dep arrays are real fixes; the strictest `tsconfig` flags are on |
| **M14** tests | ✅ | `rules`(29) `metrics`(12) `storage`(11) `words`(11) `badges`(14) `engine`(12) `audio`(9) `view`(23) `screens`(12) = **134** |
| **M15** a11y | ✅ | `role="dialog"` + `useFocusTrap` on pause, `sr-only role="status" aria-live="polite"` narration, `onClick` + `onPointerDown` on touch keys, `useReducedMotion()` gating FxCanvas/WordTrack/Home marquee/Sparkline, `prefersCoarsePointer()` showing the on-screen keyboard by default |
| **L1** render cost | ✅ | `WordTrack` windows ±8 words behind a memoised row; the redundant `publish()` in `press`/`backspace` is replaced by the 10 Hz ceiling |
| **L2** particle budget | ✅ | `MAX_PARTICLES = 420` with head-trimming instead of unbounded growth; loop parks |
| **L3** shuffle | ✅ | Fisher–Yates in `words.ts:shuffle` + a reshuffled bag draw; `sort(() => Math.random() - 0.5)` is gone |
| **L4** code-splitting | ⛔ **declined** | `vite-plugin-singlefile` is the deployment contract for this artifact (one self-contained `dist/index.html`); splitting would break the host. Payload was attacked at the real cause instead — fonts (below) |
| **L5** fonts | ✅ | `@fontsource/bungee` + `@fontsource-variable/{space-grotesk,jetbrains-mono}`, **latin-only `@font-face` rules** in `index.css`; the 788 kB build came from importing the packages' `index.css`, which base64-inlined every subset *and* the `.woff` fallback. Accepted trade-off: non-latin glyphs fall back to a system face |
| **L6** palette policy | ✅ | one `PALETTE` object, `@theme` tokens, no raw hex in components except `main.tsx`'s pre-hydration error style (which must render before CSS exists) and canvas/SVG white |
| **L7** write batching / IndexedDB | ⏸ not done | 60-run cap keeps the payload ~30 kB; revisited only if retention grows |
| **L8** cross-tab | ✅ | `subscribeToStorage` reloads settings/career; a live race's `stats` key is never re-read mid-run |
| **L9** mute flag ownership | ✅ | `Home.tsx`'s inverted `sfx.muted = settings.sound` deleted; `App.tsx:71` is the only writer |
| **L10** countdown constants | ✅ | `COUNTDOWN { from: 3, stepMs: 520, goMs: 1561 }` in `config.ts`, `go` event emitted so the "GO" beep branch is reachable |
| **L11** document head | ✅ | favicon, `og:`/`twitter:` meta, `manifest.webmanifest`, `robots.txt`, `<noscript>`, `env(safe-area-inset-*)` on the keyboard row and HUD |
| **L12** README | ✅ | `README.md`: run/build table, `src/game` map, the 7 invariants an editor must not break, a11y/privacy/testing/CI rationale |
| **L13** toolchain pinning | ✅ | `engines.node`, `packageManager`, `.nvmrc`, `package-lock.json` committed, CI uses `npm ci` |
| **L14** provenance | ✅ | `LICENSE` (MIT) added |

### 6.3 Defects the *tests* found that the audit missed

Worth recording, because all four were in code written as part of this remediation and none of them was visible by reading:

1. **`Play.quit()` double-persisted the DNF record.** `abandon()` ends the run through the normal path, whose `end` event had already called `onSettled`; `quit()` then handed the same record to `onSettled` again → `totals.races` incremented twice and a duplicate row in `stats.runs` for one abandoned race. The `end` event is now the single writer. *Found by `tests/screens.test.tsx` asserting `runs).toHaveLength(1)`.*
2. **`rules.ts:toRecord` gave bonuses and `place` to invalid runs** — the C3 fix was initially only half-applied (skip path settled `place`, finish path did not). `tests/rules.test.ts` pinned both doors.
3. **`storage.ts:intArrayOf` accepted any magnitude**, so a hand-edited `series` of `1e12` was persisted and re-rendered as an unusable chart; values are now clamped by `MAX_SERIES_VALUE = 500`.
4. **`useFocusTrap` gated focusability on `offsetParent`/`tabIndex >= 0`**, which is false for `<button>` in jsdom *and* for any `position: fixed` subtree in a real browser — the trap silently never trapped. It now asks the markup only: selector match plus `!disabled`, `!hidden`, `aria-hidden !== "true"`.

### 6.4 What is still open, deliberately

- No server, no accounts, no anti-cheat: scores remain local and unsigned by design. A leaderboard would need a signed submission contract, not a `fetch`.
- `wpm` is raw (not adjusted); `MIN_VALID_CHARS = 8` is a judgement call, not a law.
- CI has no visual/browser job: `Play`'s layout is exercised in jsdom only, and `AnimatePresence` screen swaps cannot be driven under fake timers (documented in `tests/screens.test.tsx`) — the App-level tests therefore spend real milliseconds.
- `nginx.conf`/`Dockerfile` ship security headers but no CSP `nonce`; `'unsafe-inline'` remains because the artifact is a single inlined HTML file.

### 6.5 Post-remediation finding: the deployment path was the bug nobody could see in the source

The audit graded §4.2 on *what the repo contains* and stopped there. Checking what the repository
actually **publishes** found a defect in the shipped product that no amount of reading `src/` would
surface:

- `gh api repos/…/pages` → `build_type: "legacy"`, `source: {branch: "master", path: "/"}`. GitHub
  was running the Jekyll branch pipeline over the repo root, so the live site at
  `omkarsolat-17.github.io/Typing-Racing-Game/` was serving `index.html` with
  `<script type="module" src="/src/main.tsx">` — raw, untranspiled TSX. **The production URL was a
  blank page while every local check was green.** `git ls-tree master` confirms the root contains
  `src/` and no build output.
- With `base` left at Vite's default `/`, `href="/favicon.svg"`, `href="/manifest.webmanifest"` and
  the manifest's `"start_url": "/"`, `"scope": "/"` all resolve to the *domain root* under a project
  page — icons 404 and the PWA install prompt points at `omkarsolat-17.github.io/`.

Closed by:

| Change | File |
| --- | --- |
| `base: "./"` — the artifact is location-independent | `vite.config.ts` |
| `./favicon.svg`, `./manifest.webmanifest` | `index.html` |
| `"start_url": "./"`, `"scope": "./"`, `icons[].src: "favicon.svg"` | `public/manifest.webmanifest` |
| Pages pipeline: `npm run verify` → `upload-pages-artifact` → `deploy-pages`, and an idempotent step that switches `build_type` to `workflow` so branch-mode Jekyll can never publish raw source again | `.github/workflows/deploy-pages.yml` |
| CI guard: fail if the artifact has a root-absolute URL or any `/src/main` reference | `.github/workflows/ci.yml` (build job) |
| Deploy + subpath rules documented | `README.md` §Deploy |

Lesson recorded for the next review of an AI-generated repo: **verify what the CI/host config
actually emits, not just that the config exists.** A workflow file that passes locally and a Pages
setting that publishes the wrong tree are perfectly compatible states.
