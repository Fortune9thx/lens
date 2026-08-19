import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral/40 cursor-pointer disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        primary:
          "bg-coral text-white shadow-[0_1px_2px_rgba(28,23,18,0.08)] hover:bg-coral-dim hover:shadow-[0_4px_16px_rgba(234,91,38,0.35)] active:scale-[0.98]",
        secondary:
          "border border-border bg-surface text-fg hover:border-border-strong hover:bg-bg-subtle active:scale-[0.98]",
        dark: "bg-fg text-bg hover:opacity-90 active:scale-[0.98]",
        outline: "border border-border-strong text-fg hover:bg-bg-subtle active:scale-[0.98]",
        danger:
          "border border-negative/40 bg-negative-soft text-negative hover:border-negative active:scale-[0.98]",
        ghost: "text-fg-secondary hover:text-fg hover:bg-bg-subtle",
        link: "text-coral hover:text-coral-dim underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        default: "h-11 px-6",
        sm: "h-9 px-4 text-xs",
        lg: "h-13 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
