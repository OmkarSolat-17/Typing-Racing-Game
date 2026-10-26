/**
 * Word pools and track construction.
 *
 * Pools are de-duplicated at module load and verified by `tests/words.test.ts`
 * (uniqueness ratio, no empty tokens, no token longer than the lane can render).
 * The `code` pool deliberately contains no bare braces: a race that is 11% `{`
 * is not syntax practice, it is filler.
 */
import type { Difficulty } from "./types";

const tokenize = (raw: string): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw.split(/\s+/)) {
    if (t.length > 0 && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
};

const EASY = tokenize(
  `the be to of and a in that it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take into year your good some could them see other than then now look only come over think also back after use two how our work first well way even new want any these give day most is big high small large next early young important few bad same able own low right old last set put end why let keep run move live feel turn show help start try ask need seem hand call home side kind head house far told went came said made saw may too boy did water long very words name form much great line before cause mean still find tell might hear play read add land part once place near point best more much sure real open both under again every while where why`,
);

const MEDIUM = tokenize(
  `people system program question number different always example change another place around never between because every right thought under against while through during those where world still state three small group begin large often early point found study might house again young learn about should market become people number however company subject problem service against pattern forward because student general research consider increase activity movement treatment evidence position response experience important anything something difficult difference direction decision solution education development information environment performance professional relationship responsibility`,
);

const HARD = tokenize(
  `algorithm asynchronous bandwidth bureaucracy circumference configuration consciousness constellation controversial curiosity deliberately demographic electromagnetic encyclopedia entrepreneurship extraordinary fluorescence galactic gravitational hierarchy hypothesis illuminating immediate improvisation independent indispensable infrastructure intricate investigation jubilee kaleidoscope knowledgeable laboratory labyrinth magnificent miscellaneous navigate noncommittal obsolescence opportunity orchestrate paradigm paraphernalia perpendicular phenomenon phosphorescence picturesque polymorphism prerequisite predominantly prestigious procrastination professional protagonist questionnaire quintessential reconnaissance rehabilitation renaissance representative reservoir responsibility rhetorical ridiculous rudimentary sanctuary simultaneously sophistication spectacular spontaneous statistics straightforward strategy subconscious substantially synchronize systematic technology temperature temporary tremendous ubiquitous unexpectedly unbelievable unfortunately unprecedented verification versatile vocabulary vulnerable`,
);

const CODE: string[] = [
  "const x = 1;",
  "let y = 2;",
  "var z;",
  "return null;",
  "yield n;",
  "await p;",
  "async () => {}",
  "if (a) {",
  "} else {",
  "} finally {",
  "for (i = 0; i < n; i++)",
  "while (q.size)",
  "do { go(); } while (ok)",
  "switch (k) {",
  'case "a":',
  "break;",
  "continue;",
  "throw err;",
  "try {",
  "} catch (e) {",
  "fn(a, b)",
  "fn?.(a)",
  "obj.key",
  "obj?.deep?.key",
  "arr[i]",
  "[a, b] = [b, a]",
  "{ ...obj }",
  "{ a, b } = c",
  "a === b",
  "a !== b",
  "a && b",
  "a || b",
  "!ok",
  "x ?? 0",
  "x ** 2",
  "i++",
  "j--",
  "n += 1",
  "n -= 1",
  "n *= 2",
  "n /= 2",
  "n %= 7",
  "a > b",
  "a <= b",
  "0xDEAD",
  "0b1011",
  "1e3",
  "1_000_000",
  "3.14.toFixed(2)",
  "Math.max(0, d)",
  "Math.floor(x)",
  "Date.now()",
  "Number.isNaN(v)",
  "arr.map(fn)",
  "arr.filter(isOdd)",
  "arr.reduce(sum, 0)",
  "arr.slice(0, 3)",
  "arr.push(x)",
  'arr.join("-")',
  "Object.keys(o)",
  "Object.entries(o)",
  "new Map()",
  "new Set(xs)",
  "Array.from(n)",
  "JSON.parse(s)",
  "JSON.stringify(o)",
  "console.log(v)",
  "console.error(e)",
  'typeof v === "string"',
  "instanceof Node",
  "void 0",
  "delete o.k",
  "/^a-z+$/i.test(s)",
  "s.split(/ /)",
  "s.trimEnd()",
  "s.trim()",
  "useState(0)",
  "useMemo(() => 1, [])",
  "useEffect(load, [])",
  "useRef<HTMLDivElement>()",
  '<div className="row">',
  "<Button onClick={go} />",
  "</span>",
  "{child}",
  "export default App;",
  'import { x } from "y";',
  "export type Id = string;",
  "interface Node { v: T }",
  "class Box extends Div {}",
  "enum Kind { A, B }",
  "namespace App {}",
  "type Alias = A | B;",
  "@observable",
  "#private",
  "/* note */",
  "// rename later",
  'git commit -m "fix: wpm"',
  "npm run build",
  "docker compose up",
  "sudo apt update",
  "cat file | grep -n pat",
  "obj?.nested?.deep ?? 0",
  "new Set([...list])",
  "str.split(/\\s+/)",
  "/^a-z+$/i.test(id)",
  "void 0 !== x",
  "el.textContent = txt;",
];

export const POOLS: Record<Difficulty, readonly string[]> = {
  easy: EASY,
  medium: MEDIUM,
  hard: HARD,
  code: CODE,
};

/**
 * Fisher–Yates (selection form): uniform, unlike `sort(() => Math.random() - 0.5)`, and total —
 * a misbehaving `rand` yields an unshuffled copy rather than a list of holes, which matters
 * because `trackChars` and the lane renderer both assume every entry is a word.
 */
export function shuffle<T>(arr: readonly T[], rand: () => number = Math.random): T[] {
  const src = arr.slice();
  const out: T[] = [];
  while (src.length > 0) {
    const raw = Math.floor(rand() * src.length);
    const j = Number.isFinite(raw) ? Math.min(src.length - 1, Math.max(0, raw)) : 0;
    out.push(...src.splice(j, 1));
  }
  return out;
}

/**
 * Build a race track of `count` words.
 *
 * Draws from a reshuffled bag so a track is spread across the pool instead of clustering,
 * and retries once before accepting a back-to-back repeat (with a tiny pool, a hard block
 * would spin forever — a repeat is better than a stall).
 */
export function buildTrack(difficulty: Difficulty, count: number, rand: () => number = Math.random): string[] {
  const pool = POOLS[difficulty] as string[];
  const out: string[] = [];
  let bag: string[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 12 + 64) {
    if (bag.length === 0) bag = shuffle(pool, rand);
    const w = bag.pop();
    // A draw that is not a usable word (a hostile or broken `rand`) can never enter a track:
    // `trackChars` and the lane renderer both assume strings.
    if (typeof w !== "string" || w.length === 0) continue;
    if (out.length > 0 && out[out.length - 1] === w) {
      // push it back and take the next one, once
      if (bag.length > 1) {
        bag.push(w);
        continue;
      }
    }
    out.push(w);
  }
  // Exhausted pools (shouldn't happen) still must yield exactly `count` words.
  while (out.length < count) out.push(pool[out.length % pool.length] ?? "go");
  return out.slice(0, count);
}

/** Race distance = every character you actually have to type. Spaces are free (words auto-submit). */
export const trackChars = (words: readonly string[]): number => words.reduce((n, w) => n + w.length, 0);

/** Average token length of a pool — used to size tracks so all difficulties take similar time. */
export const avgWordLength = (difficulty: Difficulty): number => {
  const pool = POOLS[difficulty];
  if (pool.length === 0) return 5;
  return Math.max(1, trackChars(pool) / pool.length);
};
