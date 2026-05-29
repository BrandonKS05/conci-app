"use client";

import { useCallback, useState } from "react";
import { formatInviteCodeDisplay, normalizeInviteCode } from "@/backend/invite-code";

export function InviteCodeRow({
  rawCode,
  prominent = false,
  variant,
}: {
  rawCode: string;
  prominent?: boolean;
  variant?: "compact";
}) {
  const display = formatInviteCodeDisplay(rawCode);
  const inviteLink = `https://conci.travel/join/${normalizeInviteCode(rawCode)}`;
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = inviteLink;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        /* ignore */
      }
    }
  }, [inviteLink]);

  if (variant === "compact") {
    return (
      <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-lowest)] p-3 shadow-[var(--shadow-ambient-sm)] dark:border-white/10 dark:bg-dm-elevated dark:shadow-none">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="label-caps text-[#2F66ED] dark:text-blue-200">Invite friends</p>
            <p className="mt-1 font-display text-lg font-semibold tracking-[0.16em] text-[color:var(--on-surface)] dark:text-white">
              {display}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copy()}
            className="shrink-0 rounded-full border border-[color:var(--hairline-strong)] bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--on-surface)] transition hover:bg-[color:var(--surface-container-low)] dark:border-white/15 dark:bg-dm-page dark:text-[#ebe9e4] dark:hover:bg-white/10"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[color:var(--on-surface-muted)] dark:text-neutral-500">
          Guests can join, vote, and add preferences.
        </p>
      </div>
    );
  }

  return (
    <div
      className={
        prominent
          ? "inline-flex rounded-2xl border border-[color:var(--hairline-strong)] bg-[color:var(--surface-container-lowest)] px-3 py-2.5 shadow-[var(--shadow-ambient-sm)] dark:border-indigo-500/25 dark:bg-indigo-950/30"
          : "rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface-container-low)] px-3 py-2 dark:border-white/10 dark:bg-dm-elevated"
      }
    >
      <div className="flex items-center gap-3">
        <div>
          <p className="label-caps text-[color:var(--sage)] dark:text-neutral-500">Invite code</p>
          <p className="font-display text-lg font-semibold tracking-[0.18em] text-[color:var(--on-surface)] dark:text-white sm:text-xl">{display}</p>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-lg bg-[#1c1c17] px-3 py-1.5 text-xs font-medium tracking-wide text-[color:var(--surface)] shadow-[var(--shadow-ambient-sm)] transition hover:bg-[#2a2a26] dark:border dark:border-indigo-500/40 dark:bg-dm-page dark:text-indigo-200 dark:hover:bg-indigo-950/40"
        >
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>
    </div>
  );
}
