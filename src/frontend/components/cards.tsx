import Link from "next/link";

export function GlassCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[1.75rem] border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] p-5 shadow-[var(--shadow-ambient)] dark:border-white/10 dark:bg-dm-card dark:shadow-[0_18px_50px_rgba(0,0,0,0.35)] ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-5">
      <h2 className="font-display text-xl font-semibold tracking-[-0.03em] text-[color:var(--on-surface)] dark:text-white sm:text-2xl">
        {title}
      </h2>
      {description ? <p className="mt-1 text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-500">{description}</p> : null}
    </div>
  );
}

export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="label-caps inline-flex items-center rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-3 py-1 text-[color:var(--on-surface-variant)] dark:border-white/10 dark:bg-white/5 dark:text-neutral-300">
      {children}
    </span>
  );
}

export function PrimaryButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-full bg-[#1c1c17] px-6 py-3.5 text-sm font-medium tracking-wide text-[color:var(--surface)] shadow-[var(--shadow-ambient-sm)] transition hover:bg-[#2a2a26]"
    >
      {children}
    </Link>
  );
}

export function SecondaryButton({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-full border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-6 py-3.5 text-sm font-medium tracking-wide text-[color:var(--on-surface)] shadow-[var(--shadow-ambient-sm)] transition hover:bg-[color:var(--surface-container-low)] dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-200 dark:hover:border-white/15 dark:hover:bg-dm-card"
    >
      {children}
    </Link>
  );
}
