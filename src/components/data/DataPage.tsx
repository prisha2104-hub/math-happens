"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageShell, SectionHeading } from "@/components/shell/PageShell";
import { Button } from "@/components/ui/Button";
import { Stat } from "@/components/ui/Stat";
import { getRepositories, getStorageAdapter } from "@/lib/storage/client";
import type { StorageCounts } from "@/lib/storage/repositories";
import { type ImportMode, type ImportPreview, type ExportFile, applyImport, buildExport, exportFileName, parseExport } from "@/lib/storage/transfer";

const ADAPTER_LABELS: Record<string, string> = {
  indexeddb: "IndexedDB",
  localstorage: "localStorage",
  memory: "memory only (nothing persists after this tab closes)",
  pending: "…",
};

type Pending = { file: ExportFile; preview: ImportPreview; name: string };

export function DataPage() {
  const [adapter, setAdapter] = useState("pending");
  const [counts, setCounts] = useState<StorageCounts | null>(null);
  const [notice, setNotice] = useState<{ tone: "good" | "bad" | "muted"; text: string } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(() => {
    getStorageAdapter()
      .name()
      .then(setAdapter)
      .catch(() => setAdapter("memory"));
    getRepositories()
      .counts()
      .then(setCounts)
      .catch(() => setNotice({ tone: "bad", text: "Could not read local storage." }));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleExport = async () => {
    setBusy(true);
    try {
      const file = await buildExport(getRepositories());
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFileName();
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice({ tone: "good", text: `Exported ${file.sessions.length} sessions to ${link.download}.` });
    } catch {
      setNotice({ tone: "bad", text: "Export failed. Nothing was changed." });
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    setNotice(null);
    setConfirmReplace(false);
    const parsed = parseExport(await file.text());
    if (!parsed.ok) {
      setPending(null);
      setNotice({ tone: "bad", text: parsed.error });
      return;
    }
    setPending({ file: parsed.file, preview: parsed.preview, name: file.name });
  };

  const runImport = async (mode: ImportMode) => {
    if (!pending) return;
    setBusy(true);
    try {
      const result = await applyImport(getRepositories(), pending.file, mode);
      setNotice({
        tone: "good",
        text:
          mode === "merge"
            ? `Merged ${result.sessionsAdded} new ${result.sessionsAdded === 1 ? "session" : "sessions"} (${result.attemptsAdded} answers). Existing records were left untouched.`
            : `Replaced everything with ${result.sessionsAdded} sessions and ${result.attemptsAdded} answers from ${pending.name}.`,
      });
      setPending(null);
      setConfirmReplace(false);
      if (fileInput.current) fileInput.current.value = "";
      refresh();
    } catch {
      setNotice({ tone: "bad", text: "Import failed part-way. Export your data and check the file before retrying." });
    } finally {
      setBusy(false);
    }
  };

  const runClear = async () => {
    setBusy(true);
    try {
      await getRepositories().clearAll();
      setNotice({ tone: "muted", text: "All local Math Happens data was removed." });
      setConfirmClear(false);
      refresh();
    } catch {
      setNotice({ tone: "bad", text: "Could not clear storage." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell title="Data" lede="Everything lives in this browser. Take a copy, move it to another device, or start over — nothing is overwritten without asking." width="narrow">
      <section aria-label="Storage status" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Store" value={<span className="text-base">{ADAPTER_LABELS[adapter] ?? adapter}</span>} hint="chosen automatically" />
        <Stat label="Sessions" value={counts?.sessions ?? "—"} />
        <Stat label="Answers" value={counts?.attempts ?? "—"} />
        <Stat label="Review skills" value={counts?.reviewItems ?? "—"} />
      </section>

      {notice && (
        <p
          role="status"
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            notice.tone === "good" ? "border-good/30 bg-good-soft text-good" : notice.tone === "bad" ? "border-bad/30 bg-bad-soft text-bad" : "border-line bg-surface text-ink-soft"
          }`}
        >
          {notice.text}
        </p>
      )}

      <section className="mt-8" aria-label="Export">
        <SectionHeading hint="A versioned JSON file with settings, sessions, every answer, and the review calendar.">Export</SectionHeading>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-4">
          <p className="text-sm text-ink-soft">Download a complete copy of your history. Keep it as a backup or import it on another device.</p>
          <Button variant="primary" onClick={handleExport} disabled={busy || counts === null}>
            Export JSON
          </Button>
        </div>
      </section>

      <section className="mt-8" aria-label="Import">
        <SectionHeading hint="Merging adds sessions you do not already have. Replacing deletes everything first and asks you to confirm.">Import</SectionHeading>
        <div className="rounded-xl border border-line bg-surface px-4 py-4">
          <label className="flex flex-col gap-2 text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between">
            <span>Choose a Math Happens export file.</span>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              onChange={(event) => void handleFile(event.target.files)}
              className="text-sm text-ink file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:border-ink"
            />
          </label>
          {pending && (
            <div className="mt-4 rounded-xl border border-line-strong bg-paper px-4 py-3">
              <p className="text-sm text-ink">
                <span className="font-semibold">{pending.name}</span> · exported {pending.preview.exportedAt ? new Date(pending.preview.exportedAt).toLocaleString() : "at an unknown time"}
              </p>
              <p className="tabular mt-1 font-mono text-xs text-muted">
                {pending.preview.sessions} sessions · {pending.preview.attempts} answers · {pending.preview.reviewItems} review skills · settings {pending.preview.hasSettings ? "included" : "absent"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm" onClick={() => void runImport("merge")} disabled={busy}>
                  Merge into my history
                </Button>
                {!confirmReplace ? (
                  <Button variant="danger" size="sm" onClick={() => setConfirmReplace(true)} disabled={busy}>
                    Replace everything…
                  </Button>
                ) : (
                  <span className="flex flex-wrap items-center gap-2 text-sm text-bad">
                    This deletes your {counts?.sessions ?? 0} current sessions first.
                    <Button variant="danger" size="sm" onClick={() => void runImport("replace")} disabled={busy}>
                      Yes, replace everything
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmReplace(false)}>
                      Cancel
                    </Button>
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPending(null);
                    setConfirmReplace(false);
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                >
                  Discard file
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="mt-8" aria-label="Clear">
        <SectionHeading hint="Removes sessions, answers, review state and settings from this browser. Export first if you might want them back.">Start over</SectionHeading>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-4">
          {!confirmClear ? (
            <>
              <p className="text-sm text-ink-soft">Delete all local Math Happens data.</p>
              <Button variant="danger" onClick={() => setConfirmClear(true)} disabled={busy || !counts || (counts.sessions === 0 && counts.reviewItems === 0)}>
                Clear all data…
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-bad">This permanently deletes {counts?.sessions ?? 0} sessions and {counts?.attempts ?? 0} answers.</p>
              <span className="flex items-center gap-2">
                <Button variant="danger" onClick={() => void runClear()} disabled={busy}>
                  Yes, delete everything
                </Button>
                <Button variant="ghost" onClick={() => setConfirmClear(false)}>
                  Cancel
                </Button>
              </span>
            </>
          )}
        </div>
      </section>
    </PageShell>
  );
}
