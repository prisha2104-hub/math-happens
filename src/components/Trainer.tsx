"use client";

import { useCallback, useRef, useState } from "react";
import { useStoredSettings } from "@/hooks/useStoredSettings";
import type { Attempt, SessionSummary, TrainerSettings } from "@/lib/session/types";
import { recordCompletedSession } from "@/lib/services/recordSession";
import { Button } from "./ui/Button";
import { PageShell } from "./shell/PageShell";
import { ResultsScreen, type SaveState } from "./results/ResultsScreen";
import { SessionScreen } from "./session/SessionScreen";
import { SetupScreen } from "./setup/SetupScreen";

type Screen =
  | { name: "setup" }
  | { name: "session"; settings: TrainerSettings; run: number }
  | { name: "results"; settings: TrainerSettings; summary: SessionSummary; attempts: Attempt[]; saveState: SaveState };

export function Trainer() {
  const { settings, updateSettings } = useStoredSettings();
  const [screen, setScreen] = useState<Screen>({ name: "setup" });
  const runCounter = useRef(0);

  const startSession = useCallback((sessionSettings: TrainerSettings) => {
    runCounter.current += 1;
    setScreen({ name: "session", settings: sessionSettings, run: runCounter.current });
  }, []);

  const handleFinished = useCallback((summary: SessionSummary, attempts: Attempt[]) => {
    setScreen((current) => {
      if (current.name === "results" && current.summary.id === summary.id) return current;
      return { name: "results", settings: summary.settings, summary, attempts, saveState: "saving" };
    });
    recordCompletedSession(summary, attempts)
      .then(() => setSaveState(summary.id, "saved"))
      .catch(() => setSaveState(summary.id, "failed"));

    function setSaveState(sessionId: string, saveState: SaveState) {
      setScreen((current) => (current.name === "results" && current.summary.id === sessionId ? { ...current, saveState } : current));
    }
  }, []);

  switch (screen.name) {
    case "setup":
      return (
        <PageShell width="narrow">
          <SetupScreen settings={settings} onChange={updateSettings} onStart={startSession} />
        </PageShell>
      );
    case "session":
      return <SessionScreen key={screen.run} settings={screen.settings} onFinished={handleFinished} />;
    case "results":
      return (
        <PageShell width="narrow">
          <ResultsScreen
            summary={screen.summary}
            attempts={screen.attempts}
            saveState={screen.saveState}
            actions={
              <>
                <Button variant="secondary" size="sm" onClick={() => setScreen({ name: "setup" })}>
                  Change settings
                </Button>
                <Button variant="primary" size="sm" onClick={() => startSession(screen.settings)}>
                  Train again
                </Button>
              </>
            }
          />
        </PageShell>
      );
  }
}
