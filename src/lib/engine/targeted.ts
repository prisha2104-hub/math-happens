import { FEATURES, type FeatureId, facetOf, featuresOf } from "@/lib/analysis/facets";
import type { AdvancedSettings } from "./advanced";
import { DEFAULT_FINANCE_SETTINGS, type FinanceSubtype, isFinanceSubtype } from "./finance";
import { buildFinanceQuestion, generateQuestion } from "./generate";
import { generateFinanceSpec } from "./generators/finance";
import type { Rng } from "./rng";
import type { Difficulty, NumberType, Operation, Question } from "./types";

/** What kind of question to practise: a skill, optionally narrowed to a facet or a structural feature. */
export interface TargetSpec {
  numberType: NumberType;
  operation: Operation;
  difficulty: Difficulty;
  /** Generator facet (variant without difficulty/sign suffixes), e.g. "int-div-2digit-divisor". */
  facet?: string | null;
  /** Structural feature the question should exhibit, e.g. "carry". */
  feature?: FeatureId | null;
}

export function targetKey(target: TargetSpec): string {
  return `${target.numberType}/${target.operation}@${target.difficulty}${target.facet ? `#${target.facet}` : ""}${target.feature ? `+${target.feature}` : ""}`;
}

/** Inverse of `targetKey`; null for anything malformed (e.g. a hand-edited URL). */
export function parseTargetKey(key: string): TargetSpec | null {
  const match = /^(integer|decimal|fraction)\/(addition|subtraction|multiplication|division)@(easy|medium|hard)(?:#([a-z0-9-]+))?(?:\+([a-z-]+))?$/.exec(key);
  if (!match) return null;
  const [, numberType, operation, difficulty, facet, feature] = match;
  if (feature && !(FEATURES as readonly string[]).includes(feature)) return null;
  return {
    numberType: numberType as NumberType,
    operation: operation as Operation,
    difficulty: difficulty as Difficulty,
    facet: facet ?? null,
    feature: (feature as FeatureId | undefined) ?? null,
  };
}

export function questionMatchesTarget(question: Question, target: TargetSpec, options: { ignoreFacet?: boolean; ignoreFeature?: boolean } = {}): boolean {
  if (question.numberType !== target.numberType || question.operation !== target.operation || question.difficulty !== target.difficulty) return false;
  if (!options.ignoreFacet && target.facet && facetOf(question.meta.variant) !== target.facet) return false;
  if (!options.ignoreFeature && target.feature && !featuresOf(question).includes(target.feature)) return false;
  return true;
}

export interface TargetedOptions {
  target: TargetSpec;
  rng: Rng;
  id: string;
  recentKeys?: readonly string[];
  /** Attempts per relaxation tier before loosening the constraints. */
  triesPerTier?: number;
  /** Operand ranges to stay inside, so adaptive practice honours them too. */
  advanced?: AdvancedSettings | null;
}

/** "fin-percent-change" → "percent-change", for finance targets. */
export function financeSubtypeOfFacet(facet: string | null | undefined): FinanceSubtype | null {
  if (!facet || !facet.startsWith("fin-")) return null;
  const subtype = facet.slice(4);
  return isFinanceSubtype(subtype) ? subtype : null;
}

/**
 * Generate a fresh question for a target without touching the generators:
 * sample questions for the skill and keep the first that shows the requested
 * facet and feature. If the combination is rare the feature is dropped, then
 * the facet, so a question of the right skill is always returned.
 */
export function generateTargetedQuestion({ target, rng, id, recentKeys = [], triesPerTier = 40, advanced = null }: TargetedOptions): Question {
  // Finance families are generated directly rather than sampled for: the
  // facet names the family, so there is nothing to search for.
  if (target.operation === "finance") {
    const spec = generateFinanceSpec({
      rng,
      settings: advanced?.finance ?? DEFAULT_FINANCE_SETTINGS,
      difficulty: target.difficulty,
      subtype: financeSubtypeOfFacet(target.facet),
    });
    return buildFinanceQuestion(id, spec, target.difficulty);
  }
  const settings = { operations: [target.operation], numberTypes: [target.numberType], difficulty: target.difficulty, advanced };
  const tiers = [{}, { ignoreFeature: true }, { ignoreFacet: true, ignoreFeature: true }];
  let last: Question | null = null;
  for (const tier of tiers) {
    for (let i = 0; i < triesPerTier; i += 1) {
      last = generateQuestion({ settings, rng, id, recentKeys });
      if (questionMatchesTarget(last, target, tier)) return last;
    }
  }
  return last ?? generateQuestion({ settings, rng, id, recentKeys });
}
