# Math Happens

A personal mental-arithmetic trainer in the spirit of TraderMath, extended
into an adaptive coach. Integers, decimals and fractions are all first-class,
every answer is checked with exact rational arithmetic, and every attempt is
kept locally so the app can show where you struggle, drill exactly that, teach
a faster technique, and bring the skill back on a review schedule until it
sticks.

## Running locally

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>.

| Command              | What it does                                     |
| -------------------- | ------------------------------------------------ |
| `npm run dev`        | Start the development server                     |
| `npm run build`      | Production build                                 |
| `npm start`          | Serve the production build                       |
| `npm test`           | Run the Vitest suite once                        |
| `npm run test:watch` | Run Vitest in watch mode                         |
| `npm run typecheck`  | `tsc --noEmit`                                   |
| `npm run lint`       | ESLint (`eslint-config-next` + TypeScript rules) |
| `npm run check`      | Typecheck, lint, test and build in one go        |

## The product

| Section        | Route         | Answers the question                                            |
| -------------- | ------------- | --------------------------------------------------------------- |
| **Train**      | `/`           | Ordinary practice with your own operations, number types, difficulty, timer and answer format. |
| **Improve**    | `/improve`    | *What should I practise next?* An adaptive plan built from weak skills, slow skills and skills due for review, plus a review calendar. |
| **History**    | `/history`    | *How am I performing and am I improving?* Totals, trends, breakdowns and detected patterns, filterable by operation, number type, difficulty, answer format and period. |
| **Notebook**   | `/notebook`   | *What am I struggling with?* Every miss with a diagnosis, the question's structure, a faster technique worked on that exact question, and a "Practice similar" action. |
| **Techniques** | `/techniques` | *How can I solve these faster?* A library of mental-math methods with verified worked examples and a drill for each. |
| **Data**       | `/data`       | Export/import a versioned JSON backup, see where data lives, start over. |

### Answer formats

- **Open answer** — type the exact value. Any mathematically equal form is
  accepted: for `1/2` you may type `1/2`, `2/4`, `0.5`, `.5`; mixed numbers
  (`1 3/4`), negatives and grouped integers (`2,736`) work too.
- **Multiple choice** — four options, keys `1`–`4` or tap. Distractors are
  generated procedurally from realistic mistakes (misplaced decimal points,
  dropped carries and borrows, added denominators, multiplying instead of
  inverting, partial products, estimation), each tagged with its error
  category. Options are exact rationals, so equivalent fractions can never
  appear twice; the correct option's position is uniformly random. After a
  pick the verdict shows briefly, the correct option is highlighted, and the
  next question follows automatically.

The two formats measure different skills (producing vs. recognising an
answer) and are never blended into a single figure anywhere in the app.

### Difficulty tiers

| Tier   | Integers                              | Decimals                               | Fractions                                         |
| ------ | ------------------------------------- | -------------------------------------- | ------------------------------------------------- |
| Easy   | 2-digit sums, times tables, `72 ÷ 9`  | tenths, `2.4 + 3.7`, `7.2 ÷ 0.3`       | shared / nested denominators, `1/2 + 1/4`         |
| Medium | 3-digit sums, `23 × 15`, `672 ÷ 16`   | hundredths, `1.2 × 0.35`, `4.8 ÷ 0.06` | unlike denominators with LCM ≤ 24, `3/4 − 1/6`    |
| Hard   | 4-digit sums, `47 × 68`, `2,736 ÷ 24` | `3.75 × 0.4`, `38.76 ÷ 5.7`            | LCM 24–90, denominators up to 12–16, `5/8 + 3/10` |

Division is generated from a divisor and quotient, so integer division is
always exact and decimal division always terminates. Hard subtraction
occasionally produces negative results.

### How the adaptive parts work

- **Skills.** Each question carries a generator *facet* ("two-digit divisors",
  "tenths × hundredths") and structural *features* (carries, borrows, unlike
  denominators, decimal divisors, …) derived from its metadata. A skill is a
  facet at a difficulty.
