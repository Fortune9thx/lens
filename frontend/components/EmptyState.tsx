import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="card-surface flex flex-col items-center gap-4 px-8 py-16 text-center">
      <svg width="56" height="56" viewBox="0 0 64 64" fill="none" className="opacity-80">
        <circle cx="32" cy="32" r="30" stroke="var(--color-border-strong)" strokeWidth="1" strokeDasharray="4 4" />
        <circle cx="32" cy="32" r="18" stroke="var(--color-coral)" strokeWidth="1.5" opacity="0.55" />
        <path d="M32 20 L32 32 L40 38" stroke="var(--color-coral)" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
      </svg>
      <div className="max-w-sm">
        <h3 className="text-base font-semibold text-fg">{title}</h3>
        <p className="mt-1.5 text-sm text-fg-secondary">{description}</p>
      </div>
      {action}
    </div>
  );
}
