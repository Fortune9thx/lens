import Link from "next/link";
import { Sparkles } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border bg-bg-subtle">
      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-fg">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-coral text-white">
                <Sparkles className="h-4 w-4" />
              </span>
              Lens
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-fg-secondary">
              A real-time interpretation engine for high-stakes information streams.
              Capital-backed, GenLayer-adjudicated, continuously updatable.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Product</p>
            <ul className="mt-3 space-y-2 text-sm text-fg-secondary">
              <li><Link href="/lenses" className="hover:text-fg">Explore Lenses</Link></li>
              <li><Link href="/create" className="hover:text-fg">Open a Lens</Link></li>
              <li><Link href="/agents" className="hover:text-fg">Agent SDK</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Protocol</p>
            <ul className="mt-3 space-y-2 text-sm text-fg-secondary">
              <li>
                <a href="https://docs.genlayer.com" target="_blank" rel="noreferrer" className="hover:text-fg">
                  GenLayer Docs
                </a>
              </li>
              <li>
                <a href="https://github.com/Fortune9thx/lens" target="_blank" rel="noreferrer" className="hover:text-fg">
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 text-xs text-fg-muted md:flex-row">
          <p>© {new Date().getFullYear()} Lens. Built on GenLayer.</p>
          <p>Interpretation is infrastructure.</p>
        </div>
      </div>
    </footer>
  );
}
