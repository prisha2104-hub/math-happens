"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/ui/Wordmark";
import { cx } from "@/lib/ui/cx";

export const NAV_ITEMS = [
  { href: "/", label: "Train" },
  { href: "/improve", label: "Improve" },
  { href: "/history", label: "History" },
  { href: "/notebook", label: "Notebook" },
  { href: "/techniques", label: "Techniques" },
  { href: "/data", label: "Data" },
] as const;

export function SiteNav() {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement | null>(null);

  // On narrow screens the list scrolls; keep the current section in view.
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>("[aria-current='page']");
    if (!list || !active || list.scrollWidth <= list.clientWidth) return;
    list.scrollLeft = Math.max(0, active.offsetLeft - (list.clientWidth - active.offsetWidth) / 2);
  }, [pathname]);

  return (
    <nav className="border-b border-line bg-paper/80 backdrop-blur-sm" aria-label="Primary">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-8">
        <Link href="/" className="shrink-0 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <Wordmark className="text-lg sm:text-xl" />
        </Link>
        <ul ref={listRef} className="-mx-1 flex min-w-0 items-center gap-0 overflow-x-auto text-[13px] sm:gap-1 sm:text-sm">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "relative inline-block whitespace-nowrap rounded-md px-2 py-1.5 font-medium tracking-tight transition-colors sm:px-3",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    active ? "text-ink" : "text-muted hover:text-ink",
                  )}
                >
                  {item.label}
                  {active && <span className="absolute inset-x-2.5 -bottom-[13px] h-0.5 rounded-full bg-accent sm:inset-x-3" aria-hidden="true" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
