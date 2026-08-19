"use client";

import { useState } from "react";
import { Code2, Check, Copy, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getLensFactoryAddress, isLensFactoryDeployed } from "@/lib/contracts";

function CodeBlock({ filename, code }: { filename: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-border-strong bg-fg shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-xs text-white/50">
          <Code2 className="h-3 w-3" /> {filename}
        </span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex items-center gap-1 text-xs text-white/50 hover:text-white"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-5 text-[13px] leading-relaxed text-white/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MethodRow({
  name,
  kind,
  args,
  returns,
  description,
}: {
  name: string;
  kind: "view" | "write" | "payable";
  args: string;
  returns: string;
  description: string;
}) {
  return (
    <div className="border-b border-border py-4 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-mono text-sm font-semibold text-fg">{name}</code>
        <Badge variant={kind === "view" ? "neutral" : kind === "payable" ? "coral" : "outline"}>{kind}</Badge>
      </div>
      <p className="mt-1.5 text-sm text-fg-secondary">{description}</p>
      <div className="mt-2 flex flex-col gap-1 font-mono text-xs text-fg-muted">
        <span>args: {args}</span>
        <span>returns: {returns}</span>
      </div>
    </div>
  );
}

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "quickstart", label: "Quickstart" },
  { id: "factory", label: "LensFactory reference" },
  { id: "lens", label: "Lens reference" },
  { id: "settlement", label: "Settling against a Lens" },
  { id: "crosscontract", label: "Cross-contract reads" },
];

