"""
Direct-mode tests for LensFactory -- validation guard clauses, and the
withdraw_fees() recovery path.

Scope note: create_lens's actual gl.deploy_contract call (spawning a child
Lens) is NOT exercised here. gltest's direct-mode WASI mock has no default
handler for cross-contract DeployContract calls (confirmed by reading
gltest/direct/wasi_mock.py -- CallContract/DeployContract route through an
optional _gl_call_hook that only "glsim" mode installs, and this gltest
version ships no default implementation). Every guard clause below reverts
BEFORE the deploy_contract call is ever reached, so it's fully testable in
direct mode; the success path (a real spawned, readable child Lens) is
integration-test-only -- see tests/integration/test_full_lifecycle.py.
"""

from gltest.direct import VMContext, deploy_contract, create_test_addresses

from conftest import LENS_FACTORY_PATH, LENS_PATH, to_hex

SOURCES = ["https://example.com/feed", "https://example.org/feed"]


def _deploy_factory(vm, owner, creation_stake=0):
    vm.sender = owner
    lens_code = LENS_PATH.read_text(encoding="utf-8")
    return deploy_contract(LENS_FACTORY_PATH, vm, lens_code, creation_stake)


def test_factory_deploys_with_owner_and_stake():
    vm = VMContext()
    owner, = create_test_addresses(1)
    with vm.activate():
        factory = _deploy_factory(vm, owner, creation_stake=100)
        assert factory.get_creation_stake() == "100"
        assert factory.get_lenses_count() == 0
        assert factory.get_collected_fees() == "0"


def test_factory_requires_lens_code():
    vm = VMContext()
    with vm.activate():
        with vm.expect_revert("Missing Lens contract source"):
            deploy_contract(LENS_FACTORY_PATH, vm, "", 0)


def test_create_lens_rejects_insufficient_stake():
    vm = VMContext()
    owner, alice = create_test_addresses(2)
    with vm.activate():
        factory = _deploy_factory(vm, owner, creation_stake=100)
        vm.sender = alice
        vm.value = 50
        with vm.expect_revert("stake too low"):
            factory.create_lens(SOURCES, "market", "Title", "Desc")


def test_create_lens_rejects_single_source():
    vm = VMContext()
    owner, alice = create_test_addresses(2)
    with vm.activate():
        factory = _deploy_factory(vm, owner, creation_stake=0)
        vm.sender = alice
        vm.value = 0
        with vm.expect_revert("At least 2 sources"):
            factory.create_lens(["https://example.com/feed"], "market", "Title", "Desc")


def test_create_lens_rejects_no_sources():
    vm = VMContext()
    owner, alice = create_test_addresses(2)
    with vm.activate():
        factory = _deploy_factory(vm, owner, creation_stake=0)
        vm.sender = alice
        vm.value = 0
        with vm.expect_revert("At least 2 sources"):
            factory.create_lens([], "market", "Title", "Desc")


def test_create_lens_rejects_bad_url():
    vm = VMContext()
    owner, alice = create_test_addresses(2)
    with vm.activate():
        factory = _deploy_factory(vm, owner, creation_stake=0)
        vm.sender = alice
        vm.value = 0
        with vm.expect_revert("http(s)"):
            factory.create_lens(["https://example.com/feed", "not-a-url"], "market", "Title", "Desc")


def test_create_lens_rejects_missing_type():
    vm = VMContext()
    owner, alice = create_test_addresses(2)
    with vm.activate():
        factory = _deploy_factory(vm, owner, creation_stake=0)
        vm.sender = alice
        vm.value = 0
        with vm.expect_revert("interpretation_type"):
            factory.create_lens(SOURCES, "", "Title", "Desc")


def test_create_lens_rejects_missing_title():
    vm = VMContext()
    owner, alice = create_test_addresses(2)
    with vm.activate():
        factory = _deploy_factory(vm, owner, creation_stake=0)
        vm.sender = alice
        vm.value = 0
        with vm.expect_revert("Title is required"):
            factory.create_lens(SOURCES, "market", "", "Desc")


def test_get_owner_matches_deployer():
    vm = VMContext()
    owner, = create_test_addresses(1)
    with vm.activate():
        factory = _deploy_factory(vm, owner, creation_stake=0)
        assert factory.get_owner().lower() == to_hex(owner).lower()


# ------------------------------------------------------------------
# withdraw_fees() -- the factory-creation-fee recovery path
# ------------------------------------------------------------------

def test_withdraw_fees_only_owner():
    vm = VMContext()
    owner, alice = create_test_addresses(2)
    with vm.activate():
        factory = _deploy_factory(vm, owner, creation_stake=0)
        vm.sender = alice
        with vm.expect_revert("Only the factory owner"):
            factory.withdraw_fees()


def test_withdraw_fees_rejects_when_nothing_collected():
    vm = VMContext()
    owner, = create_test_addresses(1)
    with vm.activate():
        factory = _deploy_factory(vm, owner, creation_stake=0)
        vm.sender = owner
        with vm.expect_revert("No fees to withdraw"):
            factory.withdraw_fees()
