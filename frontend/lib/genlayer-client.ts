"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import type {
  GenLayerClient,
  GenLayerChain,
  GenLayerTransaction,
  TransactionHash,
} from "genlayer-js/types";

let _readOnlyClient: GenLayerClient<GenLayerChain> | null = null;

/**
 * A wallet-free client for read-only pages (explorer, Lens detail) --
 * readContract needs no signer, confirmed working across every prior
 * GenLayer frontend on this stack. Never construct this with an account:
 * omitting `account` entirely is what keeps it read-only (createAccount()
 * with no arguments generates a fresh random wallet on every call and
 * triggers wallet permission prompts -- a real, confirmed GenLayer
 * rejection pattern this deliberately avoids).
 */
export function getReadOnlyClient(): GenLayerClient<GenLayerChain> {
  if (!_readOnlyClient) {
    _readOnlyClient = createClient({ chain: testnetBradbury });
  }
  return _readOnlyClient;
}

export function useGenLayerClient(): {
  client: GenLayerClient<GenLayerChain> | null;
  address: `0x${string}` | undefined;
} {
  const { address, isConnected, connector } = useAccount();
  const [client, setClient] = useState<GenLayerClient<GenLayerChain> | null>(null);

  // connector.getProvider() returns whichever EIP-1193 provider wagmi
  // actually established the connection through -- matches every connector
  // type (injected, WalletConnect, Coinbase Smart Wallet, Safe), unlike
  // reading window.ethereum directly which only works for a single
  // browser-extension wallet.
  useEffect(() => {
    let cancelled = false;
    if (!isConnected || !address || !connector) {
      setClient(null);
      return;
    }
    connector
      .getProvider()
      .then((provider) => {
        if (cancelled) return;
        setClient(
          createClient({
            chain: testnetBradbury,
            account: address,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            provider: provider as any,
          })
        );
      })
      .catch(() => {
        if (!cancelled) setClient(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isConnected, address, connector]);

  return { client, address };
}

// ---------------------------------------------------------------------
// Consensus polling -- drives the live transaction-lifecycle UI directly
// off real chain state, no fabricated timers. Contract-agnostic: takes
// only a tx hash, so it's shared across LensFactory and every Lens.
// ---------------------------------------------------------------------

// A read is correct the moment consensus is ACCEPTED; FINALIZED only
// settles the appeal window and can take much longer to arrive. Most Lens
// writes surface success at ACCEPTED (a reversal there just means the
// record disappears, nothing downstream acted on it yet); adjudicate() is
// the one call sites should pass requireFinalized for, since its output
// (the live interpretation) is exactly the kind of state an external agent
// or contract may read and act on.
const TERMINAL_STATUSES = new Set<TransactionStatus>([
  TransactionStatus.ACCEPTED,
  TransactionStatus.FINALIZED,
  TransactionStatus.UNDETERMINED,
  TransactionStatus.CANCELED,
  TransactionStatus.VALIDATORS_TIMEOUT,
  TransactionStatus.LEADER_TIMEOUT,
]);

const FINALIZED_REQUIRED_STATUSES = new Set<TransactionStatus>([
  TransactionStatus.FINALIZED,
  TransactionStatus.UNDETERMINED,
  TransactionStatus.CANCELED,
  TransactionStatus.VALIDATORS_TIMEOUT,
  TransactionStatus.LEADER_TIMEOUT,
]);

export interface ConsensusTick {
  status: TransactionStatus;
  transaction: GenLayerTransaction;
}

const MAX_CONSECUTIVE_RPC_FAILURES = 4;

export class PollCancelledError extends Error {
  constructor() {
    super("Polling was cancelled");
    this.name = "PollCancelledError";
  }
}

/**
 * Polls the real transaction status until a terminal state is reached,
 * invoking onTick on every observed status change. isCancelled is checked
 * before every network call and every sleep so an unmounted caller stops
 * the loop from actually running, not just from reporting status. A single
 * transient RPC failure is tolerated up to MAX_CONSECUTIVE_RPC_FAILURES
 * times before giving up, since one bad request doesn't mean the
 * transaction itself failed.
 */
export async function pollConsensusStatus(
  client: GenLayerClient<GenLayerChain>,
  hash: `0x${string}`,
  onTick: (tick: ConsensusTick) => void,
  {
    intervalMs,
    maxAttempts,
    isCancelled = () => false,
    requireFinalized = false,
  }: {
    intervalMs?: number;
    maxAttempts?: number;
    isCancelled?: () => boolean;
    requireFinalized?: boolean;
  } = {}
): Promise<GenLayerTransaction> {
  const terminalStatuses = requireFinalized ? FINALIZED_REQUIRED_STATUSES : TERMINAL_STATUSES;
  const effectiveIntervalMs = intervalMs ?? (requireFinalized ? 5000 : 1500);
  const effectiveMaxAttempts = maxAttempts ?? (requireFinalized ? 100 : 120);
  let lastStatus: TransactionStatus | null = null;
  let consecutiveFailures = 0;

  for (let attempt = 0; attempt < effectiveMaxAttempts; attempt++) {
    if (isCancelled()) throw new PollCancelledError();

    let transaction: GenLayerTransaction;
    try {
      transaction = await client.getTransaction({ hash: hash as TransactionHash });
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures += 1;
      if (consecutiveFailures > MAX_CONSECUTIVE_RPC_FAILURES) throw err;
      await new Promise((resolve) => setTimeout(resolve, effectiveIntervalMs));
      continue;
    }

    const status = transaction.statusName ?? TransactionStatus.PENDING;

    if (status !== lastStatus) {
      onTick({ status, transaction });
      lastStatus = status;
    }

    if (terminalStatuses.has(status)) {
      return transaction;
    }

    if (isCancelled()) throw new PollCancelledError();
    await new Promise((resolve) => setTimeout(resolve, effectiveIntervalMs));
  }

  throw new Error(
    requireFinalized
      ? "Timed out waiting for the transaction to finalize."
      : "Timed out waiting for transaction to reach a terminal status"
  );
}
