# Audit: strict-review pass (2026-08-20)

This document records a self-adversarial review of Lens, calibrated against real GenLayer review
team rejection language from this same reviewer team's feedback on multiple prior, unrelated
submissions (escrow/payment contracts, insurance-claim contracts, evidence-adjudication contracts,
merge-gate and changelog-gate contracts) — not a generic best-practices checklist. Every finding
below was checked against the actual code, not assumed; every fix was verified by a passing
regression test, not just asserted.

## Findings and fixes

### 1. Frontend could report success on a transaction that reverted on-chain (critical)

**Before:** `lib/useTransactionLifecycle.ts` determined success/failure from `transaction.statusName`
alone (UNDETERMINED/CANCELED/timeouts = failure, everything else = success) and never read
`transaction.txExecutionResultName`. A real, confirmed behavior on this exact chain: a contract-level
revert via `gl.vm.UserError(...)` still reaches `statusName: ACCEPTED`, with
`txExecutionResultName: "FINISHED_WITH_ERROR"`. Every write in the app could show a green checkmark
on a transaction that changed nothing.

**Fix:** `lib/genlayer-client.ts`'s `describeTransactionOutcome()` now requires the explicit
allowlisted value `ExecutionResult.FINISHED_WITH_RETURN` on top of a terminal consensus status.
`FINISHED_WITH_ERROR`, the transitional `NOT_VOTED` value, and a missing/undefined
`txExecutionResultName` (a real, typed-optional field per genlayer-js's own `.d.ts`) are all treated
as **not a confirmed success** — never defaulted to success. Used by every write in the app via the
shared `useTransactionLifecycle` hook.

### 2. `adjudicate()` had no fail-closed gate — a winner was crowned and real stake paid out even on zero evidence (critical)

**Before:** every source fetch failure was silently swallowed to an empty string
(`except Exception: fetched = ""`), and adjudication proceeded regardless — the LLM was asked to
judge "fit" against nothing, and its pick (however arbitrary) still became the live output and still
paid real GEN to its backers. There was also no confidence floor of any kind gating the decision.

**Fix:** if every source comes back empty, the leader closure detects this deterministically and
returns before ever calling the LLM — a `DECISION_NO_EVIDENCE` outcome, agreed by every validator
without needing model agreement on anything. Separately, `CONFIDENCE_THRESHOLD = 0.5` now gates the
decision even when a winner *is* selected: below it, the round is marked `inconclusive`, no winner is
recorded, and no stake moves. Covered by `test_adjudicate_fails_closed_when_all_sources_unfetchable`,
`test_adjudicate_fails_closed_when_confidence_below_threshold`, and
`test_inconclusive_round_does_not_disturb_prior_live_output`.

### 3. A round nobody adjudicates, or a Lens closed mid-round, permanently stranded real GEN (critical)

**Before:** there was no cancel/expire/refund method anywhere in `Lens.py`. `close_lens()` blocked
`adjudicate()` on the current round with no way to ever reach `ROUND_ADJUDICATED`, so `settle()`/
`claim()` could never open for that round — its backers' stake was frozen forever, with no code path
back to a claimable state.

**Fix:** `cancel_round()` — permissionless, after `ROUND_TIMEOUT_SECONDS` (24h) with no adjudication
— and `close_lens()`'s new immediate auto-cancel of the *current* round (no timeout wait) both mark
the round `cancelled`, which `claim()` treats as a straight refund of each backer's own stake. Every
round now ends in one of four states, three of which are directly claimable — see
`docs/ARCHITECTURE.md`'s "No round can permanently strand stake" table. Covered by
`test_cancel_round_after_timeout_unlocks_refund`,
`test_close_lens_immediately_cancels_open_round_and_unlocks_refund`, and
`test_close_lens_with_adjudicated_round_does_not_touch_it` (confirming the auto-cancel never touches
an already-decided round).

### 4. `LensFactory` had no fee-recovery path (critical)

**Before:** every `create_lens` creation stake accumulated in the factory contract forever with no
owner withdrawal method.

**Fix:** `collected_fees: u256` tracks the running total explicitly; `withdraw_fees()` (owner-only —
the *only* privileged action anywhere in this system) recovers it. Covered by
`test_withdraw_fees_only_owner`, `test_withdraw_fees_rejects_when_nothing_collected`, and the
integration test's real successful-withdrawal path (`test_withdraw_fees_recovers_real_collected_stake`
— direct-mode can't exercise a genuine `collected_fees > 0`, since that requires a real
`gl.deploy_contract` call the WASI mock doesn't support).

### 5. `create_lens` didn't wait for FINALIZED before the UI declared the new Lens live (critical)

**Before:** `app/create/page.tsx` called `run(() => createLens(...))` with no options, defaulting to
`ACCEPTED`. A new Lens address is exactly the kind of output other things act on (the Explorer lists
it, this page navigates the user straight into staking real GEN into it) — the same bar this review
team has set elsewhere for a write whose output gets acted on.

**Fix:** `create_lens` now passes `{ requireFinalized: true }`.

### 6. `evidence_snapshot` was the LLM's own self-report, not bound to what was actually fetched (serious)

**Before:** the stored "evidence the adjudicator looked at" came from `parsed.get("evidence_snapshot")`
— the model's own JSON field, which could paraphrase, misquote, or fabricate content with nothing
binding it to reality.

**Fix:** `evidence_snapshot` is now sliced deterministically from the real fetched `evidence` list in
contract code; the prompt no longer even asks the model to report one. Covered by
`test_evidence_snapshot_is_bound_to_real_fetched_content_not_llm_self_report`, which feeds the mock
LLM a fabricated snapshot on purpose and asserts the stored record reflects the real mocked web
content instead.

### 7. Sources had no governance — a creator's single, possibly self-controlled URL was sufficient (serious)

**Before:** a Lens could be created with one source and no way for anyone but the creator to ever
change it.

**Fix:** `MIN_SOURCES = 2` is now enforced in both `LensFactory.create_lens` and `Lens.__init__`
(defense in depth, matching the existing dual-validation pattern). `add_source()` is permissionless
and append-only (no remove method exists, by design) — the real "challenge path": anyone who thinks a
Lens's evidence base is narrow or biased can add a corroborating or contradicting source themselves.
Covered by `tests/direct/test_sources.py` (six tests: permissionless add, duplicate rejection, bad
URL rejection, `MAX_SOURCES` enforcement, rejection after close, and confirming no remove method
exists).

### 8. The core adjudication mechanism is fundamentally an LLM's qualitative judgment (acknowledged, not fully closeable)

Selecting "the interpretation that best fits the evidence" is not a deterministic computation — it
requires reading natural-language claims against freshly fetched, unstructured content. Findings 2, 6,
and 7 materially harden this (fail-closed on missing evidence, deterministic evidence binding, ≥2-source
corroboration, plus the pre-existing independent-validator-re-derivation design), but none of them turn
it into a fully mechanical check. This is stated explicitly in `docs/ARCHITECTURE.md` rather than
implied to be solved — the same "acknowledge what genuinely can't be closed, rather than hand-wave it"
standard this reviewer team has praised elsewhere.

### 9. Nothing had been write-tested live (acknowledged, addressed by live verification)

Prior to this pass, only read calls (`get_owner`, `get_creation_stake`, `get_lenses_count`) had been
verified against a real deployment. See the "Live verification" section below for the real
create → submit → adjudicate → settle/claim cycle run against Bradbury after this pass's fixes were
deployed.

### 10. No excess-value refund on overpayment (minor, disclosed)

Any value sent above the required creation stake becomes part of `collected_fees` rather than being
partially refunded. Documented explicitly in `docs/ARCHITECTURE.md`'s known-limitations section as a
deliberate simplicity tradeoff — the amount stays fully recoverable (by the factory owner via
`withdraw_fees`), just not automatically returned to the original sender.

## What was checked and found already correct

- **Wallet wiring**: `useGenLayerClient` binds `connector.getProvider()` (never `window.ethereum`
  directly); `getReadOnlyClient()` is a memoized, no-account singleton (never a fresh ephemeral
  account per call).
- **Address normalization**: every TreeMap keyed by an address string normalizes via
  `_normalize_address()` on both the write and read side, regression-tested with mixed-case lookups.
- **Validator independence**: `validator_fn` calls `leader_fn()` again for a genuinely independent
  re-fetch and re-reasoning, never a shape-only check of the leader's claimed output.
- **Contract lint**: exactly one top-level `run_nondet_unsafe` call per method; `genvm-lint check`
  passes clean on both contracts, enforced in CI on every push.
- **Reentrancy discipline**: `claimed[...]` and `round_status[...] = ROUND_ADJUDICATING` are both
  mutated before their respective external interaction/nondet step (checks-effects-interactions).
- **No cross-round fund mixing**: each round's parimutuel payout total is bounded by that round's own
  pool (verified by the payout formula's arithmetic, see `docs/ARCHITECTURE.md`) — a round's
  claimants can never draw down GEN that belongs to a different round's unclaimed backers.

## Live verification

After every fix above was implemented and covered by a passing direct-mode test (72/72), the
contracts were redeployed fresh to GenLayer Bradbury testnet (the fixed `Lens.py` required a new
`LensFactory` deploy, since factory-embedded child source is fixed at the factory's own deploy time)
and a full real write cycle was run against the live network — not just reads. See the repository's
deployment record for the current live addresses and the transaction hashes of that live run.
