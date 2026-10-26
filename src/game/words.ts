import type { Difficulty } from "./types";

const EASY = `the be to of and a in that it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take into year your good some could them see other than then now look only come over think also back after use two how our work first well way even new want any these give day most is big high small large next early young important few bad same able own low right old last big set put end why let keep own put run move live feel turn show help start try ask need seem hand call home side kind head house far told went came said used told made own saw way may day too any why boy did old own said use water long very words name just form much great think help line before turn cause same mean right here still off find tell might own old show hear play small put end home read hand add land part once`.split(/\s+/);

const MEDIUM = `people system program question number different always example change another place around never between because every right thought under against while every through during before after those where world still state three small group begin seem those large often early point every found study might still house those again where world young never under between people every right thought begin seem those large often early point every found study might still house those again where world young never under between people system program question number different always example change another place around never because every right thought under against while through during before after those where world still state three small group begin large often early point found study might house those again young under between`.split(/\s+/);

const HARD = `algorithm asynchronous bandwidth bureaucracy circumference configuration consciousness constellation controversial curiosity deliberately demographic electromagnetic encyclopedia entrepreneurship extraordinary fluorescence galactic gravitational hierarchy hypothesis illuminating immediate improvisation independent indispensable infrastructure intricate investigation jubilee kaleidoscope knowledgeable laboratory labyrinth magnificent miscellaneous navigate noncommittal obsolescence opportunity orchestrate paradigm paraphernalia perpendicular phenomenon phosphorescence picturesque polymorphism prerequisite predominantly prestigious procrastination professional protagonist questionnaire quintessential reconnaissance rehabilitation renaissance representative reservoir responsibility rhetorical ridiculous rudimentary sanctuary simultaneously sophistication spectacular spontaneous statistics straightforward strategy subconscious substantially synchronize systematic technology temperature temporary tremendous ubiquitous unexpectedly unbelievable unfortunately unprecedented unusual verification versatile vocabulary vulnerable`.split(/\s+/);

const CODE = `useState() useEffect() const value = 42; let count += 1; return null; if (a === b) { ... } else { } for (let i = 0; i < 10; i++) map((x) => x * 2) .filter(Boolean) import type { Foo } from "bar"; export default App; async function fetchData(id: string): Promise<Response> { await fetch(\`/api/v2/\${id}\`); } try { JSON.parse(text) } catch (err) { console.error(err); } Array.from({ length: 5 }, (_, i) => i ** 2) "hello, world!" 3.14159 >= 0.5 && <= 1.0 switch (key) { case "a": break; } class Node<T> { left: T | null; } #privateField @decorator(x: 1) => void query?.field ?? "fallback" [1, 2, 3].join("-") Object.entries(map).sort() git commit -m "fix: wpm"`.split(/\s+/);

const POOLS: Record<Difficulty, string[]> = {
  easy: EASY,
  medium: MEDIUM,
  hard: HARD,
  code: CODE,
};

export const RIVAL_NAMES = [
  { name: "VYPER", color: "#ff5a7a" },
  { name: "GLITCH", color: "#a78bfa" },
  { name: "NOVA", color: "#4cc9ff" },
  { name: "TURBO", color: "#35e0a1" },
];

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Build a race track of words. Avoids repeating the same word back-to-back. */
export function buildTrack(difficulty: Difficulty, count: number): string[] {
  const pool = POOLS[difficulty].filter(Boolean);
  let bag = shuffle(pool);
  const out: string[] = [];
  let retries = 0;
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    if (bag.length === 0) bag = shuffle(pool);
    const w = bag.pop();
    if (!w) continue;
    if (retries < 3 && out.length > 0 && w === out[out.length - 1]) {
      bag.unshift(w);
      retries++;
      continue;
    }
    retries = 0;
    out.push(w);
  }
  while (out.length < count) out.push(pool[out.length % pool.length]);
  return out.slice(0, count);
}

/** Race distance = every character you actually have to type. */
export const TOTAL_CHARS = (words: string[]) => words.reduce((n, w) => n + w.length, 0);
