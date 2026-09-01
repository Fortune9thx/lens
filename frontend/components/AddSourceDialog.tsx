"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TransactionPanel } from "@/components/TransactionPanel";
import { useTransactionLifecycle } from "@/lib/useTransactionLifecycle";
import { useGenLayerClient } from "@/lib/genlayer-client";
import { addSource } from "@/lib/lens-calls";

export function AddSourceDialog({
  open,
  onOpenChange,
  lensAddress,
  existingSources,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lensAddress: `0x${string}`;
  existingSources: string[];
  onSuccess?: () => void;
}) {
  const { client } = useGenLayerClient();
  const { state, run, reset } = useTransactionLifecycle(client);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const busy = state.phase === "submitting" || state.phase === "polling";

  function handleClose(next: boolean) {
    if (!next) {
      reset();
      setUrl("");
      setError(null);
    }
    onOpenChange(next);
  }

  async function handleSubmit() {
    setError(null);
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      setError("Must be a valid http:// or https:// URL.");
      return;
    }
    if (existingSources.includes(trimmed)) {
      setError("This source is already part of the Lens.");
      return;
    }
    await run(() => addSource(client!, lensAddress, trimmed));
    if (onSuccess) onSuccess();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a corroborating source</DialogTitle>
          <DialogDescription>
            Anyone can add a source — sources are append-only and permissionless. If you think this
            Lens&rsquo;s evidence base is too narrow or one-sided, add a source that corroborates or
            challenges it; every future adjudication will fetch and weigh it too.
          </DialogDescription>
        </DialogHeader>

        {state.phase === "idle" ? (
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-fg-secondary">Source URL</label>
              <Input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/independent-source"
              />
              {error && <p className="mt-1.5 text-xs text-negative">{error}</p>}
            </div>
            <Button onClick={handleSubmit} disabled={!client || busy}>
              {client ? "Add source" : "Connect a wallet to continue"}
            </Button>
          </div>
        ) : (
          <TransactionPanel state={state} onReset={() => handleClose(false)} successLabel="Source added" />
        )}
      </DialogContent>
    </Dialog>
  );
}
