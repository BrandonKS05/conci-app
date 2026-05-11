import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/frontend/lib/utils";

/**
 * Variants are tuned to the existing Conci palette:
 *  - `default`: slate-900 light / warm off-white `#ebe9e4` dark — matches
 *    `primaryFilledInteractive` from `src/frontend/ui/primary-action.ts`.
 *  - `secondary`: light-slate / dm.elevated outlined surface — matches the
 *    legacy `SecondaryButton`.
 *  - `pill` size keeps Conci's rounded-full CTA shape; `default` size keeps
 *    a softer radius for forms and inline actions.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-slate-900 text-white shadow-sm hover:bg-slate-800 dark:bg-[#ebe9e4] dark:text-[#141414] dark:hover:bg-white",
        secondary:
          "border border-slate-200 bg-white text-ink hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-200 dark:hover:border-white/15 dark:hover:bg-dm-card",
        outline:
          "border border-input bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        ghost:
          "text-slate-700 hover:bg-slate-100 dark:text-neutral-200 dark:hover:bg-dm-elevated",
        link: "text-brand-600 underline-offset-4 hover:underline dark:text-brand-100",
      },
      size: {
        default: "h-9 rounded-md px-4",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-6",
        icon: "h-9 w-9 rounded-md",
        pill: "h-10 rounded-full px-5",
        "pill-sm": "h-8 rounded-full px-4 text-xs",
        "pill-lg": "h-12 rounded-full px-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
