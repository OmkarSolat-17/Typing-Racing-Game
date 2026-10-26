# KEYRUSH

An arcade typing racer in the browser. You type words to feed a boost tank, race a small
field of scripted rivals, and stack a combo multiplier out of flawless words. Four modes, four
track difficulties, keyboard-and-touch play, persistent career records — no backend, no
accounts, no analytics.

React 19 · Vite 7 · TypeScript (strict, `noUncheckedIndexedAccess`) · Tailwind v4 ·
Framer Motion · WebAudio · Canvas 2D.

---

## Run it

```bash
nvm use            # Node 22 (see .nvmrc); >= 20.19 works too
npm ci             # frozen lockfile
npm run dev        # http://localhost:5199
```

| Script                  | What it does                                                          |
| ----------------------- | --------------------------------------------------------------------- |
| `npm run dev`           | Vite dev server on `:5199` (`strictPort`, no full-page-reload churn). |
| `npm run build`         | `tsc --noEmit` **then** `vite build`. A type error cannot ship.       |
| `npm run build:fast`    | `vite build` only (used by the bundle-budget job).                    |
| `npm run preview`       | Serves `dist/` locally.                                               |
| `npm test`              | Vitest (jsdom). `npm run test:watch` for the UI.                      |
| `npm run test:coverage` | Vitest + v8 coverage, with enforcing thresholds.                      |
| `npm run lint`          | ESLint (flat config, `recommendedTypeChecked` + `react-hooks`).       |
| `npm run typecheck`     | `tsc --noEmit`.                                                       |
| `npm run format`        | Prettier over the repo (`format:check` in CI).                        |
| `npm run verify`        | format → lint → typecheck → tests → build. The pre-push ritual.       |

Deployment is a static host or the included image:

```bash
docker build -t keyrush . && docker run --rm -p 8080:8080 keyrush
```

`vite-plugin-singlefile` inlines the JS, CSS and fonts into one `dist/index.html`, which is the
artifact every host above serves. `base: "./"` in `vite.config.ts` keeps every URL in that file
relative, so the same artifact works from a domain root, a project-page subpath
(`…/Typing-Racing-Game/`) or someone's `file://` download.

## How it is put together

```
src/
  game/            ← the game. No component imports React here.
    types.ts       shared domain types (types-only by design)
    config.ts      every tunable number: modes, difficulties, scoring, energy, rivals, palette
    clock.ts       one monotonic clock (performance.now) + wall-clock stamps + isNightHour
    metrics.ts     wpm / accuracy / multiplier / progress / formatting — defined exactly once
    fingers.ts     the touch-typing layout table (label, colour, key→finger)
    words.ts       word pools, Fisher–Yates shuffle, track builder
    rules.ts       the state machine: keyDown, backspace, skip, advance, pause, toRecord
    badges.ts      achievement predicates over persisted stats
    career.ts      folding a run into lifetime totals + leaderboard
    storage.ts     the localStorage boundary: validate, repair, quarantine, report
    useEngine.ts   React adapter: ref-owned state, rAF loop, timer discipline, snapshots
    audio.ts       procedural WebAudio synth (degrades silently when WebAudio is absent)
  components/      FxCanvas · Hud · WordTrack · RivalTrack · TouchKeyboard · NextKeyGuide · Sparkline · ErrorBoundary
  screens/         Home · Play · Results · Stats
```

Data flows one way. `rules.ts` owns truth; `useEngine.ts` samples it into an immutable
`Snapshot` (immediately on input, otherwise at a 10 Hz ceiling); screens render the snapshot and
read nothing else. The two things that must move at frame rate — the rival lane and the particle
canvas — read the live state ref directly and write to the DOM/canvas themselves, so a keystroke
never costs a React re-render of the whole track.

### Invariants worth knowing before you edit

- **One clock.** `game/clock.ts` is the only time source in the runtime path. Comparing
  `Date.now()` against `performance.now()` is how the key guide used to freeze mid-flash.
- **A race must be typed to count.** `RunRecord.valid` = finished, no skipped words, at least
  `MIN_VALID_CHARS` characters. Only valid runs may hold a personal best, a badge or a podium
  position; everything else is history.
