import type { ReactNode } from "react";
import { cx } from "@/lib/ui/cx";
import { SiteNav } from "./SiteNav";

interface PageShellProps {
  title?: ReactNode;
  /** Short editorial line under the title. */
  lede?: ReactNode;
  /** Controls rendered to the right of the title on wide screens. */
  actions?: ReactNode;
  width?: "narrow" | "wide";
  children: ReactNode;
}

/** Navigation plus the editorial page header shared by every section except a live session. */
export function PageShell({ title, lede, actions, width = "wide", children }: PageShellProps) {
  return (
    <>
      <SiteNav />
      <main className={cx("mx-auto flex w-full flex-1 flex-col px-5 py-8 sm:px-8 sm:py-10", width === "wide" ? "max-w-5xl" : "max-w-3xl")}>
        {title !== undefined && (
          <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-4xl tracking-tight text-ink sm:text-5xl">{title}</h1>
              {lede !== undefined && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft sm:text-base">{lede}</p>}
            </div>
            {actions !== undefined && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
          </header>
        )}
        {children}
      </main>
    </>
  );
}

/** Dashed panel used whenever a section has nothing to show yet. */
export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
      <p className="font-display text-2xl text-ink sm:text-3xl">{title}</p>
      {children !== undefined && <div className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">{children}</div>}
      {action !== undefined && <div className="mt-6 flex justify-center">{action}</div>}
    </section>
  );
}

export function SectionHeading({ children, hint, actions }: { children: ReactNode; hint?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">{children}</h2>
        {hint !== undefined && <p className="mt-1 text-sm text-ink-soft">{hint}</p>}
      </div>
      {actions}
    </div>
  );
}
