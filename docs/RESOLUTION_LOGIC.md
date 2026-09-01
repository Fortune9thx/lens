# Resolution logic

This document walks through `Lens.adjudicate()` in `contracts/Lens.py` step by step, and explains
every deliberate deviation from the naive/obvious implementation — including the fail-closed gate
added after a strict-review pass found the original version would crown a winner and move real
stake on zero evidence or near-zero confidence.

## Preconditions

```python
if self.status != STATUS_ACTIVE:
    raise gl.vm.UserError("Lens is closed.")
round_str = str(int(self.current_round))
if self.round_status.get(round_str, "") != ROUND_OPEN:
    raise gl.vm.UserError("Current round is not open for adjudication.")

ids = json.loads(self.round_interpretation_ids.get(round_str, "[]"))
if not ids:
    raise gl.vm.UserError("No interpretations submitted this round.")

self.round_status[round_str] = ROUND_ADJUDICATING
```

Marking the round `ROUND_ADJUDICATING` before the nondet call is a reentrancy-style guard: a second
`adjudicate()` call against the same round fails the `ROUND_OPEN` check immediately. If anything
after this line causes the transaction to revert, GenVM rolls back every state change in it —
including this line — so a failed attempt can never leave a round permanently stuck at
`ROUND_ADJUDICATING`; it simply reverts back to `ROUND_OPEN`.

## Preparing local state before the nondet block

```python
sources = list(self.sources)
candidates = [{"id": iid, "content": rec["content"], "structured_claims": rec["structured_claims"]}
              for iid in ids for rec in [json.loads(self.interpretations[iid])]]
valid_ids = [c["id"] for c in candidates]
```

