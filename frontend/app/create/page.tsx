"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Plus, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { TransactionPanel } from "@/components/TransactionPanel";
import { useGenLayerClient, getReadOnlyClient, readContractRetry } from "@/lib/genlayer-client";
import { useTransactionLifecycle } from "@/lib/useTransactionLifecycle";
import { createLens, fetchLenses, fetchCreationStake, waitForNewLens } from "@/lib/lens-calls";
import { getLensFactoryAddress, isLensFactoryDeployed } from "@/lib/contracts";
import { INTERPRETATION_TYPES, MIN_SOURCES, MAX_SOURCES } from "@/lib/lens-abi";
import { cn, formatGen } from "@/lib/utils";

const STEP_LABELS = ["Sources", "Details", "Review & Open"];

export default function CreateLensPage() {
  const router = useRouter();
  const { client } = useGenLayerClient();
  const { state, run, reset } = useTransactionLifecycle(client);

  const [step, setStep] = useState(0);
  const [sources, setSources] = useState<string[]>(["", ""]);
  const [interpretationType, setInterpretationType] = useState<string>("market");
  const [customType, setCustomType] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creationStake, setCreationStake] = useState<string | null>(null);
  const [creationStakeError, setCreationStakeError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const factoryAddress = getLensFactoryAddress();

  function loadCreationStake() {
    if (!factoryAddress) return;
    setCreationStakeError(null);
    // Retried: this value is never cosmetic -- it's the exact `value` sent
    // with create_lens. A silent fallback to "0" here used to mean a
    // transient read failure would both mislead the Review step AND submit
    // a real transaction with 0 GEN attached, which the contract then
    // correctly rejects for insufficient stake -- a confusing failure with
    // no visible cause. Never guess this value; show a real error instead.
    readContractRetry(() => fetchCreationStake(getReadOnlyClient(), factoryAddress))
      .then(setCreationStake)
      .catch(() => setCreationStakeError("Couldn't load the creation stake from the network."));
  }

  useEffect(() => {
    loadCreationStake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factoryAddress]);

  if (!isLensFactoryDeployed() || !factoryAddress) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24">
        <EmptyState
          title="LensFactory not deployed yet"
          description="This deployment of the app isn't pointed at a live LensFactory contract yet, so new Lenses can't be opened here. Check back once the contract is live."
        />
      </div>
    );
  }

  const effectiveType = interpretationType === "custom" ? customType.trim() : interpretationType;
  const cleanSources = sources.map((s) => s.trim()).filter(Boolean);

  function validateStep(current: number): string | null {
    if (current === 0) {
      if (cleanSources.length < MIN_SOURCES)
        return `Add at least ${MIN_SOURCES} source URLs -- a single, possibly self-controlled source isn't enough to adjudicate against.`;
      if (cleanSources.length > MAX_SOURCES) return `At most ${MAX_SOURCES} sources are allowed.`;
      const bad = cleanSources.find((s) => !/^https?:\/\//i.test(s));
      if (bad) return `"${bad}" must start with http:// or https://`;
      if (new Set(cleanSources).size !== cleanSources.length) return "Sources must be unique.";
    }
    if (current === 1) {
      if (!effectiveType) return "Choose or enter an interpretation type.";
      if (!title.trim()) return "Give this Lens a title.";
    }
    return null;
  }

  function goNext() {
    const err = validateStep(step);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  }

  function goBack() {
    setStepError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit() {
    // creationStake being unknown (still loading, or the retried fetch
    // ultimately failed) must block submission rather than silently send a
    // wrong `value` -- see loadCreationStake()'s comment for why "0" was a
    // real bug here, not just a display issue.
    if (!client || !factoryAddress || creationStake === null) return;
    const stakeWei = BigInt(creationStake);
    // Fired in parallel with run() below, NOT awaited first -- this read is
    // only needed after the write succeeds (to resolve the new Lens's
    // address), so blocking the wallet-signature prompt on it first was a
    // real, reported UX bug: a slow/flaky read visibly delayed the wallet
    // popup by however long this call took, even though the two are
    // logically independent until the write actually finishes.
    const beforeLensesPromise = fetchLenses(getReadOnlyClient(), factoryAddress).catch(() => []);
    // A new Lens address is exactly the kind of output other things act on
    // (the Explorer lists it, this page navigates the user straight to it,
    // they immediately stake real GEN into it) -- ACCEPTED can still be
    // appealed and reversed before FINALIZED, so this is one of the writes
    // that must wait for the stronger guarantee before declaring success.
    await run(
      () => createLens(client, factoryAddress, cleanSources, effectiveType, title.trim(), description.trim(), stakeWei),
      { requireFinalized: true }
    );
    setResolving(true);
    try {
      const beforeLenses = await beforeLensesPromise;
      const newAddress = await waitForNewLens(getReadOnlyClient(), factoryAddress, beforeLenses.length);
      setResolvedAddress(newAddress);
    } catch {
      // Non-fatal: the Lens was almost certainly created (tx succeeded) --
      // just couldn't confirm the exact address to auto-redirect to yet.
    } finally {
      setResolving(false);
    }
  }

  const busy = state.phase === "submitting" || state.phase === "polling";

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-wider text-coral">Open a Lens</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
        Define what deserves interpretation
      </h1>

      {state.phase === "idle" && (
        <div className="mt-8 flex items-center gap-2">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  i < step
                    ? "bg-coral text-white"
                    : i === step
                    ? "border-2 border-coral text-coral"
                    : "border border-border text-fg-muted"
                )}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={cn("hidden text-sm sm:block", i === step ? "text-fg font-medium" : "text-fg-muted")}>
                {label}
              </span>
              {i < STEP_LABELS.length - 1 && <div className="h-px flex-1 bg-border" />}
            </div>
          ))}
        </div>
      )}

      <div className="mt-10">
        {state.phase !== "idle" ? (
          <div className="flex flex-col items-center gap-6">
            <TransactionPanel state={state} successLabel="Lens is live" />
            {state.phase === "success" && (
              <div className="flex flex-col items-center gap-3">
                {resolving && <p className="text-sm text-fg-secondary">Resolving your new Lens address…</p>}
                {resolvedAddress ? (
                  <Button onClick={() => router.push(`/lenses/${resolvedAddress}`)}>
                    View your Lens <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  !resolving && (
                    <Button variant="secondary" onClick={() => router.push("/lenses")}>
                      Go to Explorer
                    </Button>
                  )
                )}
              </div>
            )}
            {state.phase === "error" && (
              <Button
                variant="secondary"
                onClick={() => {
                  reset();
                  setResolvedAddress(null);
                }}
              >
                Try again
              </Button>
            )}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25 }}
            >
              {step === 0 && (
                <div className="card-surface p-6">
                  <h2 className="text-lg font-semibold text-fg">What source is this Lens watching?</h2>
                  <p className="mt-1 text-sm text-fg-secondary">
                    Add {MIN_SOURCES}-{MAX_SOURCES} live http(s) URLs. At least {MIN_SOURCES} are required so no single
                    (possibly self-controlled) source can decide adjudication alone. Validators fetch these fresh
                    every time this Lens is adjudicated, and anyone can add more corroborating sources later.
                  </p>
                  <div className="mt-5 flex flex-col gap-3">
                    {sources.map((src, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          value={src}
                          onChange={(e) => {
                            const next = [...sources];
                            next[i] = e.target.value;
                            setSources(next);
                          }}
                          placeholder="https://example.com/live-feed"
                        />
                        {sources.length > MIN_SOURCES && (
                          <button
                            onClick={() => setSources(sources.filter((_, idx) => idx !== i))}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fg-muted hover:bg-bg-subtle hover:text-negative"
                            aria-label="Remove source"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {sources.length < MAX_SOURCES && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="self-start"
                        onClick={() => setSources([...sources, ""])}
                      >
                        <Plus className="h-4 w-4" /> Add another source
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="card-surface p-6">
                  <h2 className="text-lg font-semibold text-fg">Describe the Lens</h2>
                  <p className="mt-1 text-sm text-fg-secondary">
                    This is shown to everyone who might submit or back an interpretation.
                  </p>
                  <div className="mt-5 flex flex-col gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-fg-secondary">Interpretation type</label>
                      <div className="flex flex-wrap gap-2">
                        {INTERPRETATION_TYPES.map((type) => (
                          <button key={type} onClick={() => setInterpretationType(type)}>
                            <Badge variant={interpretationType === type ? "coral" : "outline"} className="cursor-pointer capitalize">
                              {type}
                            </Badge>
                          </button>
                        ))}
                        <button onClick={() => setInterpretationType("custom")}>
                          <Badge variant={interpretationType === "custom" ? "coral" : "outline"} className="cursor-pointer">
                            Custom
                          </Badge>
                        </button>
                      </div>
                      {interpretationType === "custom" && (
                        <Input
                          className="mt-2"
                          value={customType}
                          onChange={(e) => setCustomType(e.target.value)}
                          placeholder="e.g. legal-filing"
                        />
                      )}
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-fg-secondary">Title</label>
                      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="BTC Dominance Trend" maxLength={140} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-fg-secondary">Description (optional)</label>
                      <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What should a strong interpretation of this source explain?"
                        maxLength={1000}
                      />
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="card-surface p-6">
                  <h2 className="text-lg font-semibold text-fg">Review</h2>
                  <dl className="mt-5 flex flex-col gap-4 text-sm">
                    <div>
                      <dt className="text-fg-muted">Sources</dt>
                      <dd className="mt-1 flex flex-col gap-1 text-fg">
                        {cleanSources.map((s) => (
                          <span key={s} className="truncate font-mono text-xs">{s}</span>
                        ))}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-fg-muted">Type</dt>
                      <dd className="mt-1 capitalize text-fg">{effectiveType}</dd>
                    </div>
                    <div>
                      <dt className="text-fg-muted">Title</dt>
                      <dd className="mt-1 text-fg">{title}</dd>
                    </div>
                    {description && (
                      <div>
                        <dt className="text-fg-muted">Description</dt>
                        <dd className="mt-1 text-fg-secondary">{description}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-fg-muted">Creation stake</dt>
                      <dd className="mt-1 font-semibold text-fg">
                        {creationStakeError ? (
                          <span className="flex items-center gap-2 text-sm font-normal text-negative">
                            {creationStakeError}
                            <button onClick={loadCreationStake} className="font-medium text-coral underline underline-offset-2">
                              Retry
                            </button>
                          </span>
                        ) : creationStake === null ? (
                          <span className="inline-block h-5 w-16 animate-pulse-soft rounded bg-bg-subtle align-middle" />
                        ) : (
                          `${formatGen(creationStake)} GEN`
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {stepError && state.phase === "idle" && (
        <p className="mt-4 text-sm text-negative">{stepError}</p>
      )}

      {state.phase === "idle" && (
        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" onClick={goBack} disabled={step === 0}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          {step < STEP_LABELS.length - 1 ? (
            <Button onClick={goNext}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!client || busy || creationStake === null}>
              {!client
                ? "Connect a wallet to continue"
                : creationStake === null
                ? "Waiting for creation stake…"
                : "Open this Lens"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
