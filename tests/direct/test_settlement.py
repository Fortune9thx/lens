"""Direct-mode tests for Lens.settle(), Lens.claim(), and the refund paths
(cancel_round timeout, close_lens auto-cancel)."""

import json
import time

from gltest.direct import VMContext, deploy_contract, create_test_addresses

from conftest import LENS_PATH, to_hex, warp_now

SOURCES = ["https://example.com/feed", "https://example.org/feed"]


def _web(body: str) -> dict:
    return {"method": "GET", "status": 200, "body": body}


def _wrapped_json(payload: dict) -> str:
    return f"Analysis:\n```json\n{json.dumps(payload)}\n```"


def _mock_both_sources(vm, body="Evidence favoring the correct read."):
    vm.mock_web(r"example\.com/feed", _web(body))
    vm.mock_web(r"example\.org/feed", _web(body))


def _deploy_open_lens(vm, creator):
    vm.sender = creator
    return deploy_contract(LENS_PATH, vm, SOURCES, "market", "Title", "Desc")


def _adjudicate(lens, vm, creator, winner_id, confidence="0.85"):
    _mock_both_sources(vm)
    vm.mock_llm(
        r"adjudicator for Lens",
        _wrapped_json({"winner_id": winner_id, "confidence": confidence, "reasoning": "Fits."}),
    )
    vm.sender = creator
    return lens.adjudicate()


def test_settle_requires_adjudicated_round():
    vm = VMContext()
    creator, = create_test_addresses(1)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = creator
        with vm.expect_revert("adjudicated"):
            lens.settle("1")


def test_settle_marks_round_settled():
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = alice
        vm.value = 10
        id_a = lens.submit_interpretation("Only.", "{}")
        _adjudicate(lens, vm, creator, id_a)

        vm.sender = creator
        lens.settle("1")
        assert lens.get_round_info("1")["status"] == "settled"


def test_settle_twice_reverts():
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = alice
        vm.value = 10
        id_a = lens.submit_interpretation("Only.", "{}")
        _adjudicate(lens, vm, creator, id_a)
        vm.sender = creator
        lens.settle("1")
        with vm.expect_revert("adjudicated"):
            lens.settle("1")


def test_claim_requires_claimable_round():
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = alice
        vm.value = 10
        id_a = lens.submit_interpretation("Only.", "{}")
        _adjudicate(lens, vm, creator, id_a)
        vm.sender = alice
        with vm.expect_revert("not yet claimable"):
            lens.claim("1")


def test_claim_pays_parimutuel_share_of_winning_side():
    """Alice and Carol both back the winning interpretation (100 + 100);
    Bob backs the losing one (200). Total pool = 400. Winning side total =
    200. Alice's share = 100/200 * 400 = 200. Carol's share = 200 too."""
    vm = VMContext()
    creator, alice, bob, carol = create_test_addresses(4)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)

        vm.sender = alice
        vm.value = 100
        id_win = lens.submit_interpretation("Correct read.", "{}")

        vm.sender = carol
        vm.value = 100
        lens.back_interpretation(id_win)

        vm.sender = bob
        vm.value = 200
        lens.submit_interpretation("Wrong read.", "{}")

        _adjudicate(lens, vm, creator, id_win)

        vm.sender = creator
        lens.settle("1")

        assert lens.get_claimable("1", to_hex(alice)) == "200"
        assert lens.get_claimable("1", to_hex(carol)) == "200"
        assert lens.get_claimable("1", to_hex(bob)) == "0"

        vm.sender = alice
        lens.claim("1")
        assert lens.is_claimed("1", to_hex(alice)) is True
        assert lens.get_claimable("1", to_hex(alice)) == "0"


def test_claim_on_losing_side_succeeds_with_zero_payout():
    """A backer of a losing interpretation must still be able to claim (to
    mark their round as resolved / avoid confusion) -- payout is legitimately
    zero, not an error."""
    vm = VMContext()
    creator, alice, bob = create_test_addresses(3)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = alice
        vm.value = 100
        id_win = lens.submit_interpretation("Correct read.", "{}")
        vm.sender = bob
        vm.value = 50
        lens.submit_interpretation("Wrong read.", "{}")

        _adjudicate(lens, vm, creator, id_win)
        vm.sender = creator
        lens.settle("1")

        vm.sender = bob
        lens.claim("1")
        assert lens.is_claimed("1", to_hex(bob)) is True


