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
          ? "rounded-2xl border border-indigo-200 bg-indigo-50/80 px-4 py-4 dark:border-indigo-500/25 dark:bg-indigo-950/30"
          : "rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-dm-elevated"
      }
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-neutral-500">Invite code</p>
          <p className="text-xl font-bold tracking-wider text-slate-900 dark:text-white sm:text-2xl">{display}</p>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-semibold text-indigo-800 shadow-sm hover:bg-indigo-50 dark:border-indigo-500/40 dark:bg-dm-page dark:text-indigo-200 dark:hover:bg-indigo-950/40"
        >
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>
    </div>
  );
}
