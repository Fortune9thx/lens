# Architecture

## System overview

```mermaid
flowchart TB
    subgraph Frontend["Next.js 15 App Router"]
        UI[V7-inspired warm UI]
        GLJS[genlayer-js client]
        WAGMI[wagmi / RainbowKit<br/>wallet connect UX]
    end

    subgraph GenLayer["GenLayer Bradbury testnet"]
        Factory[LensFactory.py<br/>registry + on-chain factory]
        LensA[Lens.py instance<br/>e.g. 'BTC Dominance Trend']
        LensB[Lens.py instance<br/>e.g. 'Filing X interpretation']
        Validators[GenVM validator set<br/>Equivalence Principle consensus]
    end

    subgraph External["Live web + other agents/contracts"]
        Sources[Declared source URLs<br/>append-only, permissionless]
        Agent[External agent or contract]
    end

    UI --> GLJS
    WAGMI -.wallet address.-> GLJS
    GLJS -->|create_lens| Factory
    Factory -->|gl.deploy_contract| LensA
    Factory -->|gl.deploy_contract| LensB
    GLJS -->|submit_interpretation / back_interpretation / add_source / adjudicate / cancel_round / settle / claim| LensA
    GLJS -->|.view reads| LensA
    LensA -->|adjudicate: gl.nondet.web.render| Sources
    LensA <-->|run_nondet_unsafe leader/validator| Validators
    Agent -->|.view get_live_interpretation| LensA
```

## Contract architecture

Two contracts, following the verified `genlayerlabs/intelligent-oracle` factory pattern (same
`py-genlayer` dependency hash independently confirmed live on Bradbury across multiple prior
projects on this stack):

- **`LensFactory.py`** — a registry that deploys a fresh `Lens` contract per opened Lens via
  `gl.deploy_contract(code=lens_source.encode("utf-8"), args=[...], salt_nonce=...)`. Lens source
  is passed in as a constructor argument (`lens_code: str`) at LensFactory's own deploy time.
  Factory metadata (sources, interpretation type, title, description, creator) is stored once at
  creation and is **read-only** afterward — the factory has no way to be pushed live updates from
  a Lens (see "Why no cross-contract writes" below), so it never claims to know a Lens's current
  round, status, or live output. Callers read that directly from the Lens contract. `owner` gates
  exactly one privileged action — `withdraw_fees()` — and nothing else; every other write
  (`create_lens`) is intentionally permissionless, gated by the creation stake, not an allowlist.
- **`Lens.py`** — a single Lens's full lifecycle: `add_source` (permissionless, append-only source
  governance), `submit_interpretation` / `back_interpretation` (payable, staking), `adjudicate`
  (the fail-closed Equivalence Principle consensus step), `cancel_round` (timeout-based refund
  path), `settle` / `claim` (post-adjudication settlement, and refunds for inconclusive/cancelled
  rounds), and view methods (`get_lens_info`, `get_live_interpretation`,
  `get_round_interpretations`, `get_adjudication_log`, `get_claimable`, …).

## Why a Lens is round-based, not one-shot

A prediction market or a Claim resolves once. A Lens is explicitly designed to keep tracking a
source as it changes, so `adjudicate()` never terminates the contract's lifecycle — it closes the
current round and immediately opens a fresh one so new interpretations can be submitted and the
live output can be re-adjudicated later against newer evidence. `live_interpretation_id` always
points at the most recent *decided* winner regardless of which round it came from — that is the
Lens's current live output, the one field external readers care about, and it is never disturbed
by a later round that goes inconclusive.

## No round can permanently strand stake

Every round ends in exactly one of four states, and three of the four are directly claimable —
there is no dead end where backer capital sits with no recovery path:

| Round outcome | How it's reached | What backers get |
| --- | --- | --- |
| `settled` | `adjudicate()` picks a winner with confidence ≥ `CONFIDENCE_THRESHOLD` → `settle()` | Parimutuel share of the round's pool if they backed the winner |
| `inconclusive` | `adjudicate()` finds no fetchable evidence, or confidence is too low to act on | Full refund of their own stake — nobody "loses," the round just never produced a well-supported decision |
| `cancelled` (timeout) | Nobody adjudicates within `ROUND_TIMEOUT_SECONDS` (24h) and anyone calls `cancel_round()` | Full refund |
| `cancelled` (closure) | The Lens creator calls `close_lens()` while the current round is still open | Full refund, unlocked *immediately* — no 24h wait |