def test_claim_without_participation_reverts():
    vm = VMContext()
    creator, alice, outsider = create_test_addresses(3)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = alice
        vm.value = 100
        id_a = lens.submit_interpretation("Only.", "{}")
        _adjudicate(lens, vm, creator, id_a)
        vm.sender = creator
        lens.settle("1")

        vm.sender = outsider
        with vm.expect_revert("No stake"):
            lens.claim("1")


def test_double_claim_reverts():
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = alice
        vm.value = 100
        id_a = lens.submit_interpretation("Only.", "{}")
        _adjudicate(lens, vm, creator, id_a)
        vm.sender = creator
        lens.settle("1")

        vm.sender = alice
        lens.claim("1")
        with vm.expect_revert("Already claimed"):
            lens.claim("1")


def test_close_lens_only_creator():
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = alice
        with vm.expect_revert("Only the Lens creator"):
            lens.close_lens()

        vm.sender = creator
        lens.close_lens()
        assert lens.get_lens_info()["status"] == "closed"


def test_submit_interpretation_rejected_after_close():
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = creator
        lens.close_lens()
        vm.sender = alice
        vm.value = 10
        with vm.expect_revert("Lens is closed"):
            lens.submit_interpretation("Content.", "{}")


# ------------------------------------------------------------------
# Refund paths: close_lens() auto-cancel, and cancel_round() timeout
# ------------------------------------------------------------------

def test_close_lens_immediately_cancels_open_round_and_unlocks_refund():
    """Regression test for the "permanently strand participant funds" class
    of bug: closing a Lens while its current round is still open must not
    leave that round's backers with no path to their stake back. It must be
    cancelled immediately (no timeout wait), and refundable right away."""
    vm = VMContext()
    creator, alice, bob = create_test_addresses(3)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = alice
        vm.value = 100
        lens.submit_interpretation("Alice's read.", "{}")
        vm.sender = bob
        vm.value = 50
        lens.submit_interpretation("Bob's read.", "{}")

        vm.sender = creator
        lens.close_lens()

        round1 = lens.get_round_info("1")
        assert round1["status"] == "cancelled"

        assert lens.get_claimable("1", to_hex(alice)) == "100"
        assert lens.get_claimable("1", to_hex(bob)) == "50"

        vm.sender = alice
        lens.claim("1")
        assert lens.is_claimed("1", to_hex(alice)) is True

        vm.sender = bob
        lens.claim("1")
        assert lens.is_claimed("1", to_hex(bob)) is True


def test_close_lens_with_adjudicated_round_does_not_touch_it():
    """close_lens()'s auto-cancel must only ever touch the CURRENT round --
    an already-adjudicated round (with a real winner) must be left alone,
    still settleable/claimable through its normal parimutuel path."""
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = alice
        vm.value = 100
        id_a = lens.submit_interpretation("Only.", "{}")
        _adjudicate(lens, vm, creator, id_a)  # round 1 -> adjudicated, round 2 opens

        vm.sender = creator
        lens.close_lens()

        # Round 1 (already adjudicated with a real winner) untouched.
        assert lens.get_round_info("1")["status"] == "adjudicated"
        # Round 2 (open, empty) was cancelled by the close.
        assert lens.get_round_info("2")["status"] == "cancelled"

        vm.sender = creator
        lens.settle("1")
        assert lens.get_claimable("1", to_hex(alice)) == "100"


def test_cancel_round_before_timeout_reverts():
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = alice
        vm.value = 10
        lens.submit_interpretation("Content.", "{}")
        vm.sender = creator
        with vm.expect_revert("can only be cancelled after"):
            lens.cancel_round("1")


def test_cancel_round_after_timeout_unlocks_refund():
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = alice
        vm.value = 100
        lens.submit_interpretation("Nobody ever adjudicates this.", "{}")

        future = int(time.time()) + 86400 + 60
        warp_now(vm, f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(future))}")

        vm.sender = alice  # permissionless -- any address may cancel, not just the creator
        lens.cancel_round("1")

        assert lens.get_round_info("1")["status"] == "cancelled"
        assert lens.get_claimable("1", to_hex(alice)) == "100"

        lens.claim("1")
        assert lens.is_claimed("1", to_hex(alice)) is True


