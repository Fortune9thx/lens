import Link from "next/link";
import { ArrowUpRight, Radio, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { shortenAddress, timeAgo } from "@/lib/utils";
import type { LensMeta } from "@/lib/lens-abi";

export function LensCard({ meta }: { meta: LensMeta }) {
  return (
    <Link
      href={`/lenses/${meta.address}`}
      className="card-surface card-surface-hover group flex flex-col gap-4 p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <Badge variant="coral" className="capitalize">
          {meta.interpretation_type}
        </Badge>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-fg-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-coral" />
      </div>

      <div>
        <h3 className="line-clamp-2 text-lg font-semibold leading-snug text-fg">{meta.title}</h3>
        {meta.description && (
          <p className="mt-1.5 line-clamp-2 text-sm text-fg-secondary">{meta.description}</p>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-fg-muted">
        <span className="flex items-center gap-1">
          <Layers className="h-3.5 w-3.5" /> {meta.sources.length} source{meta.sources.length === 1 ? "" : "s"}
        </span>
        <span className="flex items-center gap-1">
          <Radio className="h-3.5 w-3.5" /> {shortenAddress(meta.creator)}
        </span>
        <span>{timeAgo(meta.created_at)}</span>
      </div>
    </Link>
  );
}
