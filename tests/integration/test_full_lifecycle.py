"""
Integration tests against a real GenLayer node (Studio or Bradbury testnet).

These are the only tests in this repo that exercise gl.deploy_contract (the
LensFactory -> Lens on-chain factory pattern), since gltest's direct-mode
WASI mock has no default support for cross-contract deploy (see
tests/direct/test_factory_validation.py's module docstring).

Requires a configured gltest.config.yaml pointing at a live node and funded
test accounts. Run with: gltest tests/integration -v
"""

from pathlib import Path

import pytest

CONTRACTS_DIR = Path(__file__).resolve().parents[2] / "contracts"
LENS_PATH = CONTRACTS_DIR / "Lens.py"
LENS_FACTORY_PATH = CONTRACTS_DIR / "LensFactory.py"

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def factory(get_contract_factory, accounts):
    """Deploy a fresh LensFactory with the real Lens.py source embedded,
    exactly as deploy/001_deploy_lens_factory.ts does for a real network
    deployment."""
    lens_code = LENS_PATH.read_text(encoding="utf-8")
    contract_factory = get_contract_factory(contract_file_path=str(LENS_FACTORY_PATH))
    return contract_factory.deploy(args=[lens_code, 0])


def test_create_lens_spawns_readable_child_contract(factory, accounts):
    creator = accounts[0]
    address_hex = factory.connect(creator).create_lens(
        ["https://en.wikipedia.org/wiki/Bitcoin"],
        "research",
        "Integration test Lens",
        "Spawned by the automated integration suite.",
    )
    assert address_hex.startswith("0x")

    lenses = factory.get_lenses()
    assert address_hex in lenses

    meta = factory.get_lens_meta(address_hex)
    assert meta["title"] == "Integration test Lens"


def test_factory_owner_is_informational_and_matches_deployer(factory, accounts):
    """get_owner() is provenance-only -- LensFactory has no admin-gated write
    anywhere (create_lens is intentionally permissionless, gated by the
    creation stake, not an allowlist). This just confirms the stored value
    is what it claims to be: whoever deployed this factory."""
    deployer = accounts[0]
    assert factory.get_owner().lower() == deployer.lower()


def test_deploy_lens_rejects_missing_type(factory, accounts):
    creator = accounts[0]
    with pytest.raises(Exception, match="interpretation_type"):
        factory.connect(creator).create_lens(
            ["https://example.com"], "", "Q?", "desc",
        )


def test_submit_and_adjudicate_end_to_end(factory, accounts, get_contract_factory):
    """End-to-end: spawn a Lens via the factory, two participants submit
    competing interpretations of a page whose content is stable and
    verifiable (a static arithmetic fact page), adjudicate() runs a real
    Equivalence Principle consensus round against live evidence, and the
    live output plus settlement math are confirmed against the real chain."""
    creator = accounts[0]
    alice = accounts[1]
    bob = accounts[2]

    lens_address = factory.connect(creator).create_lens(
        ["https://en.wikipedia.org/wiki/2_%2B_2"],
        "research",
        "Does 2 + 2 equal 4?",
        "Tracks whether the cited page confirms basic arithmetic.",
    )
    lens = get_contract_factory(contract_file_path=str(LENS_PATH)).build_contract(
        contract_address=lens_address
    )

    id_correct = lens.connect(alice).submit_interpretation(
        "The page confirms 2 + 2 = 4, standard arithmetic.",
        '{"claim": "2+2=4"}',
    )
    lens.connect(bob).submit_interpretation(
        "The page shows 2 + 2 = 5.",
        '{"claim": "2+2=5"}',
    )

    winner = lens.connect(creator).adjudicate()
    assert winner == id_correct

    live = lens.get_live_interpretation()
    assert live["has_live"] is True
    assert live["interpretation"]["id"] == id_correct

    lens.connect(creator).settle("1")
    claimable = lens.get_claimable("1", alice)
    assert int(claimable) > 0

    lens.connect(alice).claim("1")
    assert lens.is_claimed("1", alice) is True

    with pytest.raises(Exception, match="No stake"):
        lens.connect(accounts[3]).claim("1")