Non-deterministic blocks (`run_nondet_unsafe`'s `leader_fn`/`validator_fn`) cannot touch `self.*`
storage — everything the closures need is copied into locals first. Deliberately **not** included:
each interpretation's `total_stake`/`backers`. The adjudicator is instructed to judge evidentiary
fit only, and simply never seeing stake amounts is a stronger guarantee against stake-weighted bias
than trusting a prompt instruction alone.

## The leader function: fetch, then fail closed before ever calling the LLM

```python
def leader_fn():
    evidence = []
    for url in sources:
        try:
            fetched = gl.nondet.web.render(url, mode="text", wait_after_loaded="3s") or ""
        except Exception:
            fetched = ""
        excerpt = _sanitize_input(fetched, MAX_SOURCE_EXCERPT_LEN)
        evidence.append({"url": url, "excerpt": excerpt})

    evidence_snapshot = [
        {"url": e["url"], "excerpt": e["excerpt"][:MAX_EVIDENCE_ITEM_LEN]}
        for e in evidence if e["excerpt"]
    ][:MAX_EVIDENCE_ITEMS]

    if not evidence_snapshot:
        return {"decision": DECISION_NO_EVIDENCE, "winner_id": "", "confidence": "0.0",
                "reasoning": "No live evidence could be fetched from any declared source.",
                "evidence_snapshot": []}

    prompt = f"""...interpretations, live evidence, selection rules..."""
    raw_response = gl.nondet.exec_prompt(prompt)
    parsed = _parse_json_object(raw_response)
    winner_id = str(parsed.get("winner_id", "")).strip()
    if winner_id not in valid_ids:
        winner_id = valid_ids[0]
    return {"decision": DECISION_DECIDED, "winner_id": winner_id,
            "confidence": _stringify_confidence(parsed.get("confidence")),
            "reasoning": str(parsed.get("reasoning", ""))[:MAX_REASONING_LEN],
            "evidence_snapshot": evidence_snapshot}
```

Every declared source is fetched **inside this single leader closure**, not as separate top-level
nondet calls — `genvm-lint` (and real portal reviewers, per documented rejection language from a
prior submission) enforce exactly one non-deterministic block per method.

Five deliberate choices here, four of them regression-tested:

1. **If every source's fetch comes back empty, the LLM is never called at all.** `evidence_snapshot`
   is computed *before* the early return, deterministically, so leader and every validator agree on
   `DECISION_NO_EVIDENCE` without needing a model call to agree on anything. This is the fail-closed
   fix for a real gap: the original version silently swallowed fetch failures to an empty string and
   let the LLM "judge" zero real evidence anyway, still crowning a winner. Covered by
   `test_adjudicate_fails_closed_when_all_sources_unfetchable` and
   `test_validator_agrees_on_matching_no_evidence_outcome`.
2. **`evidence_snapshot` is sliced from the real fetched `evidence` list, never from the model's own
   JSON response.** The prompt no longer even asks the model to report one. A prior version trusted
   an LLM-self-reported `evidence_snapshot` field — nothing bound that field to what was actually
   fetched, so a hallucinating or adversarial model could report evidence that was never real.
   `test_evidence_snapshot_is_bound_to_real_fetched_content_not_llm_self_report` feeds the mock LLM a
   fabricated `evidence_snapshot` on purpose and asserts the stored record reflects the real mocked
   web content instead, never the model's claim.
3. **`gl.nondet.exec_prompt(prompt)` is called without `response_format="json"`, and the response is
   parsed manually** via `_parse_json_object` (brace-stripping, trailing-comma removal). Real LLM
   output is rarely bare JSON; it's usually wrapped in prose or a markdown fence.
4. **Confidence is force-stringified before the function returns**, via `_stringify_confidence`.
   GenVM's calldata encoding has no float type. `test_adjudicate_confidence_bare_float_never_crashes`
   feeds the mock LLM a **bare float** on purpose and asserts the contract still returns a clean
   string.
5. **A `winner_id` outside the submitted candidate set is coerced to the first candidate**, never
   stored as-is. `test_adjudicate_falls_back_to_first_candidate_on_invalid_winner_id` covers this.

## The validator function

```python
def validator_fn(leader_result) -> bool:
    if not isinstance(leader_result, gl.vm.Return):
        return False
    leader_data = leader_result.calldata
    mine = leader_fn()
    if mine.get("decision") != leader_data.get("decision"):
        return False
    if mine.get("decision") == DECISION_NO_EVIDENCE:
        return True  # both independently found no fetchable evidence
    winner_agrees = mine.get("winner_id") == leader_data.get("winner_id")
    my_confidence = float(mine.get("confidence", "0.0"))
    their_confidence = float(leader_data.get("confidence", "0.0"))
    confidence_agrees = abs(my_confidence - their_confidence) < CONFIDENCE_AGREEMENT_TOLERANCE
    return winner_agrees and confidence_agrees
```

`validator_fn` calls `leader_fn()` again — a genuinely independent re-fetch of every source and a
fresh LLM call (or, in the no-evidence case, a genuinely independent re-confirmation that nothing
was fetchable), never a structural check of the leader's own claimed output. This directly matches
a real, confirmed GenLayer rejection pattern from a prior submission: *"the validator checks only
verdict shape, ranges, and a few field combinations... redesign the validator to independently
acquire and assess the evidence."*

`tests/direct/test_adjudicate.py` covers agreement (matching winner + confidence, and matching
no-evidence outcomes) and disagreement (different winner, confidence outside tolerance).

## After consensus: the fail-closed confidence gate

```python
result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
decision = result.get("decision", DECISION_NO_EVIDENCE)
confidence_val = float(_stringify_confidence(result.get("confidence")))

if decision != DECISION_DECIDED or confidence_val < CONFIDENCE_THRESHOLD:
    # Fail closed: no winner, no live-output change, round marked
    # inconclusive -- every backer gets a full refund via claim().
    self.round_status[round_str] = ROUND_INCONCLUSIVE
    ...
    return ""

winner_id = result.get("winner_id", "")
if winner_id not in valid_ids:
    winner_id = valid_ids[0]
self.live_interpretation_id = winner_id
...
self.round_status[round_str] = ROUND_ADJUDICATED
return winner_id
```

`CONFIDENCE_THRESHOLD = 0.5` is a genuine gate, not a formality: even when the LLM successfully
picks a winner, if its own reported confidence in that pick doesn't clear the bar, the round is
still marked inconclusive and no stake moves. This closes a real gap — the original version had no
confidence floor at all, so a near-zero-confidence pick still became the live output and still paid
out real GEN to its backers. `test_adjudicate_fails_closed_when_confidence_below_threshold` and
`test_inconclusive_round_does_not_disturb_prior_live_output` (a later round going inconclusive must
never erase an earlier round's already-established live output) both cover this directly.

The round always advances to a fresh `ROUND_OPEN` state regardless of outcome — a Lens is designed
to keep tracking its source, so even an inconclusive round doesn't block future adjudication
attempts against newer evidence.

## Refund paths: cancel_round() and close_lens()

An inconclusive round is claimable immediately (no separate step needed). Two more paths exist for
a round that never gets adjudicated at all:

```python
@gl.public.write
def cancel_round(self, round: str) -> None:
    status = self.round_status.get(round, "")
    if status not in (ROUND_OPEN, ROUND_ADJUDICATING):
        raise gl.vm.UserError("Round is not open or adjudicating; it cannot be cancelled.")
    opened_at = int(self.round_opened_at.get(round, "0"))
    if _consensus_now() < opened_at + ROUND_TIMEOUT_SECONDS:
        raise gl.vm.UserError(f"Round can only be cancelled after {ROUND_TIMEOUT_SECONDS} seconds with no adjudication.")
    self.round_status[round] = ROUND_CANCELLED
```

Permissionless — any address may cancel a round nobody has adjudicated within 24 hours, unlocking
refunds. `close_lens()` goes further: it force-cancels the *current* round immediately (no timeout
wait) the moment the Lens is closed, since a closed Lens can never adjudicate again and would
otherwise leave that round's backers with literally no path back to their stake. Both are covered
by `tests/direct/test_settlement.py` (`test_cancel_round_after_timeout_unlocks_refund`,
`test_close_lens_immediately_cancels_open_round_and_unlocks_refund`,
`test_close_lens_with_adjudicated_round_does_not_touch_it` — confirming the auto-cancel only ever
touches the *current* round, never an already-decided one).

## Settlement (`settle` / `claim`)

Parimutuel payout for a `settled` round: a winning backer receives
`(their_stake_in_winner * round_pool) // winner_total_stake`. For an `inconclusive` or `cancelled`
round, `claim()` instead sums and refunds the caller's own stake across every interpretation they
backed that round — a straight refund, not a redistribution, since there is no winner to
redistribute a loser's stake to. State is mutated (`claimed[...] = "1"`) **before** the value
transfer (`_Recipient(...).emit_transfer(...)`) — checks-effects-interactions, regardless of whether
GenVM's execution model has a reentrancy analogue to Solidity's.

A caller who participated in **no** interpretation that round at all still gets a real revert
(`test_claim_without_participation_reverts`), distinguishing "you lost/were refunded" from "you
were never here."
