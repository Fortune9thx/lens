import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-24 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg placeholder:text-fg-muted transition-colors resize-y",
        "focus-visible:outline-none focus-visible:border-coral focus-visible:ring-2 focus-visible:ring-coral/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
