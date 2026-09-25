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

const TICK_MS = 100;
/** How long a multiple-choice verdict stays on screen before the next question. */
export const REVEAL_MS = { correct: 650, incorrect: 1600 };

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
  const revealing = state.reveal !== null && state.status === "running";
  const revealCorrect = state.lastFeedback?.correct ?? true;
  useEffect(() => {
    if (!revealing) return;
    const timeout = window.setTimeout(() => dispatch({ type: "advance", ...stamp() }), revealCorrect ? REVEAL_MS.correct : REVEAL_MS.incorrect);
    return () => window.clearTimeout(timeout);
  }, [revealing, revealCorrect, state.attempts.length]);

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
    pause,
    resume,
    togglePause,
    end,
    clearInputError,
  };
}
