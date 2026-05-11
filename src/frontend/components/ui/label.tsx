import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/frontend/lib/utils";

type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  /** Render as a child element (e.g. `<span>`) instead of `<label>`. Useful
   * when the surrounding element is already a `<label>`. */
  asChild?: boolean;
};

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "label";
    return (
      <Comp
        ref={ref}
        className={cn(
          "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-500",
          className
        )}
        {...props}
      />
    );
  }
);
Label.displayName = "Label";

export { Label };
