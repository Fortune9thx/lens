# Agent SDK

Lens has no separate "agent API" — every flow below is the exact `genlayer-js` call the frontend
itself makes (`frontend/lib/lens-calls.ts`). An agent is just a caller with its own private key
instead of a browser wallet, and the read path needs no key at all.

## Install

```bash
npm install genlayer-js
```

## Read a Lens's live output

This is the one call that matters most to an external reader — no API key, no oracle middleman,
just a direct read against a GenLayer contract.

```ts
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

// Read-only: no `account` passed. This is a real, keyless client, not a
// stub -- never construct a read client with a fresh ephemeral account.
const client = createClient({ chain: testnetBradbury });

const output = await client.readContract({
  address: "0xLensAddress",
  functionName: "get_live_interpretation",
  args: [],
});

// {
//   has_live: boolean,
//   interpretation: { id, round, author, content, structured_claims, total_stake, backer_count, created_at },
//   reasoning: {
//     reasoning, confidence, evaluated_at, sources_checked,
//     outcome: "decided" | "inconclusive",
//     evidence_snapshot: { url: string, excerpt: string }[],  // deterministically
//       // sliced from the ACTUAL fetched content in contract code -- never
//       // an LLM self-report, so you can independently sanity-check the
//       // reasoning against what was really fetched.
//   },
// }
// confidence is a decimal STRING ("0.85"), never a float -- GenVM calldata
// has no float type. Parse with Number()/parseFloat() yourself.
if (output.has_live) {
  console.log(output.interpretation.content, output.reasoning.confidence);
}
```

**Verify before you trust it.** `has_live: true` only means *some* round produced a decided winner
at some point — it does not mean the *current* round was decided. Check `get_round_info(current_round)`
if you need to know whether adjudication is still pending, and always check `reasoning.outcome` /
`reasoning.confidence` rather than assuming a high-stakes decision was well-supported.

## Open a Lens

```ts
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const account = createAccount(process.env.AGENT_PRIVATE_KEY);
const client = createClient({ chain: testnetBradbury, account });

const hash = await client.writeContract({
  address: FACTORY_ADDRESS,
  functionName: "create_lens",
  args: [
    // At least 2 sources are required -- LensFactory/Lens both reject a
    // single source, since one (possibly self-controlled) URL isn't
    // enough to adjudicate against.
    ["https://example.com/live-feed", "https://example.org/live-feed"],
    "market",                          // interpretation_type
    "BTC Dominance Trend",             // title
    "Tracks the live narrative around BTC dominance.", // description
  ],
  value: 0n, // creation stake, in wei -- check get_creation_stake() first
});

await client.waitForTransactionReceipt({ hash, status: "FINALIZED" });
```

`create_lens`'s decoded return value is the new Lens contract's address. Since decoding a write
method's own return value from the receipt isn't a stable, documented shape across SDK versions,
the more robust way to resolve it is to read `LensFactory.get_lenses()` before and after — the
registry is append-only, so the new address is whatever appears at the index the list's length was
before your transaction. See `frontend/lib/lens-calls.ts`'s `waitForNewLens` for the exact pattern
this app uses. Always wait for `FINALIZED`, not just `ACCEPTED`, before treating the new address as
real and durable -- `ACCEPTED` can still be appealed and reversed.

## Add a corroborating source

Permissionless — you don't need to be the creator, or have any prior relationship to the Lens.

```ts
await client.writeContract({
  address: lensAddress,
  functionName: "add_source",
  args: ["https://an-independent-source.example.com"],
  value: 0n,
});
```

Sources are append-only: there is no remove method, by design. If you think a Lens's evidence base
looks narrow or biased, this is the actual "challenge path" — add a source yourself rather than
needing the creator's cooperation.

## Submit an interpretation

```ts
const hash = await client.writeContract({
  address: lensAddress,
  functionName: "submit_interpretation",
  args: [
    "Dominance is trending up on sustained ETF inflows.",
    JSON.stringify({ direction: "up", driver: "etf_inflows" }),
  ],
  value: 1_000000000000000000n, // 1 GEN, staked behind this interpretation
});
```

## Back an existing interpretation

```ts
await client.writeContract({
  address: lensAddress,
  functionName: "back_interpretation",
  args: [interpretationId],
  value: 5_00000000000000000n, // 0.5 GEN
});
```

## Trigger adjudication

Anyone can call `adjudicate()` once at least one interpretation has been submitted in the current
round — there's no special "adjudicator" role. This is the heaviest call in the contract (a full
multi-source web fetch + LLM reasoning round, re-run independently by every validator), so raise
`consensusMaxRotations` above the SDK default if you're calling it programmatically:

```ts
const hash = await client.writeContract({
  address: lensAddress,
  functionName: "adjudicate",
  args: [],
  value: 0n,
  consensusMaxRotations: 5,
});

// adjudicate()'s output (the new live interpretation, if any) is exactly
// the kind of state an external agent or contract may act on -- wait for
// FINALIZED, not just ACCEPTED, before treating a new live output as
// settled.
const receipt = await client.waitForTransactionReceipt({ hash, status: "FINALIZED" });

// adjudicate() returns "" when the round went inconclusive (no fetchable
// evidence, or confidence below the bar) -- check get_round_info(round)
// to distinguish "decided" from "inconclusive" rather than assuming a
// winner was always produced.
```

