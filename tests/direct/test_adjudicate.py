"""
Direct-mode tests for Lens.adjudicate().

Scope note: adjudicate() fetches every declared source via gl.nondet.web.render
inside a single leader closure passed to gl.vm.run_nondet_unsafe, matching the
one-nondet-call-per-method rule genvm-lint enforces. Multi-source Lenses are
covered here against the WASI mock's vm.mock_web/vm.mock_llm, including the
fail-closed paths (no fetchable evidence, confidence below threshold) that
never crown a winner or move real backer capital on an unsupported decision.
Cross-contract reads are not used anywhere in this contract, so there is no
integration-only gap for adjudicate() itself (unlike LensFactory.create_lens's
gl.deploy_contract call, which does require a real node -- see tests/integration).
"""

import json

from gltest.direct import VMContext, deploy_contract, create_test_addresses

from conftest import LENS_PATH, to_hex

SOURCES = ["https://example.com/feed", "https://example.org/feed"]


def _web(body: str) -> dict:
    return {"method": "GET", "status": 200, "body": body}


def _wrapped_json(payload: dict) -> str:
    """LLM responses are rarely bare JSON in practice -- wrap it in prose the
    way a real model would, forcing _parse_json_object's brace-stripping to
    actually do work rather than relying on the mock's own auto-parse."""
    return f"Here is my analysis.\n```json\n{json.dumps(payload)}\n```\nEnd of response."


def _deploy_open_lens(vm, creator):
    vm.sender = creator
    return deploy_contract(LENS_PATH, vm, SOURCES, "market", "Title", "Desc")


def _submit(lens, vm, sender, content, claims, value):
    vm.sender = sender
    vm.value = value
    return lens.submit_interpretation(content, json.dumps(claims))


def _mock_both_sources(vm, body_a="Evidence A.", body_b="Evidence B."):
    vm.mock_web(r"example\.com/feed", _web(body_a))
    vm.mock_web(r"example\.org/feed", _web(body_b))


def test_adjudicate_selects_winner_and_publishes_live_output():
    vm = VMContext()
    creator, alice, bob = create_test_addresses(3)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        id_a = _submit(lens, vm, alice, "Dominance is rising on ETF demand.", {"direction": "up"}, 100)
        _submit(lens, vm, bob, "Dominance is falling on altcoin rotation.", {"direction": "down"}, 100)

        _mock_both_sources(vm, "BTC dominance climbed 2.1% this week on strong ETF inflows.")
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({
                "winner_id": id_a,
                "confidence": "0.88",
                "reasoning": "Live evidence confirms rising dominance driven by ETF inflows.",
            }),
        )
        vm.sender = creator
        winner = lens.adjudicate()
        assert winner == id_a

        live = lens.get_live_interpretation()
        assert live["has_live"] is True
        assert live["interpretation"]["id"] == id_a
        assert live["reasoning"]["confidence"] == "0.88"
        assert "ETF inflows" in live["reasoning"]["reasoning"]

        info = lens.get_lens_info()
        assert info["live_interpretation_id"] == id_a
        assert info["current_round"] == "2"

        round1 = lens.get_round_info("1")
        assert round1["status"] == "adjudicated"
        assert round1["winner_id"] == id_a
        assert round1["reasoning"]["outcome"] == "decided"


def test_evidence_snapshot_is_bound_to_real_fetched_content_not_llm_self_report():
    """Regression test for the "evidence not bound to actual content"
    failure class: even if the LLM's own JSON response claims to have seen
    fabricated text, the stored evidence_snapshot must reflect what was
    actually fetched (the mocked web body), never the model's self-report --
    because the contract no longer asks the model to report it at all."""
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        id_a = _submit(lens, vm, alice, "Interpretation.", {}, 10)

        _mock_both_sources(vm, "The real, actually-fetched market data says X.")
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({
                "winner_id": id_a,
                "confidence": "0.9",
                "reasoning": "Fits.",
                # A hostile/hallucinating model reporting evidence that was
                # never actually fetched -- this field must simply be
                # ignored by the contract.
                "evidence_snapshot": ["This text was never fetched from anywhere."],
            }),
        )
        vm.sender = creator
        lens.adjudicate()

        round_info = lens.get_round_info("1")
        snapshot_text = json.dumps(round_info["reasoning"]["evidence_snapshot"])
        assert "actually-fetched market data" in snapshot_text
        assert "never actually fetched" not in snapshot_text


