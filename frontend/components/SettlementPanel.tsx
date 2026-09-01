"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Coins, TimerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TransactionPanel } from "@/components/TransactionPanel";
import { useGenLayerClient, getReadOnlyClient } from "@/lib/genlayer-client";
import { useTransactionLifecycle } from "@/lib/useTransactionLifecycle";
import {
  fetchRoundInfo,
  fetchClaimable,
  fetchIsClaimed,
  settleRound,
  claimSettlement,
  cancelRound,
} from "@/lib/lens-calls";
import { formatGen } from "@/lib/utils";
import { ROUND_TIMEOUT_SECONDS } from "@/lib/lens-abi";
import type { RoundInfo, RoundStatus } from "@/lib/lens-abi";

const STATUS_VARIANT: Record<RoundStatus, "positive" | "coral" | "neutral" | "negative"> = {
  settled: "positive",
  adjudicated: "coral",
  inconclusive: "negative",
  cancelled: "negative",
  adjudicating: "neutral",
  open: "neutral",
  "": "neutral",
};

const CLAIMABLE_STATUSES: RoundStatus[] = ["settled", "inconclusive", "cancelled"];

function secondsUntilCancellable(openedAt: string): number {
  const opened = parseInt(openedAt, 10) || 0;
  const deadline = opened + ROUND_TIMEOUT_SECONDS;
  return Math.max(0, deadline - Math.floor(Date.now() / 1000));
}

export function SettlementPanel({ lensAddress, round }: { lensAddress: `0x${string}`; round: string }) {
  const { client, address } = useGenLayerClient();
  const settleLifecycle = useTransactionLifecycle(client);
  const claimLifecycle = useTransactionLifecycle(client);
  const cancelLifecycle = useTransactionLifecycle(client);

  const [info, setInfo] = useState<RoundInfo | null>(null);
  const [claimable, setClaimable] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<boolean | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const readClient = getReadOnlyClient();
    fetchRoundInfo(readClient, lensAddress, round).then(setInfo).catch(() => setInfo(null));
    if (address) {
      fetchClaimable(readClient, lensAddress, round, address).then(setClaimable).catch(() => setClaimable(null));
      fetchIsClaimed(readClient, lensAddress, round, address).then(setClaimed).catch(() => setClaimed(null));
    }
  }, [lensAddress, round, address, refreshTick]);

  if (!info) {
    return <div className="skeleton h-40 rounded-2xl" />;
  }

  const isClaimableStatus = CLAIMABLE_STATUSES.includes(info.status);
  const isRefund = info.status === "inconclusive" || info.status === "cancelled";
  const cancellableIn = secondsUntilCancellable(info.opened_at);

  return (
    <div className="card-surface flex flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Round {round}</p>
          <p className="mt-1 text-lg font-semibold text-fg">{formatGen(info.pool)} GEN pool</p>
        </div>
        <Badge variant={STATUS_VARIANT[info.status]} className="capitalize">
          {info.status || "unknown"}
        </Badge>
      </div>

      {info.status === "open" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-secondary">
            This round is still open — settlement becomes available once it&rsquo;s adjudicated.
          </p>
          {cancelLifecycle.state.phase === "idle" ? (
            <div className="flex items-center justify-between rounded-xl border border-border bg-bg-subtle px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-fg-muted">
                <TimerOff className="h-3.5 w-3.5" />
                {cancellableIn > 0
                  ? `Cancellable (unlocks refunds) in ~${Math.ceil(cancellableIn / 3600)}h if nobody adjudicates`
                  : "No one has adjudicated this round in time — anyone may cancel it now"}
              </div>
              {cancellableIn === 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => cancelLifecycle.run(() => cancelRound(client!, lensAddress, round))}
                  disabled={!client}
                >
                  Cancel & refund
                </Button>
              )}
            </div>
          ) : (
            <TransactionPanel
              state={cancelLifecycle.state}
              onReset={() => {
                cancelLifecycle.reset();
                setRefreshTick((t) => t + 1);
              }}
              successLabel="Round cancelled — refunds unlocked"
            />
          )}
        </div>
      )}

      {info.status === "adjudicating" && (
        <p className="text-sm text-fg-secondary">Adjudication is in progress for this round.</p>
      )}

      {info.status === "adjudicated" &&
        (settleLifecycle.state.phase !== "idle" ? (
          <TransactionPanel
            state={settleLifecycle.state}
            onReset={() => {
              settleLifecycle.reset();
              setRefreshTick((t) => t + 1);
            }}
            successLabel="Round settled"
          />
        ) : (
          <Button
            variant="secondary"
            onClick={() => settleLifecycle.run(() => settleRound(client!, lensAddress, round))}
            disabled={!client}
          >
            Settle this round
          </Button>
        ))}

      {isRefund && (
        <p className="text-sm text-fg-secondary">
          {info.status === "inconclusive"
            ? "This round produced no winner — either no live evidence could be fetched, or the adjudicator's confidence in its pick was too low to act on. Every backer gets a full refund of their own stake."
            : "This round was cancelled before adjudication (either it timed out, or the Lens was closed). Every backer gets a full refund of their own stake."}
        </p>
      )}

      {isClaimableStatus && address && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-bg-subtle px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-fg">
            <Coins className="h-4 w-4 text-coral" />
            {claimable === null ? "…" : `${formatGen(claimable)} GEN ${isRefund ? "refundable" : "claimable"}`}
          </div>
          {claimed ? (
            <Badge variant="positive">
              <CheckCircle2 className="h-3 w-3" /> Claimed
            </Badge>
          ) : (
            claimLifecycle.state.phase === "idle" && (
              <Button
                size="sm"
                onClick={() => claimLifecycle.run(() => claimSettlement(client!, lensAddress, round))}
                disabled={!client || claimable === "0"}
              >
                {isRefund ? "Claim refund" : "Claim"}
              </Button>
            )
          )}
        </div>
      )}

      {claimLifecycle.state.phase !== "idle" && (
        <TransactionPanel
          state={claimLifecycle.state}
          onReset={() => {
            claimLifecycle.reset();
            setRefreshTick((t) => t + 1);
          }}
          successLabel={isRefund ? "Refund claimed" : "Settlement claimed"}
        />
      )}
    </div>
  );
}
