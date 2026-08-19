"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Scale, Trophy, X, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConsensusVisualizer } from "@/components/ConsensusVisualizer";
import { useTransactionLifecycle } from "@/lib/useTransactionLifecycle";
import { useGenLayerClient, getReadOnlyClient } from "@/lib/genlayer-client";
import { adjudicate, fetchLiveInterpretation } from "@/lib/lens-calls";
import { formatGen } from "@/lib/utils";
import type { InterpretationRecord, LiveInterpretation } from "@/lib/lens-abi";

type Stage = "preview" | "running" | "revealed";

export function AdjudicationTheater({
  lensAddress,
  sources,
  candidates,
  onClose,
  onAdjudicated,
}: {
  lensAddress: `0x${string}`;
  sources: string[];
  candidates: InterpretationRecord[];
  onClose: () => void;
  onAdjudicated: () => void;
}) {
  const { client } = useGenLayerClient();
  const { state, run } = useTransactionLifecycle(client);
  const [stage, setStage] = useState<Stage>("preview");
  const [result, setResult] = useState<LiveInterpretation | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);

  const busy = state.phase === "submitting" || state.phase === "polling";

  async function handleRun() {
    setStage("running");
    await run(() => adjudicate(client!, lensAddress), { requireFinalized: true });
  }

  async function revealResult() {
    try {
      const live = await fetchLiveInterpretation(getReadOnlyClient(), lensAddress);
      setResult(live);
      setStage("revealed");
      onAdjudicated();
    } catch (err) {
      setResultError(err instanceof Error ? err.message : "Couldn't load the result.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border-strong bg-surface shadow-[var(--shadow-lifted)]"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-coral" />
            <p className="text-sm font-semibold text-fg">Adjudication</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-fg-muted hover:bg-bg-subtle hover:text-fg"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-8">
          <AnimatePresence mode="wait">
            {stage === "preview" && (
              <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-8">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                    Live evidence will be fetched from
                  </p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {sources.map((src) => (
                      <li key={src} className="flex items-center gap-2 rounded-xl border border-border bg-bg-subtle px-4 py-2.5 text-sm">
                        <Globe className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
                        <span className="truncate font-mono text-xs text-fg-secondary">{src}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                    {candidates.length} interpretation{candidates.length === 1 ? "" : "s"} competing this round
                  </p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {candidates.map((c) => (
                      <li key={c.id} className="rounded-xl border border-border px-4 py-3">
                        <p className="line-clamp-2 text-sm text-fg">{c.content}</p>
                        <p className="mt-1 text-xs text-fg-muted">{formatGen(c.total_stake)} GEN staked</p>
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="text-xs leading-relaxed text-fg-muted">
                  Validators independently fetch this evidence and select the strongest interpretation under
                  GenLayer&rsquo;s Equivalence Principle — stake size plays no role in the decision.
                </p>

                <Button onClick={handleRun} size="lg" disabled={!client || busy}>
                  {client ? "Run adjudication" : "Connect a wallet to adjudicate"}
                </Button>
              </motion.div>
            )}

            {stage === "running" && (
              <motion.div key="running" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-6 py-4">
                {state.phase === "submitting" && (
                  <div className="flex flex-col items-center gap-3 py-10 text-fg-secondary">
                    <Loader2 className="h-6 w-6 animate-spin text-coral" />
                    <p className="text-sm">Waiting for wallet signature…</p>
                  </div>
                )}
                {state.phase === "polling" && state.status && (
                  <ConsensusVisualizer status={state.status} transaction={state.transaction} />
                )}
                {state.phase === "success" && (
                  <div className="flex flex-col items-center gap-4 py-6">
                    <Trophy className="h-8 w-8 text-coral" />
                    <p className="text-sm font-medium text-fg">Consensus reached — finalized on-chain</p>
                    <Button onClick={revealResult}>
                      Reveal the live output <ArrowRight className="h-4 w-4" />
                    </Button>
                    {resultError && <p className="text-xs text-negative">{resultError}</p>}
                  </div>
                )}
                {state.phase === "error" && (
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <p className="text-sm font-medium text-negative">{state.error}</p>
                    <Button variant="secondary" onClick={() => setStage("preview")}>
                      Back
                    </Button>
                  </div>
                )}
              </motion.div>
            )}

            {stage === "revealed" && result && (
              <motion.div
                key="revealed"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-5"
              >
                <div className="flex flex-col items-center gap-2 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-coral-soft text-coral">
                    <Trophy className="h-6 w-6" />
                  </span>
                  <p className="text-lg font-semibold text-fg">New live output</p>
                </div>

                {result.has_live && "content" in result.interpretation && (
                  <>
                    <div className="rounded-2xl border border-coral/40 bg-coral-soft/40 p-5">
                      <p className="text-sm leading-relaxed text-fg">{result.interpretation.content}</p>
                    </div>
                    {"reasoning" in result.reasoning && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Reasoning</p>
                        <p className="mt-1.5 text-sm leading-relaxed text-fg-secondary">{result.reasoning.reasoning}</p>
                        <p className="mt-2 text-xs text-fg-muted">
                          Confidence: {(parseFloat(result.reasoning.confidence) * 100).toFixed(0)}%
                        </p>
                      </div>
                    )}
                  </>
                )}

                <Button onClick={onClose}>Done</Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
