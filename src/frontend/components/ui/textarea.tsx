import * as React from "react";

import { cn } from "@/frontend/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-emerald-500/40 dark:focus:ring-emerald-500/10",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
