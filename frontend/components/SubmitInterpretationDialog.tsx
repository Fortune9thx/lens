"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TransactionPanel } from "@/components/TransactionPanel";
import { useTransactionLifecycle } from "@/lib/useTransactionLifecycle";
import { useGenLayerClient } from "@/lib/genlayer-client";
import { submitInterpretation } from "@/lib/lens-calls";
import { parseGenToWei } from "@/lib/utils";

interface ClaimField {
  key: string;
  value: string;
}

export function SubmitInterpretationDialog({
  open,
  onOpenChange,
  lensAddress,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lensAddress: `0x${string}`;
  onSuccess?: () => void;
}) {
  const { client } = useGenLayerClient();
  const { state, run, reset } = useTransactionLifecycle(client);

  const [content, setContent] = useState("");
  const [claims, setClaims] = useState<ClaimField[]>([{ key: "", value: "" }]);
  const [amount, setAmount] = useState("1.0");
  const [error, setError] = useState<string | null>(null);

  const busy = state.phase === "submitting" || state.phase === "polling";

  function handleClose(next: boolean) {
    if (!next) {
      reset();
      setContent("");
      setClaims([{ key: "", value: "" }]);
      setAmount("1.0");
      setError(null);
    }
    onOpenChange(next);
  }

  async function handleSubmit() {
    setError(null);
    if (!content.trim()) {
      setError("Describe your interpretation.");
      return;
    }
    let wei: bigint;
    try {
      wei = parseGenToWei(amount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid stake amount.");
      return;
    }
    if (wei <= 0n) {
      setError("Stake must be greater than zero.");
      return;
    }
    const claimsObj: Record<string, string> = {};
    for (const { key, value } of claims) {
      if (key.trim()) claimsObj[key.trim()] = value.trim();
    }

    await run(() => submitInterpretation(client!, lensAddress, content.trim(), JSON.stringify(claimsObj), wei));
    if (onSuccess) onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Submit an interpretation</DialogTitle>
          <DialogDescription>
            Stake GEN behind your read of the live evidence. If it&rsquo;s selected at adjudication, it becomes the live output.
          </DialogDescription>
        </DialogHeader>

        {state.phase === "idle" ? (
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-fg-secondary">Interpretation</label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Dominance is trending up, driven by sustained ETF inflows over the past week."
                maxLength={3000}
                rows={4}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-fg-secondary">
                Structured claims <span className="text-fg-muted">(optional key/value facts)</span>
              </label>
              <div className="flex flex-col gap-2">
                {claims.map((claim, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={claim.key}
                      onChange={(e) => {
                        const next = [...claims];
                        next[i] = { ...next[i], key: e.target.value };
                        setClaims(next);
                      }}
                      placeholder="direction"
                      className="w-1/3"
                    />
                    <Input
                      value={claim.value}
                      onChange={(e) => {
                        const next = [...claims];
                        next[i] = { ...next[i], value: e.target.value };
                        setClaims(next);
                      }}
                      placeholder="up"
                    />
                    {claims.length > 1 && (
                      <button
                        onClick={() => setClaims(claims.filter((_, idx) => idx !== i))}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-bg-subtle hover:text-negative"
                        aria-label="Remove claim"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() => setClaims([...claims, { key: "", value: "" }])}
                >
                  <Plus className="h-4 w-4" /> Add claim
                </Button>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-fg-secondary">Stake amount (GEN)</label>
              <Input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>

            {error && <p className="text-xs text-negative">{error}</p>}

            <Button onClick={handleSubmit} disabled={!client || busy}>
              {client ? "Submit interpretation" : "Connect a wallet to continue"}
            </Button>
          </div>
        ) : (
          <TransactionPanel state={state} onReset={() => handleClose(false)} successLabel="Interpretation submitted" />
        )}
      </DialogContent>
    </Dialog>
  );
}
