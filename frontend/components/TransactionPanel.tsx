"use client";

import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { ConsensusVisualizer } from "./ConsensusVisualizer";
import { Button } from "./ui/button";
import type { TransactionLifecycleState } from "@/lib/useTransactionLifecycle";
import { testnetBradbury } from "genlayer-js/chains";

const EXPLORER_BASE = testnetBradbury.blockExplorers?.default?.url ?? "https://explorer-bradbury.genlayer.com/";

export function TransactionPanel({
  state,
  onReset,
  successLabel = "Confirmed on-chain",
}: {
  state: TransactionLifecycleState;
  onReset?: () => void;
  successLabel?: string;
}) {
  if (state.phase === "idle") return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-surface flex flex-col items-center gap-4 p-6"
    >
      {state.phase === "submitting" && (
        <div className="flex flex-col items-center gap-3 py-6 text-fg-secondary">
          <Loader2 className="h-6 w-6 animate-spin text-coral" />
          <p className="text-sm">Waiting for wallet signature…</p>
        </div>
      )}

      {state.phase === "polling" && state.status && (
        <ConsensusVisualizer status={state.status} transaction={state.transaction} />
      )}

      {state.phase === "success" && (
        <div className="flex flex-col items-center gap-2 py-4">
          <CheckCircle2 className="h-8 w-8 text-positive" />
          <p className="text-sm font-medium text-fg">{successLabel}</p>
        </div>
      )}

      {state.phase === "error" && (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <XCircle className="h-8 w-8 text-negative" />
          <p className="text-sm font-medium text-negative">{state.error ?? "Something went wrong."}</p>
        </div>
      )}

      {state.hash && (
        <a
          href={`${EXPLORER_BASE}tx/${state.hash}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs text-fg-muted underline decoration-dotted underline-offset-4 hover:text-coral"
        >
          {state.hash.slice(0, 10)}…{state.hash.slice(-8)}
        </a>
      )}

      {(state.phase === "success" || state.phase === "error") && onReset && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          Done
        </Button>
      )}
    </motion.div>
  );
}
