"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TransactionPanel } from "@/components/TransactionPanel";
import { useTransactionLifecycle } from "@/lib/useTransactionLifecycle";
import { useGenLayerClient } from "@/lib/genlayer-client";
import { parseGenToWei } from "@/lib/utils";
import type { GenLayerClient, GenLayerChain } from "genlayer-js/types";

export function StakeDialog({
  open,
  onOpenChange,
  title,
  description,
  actionLabel,
  minGen = "0.01",
  onSubmit,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  actionLabel: string;
  minGen?: string;
  onSubmit: (client: GenLayerClient<GenLayerChain>, weiValue: bigint) => Promise<`0x${string}`>;
  onSuccess?: () => void;
}) {
  const { client } = useGenLayerClient();
  const { state, run, reset } = useTransactionLifecycle(client);
  const [amount, setAmount] = useState(minGen);
  const [validationError, setValidationError] = useState<string | null>(null);

  const busy = state.phase === "submitting" || state.phase === "polling";

  const handleSubmit = () => {
    setValidationError(null);
    let wei: bigint;
    try {
      wei = parseGenToWei(amount);
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : "Invalid amount.");
      return;
    }
    if (wei <= 0n) {
      setValidationError("Amount must be greater than zero.");
      return;
    }
    run(() => onSubmit(client!, wei)).then(() => {
      if (onSuccess) onSuccess();
    });
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {state.phase === "idle" ? (
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-fg-secondary">Stake amount (GEN)</label>
              <Input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1.0"
              />
              {validationError && <p className="mt-1.5 text-xs text-negative">{validationError}</p>}
            </div>
            <Button onClick={handleSubmit} disabled={!client || busy}>
              {client ? actionLabel : "Connect a wallet to continue"}
            </Button>
          </div>
        ) : (
          <TransactionPanel state={state} onReset={() => handleOpenChange(false)} successLabel="Stake confirmed" />
        )}
      </DialogContent>
    </Dialog>
  );
}
