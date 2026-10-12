"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { randomSeed } from "@/lib/engine/rng";
import { newId } from "@/lib/ids";
import {
  type SessionState,
  type Timestamps,
  createSession,
  elapsedMs,
  remainingMs,
  sessionReducer,
} from "@/lib/session/reducer";
import type { TrainerSettings } from "@/lib/session/types";

/**
 * How often the displayed clock is refreshed. The clock shows whole seconds
 * and elapsed time is always derived from timestamps, so four refreshes a
 * second is plenty — and a quarter of the re-renders of a 100 ms tick, which
 * matters on a laptop that is already working hard. A late tick cannot
 * overrun the limit: `elapsedMs` is clamped to it and any answer arriving
 * after the deadline is rejected.
 */
const TICK_MS = 250;
/**
 * How long a multiple-choice verdict holds the question on screen before the
 * next one appears. A correct answer needs no more than a glance — the
 * feedback strip keeps the verdict on screen after the question changes — so
 * it is only long enough to see the option turn green. A miss holds longer so
 * the highlighted right answer can be read. Either can be cut short with
 * `skipReveal`, so the hold is never something to sit and wait out.
 */
export const REVEAL_MS = { correct: 300, incorrect: 1100 };
/**
 * A skip is ignored for this long after the verdict appears. Without it the
 * second click of a double-click (or a held-down key) would skip straight past
 * the question just answered before the user has seen the result.
 */
export const SKIP_GRACE_MS = 250;

function stamp(): Timestamps {
  return { now: performance.now(), wallClock: Date.now() };
}

function initSession(settings: TrainerSettings): SessionState {
  return createSession(settings, { id: newId("session"), seed: randomSeed(), ...stamp() });
}

export interface SessionController {
  state: SessionState;
  /** Active elapsed milliseconds as of the latest tick. */
  elapsed: number;
  /** Remaining milliseconds for timed sessions, null otherwise. */
  remaining: number | null;
  submit: (input: string) => void;
  /** Multiple choice: pick option `index` (0–3). */
  choose: (index: number) => void;
  /** True while a multiple-choice verdict is holding the question on screen. */
  revealing: boolean;
  /** Cut the verdict hold short and show the next question now. */
  skipReveal: () => void;
  pause: () => void;
  resume: () => void;
  togglePause: () => void;
  end: () => void;
  clearInputError: () => void;
}

/**
 * Drives one training session. The reducer owns all state; this hook only
 * supplies timestamps, ticks the clock while running, and re-renders the
 * displayed time. Elapsed time is derived from timestamps, so throttled
 * intervals in background tabs cannot drift it.
 */
export function useSession(settings: TrainerSettings): SessionController {
  const [state, dispatch] = useReducer(sessionReducer, settings, initSession);
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (state.status !== "running") return;
    const tick = () => {
      const stamps = stamp();
      setNow(stamps.now);
      dispatch({ type: "tick", ...stamps });
    };
    tick();
    const interval = window.setInterval(tick, TICK_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [state.status]);

  // After a multiple-choice pick, hold the verdict briefly, then move on. The
  // timer only exists while running, so pausing mid-reveal simply waits.
  // `startedAt` changes with every verdict, so each one gets its own timer.
  const revealStartedAt = state.status === "running" ? state.reveal?.startedAt ?? null : null;
  const revealCorrect = state.lastFeedback?.correct ?? true;
  useEffect(() => {
    if (revealStartedAt === null) return;
    const timeout = window.setTimeout(() => dispatch({ type: "advance", ...stamp() }), revealCorrect ? REVEAL_MS.correct : REVEAL_MS.incorrect);
    return () => window.clearTimeout(timeout);
  }, [revealStartedAt, revealCorrect]);

  // Skipping reads the verdict from the render it was called in, so the very
  // click or key press that produced the verdict cannot also skip it.
  const skipReveal = useCallback(() => {
    if (revealStartedAt === null) return;
    const stamps = stamp();
    if (stamps.now - revealStartedAt < SKIP_GRACE_MS) return;
    dispatch({ type: "advance", ...stamps });
  }, [revealStartedAt]);

  const submit = useCallback((input: string) => dispatch({ type: "submit", input, ...stamp() }), []);
  const choose = useCallback((index: number) => dispatch({ type: "choose", index, ...stamp() }), []);
  const pause = useCallback(() => dispatch({ type: "pause", ...stamp() }), []);
  const resume = useCallback(() => dispatch({ type: "resume", ...stamp() }), []);
  const end = useCallback(() => dispatch({ type: "end", ...stamp() }), []);
  const clearInputError = useCallback(() => dispatch({ type: "clearInputError" }), []);
  const togglePause = useCallback(() => {
    if (state.status === "running") pause();
    else if (state.status === "paused") resume();
  }, [state.status, pause, resume]);

  return {
    state,
    elapsed: elapsedMs(state, now),
    remaining: remainingMs(state, now),
    submit,
    choose,
    revealing: revealStartedAt !== null,
    skipReveal,
    pause,
    resume,
    togglePause,
    end,
    clearInputError,
  };
}
