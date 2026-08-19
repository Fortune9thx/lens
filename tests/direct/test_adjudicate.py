"""
Direct-mode tests for Lens.adjudicate().

Scope note: adjudicate() fetches every declared source via gl.nondet.web.render
inside a single leader closure passed to gl.vm.run_nondet_unsafe, matching the
one-nondet-call-per-method rule genvm-lint enforces. Multi-source Lenses are
covered here against the WASI mock's vm.mock_web/vm.mock_llm; cross-contract
reads are not used anywhere in this contract, so there is no integration-only
gap for adjudicate() itself (unlike LensFactory.create_lens's gl.deploy_contract
call, which does require a real node -- see tests/integration).
"""

import json

from gltest.direct import VMContext, deploy_contract, create_test_addresses

from conftest import LENS_PATH, to_hex, warp_now

SOURCES = ["https://example.com/feed"]


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


def test_adjudicate_selects_winner_and_publishes_live_output():
    vm = VMContext()
    creator, alice, bob = create_test_addresses(3)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        id_a = _submit(lens, vm, alice, "Dominance is rising on ETF demand.", {"direction": "up"}, 100)
        id_b = _submit(lens, vm, bob, "Dominance is falling on altcoin rotation.", {"direction": "down"}, 100)

        vm.mock_web(r"example\.com/feed", _web("BTC dominance climbed 2.1% this week on strong ETF inflows."))
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({
                "winner_id": id_a,
                "confidence": "0.88",
                "reasoning": "Live evidence confirms rising dominance driven by ETF inflows.",
                "evidence_snapshot": ["BTC dominance climbed 2.1% this week on strong ETF inflows."],
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


def test_adjudicate_opens_a_fresh_round_for_continued_submissions():
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        id_a = _submit(lens, vm, alice, "Initial read.", {}, 10)
        vm.mock_web(r"example\.com/feed", _web("Some evidence."))
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({"winner_id": id_a, "confidence": "0.7", "reasoning": "Fits.", "evidence_snapshot": []}),
        )
        vm.sender = creator
        lens.adjudicate()

        round2 = lens.get_round_info("2")
        assert round2["status"] == "open"

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
        vm.mock_web(r"example\.com/feed", _web("Evidence."))
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({"winner_id": "does-not-exist", "confidence": "0.5", "reasoning": "N/A", "evidence_snapshot": []}),
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
        vm.mock_web(r"example\.com/feed", _web("Evidence."))
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({"winner_id": id_a, "confidence": 0.65, "reasoning": "Fits.", "evidence_snapshot": []}),
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
        vm.mock_web(r"example\.com/feed", _web("Evidence."))
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({"winner_id": id_a, "confidence": "1.4", "reasoning": "Fits.", "evidence_snapshot": []}),
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
        vm.mock_web(r"example\.com/feed", _web("Evidence."))
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({"winner_id": id_a, "confidence": "0.7", "reasoning": "Fits.", "evidence_snapshot": []}),
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
        vm.mock_web(r"example\.com/feed", _web("Evidence."))
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({"winner_id": id_a, "confidence": "0.80", "reasoning": "Fits.", "evidence_snapshot": []}),
        )
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
        vm.mock_web(r"example\.com/feed", _web("Evidence."))
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({"winner_id": id_a, "confidence": "0.80", "reasoning": "Fits.", "evidence_snapshot": []}),
        )
        vm.sender = creator
        lens.adjudicate()

        disagrees = vm.run_validator(leader_result={
            "winner_id": "1-1", "confidence": "0.80", "reasoning": "Different.", "evidence_snapshot": [],
        })
        assert disagrees is False


def test_validator_disagrees_on_confidence_outside_tolerance():
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        id_a = _submit(lens, vm, alice, "Interpretation.", {}, 10)
        vm.mock_web(r"example\.com/feed", _web("Evidence."))
        vm.mock_llm(
            r"adjudicator for Lens",
            _wrapped_json({"winner_id": id_a, "confidence": "0.90", "reasoning": "Fits.", "evidence_snapshot": []}),
        )
        vm.sender = creator
        lens.adjudicate()

        disagrees = vm.run_validator(leader_result={
            "winner_id": id_a, "confidence": "0.10", "reasoning": "Barely.", "evidence_snapshot": [],
        })
        assert disagrees is False