def test_adjudicate_fails_closed_when_all_sources_unfetchable():
    """If every declared source comes back empty, the contract must not
    call the LLM at all, must not crown a winner, and must leave the round
    inconclusive so backers can be refunded -- never pick a winner and move
    real capital based on zero evidence."""
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        _submit(lens, vm, alice, "Interpretation.", {}, 100)
        # Deliberately no vm.mock_web registered for either source -- the
        # WASI mock returns an empty body for any unmocked URL.
        vm.sender = creator
        winner = lens.adjudicate()
        assert winner == ""

        info = lens.get_lens_info()
        assert info["live_interpretation_id"] == ""  # never set

        round1 = lens.get_round_info("1")
        assert round1["status"] == "inconclusive"
        assert round1["reasoning"]["outcome"] == "inconclusive"

        assert lens.get_claimable("1", to_hex(alice)) == "100"


def test_adjudicate_fails_closed_when_confidence_below_threshold():
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        id_a = _submit(lens, vm, alice, "Interpretation.", {}, 100)
        _mock_both_sources(vm, "Ambiguous, weak evidence.")
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({"winner_id": id_a, "confidence": "0.2", "reasoning": "Not sure at all."}),
        )
        vm.sender = creator
        winner = lens.adjudicate()
        assert winner == ""

        round1 = lens.get_round_info("1")
        assert round1["status"] == "inconclusive"
        assert lens.get_claimable("1", to_hex(alice)) == "100"


def test_inconclusive_round_does_not_disturb_prior_live_output():
    """A later round going inconclusive must never erase an already-
    established live output from an earlier round."""
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        id_a = _submit(lens, vm, alice, "First round pick.", {}, 10)
        _mock_both_sources(vm, "Confirms the first pick.")
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({"winner_id": id_a, "confidence": "0.9", "reasoning": "Confirmed."}),
        )
        vm.sender = creator
        lens.adjudicate()
        assert lens.get_lens_info()["live_interpretation_id"] == id_a

        # Round 2: submit a candidate but let adjudication go inconclusive
        # (low confidence) -- the round-1 live output must be untouched.
        # gltest's WASI mock matches mock_llm/mock_web registrations in
        # registration order and returns the FIRST match (confirmed by
        # reading gltest/direct/vm.py's _match_llm_mock) -- clear_mocks()
        # is required before re-registering the same regex pattern for a
        # second round, or the stale round-1 mock keeps winning silently.
        vm.clear_mocks()
        vm.sender = alice
        vm.value = 10
        lens.submit_interpretation("Second round pick.", "{}")
        _mock_both_sources(vm, "Still ambiguous evidence.")
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({"winner_id": "2-1", "confidence": "0.1", "reasoning": "Unclear."}),
        )
        vm.sender = creator
        lens.adjudicate()

        assert lens.get_lens_info()["live_interpretation_id"] == id_a
        assert lens.get_round_info("2")["status"] == "inconclusive"


def test_adjudicate_opens_a_fresh_round_for_continued_submissions():
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        id_a = _submit(lens, vm, alice, "Initial read.", {}, 10)
        _mock_both_sources(vm, "Some evidence.")
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({"winner_id": id_a, "confidence": "0.7", "reasoning": "Fits."}),
        )
        vm.sender = creator
        lens.adjudicate()

        round2 = lens.get_round_info("2")
        assert round2["status"] == "open"
        assert int(round2["opened_at"]) > 0

        vm.sender = alice
        vm.value = 5
        new_id = lens.submit_interpretation("A fresh interpretation for round 2.", "{}")
        assert new_id.startswith("2-")


def test_adjudicate_falls_back_to_first_candidate_on_invalid_winner_id():
    """If the LLM hallucinates a winner_id outside the submitted set, the
    contract must fall back to a valid candidate rather than storing garbage
    that later view calls can't resolve."""
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        id_a = _submit(lens, vm, alice, "Only interpretation.", {}, 10)
        _mock_both_sources(vm, "Evidence.")
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({"winner_id": "does-not-exist", "confidence": "0.5", "reasoning": "N/A"}),
        )
        vm.sender = creator
        winner = lens.adjudicate()
        assert winner == id_a


