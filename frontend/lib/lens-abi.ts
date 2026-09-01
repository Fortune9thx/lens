export const LENS_FACTORY_METHODS = {
  createLens: "create_lens",
  withdrawFees: "withdraw_fees",
  getOwner: "get_owner",
  getCreationStake: "get_creation_stake",
  getCollectedFees: "get_collected_fees",
  getLenses: "get_lenses",
  getLensesCount: "get_lenses_count",
  getLensesPage: "get_lenses_page",
  getLensMeta: "get_lens_meta",
  getLensesByCreator: "get_lenses_by_creator",
  getLensesByType: "get_lenses_by_type",
} as const;

export const LENS_METHODS = {
  addSource: "add_source",
  submitInterpretation: "submit_interpretation",
  backInterpretation: "back_interpretation",
  adjudicate: "adjudicate",
  cancelRound: "cancel_round",
  settle: "settle",
  claim: "claim",
  closeLens: "close_lens",
  getLensInfo: "get_lens_info",
  getLiveInterpretation: "get_live_interpretation",
  getInterpretation: "get_interpretation",
  getRoundInterpretations: "get_round_interpretations",
  getRoundInfo: "get_round_info",
  getAdjudicationLog: "get_adjudication_log",
  getBacking: "get_backing",
  getClaimable: "get_claimable",
  isClaimed: "is_claimed",
} as const;

export const INTERPRETATION_TYPES = [
  "market",
  "news",
  "policy",
  "research",
  "general",
] as const;
export type InterpretationType = (typeof INTERPRETATION_TYPES)[number];

// The minimum number of sources LensFactory/Lens require at creation --
// mirrors MIN_SOURCES in contracts/Lens.py and LensFactory.py. Enforced
// here too so the Create flow can't even submit a request the contract
// will just revert, and so the UI can explain *why* up front.
export const MIN_SOURCES = 2;
export const MAX_SOURCES = 5;

export type RoundStatus = "open" | "adjudicating" | "adjudicated" | "settled" | "inconclusive" | "cancelled" | "";

export interface LensMeta {
  address: string;
  sources: string[];
  interpretation_type: string;
  title: string;
  description: string;
  creator: string;
  created_at: string;
  stake: string;
}

export interface LensInfo {
  lens_id: string;
  address_creator: string;
  sources: string[];
  interpretation_type: string;
  title: string;
  description: string;
  status: "active" | "closed";
  current_round: string;
  live_interpretation_id: string;
  live_round: string;
  live_since: string;
  total_stake_all_time: string;
  last_adjudicated: string;
  created_at: string;
  interpretation_count: string;
}

export interface InterpretationRecord {
  id: string;
  round: string;
  author: string;
  content: string;
  structured_claims: Record<string, unknown>;
  total_stake: string;
  backer_count: number;
  created_at: string;
}

export interface EvidenceSnapshotItem {
  url: string;
  excerpt: string;
}

export interface RoundReasoning {
  reasoning: string;
  confidence: string;
  // Deterministically sliced from the real fetched evidence in contract
  // code -- never the LLM's own self-report of what it looked at (see
  // docs/RESOLUTION_LOGIC.md). Safe to display as "what the adjudicator
  // actually saw," not just "what it claims it saw."
  evidence_snapshot: EvidenceSnapshotItem[];
  evaluated_at: string;
  sources_checked: string[];
  outcome: "decided" | "inconclusive";
}

export interface LiveInterpretation {
  has_live: boolean;
  interpretation: InterpretationRecord | Record<string, never>;
  reasoning: RoundReasoning | Record<string, never>;
}

export interface RoundInfo {
  round: string;
  status: RoundStatus;
  opened_at: string;
  pool: string;
  winner_id: string;
  reasoning: RoundReasoning | Record<string, never>;
  interpretation_ids: string[];
}

export interface AdjudicationLogEntry {
  round: string;
  winner_id: string;
  confidence: string;
  candidate_count: number;
  evaluated_at: string;
  outcome: "decided" | "inconclusive";
}

// How long (seconds) a round may sit open with no adjudication before
// anyone can cancel it and unlock refunds -- mirrors ROUND_TIMEOUT_SECONDS
// in contracts/Lens.py. Used to show a countdown / explain why
// cancel_round() is or isn't callable yet.
export const ROUND_TIMEOUT_SECONDS = 86400;

export const CLAIMABLE_ROUND_STATUSES: RoundStatus[] = ["settled", "inconclusive", "cancelled"];
