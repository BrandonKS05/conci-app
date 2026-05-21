"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "@/frontend/components/user-menu";
import { APP_NAV_ITEMS, isAppNavActive } from "@/shared/app-nav";

export function AppTopNav() {
  const pathname = usePathname() ?? "";

  return (
    <header className="sticky top-0 z-50 border-b border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)]/85 px-5 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-[#141414]/90 sm:px-8">
      <div className="mx-auto flex max-w-6xl items-center gap-6">
        <Link
          href="/"
          className="flex shrink-0 items-center text-[color:var(--on-surface)] transition hover:opacity-90 dark:text-[#ebe9e4]"
          aria-label="Conci home"
        >
          <span className="font-display text-2xl font-semibold tracking-[-0.01em] text-[color:var(--on-surface)] dark:text-[#ebe9e4] sm:text-[1.7rem]">
            Conci
          </span>
        </Link>
        <nav aria-label="Main" className="hidden flex-1 items-center justify-center gap-8 md:flex">
          {APP_NAV_ITEMS.map((item) => {
            const active = isAppNavActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} className={navLinkClass(active)}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
          <UserMenu />
        </div>
      </div>
      <nav
        aria-label="Main (mobile)"
        className="mx-auto mt-3 flex max-w-6xl items-center gap-x-5 gap-y-2 overflow-x-auto pb-1 md:hidden"
      >
        {APP_NAV_ITEMS.map((item) => {
          const active = isAppNavActive(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} className={navLinkClass(active, true)}>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

function navLinkClass(active: boolean, mobile = false) {
  const base = "label-caps shrink-0 transition";
  if (active) {
    return mobile
      ? `${base} text-[color:var(--on-surface)] dark:text-[#ebe9e4]`
      : `${base} text-[color:var(--on-surface)] underline underline-offset-[6px] decoration-[color:var(--on-surface)]/45 decoration-1 dark:text-[#ebe9e4] dark:decoration-white/30`;
  }
  return `${base} text-[color:var(--on-surface-variant)] hover:text-[color:var(--on-surface)] dark:text-[#9c9a96] dark:hover:text-[#ebe9e4]`;
}