def test_adjudicate_confidence_bare_float_never_crashes():
    """Regression test for the calldata-has-no-float class of bug: even if
    the LLM returns confidence as a bare JSON number, the contract must
    coerce it to a string before it can cross a calldata boundary."""
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        id_a = _submit(lens, vm, alice, "Interpretation.", {}, 10)
        _mock_both_sources(vm, "Evidence.")
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({"winner_id": id_a, "confidence": 0.65, "reasoning": "Fits."}),
        )
        vm.sender = creator
        lens.adjudicate()
        live = lens.get_live_interpretation()
        assert live["reasoning"]["confidence"] == "0.65"
        assert isinstance(live["reasoning"]["confidence"], str)


def test_adjudicate_clamps_out_of_range_confidence():
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        id_a = _submit(lens, vm, alice, "Interpretation.", {}, 10)
        _mock_both_sources(vm, "Evidence.")
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({"winner_id": id_a, "confidence": "1.4", "reasoning": "Fits."}),
        )
        vm.sender = creator
        lens.adjudicate()
        live = lens.get_live_interpretation()
        assert live["reasoning"]["confidence"] == "1.0"


def test_adjudicate_rejects_when_no_interpretations():
    vm = VMContext()
    creator, = create_test_addresses(1)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = creator
        with vm.expect_revert("No interpretations"):
            lens.adjudicate()


def test_adjudicate_twice_in_same_round_reverts():
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        id_a = _submit(lens, vm, alice, "Interpretation.", {}, 10)
        _mock_both_sources(vm, "Evidence.")
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({"winner_id": id_a, "confidence": "0.7", "reasoning": "Fits."}),
        )
        vm.sender = creator
        lens.adjudicate()
        # Round 2 is now open but has zero interpretations -- adjudicating
        # it again must fail on the "no interpretations" guard, proving the
        # round genuinely advanced rather than silently re-adjudicating.
        with vm.expect_revert("No interpretations"):
            lens.adjudicate()


def test_validator_agrees_on_matching_winner_and_close_confidence():
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        id_a = _submit(lens, vm, alice, "Interpretation.", {}, 10)
        _mock_both_sources(vm, "Evidence.")
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({"winner_id": id_a, "confidence": "0.80", "reasoning": "Fits."}),
        )
        vm.sender = creator
        lens.adjudicate()

        agrees = vm.run_validator()
        assert agrees is True


def test_validator_agrees_on_matching_no_evidence_outcome():
    """Both leader and validator independently find no fetchable evidence --
    genuine agreement on DECISION_NO_EVIDENCE, without needing the model to
    agree on anything (there was no model call)."""
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        _submit(lens, vm, alice, "Interpretation.", {}, 10)
        vm.sender = creator
        lens.adjudicate()

        agrees = vm.run_validator()
        assert agrees is True


def test_validator_disagrees_on_different_winner():
    vm = VMContext()
    creator, alice, bob = create_test_addresses(3)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        id_a = _submit(lens, vm, alice, "Interpretation A.", {}, 10)
        _submit(lens, vm, bob, "Interpretation B.", {}, 10)
        _mock_both_sources(vm, "Evidence.")
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({"winner_id": id_a, "confidence": "0.80", "reasoning": "Fits."}),
        )
        vm.sender = creator
        lens.adjudicate()

        disagrees = vm.run_validator(leader_result={
            "decision": "decided", "winner_id": "1-1", "confidence": "0.80",
            "reasoning": "Different.", "evidence_snapshot": [],
        })
        assert disagrees is False


def test_validator_disagrees_on_confidence_outside_tolerance():
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        id_a = _submit(lens, vm, alice, "Interpretation.", {}, 10)
        _mock_both_sources(vm, "Evidence.")
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({"winner_id": id_a, "confidence": "0.90", "reasoning": "Fits."}),
        )
        vm.sender = creator
        lens.adjudicate()

        disagrees = vm.run_validator(leader_result={
            "decision": "decided", "winner_id": id_a, "confidence": "0.10",
            "reasoning": "Barely.", "evidence_snapshot": [],
        })
        assert disagrees is False
