"""Direct-mode tests for Lens.add_source() -- permissionless, append-only
source governance (see contracts/Lens.py's class docstring)."""

from gltest.direct import VMContext, deploy_contract, create_test_addresses

from conftest import LENS_PATH

SOURCES = ["https://example.com/feed", "https://example.org/feed"]


def _deploy_open_lens(vm, creator):
    vm.sender = creator
    return deploy_contract(LENS_PATH, vm, SOURCES, "market", "Title", "Desc")


def test_add_source_is_permissionless():
    """Anyone -- not just the creator -- can add a corroborating source.
    This is the "challenge path": if a Lens's initial sources look narrow
    or biased, add a legitimate corroborating/contradicting source yourself
    rather than needing the creator's cooperation."""
    vm = VMContext()
    creator, outsider = create_test_addresses(2)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = outsider
        lens.add_source("https://example.net/independent-feed")
        info = lens.get_lens_info()
        assert "https://example.net/independent-feed" in info["sources"]
        assert len(info["sources"]) == 3


def test_add_source_rejects_duplicate():
    vm = VMContext()
    creator, = create_test_addresses(1)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = creator
        with vm.expect_revert("already added"):
            lens.add_source(SOURCES[0])


def test_add_source_rejects_bad_url():
    vm = VMContext()
    creator, = create_test_addresses(1)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = creator
        with vm.expect_revert("http(s)"):
            lens.add_source("not-a-url")


def test_add_source_enforces_max_sources():
    vm = VMContext()
    creator, = create_test_addresses(1)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = creator
        lens.add_source("https://example.net/3")
        lens.add_source("https://example.net/4")
        lens.add_source("https://example.net/5")
        assert len(lens.get_lens_info()["sources"]) == 5
        with vm.expect_revert("maximum"):
            lens.add_source("https://example.net/6")


def test_add_source_rejected_after_close():
    vm = VMContext()
    creator, = create_test_addresses(1)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        vm.sender = creator
        lens.close_lens()
        with vm.expect_revert("Lens is closed"):
            lens.add_source("https://example.net/late")


def test_there_is_no_remove_source_method():
    """Sources are append-only by design -- a creator must not be able to
    quietly remove an inconvenient source someone else added as a
    corroboration/challenge. Confirmed by absence: no remove/delete method
    exists on the deployed contract's public interface."""
    vm = VMContext()
    creator, = create_test_addresses(1)
    with vm.activate():
        lens = _deploy_open_lens(vm, creator)
        assert not hasattr(lens, "remove_source")
        assert not hasattr(lens, "delete_source")
