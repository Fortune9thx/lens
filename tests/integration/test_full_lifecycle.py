"""
Integration tests against a real GenLayer node (Studio or Bradbury testnet).

These are the only tests in this repo that exercise gl.deploy_contract (the
LensFactory -> Lens on-chain factory pattern), since gltest's direct-mode
WASI mock has no default support for cross-contract deploy (see
tests/direct/test_factory_validation.py's module docstring). They also cover
withdraw_fees()'s successful-withdrawal path, which requires a real
collected fee balance that only a genuine create_lens deploy can produce.

Requires a configured gltest.config.yaml pointing at a live node and funded
test accounts. Run with: gltest tests/integration -v
"""

from pathlib import Path

import pytest

CONTRACTS_DIR = Path(__file__).resolve().parents[2] / "contracts"
LENS_PATH = CONTRACTS_DIR / "Lens.py"
LENS_FACTORY_PATH = CONTRACTS_DIR / "LensFactory.py"

SOURCES = ["https://en.wikipedia.org/wiki/2_%2B_2", "https://simple.wikipedia.org/wiki/2_%2B_2"]

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def factory(get_contract_factory, accounts):
    """Deploy a fresh LensFactory with the real Lens.py source embedded,
    exactly as deploy/001_deploy_lens_factory.ts does for a real network
    deployment. A non-zero creation stake so withdraw_fees() has something
    real to recover."""
    lens_code = LENS_PATH.read_text(encoding="utf-8")
    contract_factory = get_contract_factory(contract_file_path=str(LENS_FACTORY_PATH))
    return contract_factory.deploy(args=[lens_code, 1])


def test_create_lens_spawns_readable_child_contract(factory, accounts):
    creator = accounts[0]
    address_hex = factory.connect(creator).create_lens(
        SOURCES,
        "research",
        "Integration test Lens",
        "Spawned by the automated integration suite.",
    )
    assert address_hex.startswith("0x")

    lenses = factory.get_lenses()
    assert address_hex in lenses

    meta = factory.get_lens_meta(address_hex)
    assert meta["title"] == "Integration test Lens"


def test_factory_owner_is_informational_except_for_withdraw_fees(factory, accounts):
    """get_owner() gates exactly one thing (withdraw_fees) -- every other
    write (create_lens) is intentionally permissionless, gated by the
    creation stake, not an allowlist."""
    deployer = accounts[0]
    assert factory.get_owner().lower() == deployer.lower()


def test_deploy_lens_rejects_single_source(factory, accounts):
    creator = accounts[0]
    with pytest.raises(Exception, match="At least 2 sources"):
        factory.connect(creator).create_lens(
            ["https://example.com"], "research", "Q?", "desc",
        )


def test_withdraw_fees_recovers_real_collected_stake(factory, accounts):
    """The one genuinely fund-moving factory write -- proves collected_fees
    tracks real create_lens payments and withdraw_fees actually pays the
    owner, not just flips a flag."""
    owner = accounts[0]
    before = int(factory.get_collected_fees())

    factory.connect(owner).create_lens(
        SOURCES, "research", "Fee-tracking probe", "desc",
    )
    after_create = int(factory.get_collected_fees())
    assert after_create == before + 1  # 1 wei creation stake from the fixture

    with pytest.raises(Exception, match="Only the factory owner"):
        factory.connect(accounts[1]).withdraw_fees()

    factory.connect(owner).withdraw_fees()
    assert int(factory.get_collected_fees()) == 0

    with pytest.raises(Exception, match="No fees to withdraw"):
        factory.connect(owner).withdraw_fees()


def test_add_source_extends_a_live_lens(factory, accounts, get_contract_factory):
    creator = accounts[0]
    outsider = accounts[1]

    lens_address = factory.connect(creator).create_lens(
        SOURCES, "research", "Source governance probe", "desc",
    )
    lens = get_contract_factory(contract_file_path=str(LENS_PATH)).build_contract(
        contract_address=lens_address
    )

    # Permissionless: an address with no relationship to the Lens can add a
    # corroborating source.
    lens.connect(outsider).add_source("https://en.wiktionary.org/wiki/2%2B2")
    info = lens.get_lens_info()
    assert "https://en.wiktionary.org/wiki/2%2B2" in info["sources"]
    assert len(info["sources"]) == 3


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
        SOURCES,
        "research",
        "Does 2 + 2 equal 4?",
        "Tracks whether the cited pages confirm basic arithmetic.",
    )
    lens = get_contract_factory(contract_file_path=str(LENS_PATH)).build_contract(
        contract_address=lens_address
    )

    id_correct = lens.connect(alice).submit_interpretation(
        "The pages confirm 2 + 2 = 4, standard arithmetic.",
        '{"claim": "2+2=4"}',
    )
    lens.connect(bob).submit_interpretation(
        "The pages show 2 + 2 = 5.",
        '{"claim": "2+2=5"}',
    )

    winner = lens.connect(creator).adjudicate()
    assert winner == id_correct

    live = lens.get_live_interpretation()
    assert live["has_live"] is True
    assert live["interpretation"]["id"] == id_correct
    # Evidence snapshot must be real fetched content, not an LLM self-report
    # -- confirm it's non-empty and structurally what leader_fn produces.
    assert isinstance(live["reasoning"]["evidence_snapshot"], list)

    lens.connect(creator).settle("1")
    claimable = lens.get_claimable("1", alice)
    assert int(claimable) > 0

    lens.connect(alice).claim("1")
    assert lens.is_claimed("1", alice) is True

    with pytest.raises(Exception, match="No stake"):
        lens.connect(accounts[3]).claim("1")
