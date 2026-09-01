"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { ArrowRight, Layers, Scale, Radio, Code2, ShieldCheck, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveStats } from "@/components/LiveStats";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const STEPS = [
  {
    icon: Layers,
    title: "Open a Lens",
    body: "Anyone — human or agent — opens a Lens on a concrete source: a live feed, a filing, a market, a dataset. Declare what it is and what kind of interpretation it needs.",
  },
  {
    icon: Users,
    title: "Stake an interpretation",
    body: "Participants submit structured interpretations of the source and back the ones they believe in with GEN. Multiple interpretations compete in the open.",
  },
  {
    icon: Scale,
    title: "GenLayer adjudicates",
    body: "Validators fetch the source's live evidence independently and select the interpretation that fits it best under the Equivalence Principle — not the one with the most stake.",
  },
  {
    icon: Radio,
    title: "The output goes live",
    body: "The winning interpretation becomes the Lens's live output. Backers behind it settle a share of the round's pool. Any external agent or contract can read the result.",
  },
];

const DIFFERENTIATORS = [
  {
    title: "Not a prediction market",
    body: "A prediction market resolves once, at a fixed date, to a fixed outcome. A Lens never stops — every adjudication opens a fresh round, so the live output keeps tracking the source as it evolves.",
  },
  {
    title: "Not a court",
    body: "There's no dispute process, no appeal, no ruling on the past. A Lens just answers one question, continuously: which interpretation fits the evidence right now.",
  },
  {
    title: "Not simple escrow",
    body: "Escrow holds funds for a predetermined release condition. A Lens's stake backs a claim about reality, adjudicated by live evidence and consensus — the payout is a byproduct of being right, not the point.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      {/* ---------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden">
        <div className="hero-gradient" />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center px-6 pb-20 pt-24 text-center sm:pt-32">
          <motion.span
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-4 py-1.5 text-xs font-medium text-fg-secondary backdrop-blur-sm"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-coral" />
            Built on GenLayer Intelligent Contracts
          </motion.span>

          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={0.08}
            className="mt-7 max-w-3xl text-4xl font-semibold tracking-tight text-fg sm:text-6xl"
          >
            Shared interpretation,{" "}
            <span className="gradient-text">backed by capital</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={0.16}
            className="mt-6 max-w-xl text-lg leading-relaxed text-fg-secondary"
          >
            Open a Lens on any concrete source. Participants stake behind competing
            structured interpretations. GenLayer adjudicates the one that fits the live
            evidence — and the result becomes infrastructure any agent can read.
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={0.24}
            className="mt-9 flex flex-col items-center gap-3 sm:flex-row"
          >
            <Button size="lg" asChild>
              <Link href="/create">
                Open a Lens <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link href="/lenses">Explore Lenses</Link>
            </Button>
          </motion.div>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={0.32}
            className="mt-16 w-full max-w-3xl"
          >
            <LiveStats />
          </motion.div>
        </div>
      </section>

      {/* ------------------------------------------------------ How it works */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="max-w-xl"
          >
            <p className="text-sm font-semibold uppercase tracking-wider text-coral">How it works</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              Four steps from open source to live output
            </h2>
          </motion.div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="card-surface card-surface-hover p-6"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-coral-soft text-coral">
                  <step.icon className="h-5 w-5" />
                </div>
                <p className="mt-4 text-xs font-semibold text-fg-muted">STEP {i + 1}</p>
                <h3 className="mt-1 text-lg font-semibold text-fg">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-secondary">{step.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- Differentiators */}
      <section className="border-t border-border bg-bg-subtle">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="max-w-xl"
          >
            <p className="text-sm font-semibold uppercase tracking-wider text-coral">What Lens is not</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              Infrastructure for interpretation, not settlement of a bet
            </h2>
          </motion.div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {DIFFERENTIATORS.map((d, i) => (
              <motion.div
                key={d.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="rounded-2xl border border-border bg-surface p-7"
              >
                <RefreshCw className="h-5 w-5 text-coral" />
                <h3 className="mt-4 text-lg font-semibold text-fg">{d.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-secondary">{d.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- Agent teaser */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-2 lg:items-center">
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-sm font-semibold uppercase tracking-wider text-coral">For agents & protocols</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              Read the live output. Settle against it directly.
            </h2>
            <p className="mt-4 max-w-md text-fg-secondary leading-relaxed">
              Every Lens exposes a single, cheap view call: the current best interpretation and the
              reasoning behind it. No API keys, no oracle middleman — just a direct read against a
              GenLayer contract.
            </p>
            <Button className="mt-6" variant="outline" asChild>
              <Link href="/agents">
                View Agent SDK docs <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="overflow-hidden rounded-2xl border border-border-strong bg-code shadow-[var(--shadow-lifted)]"
          >
            <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-negative/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#e8b84a]/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-positive/70" />
              <span className="ml-2 flex items-center gap-1.5 text-xs text-white/50">
                <Code2 className="h-3 w-3" /> read-live-output.ts
              </span>
            </div>
            <pre className="overflow-x-auto p-5 text-[13px] leading-relaxed text-white/90">
              <code>{`import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const client = createClient({ chain: testnetBradbury });

const output = await client.readContract({
  address: LENS_ADDRESS,
  functionName: "get_live_interpretation",
  args: [],
});

// { has_live, interpretation: { content, structured_claims, ... },
//   reasoning: { reasoning, confidence, evidence_snapshot } }
console.log(output.interpretation.content);`}</code>
            </pre>
          </motion.div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Final CTA */}
      <section className="relative overflow-hidden border-t border-border">
        <div className="hero-gradient opacity-70" />
        <div className="relative mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            Something is happening right now that deserves a Lens.
          </h2>
          <p className="mt-4 text-fg-secondary">
            Open one in a few minutes — no code required.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" asChild>
              <Link href="/create">
                Open a Lens <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link href="/lenses">Browse existing Lenses</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