- **Backspace refunds.** Each credited code unit stores its points in `typedScores`; deleting
  takes them back. `wordErrors` is deliberately sticky — erasing cannot un-make a mistake.
- **Pause is free.** `pausedTotal` absorbs any gap (manual pause or a hidden tab), so neither
  the clock nor the WPM average is charged for time you were not racing. Hiding the tab pauses;
  it never auto-resumes.
- **localStorage is untrusted input.** Everything read back is validated, repaired or dropped; an
  unparsable payload is quarantined (`<key>.corrupt`) rather than re-served on every boot, and a
  failed write is reported to the UI instead of swallowed.
- **Keys are matched as text, not as `event.key` names.** `press()` receives characters
  (`ev.key` for a printable key, whole IME commits), and `expectedText` accepts a slice as long as
  what arrived, so astral graphemes stay typeable. `Tab` skips, `Escape` pauses, control keys are
  ignored rather than punished.
- **Colours and word lists have one home.** `config.ts#PALETTE` and `fingers.ts` are the only
  places a hue or a key→finger mapping is written down; `src/index.css`'s `@theme` mirrors the
  palette for CSS.

## Accessibility

Real focus rings, `aria-live` race announcements, a focus-trapped pause dialog, `aria-pressed`
toggles, `role="radiogroup"` for mode/difficulty, semantic tables on the career screen, and a
keyboard-only path through every screen (⏎ starts, `Tab` skips, `⌫` deletes, `Esc` pauses).
`prefers-reduced-motion` disables screen shake, scales particle counts down instead of deleting
the feedback, and stops the marquee. The on-screen keyboard is a real control surface, not a
picture of one: pointer _and_ click activation, per-key labels, no double-fire.

## Privacy

Nothing leaves the browser. No fonts, scripts or analytics are fetched from third-party origins
(fonts are self-hosted subsets, inlined at build time). The only persisted data is
`keyrush.stats.v3` and `keyrush.settings.v3` in `localStorage`, both removable from the career
screen ("Wipe the garage") or with `localStorage.clear()`.

## Testing

`tests/` is 122 assertions over the parts that used to break silently: the rules state machine
(scoring, backspace refunds, skip abuse, clock discipline, energy), the metrics formulas, the
storage boundary under hostile payloads, the word pools and track builder, badge and career
arithmetic, the engine adapter under fake timers, and the components (canvas park-and-resume,
rival lane, focus trap, keyboard, HUD). Coverage thresholds in `vitest.config.ts` enforce
~90% lines on `src/game` + `src/components` — the floor is a regression alarm, not a score.

Interaction-level behaviour (a real browser, real keystrokes, real audio graph) is checked by hand
with `npm run dev`; the scenarios worth re-running after any change to the engine are listed in
[`AUDIT-REPORT.md`](./AUDIT-REPORT.md), which also records what the last review found and how each
finding was closed.

## CI

`.github/workflows/ci.yml` runs four jobs: format+lint+typecheck+coverage, build with a gzip
budget on the single-file payload (260 KiB — about 95 KiB of that is three inlined latin woff2
subsets, see the comment in the workflow before you raise it again), `npm audit` on runtime deps,
and a Docker smoke test that boots the image and asserts `/healthz` answers, that `GET /`
itself carries the CSP/nosniff/frame-deny headers (a header set the document can silently lose,
see the note in `nginx.conf`), and that the built document really contains the app. The
build job also fails if the artifact contains a root-absolute URL or a reference to `/src/main.tsx`
— the second one means untranspiled source leaked into a "built" file.

## Deploy

`.github/workflows/deploy-pages.yml` publishes `master` (or a manual run) to GitHub Pages: it
`npm run verify`s, uploads `dist/` as the Pages artifact and deploys it. Its first step flips the
repository's Pages source to **GitHub Actions** if it is still in branch mode — branch mode
publishes the raw repo root, and for a Vite project that means the live page is an untranspiled
`<script src="/src/main.tsx">`, i.e. a blank screen. The workflow needs `pages: write` for that;
if you would rather click, it is Settings → Pages → Source → _GitHub Actions_.

## Licence

MIT — see [LICENSE](./LICENSE).
