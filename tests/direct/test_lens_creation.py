"""Direct-mode tests for Lens.__init__ validation."""

from gltest.direct import VMContext, deploy_contract, create_test_addresses

from conftest import LENS_PATH, to_hex

SOURCES = ["https://example.com/feed", "https://example.org/feed"]


def _deploy(vm, *args):
    return deploy_contract(LENS_PATH, vm, *args)


def test_valid_lens_deploys_active_and_open():
    vm = VMContext()
    creator, = create_test_addresses(1)
    with vm.activate():
        vm.sender = creator
        lens = _deploy(vm, SOURCES, "market", "BTC Dominance Trend", "Tracks the live narrative around BTC dominance.")
        info = lens.get_lens_info()
        assert info["status"] == "active"
        assert info["current_round"] == "1"
        assert info["sources"] == SOURCES
        assert info["interpretation_type"] == "market"
        assert info["title"] == "BTC Dominance Trend"
        assert info["address_creator"].lower() == to_hex(creator).lower()
        assert info["live_interpretation_id"] == ""
        assert info["interpretation_count"] == "0"


def test_requires_at_least_two_sources():
    vm = VMContext()
    with vm.activate():
        with vm.expect_revert("At least 2 sources"):
            _deploy(vm, ["https://example.com/feed"], "market", "Title", "Desc")


def test_rejects_empty_sources():
    vm = VMContext()
    with vm.activate():
        with vm.expect_revert("At least 2 sources"):
            _deploy(vm, [], "market", "Title", "Desc")


def test_rejects_too_many_sources():
    vm = VMContext()
    with vm.activate():
        with vm.expect_revert("At most"):
            _deploy(vm, [f"https://example.com/{i}" for i in range(6)], "market", "Title", "Desc")


def test_rejects_non_http_source():
    vm = VMContext()
    with vm.activate():
        with vm.expect_revert("http(s)"):
            _deploy(vm, ["https://example.com/feed", "ftp://example.com/feed"], "market", "Title", "Desc")


def test_rejects_duplicate_sources():
    vm = VMContext()
    with vm.activate():
        with vm.expect_revert("unique"):
            _deploy(vm, ["https://example.com/feed", "https://example.com/feed"], "market", "Title", "Desc")


def test_requires_interpretation_type():
    vm = VMContext()
    with vm.activate():
        with vm.expect_revert("interpretation_type"):
            _deploy(vm, SOURCES, "", "Title", "Desc")


def test_requires_title():
    vm = VMContext()
    with vm.activate():
        with vm.expect_revert("Title"):
            _deploy(vm, SOURCES, "market", "", "Desc")


def test_description_is_optional():
    vm = VMContext()
    creator, = create_test_addresses(1)
    with vm.activate():
        vm.sender = creator
        lens = _deploy(vm, SOURCES, "market", "Title", "")
        assert lens.get_lens_info()["description"] == ""


def test_round_one_starts_open_with_opened_at_recorded():
    vm = VMContext()
    creator, = create_test_addresses(1)
    with vm.activate():
        vm.sender = creator
        lens = _deploy(vm, SOURCES, "market", "Title", "Desc")
        round_info = lens.get_round_info("1")
        assert round_info["status"] == "open"
        assert round_info["pool"] == "0"
        assert round_info["interpretation_ids"] == []
        assert int(round_info["opened_at"]) > 0
