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
| **Train**      | `/`           | Ordinary practice with your own operations, number types, difficulty, timer and answer format, plus optional advanced control over operand ranges and the question mix. |
| **Improve**    | `/improve`    | *What should I practise next?* An adaptive plan built from weak skills, slow skills and skills due for review, plus a review calendar. |
| **History**    | `/history`    | *How am I performing and am I improving?* Totals, trends, breakdowns and detected patterns, filterable by operation, number type, difficulty, answer format and period. |
| **Notebook**   | `/notebook`   | *What am I struggling with?* Every miss with a diagnosis, the question's structure, a faster technique worked on that exact question, and a "Practice similar" action. |
| **Techniques** | `/techniques` | *How can I solve these faster?* A library of mental-math methods with verified worked examples and a drill for each. |
| **Data**       | `/data`       | Export/import a versioned JSON backup, see where data lives, clear practice history (keeping settings) or start over completely. |

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

### Advanced settings

A collapsed section at the bottom of the Train setup, off by default. While it
is off nothing changes: the difficulty tiers drive generation exactly as above.
Switching it on makes four groups the source of truth, replacing the Operations
and Numbers toggles:

| Group                 | What it controls                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| **Operation mix**     | Whole percentages per operation, summing to 100. `0 %` excludes an operation.                    |
| **Number format mix** | Whole percentages for integers / decimals / fractions, summing to 100, independent of the operation mix — so fractions appear across every chosen operation. |
| **Number ranges**     | Minimum and maximum operand per operation; both operands of a question obey the range.           |
| **Fraction ranges**   | Minimum and maximum numerator and denominator for every fraction operand.                        |

- Each percentage group shows a running total and the session cannot start
  until it reads exactly 100 %. Range problems are explained next to the field
  that caused them, and the footer points at the highlighted fields.
- **Finite sessions** (untimed with a question limit) get a schedule built up
  front by largest-remainder apportionment, so the counts match the
  percentages as closely as the question count permits — 20 questions at
  40/20/30/10 is exactly 8/4/6/2. **Open-ended and timed sessions** sample the
  same percentages by weight.
- Ranges apply to integer questions, and the fraction ranges to fraction
  questions. Decimal questions keep following the difficulty tier, because a
  whole-number operand range has no sensible meaning for decimal places.
  Difficulty still decides the decimal tier and whether Hard allows the
  occasional negative result.
- Division still builds the dividend from divisor × quotient so it stays
  exact, which needs a maximum of at least twice the minimum; narrower ranges
  are rejected with that explanation.
- Denominators start at 1 and can never be zero. Numerators at or above the
  denominator are allowed, so improper fractions such as `7/4` appear when the
  ranges permit; answers are still shown in lowest terms and any equivalent
  written form is accepted.
- **Adaptive practice stays inside the ranges and mixes.** Improve-mode plans
  drop weak and due skills that fall outside the chosen operations and
  formats, and targeted generation receives the same ranges.
- Settings persist between visits, and **Reset to defaults** restores every
  group without switching the feature off.

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

Storage is per browser **and per origin**, so data saved while the app ran on
one port is not visible on another.

### Moving your history to a deployed copy

A deployed build (Vercel or anywhere else) is a different origin from
`localhost:3000`, so **none of your local practice history follows it
automatically** — nothing is uploaded anywhere, and IndexedDB is keyed by
origin. To keep it:

1. On the machine and browser you have been practising in, open `/data` and
   choose **Export** — it writes a versioned `math-happens-*.json` file with
   every session, every answer, the review calendar and your settings.
2. Open the deployed URL in the same browser and use **Import → Merge** on
   that file. Merge only adds sessions the store does not already have and
   leaves the settings it finds in place, so it is safe to run twice.
3. Keep the export file. It is the only backup; clearing browser data for the
   origin deletes everything else.

Exporting before a deployment is also the only way to carry history between
browsers, profiles or machines.

Two clearing actions, both behind a confirmation:

- **Clear practice history** removes sessions, attempts and the review
  calendar, and keeps your settings.
- **Clear all data** removes everything, settings included.

Both also purge the localStorage copy the one-time IndexedDB migration leaves
behind, so a cleared record cannot be copied back the next time the migration
runs.

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
                          targeted generation (facet / feature filtering), advanced settings
                          (ranges + mixes) and the range-driven generators
    choice/               Distractor models, choice-set builder, open-answer error classification
    answer/               Answer parsing and validation
    session/              Pure session reducer (submit / choose / advance / pause / tick / end), scoring,
                          question-mix apportionment and weighted sampling
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

The suite (519 tests) covers exact arithmetic, answer parsing and
equivalence, every operation × number type × difficulty × answer format
combination (with independent BigInt verification of generated answers),
distractor sets (exactly one correct option, exact distinctness, equivalent
fraction handling, positional uniformity, tags), the multiple-choice reducer
flow (reveal, double-submission, expiry during reveal, scoring), settings and
record migration, aggregation, trends, weakness detection with insufficient
data guards, targeted generation, plan building and weighting, review
scheduling, every technique's worked example plus thousands of generated
explanations, storage migration, export/import integrity, clearing history
without losing settings, advanced-settings coercion and per-field validation,
percentage apportionment and weighted sampling, and range-driven generation
(operands inside their range, exact division, non-zero denominators,
degenerate ranges, and unchanged output while advanced settings are off).

## Known limitations

- Data is per browser and per origin; export/import is the only way to move it.
- Finance maths answers are graded on the single figure the question asks for,
  in the unit it names; a wrong unit is wrong, not partially credited.
- Finance value style and ranges steer the money amounts and bases, not every
  number in a prompt (chances, rates and yields come from the difficulty tier).
- The per-answer median only exists for sessions recorded after it was added;
  older sessions show their plain average and say so.
- Open-answer diagnosis is deliberately conservative: only exact matches to a
  modelled mistake are tagged, so many misses stay "unclassified".
- Fraction operands are proper fractions unless advanced fraction ranges allow
  improper ones; mixed-number operands are never generated.
- Advanced number ranges do not reach decimal questions, which keep following
  the difficulty tier.
- Technique drills keep their own generators, so advanced ranges do not apply
  to them (the technique has to keep applying to the question).
- Trends are per session and need at least two sessions to draw.
- Light theme only.
