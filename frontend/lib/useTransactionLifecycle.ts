"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TransactionStatus } from "genlayer-js/types";
import type { GenLayerClient, GenLayerChain, GenLayerTransaction } from "genlayer-js/types";
import { pollConsensusStatus, PollCancelledError, describeTransactionOutcome } from "./genlayer-client";

export type LifecyclePhase = "idle" | "submitting" | "polling" | "success" | "error";

export interface TransactionLifecycleState {
  phase: LifecyclePhase;
  hash: `0x${string}` | null;
  status: TransactionStatus | null;
  transaction: GenLayerTransaction | null;
  error: string | null;
}

const INITIAL_STATE: TransactionLifecycleState = {
  phase: "idle",
  hash: null,
  status: null,
  transaction: null,
  error: null,
};

/**
 * Drives the full write-transaction lifecycle UI: submit -> real tx hash ->
 * live consensus polling -> success/failure, all off actual chain state via
 * pollConsensusStatus. Every Lens write in this app (create/submit/back/
 * adjudicate/settle/claim) goes through this same hook so the lifecycle UI
 * is consistent everywhere.
 */
export function useTransactionLifecycle(client: GenLayerClient<GenLayerChain> | null) {
  const [state, setState] = useState<TransactionLifecycleState>(INITIAL_STATE);
  const cancelledRef = useRef(false);

  // Cancellation must not depend on every call site remembering to call
  // reset() on unmount -- a user navigating away mid-poll would otherwise
  // leave pollConsensusStatus's loop running against an unmounted
  // component. This effect guarantees every consumer of this hook stops
  // polling on unmount regardless.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const reset = useCallback(() => {
    cancelledRef.current = true;
    setState(INITIAL_STATE);
  }, []);

  const run = useCallback(
    async (submit: () => Promise<`0x${string}`>, options?: { requireFinalized?: boolean }) => {
      if (!client) {
        setState({ ...INITIAL_STATE, phase: "error", error: "Connect a wallet first." });
        return;
      }
      cancelledRef.current = false;
      setState({ ...INITIAL_STATE, phase: "submitting" });

      let hash: `0x${string}`;
      try {
        hash = await submit();
      } catch (err) {
        if (cancelledRef.current) return;
        setState({
          ...INITIAL_STATE,
          phase: "error",
          error: err instanceof Error ? err.message : "Transaction was rejected.",
        });
        return;
      }

      setState({ phase: "polling", hash, status: TransactionStatus.PENDING, transaction: null, error: null });

      try {
        const transaction = await pollConsensusStatus(
          client,
          hash,
          ({ status, transaction }) => {
            if (cancelledRef.current) return;
            setState((prev) => ({ ...prev, status, transaction }));
          },
          { isCancelled: () => cancelledRef.current, requireFinalized: options?.requireFinalized }
        );
        if (cancelledRef.current) return;
        const outcome = describeTransactionOutcome(transaction);
        setState({
          phase: outcome.succeeded ? "success" : "error",
          hash,
          status: transaction.statusName ?? null,
          transaction,
          error: outcome.succeeded ? null : outcome.reason,
        });
      } catch (err) {
        if (cancelledRef.current || err instanceof PollCancelledError) return;
        setState((prev) => ({
          ...prev,
          phase: "error",
          error: err instanceof Error ? err.message : "Polling failed.",
        }));
      }
    },
    [client]
  );

  return { state, run, reset };
}
