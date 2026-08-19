import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm text-fg placeholder:text-fg-muted transition-colors",
        "focus-visible:outline-none focus-visible:border-coral focus-visible:ring-2 focus-visible:ring-coral/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Input };
