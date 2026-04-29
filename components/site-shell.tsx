import Link from "next/link";

const navItems = [
  { href: "/", label: "Prompt" },
  { href: "/results", label: "Results" },
  { href: "/booking", label: "Booking" },
  { href: "/saved", label: "Saved" },
];

export function SiteShell({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <header className="sticky top-3 z-20 mb-7 rounded-[1.75rem] border border-white/80 bg-white/75 px-4 py-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:px-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white shadow-lg shadow-slate-900/15">
                C
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-700">
                  Conci
                </p>
                <p className="text-sm text-slate-500">AI executive assistant MVP</p>
              </div>
            </div>
            <div className="hidden items-center gap-3 md:flex">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                Consumer-first flow
              </span>
            </div>
          </div>
          <nav className="mt-4 hidden items-center gap-2 overflow-x-auto md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-transparent px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-200 hover:bg-slate-50 hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <section className="mb-7 max-w-3xl lg:mb-9">
          {eyebrow ? (
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.34em] text-brand-600">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.02] tracking-[-0.05em] text-ink sm:text-5xl lg:text-6xl">
            {title}
          </h1>
        </section>

        <div className="flex-1 pb-24 sm:pb-10">{children}</div>

        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/70 bg-white/90 px-4 py-3 backdrop-blur-xl md:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex-1 rounded-2xl px-3 py-3 text-center text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </main>
  );
}