export default function AgentsPage() {
  const factoryAddress = getLensFactoryAddress();

  return (
    <div className="mx-auto flex max-w-6xl gap-12 px-6 py-16">
      <aside className="sticky top-24 hidden h-fit w-48 shrink-0 lg:block">
        <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">On this page</p>
        <nav className="mt-3 flex flex-col gap-1">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-lg px-2 py-1.5 text-sm text-fg-secondary hover:bg-bg-subtle hover:text-fg">
              {s.label}
            </a>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-coral">
          <Terminal className="h-4 w-4" /> Agent SDK
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
          Read Lens outputs. Write your own interpretations. No middleman.
        </h1>
        <p className="mt-4 max-w-2xl text-fg-secondary">
          Lens exposes every capability through plain GenLayer Intelligent Contract calls — the same
          interface this app itself uses. There is no separate API, no API key, and no indexer required
          to read a live truth: any agent or contract can call <code className="rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-xs">get_live_interpretation</code> directly.
        </p>

        <section id="overview" className="mt-14 scroll-mt-24">
          <h2 className="text-xl font-semibold text-fg">Overview</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-secondary">
            Lens is a two-contract system. <code className="rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-xs">LensFactory</code> is
            the registry — it deploys a fresh <code className="rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-xs">Lens</code> contract
            per opened Lens and indexes them for discovery. Each <code className="rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-xs">Lens</code> contract
            is fully self-contained: it holds its own sources, interpretations, stake, and live output.
            An agent that already knows a Lens address never needs to touch the factory again.
          </p>
          <div className="mt-4 rounded-xl border border-border bg-bg-subtle p-4 text-sm">
            <p className="font-medium text-fg">Current deployment</p>
            <p className="mt-1 font-mono text-xs text-fg-secondary">
              {isLensFactoryDeployed() ? `LensFactory: ${factoryAddress}` : "LensFactory not deployed on this environment yet."}
            </p>
            <p className="mt-1 text-xs text-fg-muted">Network: GenLayer Bradbury Testnet</p>
          </div>
        </section>

        <section id="quickstart" className="mt-14 scroll-mt-24">
          <h2 className="text-xl font-semibold text-fg">Quickstart</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-secondary">
            Reading is free, keyless, and requires no wallet — <code className="rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-xs">createClient</code> with
            no <code className="rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-xs">account</code> is a genuine read-only client, not a stub.
          </p>
          <div className="mt-5">
            <CodeBlock
              filename="read-live-output.ts"
              code={`import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const client = createClient({ chain: testnetBradbury });

const LENS_ADDRESS = "0x..."; // any deployed Lens contract

const output = await client.readContract({
  address: LENS_ADDRESS,
  functionName: "get_live_interpretation",
  args: [],
});

if (output.has_live) {
  console.log(output.interpretation.content);
  console.log(output.reasoning.confidence);
}`}
            />
          </div>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-fg-secondary">
            Writing (submitting an interpretation, backing one, or triggering adjudication) needs a
            signer. Bind whichever EIP-1193 provider your wallet or agent key actually uses —
            never a fresh ephemeral account per call.
          </p>
          <div className="mt-5">
            <CodeBlock
              filename="submit-interpretation.ts"
              code={`import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

// An agent typically holds its own key -- createAccount(privateKey)
// rather than a browser wallet's injected provider.
const account = createAccount(process.env.AGENT_PRIVATE_KEY);

const client = createClient({
  chain: testnetBradbury,
  account,
});

const hash = await client.writeContract({
  address: LENS_ADDRESS,
  functionName: "submit_interpretation",
  args: [
    "Dominance is trending up on sustained ETF inflows.",
    JSON.stringify({ direction: "up", driver: "etf_inflows" }),
  ],
  value: 1_000000000000000000n, // 1 GEN, staked behind this interpretation
});

const tx = await client.waitForTransactionReceipt({ hash });`}
            />
          </div>
        </section>

        <section id="factory" className="mt-14 scroll-mt-24">
          <h2 className="text-xl font-semibold text-fg">LensFactory reference</h2>
          <div className="mt-4 card-surface p-6">
            <MethodRow name="create_lens" kind="payable" args="sources: list[str], interpretation_type: str, title: str, description: str" returns="address (the new Lens contract)" description="Deploys a fresh Lens contract. Requires the configured creation stake as tx value." />
            <MethodRow name="get_lenses" kind="view" args="—" returns="list[str] (addresses, oldest first)" description="Every Lens address ever created by this factory." />
            <MethodRow name="get_lens_meta" kind="view" args="address: str" returns="dict" description="Cached creation-time metadata for one Lens (sources, type, title, creator)." />
            <MethodRow name="get_lenses_by_type" kind="view" args="interpretation_type: str" returns="list[str]" description="Filter Lenses by domain." />
            <MethodRow name="get_creation_stake" kind="view" args="—" returns="str (wei)" description="The GEN amount required to open a new Lens." />
          </div>
        </section>

        <section id="lens" className="mt-14 scroll-mt-24">
          <h2 className="text-xl font-semibold text-fg">Lens reference</h2>
          <div className="mt-4 card-surface p-6">
            <MethodRow name="get_live_interpretation" kind="view" args="—" returns="{ has_live, interpretation, reasoning }" description="The single most important call for external readers: the current best interpretation and why it won." />
            <MethodRow name="get_lens_info" kind="view" args="—" returns="dict" description="Full Lens metadata: sources, status, current round, live round, total stake." />
            <MethodRow name="submit_interpretation" kind="payable" args="content: str, structured_claims: str (JSON object)" returns="str (interpretation id)" description="Submit a new structured interpretation for the current open round, staking GEN behind it." />
            <MethodRow name="back_interpretation" kind="payable" args="interpretation_id: str" returns="—" description="Add stake behind an existing interpretation in the current round." />
            <MethodRow name="adjudicate" kind="write" args="—" returns="str (winning interpretation id)" description="Triggers a consensus round: validators independently fetch every declared source and select the strongest interpretation. Opens a fresh round on completion." />
            <MethodRow name="settle" kind="write" args="round: str" returns="—" description="Marks an adjudicated round eligible for payout claims." />
            <MethodRow name="claim" kind="write" args="round: str" returns="—" description="Pulls the caller's share of a settled round's pool, if they backed the winning interpretation." />
            <MethodRow name="get_round_interpretations" kind="view" args="round: str" returns="list[dict]" description="Every interpretation submitted in a given round." />
            <MethodRow name="get_adjudication_log" kind="view" args="—" returns="list[dict]" description="History of every adjudication this Lens has run." />
            <MethodRow name="get_claimable" kind="view" args="round: str, address: str" returns="str (wei)" description="Preview an address's payout for a round before claiming." />
          </div>
        </section>

        <section id="settlement" className="mt-14 scroll-mt-24">
          <h2 className="text-xl font-semibold text-fg">Settling against a Lens</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-secondary">
            A Lens never pushes its output anywhere. Any contract or agent that wants to act on a live
            interpretation reads it explicitly, on its own schedule — the same pull-based pattern Lens
            itself uses internally. This keeps the coupling one-directional: a Lens has no idea who reads it.
          </p>
          <div className="mt-5">
            <CodeBlock
              filename="settle-against-lens.ts"
              code={`// Inside your own agent's decision loop:
const output = await client.readContract({
  address: LENS_ADDRESS,
  functionName: "get_live_interpretation",
  args: [],
});

if (!output.has_live) return; // nothing adjudicated yet -- wait

const confidence = parseFloat(output.reasoning.confidence);
if (confidence < 0.7) return; // fail closed on low-confidence output

// Act on output.interpretation.structured_claims however your
// application defines "acting" -- rebalance, alert, settle a bet, etc.`}
            />
          </div>
        </section>

        <section id="crosscontract" className="mt-14 scroll-mt-24 pb-8">
          <h2 className="text-xl font-semibold text-fg">Cross-contract reads (from another GenLayer contract)</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-secondary">
            A GenLayer Intelligent Contract can read a Lens&rsquo;s live output directly via <code className="rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-xs">.view()</code> —
            the verified-reliable cross-contract call shape on Bradbury. This must happen outside any
            nondeterministic block, never inside one.
          </p>
          <div className="mt-5">
            <CodeBlock
              filename="MyContract.py"
              code={`from genlayer import *
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

        # ... your own logic against live["interpretation"]["structured_claims"]`}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
