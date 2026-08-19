"use client";

import { motion } from "framer-motion";
import { Trophy, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatGen, shortenAddress, timeAgo } from "@/lib/utils";
import type { InterpretationRecord } from "@/lib/lens-abi";

export function InterpretationCard({
  interpretation,
  isLive,
  onBack,
  disabled,
}: {
  interpretation: InterpretationRecord;
  isLive?: boolean;
  onBack?: () => void;
  disabled?: boolean;
}) {
  const claimEntries = Object.entries(interpretation.structured_claims || {}).slice(0, 6);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`card-surface flex flex-col gap-4 p-6 ${isLive ? "border-coral/50 ring-1 ring-coral/20" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          <User className="h-3.5 w-3.5" />
          {shortenAddress(interpretation.author)}
          <span>·</span>
          {timeAgo(interpretation.created_at)}
        </div>
        {isLive && (
          <Badge variant="coral">
            <Trophy className="h-3 w-3" /> Live
          </Badge>
        )}
      </div>

      <p className="text-sm leading-relaxed text-fg">{interpretation.content}</p>

      {claimEntries.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {claimEntries.map(([key, value]) => (
            <span
              key={key}
              className="rounded-lg border border-border bg-bg-subtle px-2.5 py-1 text-xs text-fg-secondary"
            >
              <span className="font-medium text-fg-muted">{key}:</span> {String(value)}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between border-t border-border pt-4">
        <div className="text-sm">
          <span className="font-semibold text-fg">{formatGen(interpretation.total_stake)} GEN</span>
          <span className="ml-1.5 text-xs text-fg-muted">
            · {interpretation.backer_count} backer{interpretation.backer_count === 1 ? "" : "s"}
          </span>
        </div>
        {onBack && (
          <Button size="sm" variant="secondary" onClick={onBack} disabled={disabled}>
            Back this
          </Button>
        )}
      </div>
    </motion.div>
  );
}
