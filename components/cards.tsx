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
      className={`rounded-[1.75rem] border border-white/80 bg-white/[0.85] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl ${className}`}
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
      <h2 className="font-display text-xl font-semibold tracking-[-0.03em] text-ink sm:text-2xl">
        {title}
      </h2>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
    </div>
  );
}

export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-brand-100 bg-brand-50/80 px-3 py-1 text-xs font-semibold text-brand-700">
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
      className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-slate-950 via-slate-900 to-brand-700 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_30px_rgba(15,23,42,0.22)]"
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
      className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-ink transition hover:border-slate-300 hover:bg-slate-50"
    >
      {children}
    </Link>
  );
}