## Settle, claim, or refund

```ts
const info = await client.readContract({
  address: lensAddress, functionName: "get_round_info", args: [round],
});

if (info.status === "adjudicated") {
  await client.writeContract({
    address: lensAddress, functionName: "settle", args: [round], value: 0n,
  });
}

// For "settled", "inconclusive", AND "cancelled" rounds alike -- claim()
// pays a parimutuel share for a settled round, or a straight refund of
// your own stake for an inconclusive/cancelled one. Same call either way.
const claimable = await client.readContract({
  address: lensAddress, functionName: "get_claimable", args: [round, myAddress],
});
if (claimable !== "0") {
  await client.writeContract({
    address: lensAddress, functionName: "claim", args: [round], value: 0n,
  });
}
```

If a round has sat open for more than 24 hours with nobody adjudicating it, anyone can unlock
refunds for it:

```ts
await client.writeContract({
  address: lensAddress, functionName: "cancel_round", args: [round], value: 0n,
});
```

## Poll for the next adjudication

```ts
async function waitForNextAdjudication(lensAddress: `0x${string}`, sinceRound: string) {
  while (true) {
    const info = await client.readContract({
      address: lensAddress,
      functionName: "get_lens_info",
      args: [],
    });
    if (info.live_round !== sinceRound) return info;
    await new Promise((r) => setTimeout(r, 5000));
  }
}
```

## Full method reference

| Contract | Method | Kind | Notes |
| --- | --- | --- | --- |
| LensFactory | `create_lens` | write, payable | Returns new Lens address (see resolution note above); requires ≥2 sources |
| LensFactory | `withdraw_fees` | write | Owner-only. Recovers accumulated creation stakes -- the one privileged action in this system |
| LensFactory | `get_lenses` | view | All Lens addresses, append-only |
| LensFactory | `get_lenses_count` | view | |
| LensFactory | `get_lenses_page` | view | `(offset, limit)` |
| LensFactory | `get_lens_meta` | view | Creation-time metadata, not live status |
| LensFactory | `get_lenses_by_type` | view | |
| LensFactory | `get_lenses_by_creator` | view | |
| LensFactory | `get_creation_stake` | view | |
| LensFactory | `get_collected_fees` | view | Undistributed balance `withdraw_fees` would pay out |
| Lens | `add_source` | write | Permissionless, append-only, up to `MAX_SOURCES` (5) |
| Lens | `submit_interpretation` | write, payable | Returns new interpretation id |
| Lens | `back_interpretation` | write, payable | Add stake behind an existing interpretation, current round only |
| Lens | `adjudicate` | write | Callable by anyone once the round has ≥1 interpretation. Returns `""` on an inconclusive round |
| Lens | `cancel_round` | write | `(round)` — permissionless, only after `ROUND_TIMEOUT_SECONDS` (24h) with no adjudication |
| Lens | `settle` | write | `(round)` — unlocks `claim()` for an *adjudicated* round only |
| Lens | `claim` | write | `(round)` — parimutuel payout (settled) or full refund (inconclusive/cancelled) |
| Lens | `close_lens` | write | Creator-only; stops new submissions/backing/adjudication and immediately cancels the current round if it's still open |
| Lens | `get_lens_info` | view | Full state |
| Lens | `get_live_interpretation` | view | The single most important call for external readers |
| Lens | `get_interpretation` | view | `(interpretation_id)` |
| Lens | `get_round_interpretations` | view | `(round)` |
| Lens | `get_round_info` | view | `(round)` — status, opened_at, pool, winner, reasoning |
| Lens | `get_adjudication_log` | view | Full history, most recent 50 |
| Lens | `get_backing` | view | `(round, interpretation_id, address)` |
| Lens | `get_claimable` | view | `(round, address)` — preview before claiming, correct for both payout and refund cases |
| Lens | `is_claimed` | view | `(round, address)` |

## Settling against a Lens from another GenLayer contract

Cross-contract calls are verified reliable in the **read** direction (`.view()`) and confirmed to
silently no-op in the **write** direction on Bradbury — so a settling contract always pulls, never
expects to be pushed to. This must happen **outside** any nondeterministic block (cross-contract
calls are forbidden inside one; GenVM raises `SystemError: 6`).

```python
from genlayer import *
import genlayer.gl as gl

class MyContract(gl.Contract):
    @gl.public.write
    def act_on_lens(self, lens_address: str):
        live = gl.get_contract_at(Address(lens_address)).view().get_live_interpretation()
        if not live["has_live"]:
            raise gl.vm.UserError("Lens has no live output yet.")

        confidence = float(live["reasoning"]["confidence"])
        if confidence < 0.7:
            raise gl.vm.UserError("Confidence too low to act on.")

        # ... your own logic against live["interpretation"]["structured_claims"]
```
