import type { GenLayerClient, GenLayerChain } from "genlayer-js/types";
import { LENS_FACTORY_METHODS, LENS_METHODS } from "./lens-abi";
import type {
  LensMeta,
  LensInfo,
  LiveInterpretation,
  InterpretationRecord,
  RoundInfo,
  AdjudicationLogEntry,
} from "./lens-abi";

// ---------------------------------------------------------------------
// LensFactory reads/writes. Return values are dicts/lists that
// genlayer-js's readContract decodes to plain JSON-safe JS objects by
// default (jsonSafeReturn defaults to true), so no manual JSON parsing is
// needed anywhere below.
// ---------------------------------------------------------------------

export async function fetchLenses(
  client: GenLayerClient<GenLayerChain>,
  factoryAddress: `0x${string}`
): Promise<string[]> {
  const result = await client.readContract({
    address: factoryAddress,
    functionName: LENS_FACTORY_METHODS.getLenses,
    args: [],
  });
  return result as unknown as string[];
}

export async function fetchLensMeta(
  client: GenLayerClient<GenLayerChain>,
  factoryAddress: `0x${string}`,
  lensAddress: string
): Promise<LensMeta> {
  const result = await client.readContract({
    address: factoryAddress,
    functionName: LENS_FACTORY_METHODS.getLensMeta,
    args: [lensAddress],
  });
  return result as unknown as LensMeta;
}

export async function fetchCreationStake(
  client: GenLayerClient<GenLayerChain>,
  factoryAddress: `0x${string}`
): Promise<string> {
  const result = await client.readContract({
    address: factoryAddress,
    functionName: LENS_FACTORY_METHODS.getCreationStake,
    args: [],
  });
  return result as unknown as string;
}

export async function createLens(
  client: GenLayerClient<GenLayerChain>,
  factoryAddress: `0x${string}`,
  sources: string[],
  interpretationType: string,
  title: string,
  description: string,
  value: bigint
): Promise<`0x${string}`> {
  const hash = await client.writeContract({
    address: factoryAddress,
    functionName: LENS_FACTORY_METHODS.createLens,
    args: [sources, interpretationType, title, description],
    value,
  });
  return hash as `0x${string}`;
}

/**
 * create_lens's write-transaction result exposes ACCEPTED/FINALIZED status,
 * not a decoded method return value in a stable, documented shape -- so
 * rather than depend on undocumented transaction-result decoding, resolve
 * the newly-deployed Lens address the reliable way: lens_addresses is an
 * append-only registry, so the new Lens is whatever appears at index
 * `beforeCount` once the list grows past it. Retries with a short delay to
 * absorb the same post-ACCEPTED read lag documented for fresh contract
 * state elsewhere in this stack.
 */
export async function waitForNewLens(
  client: GenLayerClient<GenLayerChain>,
  factoryAddress: `0x${string}`,
  beforeCount: number,
  { retries = 10, intervalMs = 3000 }: { retries?: number; intervalMs?: number } = {}
): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const lenses = await fetchLenses(client, factoryAddress);
    if (lenses.length > beforeCount) return lenses[beforeCount];
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for the new Lens to appear in the registry.");
}

// ---------------------------------------------------------------------
// Lens reads
// ---------------------------------------------------------------------

export async function fetchLensInfo(
  client: GenLayerClient<GenLayerChain>,
  lensAddress: `0x${string}`
): Promise<LensInfo> {
  const result = await client.readContract({
    address: lensAddress,
    functionName: LENS_METHODS.getLensInfo,
    args: [],
  });
  return result as unknown as LensInfo;
}

export async function fetchLiveInterpretation(
  client: GenLayerClient<GenLayerChain>,
  lensAddress: `0x${string}`
): Promise<LiveInterpretation> {
  const result = await client.readContract({
    address: lensAddress,
    functionName: LENS_METHODS.getLiveInterpretation,
    args: [],
  });
  return result as unknown as LiveInterpretation;
}

export async function fetchRoundInterpretations(
  client: GenLayerClient<GenLayerChain>,
  lensAddress: `0x${string}`,
  round: string
): Promise<InterpretationRecord[]> {
  const result = await client.readContract({
    address: lensAddress,
    functionName: LENS_METHODS.getRoundInterpretations,
    args: [round],
  });
  return result as unknown as InterpretationRecord[];
}

