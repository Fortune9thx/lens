# Resolution logic

This document walks through `Lens.adjudicate()` in `contracts/Lens.py` step by step, and explains
every deliberate deviation from the naive/obvious implementation.

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
`adjudicate()` call against the same round fails the `ROUND_OPEN` check immediately, rather than
racing the first call's nondet block.

## Preparing local state before the nondet block

```python
sources = list(self.sources)
interpretation_type = self.interpretation_type
title = self.title
candidates = []
for iid in ids:
    rec = json.loads(self.interpretations[iid])
    candidates.append({"id": iid, "content": rec["content"], "structured_claims": rec["structured_claims"]})
```

Non-deterministic blocks (`run_nondet_unsafe`'s `leader_fn`/`validator_fn`) cannot touch `self.*`
storage — everything the closures need is copied into locals first. Deliberately **not** included:
each interpretation's `total_stake`/`backers`. The adjudicator is instructed to judge evidentiary
fit only, and simply never seeing stake amounts is a stronger guarantee against stake-weighted bias
than trusting a prompt instruction alone.

## The leader function

```python
def leader_fn():
    evidence = []
    for url in sources:
        try:
            fetched = gl.nondet.web.render(url, mode="text", wait_after_loaded="3s") or ""
        except Exception:
            fetched = ""
        evidence.append({"url": url, "excerpt": _sanitize_input(fetched, ...)})

    prompt = f"""...interpretations, live evidence, selection rules..."""
    raw_response = gl.nondet.exec_prompt(prompt)
    parsed = _parse_json_object(raw_response)

    winner_id = str(parsed.get("winner_id", "")).strip()
    valid_ids = [c["id"] for c in candidates]
    if winner_id not in valid_ids:
        winner_id = valid_ids[0]
    parsed["winner_id"] = winner_id
    parsed["confidence"] = _stringify_confidence(parsed.get("confidence"))
    ...
    return parsed
```

Every declared source is fetched **inside this single leader closure**, not as separate top-level
nondet calls — `genvm-lint` (and real portal reviewers, per documented rejection language from a
prior submission) enforce exactly one non-deterministic block per method. Multiple
`gl.nondet.web.render` calls inside one leader function are fine; two sequential top-level nondet
calls in the same method are not.

Three deliberate choices, all regression-tested:

1. **`gl.nondet.exec_prompt(prompt)` is called without `response_format="json"`, and the response
   is parsed manually** via `_parse_json_object` (brace-stripping, trailing-comma removal). Real LLM
   output is rarely bare JSON; it's usually wrapped in prose or a markdown fence.
2. **Confidence is force-stringified before the function returns**, via `_stringify_confidence`.
   GenVM's calldata encoding has no float type — a bare JSON number like `"confidence": 0.85`
   becomes a Python `float`, which is not calldata-encodable. The prompt explicitly instructs the
   model to quote confidence as a string, and the contract *also* defensively coerces it regardless
   of what the model actually returns. `tests/direct/test_adjudicate.py::test_adjudicate_confidence_bare_float_never_crashes`
   feeds the mock LLM a **bare float** on purpose and asserts the contract still returns a clean
   string.
3. **A `winner_id` outside the submitted candidate set is coerced to the first candidate**, never
   stored as-is. `test_adjudicate_falls_back_to_first_candidate_on_invalid_winner_id` covers this
   directly — a hallucinated id could otherwise make every later view call referencing
   `live_interpretation_id` fail to resolve.

## The validator function

```python
def validator_fn(leader_result) -> bool:
    if not isinstance(leader_result, gl.vm.Return):
        return False
    leader_data = leader_result.calldata
    mine = leader_fn()
    winner_agrees = mine.get("winner_id") == leader_data.get("winner_id")
    my_confidence = float(mine.get("confidence", "0.0"))
    their_confidence = float(leader_data.get("confidence", "0.0"))
    confidence_agrees = abs(my_confidence - their_confidence) < 0.15
    return winner_agrees and confidence_agrees
```

`validator_fn` calls `leader_fn()` again — a genuinely independent re-fetch of every source and a
fresh LLM call, not a structural check of the leader's own claimed output. This directly matches a
real, confirmed GenLayer rejection pattern from a prior submission: *"the validator checks only
verdict shape, ranges, and a few field combinations; it does not independently review the evidence
or verify the fulfillment decision... redesign the validator to independently acquire and assess
the evidence."*

Only two fields gate agreement: `winner_id` (exact match) and `confidence` (within 0.15). Wording of
`reasoning`/`evidence_snapshot` is allowed to vary between the leader and each validator's own LLM
call — expecting verbatim agreement on free-text reasoning would make consensus nearly impossible,
since models paraphrase.

`tests/direct/test_adjudicate.py` includes both directions: a validator that agrees when winner and
confidence match closely (`test_validator_agrees_on_matching_winner_and_close_confidence`) and ones
that correctly reject when the winner differs (`test_validator_disagrees_on_different_winner`) or
confidence diverges past the tolerance (`test_validator_disagrees_on_confidence_outside_tolerance`).

## After consensus

```python
result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

winner_id = result.get("winner_id", "")
if winner_id not in valid_ids:
    winner_id = valid_ids[0]
...
self.live_interpretation_id = winner_id
self.live_round = self.current_round
self.live_since = u256(now)
self.last_adjudicated = u256(now)

self.adjudication_log.append(json.dumps({...}))

self.round_status[round_str] = ROUND_ADJUDICATED
next_round = int(self.current_round) + 1
self.current_round = u256(next_round)
self.round_status[str(next_round)] = ROUND_OPEN
```

Two more deliberate choices:

- **The round advances immediately after adjudication, unconditionally.** Unlike a one-shot Claim
  that terminates at resolution, a Lens is designed to keep tracking its source — a fresh round
  opens the instant the previous one is adjudicated, so interpretations can keep being submitted
  and re-adjudicated as the underlying evidence evolves. `live_interpretation_id` is a standalone
  pointer, not scoped to "the current round," so it keeps returning the most recent winner even
  while a new round is still open and unadjudicated.
- **`round_reasoning` is stored once, keyed by round, separately from the interpretation record
  itself.** An interpretation can win in round 3 after having also competed (and lost) in round 1 —
  the reasoning that made it win is a property of that specific adjudication event, not of the
  interpretation, so it's stored and read that way (`get_round_info(round)` / the `reasoning` field
  inside `get_live_interpretation()`, sourced from `round_reasoning[live_round]`).

## Settlement (`settle` / `claim`)

Parimutuel payout per round: a winning backer receives
`(their_stake_in_winner * round_pool) // winner_total_stake`. `settle(round)` is a separate,
explicit step from `adjudicate()` (matching the spec's Core Flow steps 4–6 as distinct actions) —
it simply flips `round_status[round]` from `"adjudicated"` to `"settled"`, unlocking `claim()` for
that round. State is mutated (`claimed[...] = "1"`) **before** the value transfer
(`_Recipient(...).emit_transfer(...)`) — checks-effects-interactions, regardless of whether GenVM's
execution model has a reentrancy analogue to Solidity's.

A caller who backed only a losing interpretation in that round still gets a valid `claim()` call
(payout `0`, `claimed` marked) rather than a revert — `claim()` only reverts for someone who
`participated` in **no** interpretation that round at all
(`tests/direct/test_settlement.py::test_claim_without_participation_reverts`), distinguishing "you
lost" from "you were never here."
