<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Math Happens — project notes

- Stack: Next.js 16 App Router (`src/app`), React 19, TypeScript 5.9, Tailwind CSS 4 (theme tokens in `src/app/globals.css`), Vitest 4.
- Verify changes with `npm run check` (typecheck → lint → test → build). Individual steps: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- `src/lib/**` is framework-free TypeScript with Vitest coverage; keep React out of it. UI lives in `src/components`, hooks in `src/hooks`.
- Test files are `src/**/*.test.ts`. Engine tests verify generated answers through `src/lib/engine/testing/independent-arithmetic.ts` (BigInt on display strings) rather than the `Rational` module — keep that independence when adding generators.
- The session reducer (`src/lib/session/reducer.ts`) must stay pure: randomness comes from the seeded RNG state stored in `SessionState`, and time arrives via action payloads (`now` monotonic ms, `wallClock` epoch ms).
- ESLint 9 is pinned because `eslint-config-next`'s `eslint-plugin-react` dependency breaks on ESLint 10. Dependencies are pinned to versions published at least a week before adoption.
- Phase 2 modules: `lib/choice` (distractor models + open-answer classification share the same mistake catalogue — add new mistakes in `distractors.ts` and both benefit), `lib/analysis` (facets/features/weakness), `lib/adaptive/plan.ts`, `lib/review/schedule.ts`, `lib/techniques/library.ts` (each technique needs `applies` + an exact `explain`; tests assert every explanation reaches the true answer), `lib/storage/indexeddb.ts` + `transfer.ts`.
- Attempts store the expression, not the operands; use `lib/analysis/reconstruct.ts` (`questionFromAttempt`) when you need the `Question` back.
- Legacy records: attempts/sessions from Phase 1 lack `answerFormat`/`choice`/`errorTag`; `normalizeAttempt`/`normalizeSummary` in `repositories.ts` fill defaults on read. Never require those fields when reading stored data directly.
- Pages read history through `useHistory()`; use its `loadedAt` as "now" in analysis so renders stay pure (the React Compiler lint forbids `Date.now()` in render).
- Browser checks: a throwaway Playwright script in `/tmp` against `next dev`/`next start` was used; nothing browser-related lives in the repo.
