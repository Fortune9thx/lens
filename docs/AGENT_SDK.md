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
//   reasoning: { reasoning, confidence, evidence_snapshot, evaluated_at, sources_checked },
// }
// confidence is a decimal STRING ("0.85"), never a float -- GenVM calldata
// has no float type. Parse with Number()/parseFloat() yourself.
if (output.has_live) {
  console.log(output.interpretation.content, output.reasoning.confidence);
}
```

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
    ["https://example.com/live-feed"], // sources
    "market",                          // interpretation_type
    "BTC Dominance Trend",             // title
    "Tracks the live narrative around BTC dominance.", // description
  ],
  value: 0n, // creation stake, in wei -- check get_creation_stake() first
});

await client.waitForTransactionReceipt({ hash });
```

`create_lens`'s decoded return value is the new Lens contract's address. Since decoding a write
method's own return value from the receipt isn't a stable, documented shape across SDK versions,
the more robust way to resolve it is to read `LensFactory.get_lenses()` before and after — the
registry is append-only, so the new address is whatever appears at the index the list's length was
before your transaction. See `frontend/lib/lens-calls.ts`'s `waitForNewLens` for the exact pattern
this app uses.

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

// adjudicate()'s output (the new live interpretation) is exactly the kind
// of state an external agent or contract may act on -- wait for FINALIZED,
// not just ACCEPTED, before treating the new live output as settled.
await client.waitForTransactionReceipt({ hash, status: "FINALIZED" });
```

## Settle and claim

```ts
await client.writeContract({
  address: lensAddress,
  functionName: "settle",
  args: [round],
  value: 0n,
});

const claimable = await client.readContract({
  address: lensAddress,
  functionName: "get_claimable",
  args: [round, myAddress],
});

if (claimable !== "0") {
  await client.writeContract({
    address: lensAddress,
    functionName: "claim",
    args: [round],
    value: 0n,
  });
}
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
| LensFactory | `create_lens` | write, payable | Returns new Lens address (see resolution note above) |
| LensFactory | `get_lenses` | view | All Lens addresses, append-only |
| LensFactory | `get_lenses_count` | view | |
| LensFactory | `get_lenses_page` | view | `(offset, limit)` |
| LensFactory | `get_lens_meta` | view | Creation-time metadata, not live status |
| LensFactory | `get_lenses_by_type` | view | |
| LensFactory | `get_lenses_by_creator` | view | |
| LensFactory | `get_creation_stake` | view | |
| Lens | `submit_interpretation` | write, payable | Returns new interpretation id |
| Lens | `back_interpretation` | write, payable | Add stake behind an existing interpretation, current round only |
| Lens | `adjudicate` | write | Callable by anyone once the round has ≥1 interpretation |
| Lens | `settle` | write | `(round)` — unlocks `claim()` for that round |
| Lens | `claim` | write | `(round)` — pull-based parimutuel payout |
| Lens | `close_lens` | write | Creator-only; stops new submissions/backing/adjudication |
| Lens | `get_lens_info` | view | Full state |
| Lens | `get_live_interpretation` | view | The single most important call for external readers |
| Lens | `get_interpretation` | view | `(interpretation_id)` |
| Lens | `get_round_interpretations` | view | `(round)` |
| Lens | `get_round_info` | view | `(round)` — status, pool, winner, reasoning |
| Lens | `get_adjudication_log` | view | Full history, most recent 50 |
| Lens | `get_backing` | view | `(round, interpretation_id, address)` |
| Lens | `get_claimable` | view | `(round, address)` — preview before claiming |
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
