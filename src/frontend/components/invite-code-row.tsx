"use client";

import { useCallback, useState } from "react";
import { formatInviteCodeDisplay } from "@/backend/invite-code";

export function InviteCodeRow({ rawCode, prominent = false }: { rawCode: string; prominent?: boolean }) {
  const display = formatInviteCodeDisplay(rawCode);
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(display);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = display;
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
  }, [display]);

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