def test_cancel_round_rejects_already_adjudicated_round():
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = alice
        vm.value = 10
        id_a = lens.submit_interpretation("Only.", "{}")
        _adjudicate(lens, vm, creator, id_a)

        vm.sender = creator
        with vm.expect_revert("cannot be cancelled"):
            lens.cancel_round("1")


def test_inconclusive_round_is_claimable_as_a_refund():
    """adjudicate() itself can produce an inconclusive round (no fetchable
    evidence / low confidence) -- claim() must refund it exactly like a
    cancelled round, with no separate settle() step needed."""
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = alice
        vm.value = 100
        lens.submit_interpretation("Only.", "{}")
        # No mock_web registered -- every source fetch comes back empty.
        vm.sender = creator
        lens.adjudicate()

        assert lens.get_round_info("1")["status"] == "inconclusive"
        vm.sender = alice
        lens.claim("1")
        assert lens.is_claimed("1", to_hex(alice)) is True


def test_refund_sums_stake_across_multiple_backed_interpretations():
    """A backer who spread stake across two different interpretations in a
    round that goes inconclusive/cancelled must get the SUM of both back,
    not just one."""
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = alice
        vm.value = 60
        lens.submit_interpretation("First.", "{}")
        vm.value = 40
        lens.submit_interpretation("Second.", "{}")

        vm.sender = creator
        lens.close_lens()

        assert lens.get_claimable("1", to_hex(alice)) == "100"


def test_claim_cannot_drain_a_different_rounds_pool():
    """Regression test for cross-round fund isolation: the SAME address
    (alice) participates in TWO different rounds with different outcomes --
    a settled parimutuel win in round 1, and a full refund in round 2 (via
    inconclusive adjudication). Claiming one round must never change what
    is claimable in the other, and each round's `claimed` flag must be
    tracked completely independently -- proving claim() can't be tricked
    into paying round-2 money out of round-1's accounting or vice versa."""
    vm = VMContext()
    creator, alice, bob = create_test_addresses(3)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)

        # Round 1: alice backs the winner (100), bob backs the loser (50).
        vm.sender = alice
        vm.value = 100
        id_win = lens.submit_interpretation("Round 1 winner.", "{}")
        vm.sender = bob
        vm.value = 50
        lens.submit_interpretation("Round 1 loser.", "{}")
        _adjudicate(lens, vm, creator, id_win)
        vm.sender = creator
        lens.settle("1")

        # Round 2: alice backs a fresh interpretation, but this round goes
        # inconclusive (no evidence mocked) -- straight refund, not a
        # parimutuel win. clear_mocks() is required first: gltest's WASI
        # mock matches web/LLM mocks in registration order and round 1's
        # _adjudicate() call left web mocks registered that would otherwise
        # silently satisfy round 2's fetch too (same gotcha documented in
        # tests/direct/test_adjudicate.py).
        vm.clear_mocks()
        vm.sender = alice
        vm.value = 30
        lens.submit_interpretation("Round 2 pick.", "{}")
        vm.sender = creator
        lens.adjudicate()
        assert lens.get_round_info("2")["status"] == "inconclusive"

        # Claimable amounts for the SAME address, in two DIFFERENT rounds,
        # with two DIFFERENT settlement mechanisms, computed independently.
        round1_claimable = lens.get_claimable("1", to_hex(alice))
        round2_claimable = lens.get_claimable("2", to_hex(alice))
        assert round1_claimable == "150"  # (100 * 150 pool) // 100 winner_total
        assert round2_claimable == "30"   # straight refund, unrelated math

        # Claim round 1 -- round 2's claimable and claimed status must be
        # completely untouched.
        vm.sender = alice
        lens.claim("1")
        assert lens.is_claimed("1", to_hex(alice)) is True
        assert lens.is_claimed("2", to_hex(alice)) is False
        assert lens.get_claimable("2", to_hex(alice)) == "30"

        # Now claim round 2 -- must still succeed for the full refund
        # amount, proving round 1's claim didn't consume or corrupt it.
        lens.claim("2")
        assert lens.is_claimed("2", to_hex(alice)) is True

        # Both claimed now; neither is claimable again.
        assert lens.get_claimable("1", to_hex(alice)) == "0"
        assert lens.get_claimable("2", to_hex(alice)) == "0"
