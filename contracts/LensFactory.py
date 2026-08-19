# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from datetime import datetime

from genlayer import *
import genlayer.gl as gl

MAX_SOURCES = 5
MAX_URL_LEN = 500
MAX_TITLE_LEN = 140
MAX_DESC_LEN = 1000
MAX_TYPE_LEN = 40


def _consensus_now() -> int:
    """Unix timestamp from the transaction's own message context (identical
    for every validator), not each node's local wall clock."""
    raw = gl.message_raw["datetime"]
    return int(datetime.fromisoformat(str(raw).replace("Z", "+00:00")).timestamp())


def _normalize_address(addr: str) -> str:
    """TreeMap keys and equality comparisons against caller-supplied address
    strings use this everywhere -- see Lens.py's copy of this helper for the
    full rationale (Address.as_hex is an EIP-55-style checksum; comparing it
    against raw unnormalized caller input is a real, confirmed GenLayer
    rejection pattern)."""
    return addr.strip().lower()


class LensFactory(gl.Contract):
    """
    Registry + on-chain factory for Lens interpretation engines.

    Deploys a fresh `Lens` contract instance per Lens via gl.deploy_contract,
    mirroring the verified genlayerlabs/intelligent-oracle Registry pattern
    (same dependency hash, confirmed real deploy_contract() API). Registry
    metadata is intentionally read-only creation-time data (sources, type,
    title, creator) -- live status/round/live-interpretation state is never
    mirrored here and must be read directly from the Lens contract, since
    Lens.adjudicate() changes that state continuously after deployment and
    this contract has no reliable way to be pushed updates from it (inline
    cross-contract writes are confirmed to silently no-op on Bradbury; see
    docs/ARCHITECTURE.md). Every write on this contract and on every Lens it
    spawns is permissionless, economically gated by the creation stake and
    interpretation staking rather than by an admin allowlist -- `owner` is
    informational provenance only, it gates nothing.
    """

    lens_code: str
    creation_stake: u256
    owner: Address
    lens_addresses: DynArray[str]
    # lens_address_hex(normalized) -> JSON {address, sources, interpretation_type,
    #                                        title, description, creator, created_at, stake}
    lens_meta: TreeMap[str, str]

    def __init__(self, lens_code: str, creation_stake: u256):
        if not lens_code:
            raise gl.vm.UserError("Missing Lens contract source code.")
        self.lens_code = lens_code
        self.creation_stake = creation_stake
        self.owner = gl.message.sender_address

    @gl.public.write.payable
    def create_lens(
        self,
        sources: list[str],
        interpretation_type: str,
        title: str,
        description: str,
    ) -> str:
        if gl.message.value < self.creation_stake:
            raise gl.vm.UserError(
                f"Creation stake too low: sent {gl.message.value}, requires {self.creation_stake}"
            )
        if not sources:
            raise gl.vm.UserError("At least one source is required.")
        if len(sources) > MAX_SOURCES:
            raise gl.vm.UserError(f"At most {MAX_SOURCES} sources are allowed.")
        if any(
            len(u) > MAX_URL_LEN or not (u.strip().startswith("http://") or u.strip().startswith("https://"))
            for u in sources
        ):
            raise gl.vm.UserError(f"Sources must be http(s) URLs, each at most {MAX_URL_LEN} characters.")
        if not interpretation_type or len(interpretation_type) > MAX_TYPE_LEN:
            raise gl.vm.UserError(f"interpretation_type is required and must be at most {MAX_TYPE_LEN} characters.")
        if not title or len(title) > MAX_TITLE_LEN:
            raise gl.vm.UserError(f"Title is required and must be at most {MAX_TITLE_LEN} characters.")
        if len(description) > MAX_DESC_LEN:
            raise gl.vm.UserError(f"Description exceeds {MAX_DESC_LEN} characters.")

        registered = len(self.lens_addresses)
        contract_address = gl.deploy_contract(
            code=self.lens_code.encode("utf-8"),
            args=[sources, interpretation_type, title, description],
            salt_nonce=registered + 1,
        )
        address_hex = contract_address.as_hex
        self.lens_addresses.append(address_hex)

        meta = {
            "address": address_hex,
            "sources": sources,
            "interpretation_type": interpretation_type,
            "title": title,
            "description": description,
            "creator": gl.message.sender_address.as_hex,
            "created_at": str(_consensus_now()),
            "stake": str(int(gl.message.value)),
        }
        self.lens_meta[_normalize_address(address_hex)] = json.dumps(meta)
        return address_hex

    @gl.public.view
    def get_owner(self) -> str:
        return self.owner.as_hex

    @gl.public.view
    def get_creation_stake(self) -> str:
        return str(int(self.creation_stake))

    @gl.public.view
    def get_lenses(self) -> list[str]:
        return list(self.lens_addresses)

    @gl.public.view
    def get_lenses_count(self) -> int:
        return len(self.lens_addresses)

    @gl.public.view
    def get_lenses_page(self, offset: int, limit: int) -> list[str]:
        if offset < 0 or limit <= 0:
            return []
        addresses = list(self.lens_addresses)
        return addresses[offset : offset + limit]

    @gl.public.view
    def get_lens_meta(self, address: str) -> dict:
        raw = self.lens_meta.get(_normalize_address(address), "")
        if not raw:
            raise gl.vm.UserError("Unknown Lens address.")
        return json.loads(raw)

    @gl.public.view
    def get_lenses_by_creator(self, creator_address: str) -> list[str]:
        target = _normalize_address(creator_address)
        matches = []
        for address_hex in self.lens_addresses:
            raw = self.lens_meta.get(_normalize_address(address_hex), "")
            if not raw:
                continue
            meta = json.loads(raw)
            if _normalize_address(meta.get("creator", "")) == target:
                matches.append(address_hex)
        return matches

    @gl.public.view
    def get_lenses_by_type(self, interpretation_type: str) -> list[str]:
        matches = []
        for address_hex in self.lens_addresses:
            raw = self.lens_meta.get(_normalize_address(address_hex), "")
            if not raw:
                continue
            meta = json.loads(raw)
            if meta.get("interpretation_type", "") == interpretation_type:
                matches.append(address_hex)
        return matches
