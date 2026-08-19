export const LENS_FACTORY_METHODS = {
  createLens: "create_lens",
  getOwner: "get_owner",
  getCreationStake: "get_creation_stake",
  getLenses: "get_lenses",
  getLensesCount: "get_lenses_count",
  getLensesPage: "get_lenses_page",
  getLensMeta: "get_lens_meta",
  getLensesByCreator: "get_lenses_by_creator",
  getLensesByType: "get_lenses_by_type",
} as const;

export const LENS_METHODS = {
  submitInterpretation: "submit_interpretation",
  backInterpretation: "back_interpretation",
  adjudicate: "adjudicate",
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

export interface RoundReasoning {
  reasoning: string;
  confidence: string;
  evidence_snapshot: string[];
  evaluated_at: string;
  sources_checked: string[];
}

export interface LiveInterpretation {
  has_live: boolean;
  interpretation: InterpretationRecord | Record<string, never>;
  reasoning: RoundReasoning | Record<string, never>;
}

export interface RoundInfo {
  round: string;
  status: "open" | "adjudicating" | "adjudicated" | "settled" | "";
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
}