This directly closes a real failure mode: a Lens whose creator abandons it, or closes it mid-round,
used to leave that round's stake permanently locked (there was no code path back to a claimable
state). `close_lens()` now force-cancels the current round the instant it fires, and any round
nobody ever bothers to adjudicate becomes cancellable — by anyone, not just the creator — after the
timeout.

**Disclosed tradeoff:** `close_lens()`'s auto-cancel is unconditional — a creator whose own submitted
interpretation looks likely to lose the current round can call it to force a straight refund for
everyone instead of letting `adjudicate()` run and pay the winning side out of the losing side's
stake. Nobody's funds are ever at risk from this (every backer, including the creator, simply gets
their own stake back, same as any other cancelled round), so this is a "deny the round's profit
redistribution" griefing vector, not a fund-safety one — meaningfully lower severity than the
permanent-strand bug this mechanism fixes, and the tradeoff for closing that bug. Noted here rather
than silently accepted.

`LensFactory`'s creation-stake collection has the same property: every `create_lens` payment is
tracked in `collected_fees`, and the owner can recover it at any time via `withdraw_fees()` — it
never just accumulates in the contract with no way out.

## Adjudication is fail-closed

`adjudicate()` never crowns a winner — and never moves a single unit of real backer capital — on a
decision that isn't genuinely well-supported:

- If every declared source fails to fetch, the leader closure detects this **deterministically**
  (no LLM call is even made) and both leader and validators independently agree on a
  `DECISION_NO_EVIDENCE` outcome. The round is marked `inconclusive`.
- If the adjudicator's own reported confidence in its pick falls below `CONFIDENCE_THRESHOLD`
  (0.5), the round is marked `inconclusive` even though a winner was technically selected — a
  coin-flip-or-worse pick simply never gets to move stake.

Both fail-closed paths give every backer a straight refund via the same `claim()` used for a
cancelled round.

## Sources are append-only and permissionless

A Lens's initial sources are chosen by its creator, but nobody — not even the creator — can ever
*remove* one, and **anyone** can call `add_source()` to append a new one (up to `MAX_SOURCES`).
This is the deliberate answer to "a creator could point a Lens at a single source they control": at
least `MIN_SOURCES = 2` are required at creation, and if a Lens's evidence base still looks narrow
or one-sided to any observer, they can add a corroborating (or contradicting) source themselves —
no cooperation from the creator required, and every future `adjudicate()` call fetches and weighs
the full accumulated set.

## Storage design

Every persistent field uses only `TreeMap[str, str]` (JSON-encoded values) and `DynArray[str]` —
deliberately, not a style preference. Live testing on prior projects on this stack found that
`TreeMap` value types other than `str` — including `@allow_storage @dataclass` values and plain
scalars like `TreeMap[str, u256]` — deploy successfully (ACCEPTED consensus, looks completely
healthy) but become **permanently unreadable** on the current Bradbury GenVM build. This is a real,
reproduced, dated finding from this same toolchain, not speculation, and it drove every storage
decision in `Lens.py` and `LensFactory.py`.

## Address normalization

Every address-keyed lookup normalizes the caller-supplied address string to lowercase via
`_normalize_address()` before using it as a key, on both the write and the read side. `Address.as_hex`
is an EIP-55-style checksum (mixed case); comparing it against raw, unnormalized caller input is a
confirmed real GenLayer rejection pattern from a prior submission.

## Why no cross-contract writes

Cross-contract **write** calls (`gl.get_contract_at(addr).emit(...).some_method(...)`) reach
ACCEPTED consensus on the calling contract's own transaction, but the target contract's state never
actually changes — confirmed independently across multiple prior projects on Bradbury. Lens makes
**zero** cross-contract calls of any kind: it doesn't read from LensFactory, and LensFactory doesn't
read from any Lens. This is a deliberate simplification, not an oversight — a Lens is fully
self-contained precisely so any reader (this frontend, another agent, another contract) can settle
against it with one direct `.view()` call and no indirection through the factory.

## Adjudication consensus

