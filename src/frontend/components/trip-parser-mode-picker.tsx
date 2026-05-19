"use client";

import { type ReactNode, useState } from "react";

type Props = {
  formMode: ReactNode;
  chatMode: ReactNode;
};

export function TripParserModePicker({ formMode, chatMode }: Props) {
  const [mode, setMode] = useState<"form" | "chat">("form");

  return (
    <div>
      <div className="mb-6 flex items-center justify-end">
        <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-white/10">
          <button
            type="button"
            onClick={() => setMode("form")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              mode === "form"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "text-slate-500 hover:text-slate-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
          >
            Quick form
          </button>
          <button
            type="button"
            onClick={() => setMode("chat")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              mode === "chat"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "text-slate-500 hover:text-slate-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
          >
            Chat mode
          </button>
        </div>
      </div>
      {mode === "form" ? formMode : chatMode}
    </div>
  );
}
