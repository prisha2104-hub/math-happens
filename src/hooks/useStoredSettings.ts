"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, type TrainerSettings } from "@/lib/session/types";
import { getRepositories } from "@/lib/storage/client";

/**
 * Trainer settings persisted in local storage. Renders defaults first (so
 * server and client markup match), then applies the saved settings once they
 * load. Every change is written back.
 */
export function useStoredSettings() {
  const [settings, setSettings] = useState<TrainerSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRepositories()
      .settings.load()
      .then((stored) => {
        if (cancelled) return;
        if (stored) setSettings(stored);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = useCallback((next: TrainerSettings) => {
    setSettings(next);
    getRepositories()
      .settings.save(next)
      .catch(() => {
        /* Saving preferences is best-effort; the session itself is unaffected. */
      });
  }, []);

  return { settings, updateSettings, loaded };
}
