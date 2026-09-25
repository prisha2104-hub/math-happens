import type { Metadata } from "next";
import { Suspense } from "react";
import { ImprovePage } from "@/components/improve/ImprovePage";
import { PageShell } from "@/components/shell/PageShell";

export const metadata: Metadata = { title: "Improve · Math Happens" };

export default function Page() {
  return (
    <Suspense
      fallback={
        <PageShell title="Improve">
          <p className="text-sm text-muted">Loading…</p>
        </PageShell>
      }
    >
      <ImprovePage />
    </Suspense>
  );
}
