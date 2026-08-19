"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TransactionPanel } from "@/components/TransactionPanel";
import { useGenLayerClient, getReadOnlyClient } from "@/lib/genlayer-client";
import { useTransactionLifecycle } from "@/lib/useTransactionLifecycle";
import { fetchRoundInfo, fetchClaimable, fetchIsClaimed, settleRound, claimSettlement } from "@/lib/lens-calls";
import { formatGen } from "@/lib/utils";
import type { RoundInfo } from "@/lib/lens-abi";

export function SettlementPanel({ lensAddress, round }: { lensAddress: `0x${string}`; round: string }) {
  const { client, address } = useGenLayerClient();
  const settleLifecycle = useTransactionLifecycle(client);
  const claimLifecycle = useTransactionLifecycle(client);

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

  const statusVariant =
    info.status === "settled" ? "positive" : info.status === "adjudicated" ? "coral" : "neutral";

  return (
    <div className="card-surface flex flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Round {round}</p>
          <p className="mt-1 text-lg font-semibold text-fg">{formatGen(info.pool)} GEN pool</p>
        </div>
        <Badge variant={statusVariant} className="capitalize">
          {info.status || "unknown"}
        </Badge>
      </div>

      {info.status === "open" && (
        <p className="text-sm text-fg-secondary">This round is still open — settlement is available once it&rsquo;s adjudicated.</p>
      )}

      {info.status === "adjudicating" && (
        <p className="text-sm text-fg-secondary">Adjudication is in progress for this round.</p>
      )}

      {(info.status === "adjudicated" || info.status === "settled") && (
        <>
          {settleLifecycle.state.phase !== "idle" ? (
            <TransactionPanel
              state={settleLifecycle.state}
              onReset={() => {
                settleLifecycle.reset();
                setRefreshTick((t) => t + 1);
              }}
              successLabel="Round settled"
            />
          ) : (
            info.status === "adjudicated" && (
              <Button
                variant="secondary"
                onClick={() => settleLifecycle.run(() => settleRound(client!, lensAddress, round))}
                disabled={!client}
              >
                Settle this round
              </Button>
            )
          )}

          {info.status === "settled" && address && (
            <div className="flex items-center justify-between rounded-xl border border-border bg-bg-subtle px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-fg">
                <Coins className="h-4 w-4 text-coral" />
                {claimable === null ? "…" : `${formatGen(claimable)} GEN claimable`}
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
                    Claim
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
              successLabel="Settlement claimed"
            />
          )}
        </>
      )}
    </div>
  );
}