- **Weakness detection** groups attempts by skill, by feature and by mistake
  category. A group becomes a weakness only with enough evidence (at least 4
  attempts and 2 misses, or 4+ correct answers ≥ 1.5× slower than comparable
  questions). Recent misses weigh more than old ones; repeated misses of the
  same question count extra; anything thinner is a "needs more data"
  watchlist item, never a claim.
- **Practice plans** give weak skills 55 % of a session, skills due for review
  25 % and fresh questions from your own Train selection 20 %, with no single
  weak skill allowed more than 40 % of the weak share. Without history the plan
  is plain practice from your selection. Train mode is never altered.
- **Targeted generation** never changes the generators: it samples the skill
  and keeps questions matching the wanted facet/feature (or technique),
  relaxing the constraint if it is rare.
- **Mistake diagnosis.** Multiple-choice misses keep the tag of the chosen
  distractor. Open-answer misses are tagged only when the typed value exactly
  equals the value a specific mistake would produce; otherwise they are
  "unclassified".
- **Spaced review** is a short, visible Leitner schedule keyed by skill: a
  miss makes the skill due now; two correct answers in a row advance it one
  stage (due again after 1, 3, 7, 14, then 30 days); a later miss resets it.
  Mastered skills are still checked occasionally.
- **Techniques** are deterministic. Each has an `applies` predicate and an
  `explain` that computes every intermediate value exactly for the actual
  question; tests verify thousands of explanations reach the true answer.

## Storage

Data lives in the browser. IndexedDB is used when available; Phase 1
localStorage data is copied into it once, non-destructively (the localStorage
copy is left as a backup). If IndexedDB is unavailable the app falls back to
localStorage, then to memory. Every record sits in a versioned envelope with
migration hooks. The Data page exports a versioned JSON file and imports one
either by merging (adds unknown sessions, keeps current settings) or by
replacing everything after an explicit confirmation.

## Architecture

```
src/
  app/                    Routes: / (train), /improve, /history, /notebook, /techniques, /data
  components/             React UI: shell (nav, page frame), setup, session (open + multiple choice),
                          results, history, notebook, improve, techniques, data, charts, primitives
  hooks/                  useSession (reducer + clock + reveal timer), useStoredSettings, useHistory
  lib/
    math/                 Exact Rational arithmetic and formatting
    engine/               Question generation, seeded RNG, duplicate prevention, metadata,
                          targeted generation (facet / feature filtering)
    choice/               Distractor models, choice-set builder, open-answer error classification
    answer/               Answer parsing and validation
    session/              Pure session reducer (submit / choose / advance / pause / tick / end), scoring
    analysis/             Facets and features, aggregation, trends, weakness detection, reconstruction
    adaptive/             Practice plan builder and weighted target selection
    review/               Spaced-review schedule and queue
    techniques/           Technique library with verified explanations
    storage/              Versioned adapters (IndexedDB, localStorage, memory), repositories,
                          migration, export/import
    services/             recordCompletedSession, ensureReviewState
```

Everything under `src/lib` is framework-free TypeScript covered by Vitest.
The session reducer stays pure: randomness comes from a seeded RNG state
stored in the session, time arrives through action payloads, and plans are
plain data.

## Testing

```bash
npm test
```

The suite (456 tests) covers exact arithmetic, answer parsing and
equivalence, every operation × number type × difficulty × answer format
combination (with independent BigInt verification of generated answers),
distractor sets (exactly one correct option, exact distinctness, equivalent
fraction handling, positional uniformity, tags), the multiple-choice reducer
flow (reveal, double-submission, expiry during reveal, scoring), settings and
record migration, aggregation, trends, weakness detection with insufficient
data guards, targeted generation, plan building and weighting, review
scheduling, every technique's worked example plus thousands of generated
explanations, storage migration, and export/import integrity.

## Known limitations

- Data is per browser; export/import is the only way to move it.
- Open-answer diagnosis is deliberately conservative: only exact matches to a
  modelled mistake are tagged, so many misses stay "unclassified".
- Fraction operands are always proper fractions; mixed-number operands are not
  generated.
- Trends are per session and need at least two sessions to draw.
- Light theme only.