export async function fetchRoundInfo(
  client: GenLayerClient<GenLayerChain>,
  lensAddress: `0x${string}`,
  round: string
): Promise<RoundInfo> {
  const result = await client.readContract({
    address: lensAddress,
    functionName: LENS_METHODS.getRoundInfo,
    args: [round],
  });
  return result as unknown as RoundInfo;
}

export async function fetchAdjudicationLog(
  client: GenLayerClient<GenLayerChain>,
  lensAddress: `0x${string}`
): Promise<AdjudicationLogEntry[]> {
  const result = await client.readContract({
    address: lensAddress,
    functionName: LENS_METHODS.getAdjudicationLog,
    args: [],
  });
  return result as unknown as AdjudicationLogEntry[];
}

export async function fetchClaimable(
  client: GenLayerClient<GenLayerChain>,
  lensAddress: `0x${string}`,
  round: string,
  address: string
): Promise<string> {
  const result = await client.readContract({
    address: lensAddress,
    functionName: LENS_METHODS.getClaimable,
    args: [round, address],
  });
  return result as unknown as string;
}

export async function fetchIsClaimed(
  client: GenLayerClient<GenLayerChain>,
  lensAddress: `0x${string}`,
  round: string,
  address: string
): Promise<boolean> {
  const result = await client.readContract({
    address: lensAddress,
    functionName: LENS_METHODS.isClaimed,
    args: [round, address],
  });
  return result as unknown as boolean;
}

export async function fetchBacking(
  client: GenLayerClient<GenLayerChain>,
  lensAddress: `0x${string}`,
  round: string,
  interpretationId: string,
  address: string
): Promise<string> {
  const result = await client.readContract({
    address: lensAddress,
    functionName: LENS_METHODS.getBacking,
    args: [round, interpretationId, address],
  });
  return result as unknown as string;
}

// ---------------------------------------------------------------------
// Lens writes
// ---------------------------------------------------------------------

export async function submitInterpretation(
  client: GenLayerClient<GenLayerChain>,
  lensAddress: `0x${string}`,
  content: string,
  structuredClaims: string,
  value: bigint
): Promise<`0x${string}`> {
  const hash = await client.writeContract({
    address: lensAddress,
    functionName: LENS_METHODS.submitInterpretation,
    args: [content, structuredClaims],
    value,
  });
  return hash as `0x${string}`;
}

export async function backInterpretation(
  client: GenLayerClient<GenLayerChain>,
  lensAddress: `0x${string}`,
  interpretationId: string,
  value: bigint
): Promise<`0x${string}`> {
  const hash = await client.writeContract({
    address: lensAddress,
    functionName: LENS_METHODS.backInterpretation,
    args: [interpretationId],
    value,
  });
  return hash as `0x${string}`;
}

// adjudicate() is the heaviest call in this contract: a full nondet
// multi-source web-fetch + LLM-reasoning round, re-run independently by
// every validator for Equivalence Principle agreement. Raised above the
// SDK's default consensusMaxRotations (3) for the same reason every prior
// GenLayer project on this stack raises it for its heaviest write -- more
// surface for one slow/failed leader attempt to eat the default budget
// before the platform gives up.
const ADJUDICATE_MAX_ROTATIONS = 5;

export async function adjudicate(
  client: GenLayerClient<GenLayerChain>,
  lensAddress: `0x${string}`
): Promise<`0x${string}`> {
  const hash = await client.writeContract({
    address: lensAddress,
    functionName: LENS_METHODS.adjudicate,
    args: [],
    value: 0n,
    consensusMaxRotations: ADJUDICATE_MAX_ROTATIONS,
  });
  return hash as `0x${string}`;
}

export async function settleRound(
  client: GenLayerClient<GenLayerChain>,
  lensAddress: `0x${string}`,
  round: string
): Promise<`0x${string}`> {
  const hash = await client.writeContract({
    address: lensAddress,
    functionName: LENS_METHODS.settle,
    args: [round],
    value: 0n,
  });
  return hash as `0x${string}`;
}

export async function claimSettlement(
  client: GenLayerClient<GenLayerChain>,
  lensAddress: `0x${string}`,
  round: string
): Promise<`0x${string}`> {
  const hash = await client.writeContract({
    address: lensAddress,
    functionName: LENS_METHODS.claim,
    args: [round],
    value: 0n,
  });
  return hash as `0x${string}`;
}
