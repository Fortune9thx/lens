"""Direct-mode tests for Lens.settle() and Lens.claim() parimutuel payouts."""

import json

from gltest.direct import VMContext, deploy_contract, create_test_addresses

from conftest import LENS_PATH, to_hex

SOURCES = ["https://example.com/feed"]


def _web(body: str) -> dict:
    return {"method": "GET", "status": 200, "body": body}


def _wrapped_json(payload: dict) -> str:
    return f"Analysis:\n```json\n{json.dumps(payload)}\n```"


def _deploy_open_lens(vm, creator):
    vm.sender = creator
    return deploy_contract(LENS_PATH, vm, SOURCES, "market", "Title", "Desc")


def _adjudicate(lens, vm, creator, winner_id, confidence="0.85"):
    vm.mock_web(r"example\.com/feed", _web("Evidence favoring the correct read."))
    vm.mock_llm(
        r"adjudicator for Lens",
        _wrapped_json({"winner_id": winner_id, "confidence": confidence, "reasoning": "Fits.", "evidence_snapshot": []}),
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


def test_claim_requires_settled_round():
    vm = VMContext()
    creator, alice = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = alice
        vm.value = 10
        id_a = lens.submit_interpretation("Only.", "{}")
        _adjudicate(lens, vm, creator, id_a)
        vm.sender = alice
        with vm.expect_revert("not been settled"):
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
        id_lose = lens.submit_interpretation("Wrong read.", "{}")

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
    zero, not an error, matching Claim.claim_payout's equivalent case."""
    vm = VMContext()
    creator, alice, bob = create_test_addresses(3)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = alice
        vm.value = 100
        id_win = lens.submit_interpretation("Correct read.", "{}")
        vm.sender = bob
        vm.value = 50
        id_lose = lens.submit_interpretation("Wrong read.", "{}")

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