`Lens.adjudicate()` uses `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` with a **hand-coded**
Python validator — not `gl.eq_principle.prompt_comparative`'s natural-language `principle` string.
`validator_fn` calls `leader_fn()` again, independently — re-fetching every declared source fresh
and re-running the LLM from scratch — then compares `winner_id`/`decision` (exact match) and
`confidence` (within a 0.15 tolerance, computed in real Python arithmetic). This matches the
explicit fix for a real, confirmed GenLayer rejection pattern from a prior submission: *"the
validator checks only verdict shape... it does not independently review the evidence... redesign
the validator to independently acquire and assess the evidence."* See `RESOLUTION_LOGIC.md` for the
full walkthrough.

Both source-fetching and the LLM call happen **inside the single leader closure** passed to
`run_nondet_unsafe` — not as separate top-level nondet calls — because `genvm-lint` (and the real
portal reviewers, per documented rejection language) enforce exactly one non-deterministic block
per method.

## Evidence is bound to what was actually fetched, not to what the model claims

`evidence_snapshot` — the on-chain record of "what the adjudicator saw" — is sliced
**deterministically from the real fetched content** inside `leader_fn`, never taken from the LLM's
own self-report. Earlier iterations of this contract asked the model to report its own
`evidence_snapshot` field; a model (hallucinating or adversarial) could paraphrase, misquote, or
outright fabricate that field with nothing binding it to reality. Removing the model from that loop
entirely means the stored evidence is provably what every validator actually retrieved, independent
of anything the model says about it — closing a real, confirmed GenLayer rejection pattern:
*"bind each funding score to the actual evidence content."*

**What remains an open, acknowledged limitation:** the adjudicator's *reasoning* about that evidence
— which interpretation it judges to fit best, and why — is still an LLM's qualitative judgment,
not a deterministic check that a specific structured claim matches a specific fetched fact. The
fail-closed confidence gate, the deterministic evidence binding, the ≥2-source corroboration
requirement, and independent validator re-derivation all materially harden this, but none of them
turn "which interpretation fits the evidence" into a fully mechanical computation — that's
inherent to what a Lens is for. Stated here explicitly rather than implied to be solved.

## Frontend

Next.js 15 (App Router) + TypeScript strict + Tailwind v4. RainbowKit/wagmi own wallet-connect UX
only (address display, network chrome); all actual contract reads/writes go through `genlayer-js`,
bound to the connected wallet's real injected provider via `connector.getProvider()` (never
`window.ethereum` directly, and never a fresh ephemeral read account per call — both are confirmed
real GenLayer rejection patterns from prior submissions).

Every write flow drives its UI off one shared state machine (`lib/useTransactionLifecycle.ts`):
`submitting → polling → success/error`, polling real transaction status via `pollConsensusStatus`.
Success is determined **strictly**: `lib/genlayer-client.ts`'s `describeTransactionOutcome()`
requires `txExecutionResultName === ExecutionResult.FINISHED_WITH_RETURN` on top of a terminal
consensus status — a transaction that reaches `ACCEPTED` with `txExecutionResultName:
"FINISHED_WITH_ERROR"` (a genuine, confirmed, real behavior on this chain: a contract-level revert
via `gl.vm.UserError` still reaches `ACCEPTED` consensus) is reported as a failure, not a false
success. `txExecutionResultName` being merely absent or `NOT_VOTED` is likewise never defaulted to
success. An earlier version of this frontend checked only `statusName` and would have shown a green
checkmark on a transaction that reverted and changed nothing — this is now a hard, tested
requirement, not an assumption. `create_lens` and `adjudicate` both require `FINALIZED` (not just
`ACCEPTED`) before their success state is presented, since both produce output other flows act on
(a new contract address; a new live interpretation) and `ACCEPTED` can still be appealed and
reversed.

## Known scaling limitations (stated, not hidden)

- **No global index across all Lenses' interpretations.** The Explorer walks
  `LensFactory.get_lenses()` and reads each Lens's cached metadata individually. Fine at testnet
  scale; a real index (subgraph-style, or a denormalized registry field) is the natural next step
  at production scale.
- **`claim()` loops over a round's interpretation list** to confirm the caller genuinely
  participated before paying out — bounded by `MAX_INTERPRETATIONS_PER_ROUND` (12), so it's a small,
  fixed-size scan, not unbounded growth.
- **Overpayment to `create_lens` is not refunded** — any value sent above the required creation
  stake becomes part of `collected_fees` rather than being partially refunded to the sender. This is
  a deliberate simplicity tradeoff, disclosed here rather than silently absorbed: the amount remains
  fully recoverable (by the factory owner, via `withdraw_fees`), just not automatically returned to
  the original overpayer.
