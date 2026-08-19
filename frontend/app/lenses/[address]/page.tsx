"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Globe, Scale, Plus, Clock, Trophy, History as HistoryIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { InterpretationCard } from "@/components/InterpretationCard";
import { StakeDialog } from "@/components/StakeDialog";
import { SubmitInterpretationDialog } from "@/components/SubmitInterpretationDialog";
import { AdjudicationTheater } from "@/components/AdjudicationTheater";
import { SettlementPanel } from "@/components/SettlementPanel";
import { getReadOnlyClient } from "@/lib/genlayer-client";
import {
  fetchLensInfo,
  fetchLiveInterpretation,
  fetchRoundInterpretations,
  fetchAdjudicationLog,
  backInterpretation,
} from "@/lib/lens-calls";
import { shortenAddress, timeAgo } from "@/lib/utils";
import type { LensInfo, LiveInterpretation, InterpretationRecord, AdjudicationLogEntry } from "@/lib/lens-abi";

export default function LensDetailPage() {
  const params = useParams();
  const address = params.address as `0x${string}`;

  const [info, setInfo] = useState<LensInfo | null>(null);
  const [live, setLive] = useState<LiveInterpretation | null>(null);
  const [roundInterpretations, setRoundInterpretations] = useState<InterpretationRecord[] | null>(null);
  const [log, setLog] = useState<AdjudicationLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [submitOpen, setSubmitOpen] = useState(false);
  const [backTarget, setBackTarget] = useState<string | null>(null);
  const [theaterOpen, setTheaterOpen] = useState(false);

  const refresh = useCallback(() => {
    if (!address) return;
    const client = getReadOnlyClient();
    fetchLensInfo(client, address)
      .then((i) => {
        setInfo(i);
        return Promise.all([
          fetchLiveInterpretation(client, address),
          fetchRoundInterpretations(client, address, i.current_round),
          fetchAdjudicationLog(client, address),
        ]);
      })
      .then(([liveRes, roundRes, logRes]) => {
        setLive(liveRes);
        setRoundInterpretations(roundRes);
        setLog(logRes.reverse());
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load this Lens."));
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24">
        <EmptyState title="Couldn't load this Lens" description={error} />
      </div>
    );
  }

  if (!info) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="skeleton h-10 w-2/3 rounded-lg" />
        <div className="skeleton mt-4 h-24 w-full rounded-2xl" />
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div className="skeleton h-48 rounded-2xl" />
          <div className="skeleton h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  const canAdjudicate = info.status === "active" && (roundInterpretations?.length ?? 0) > 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="coral" className="capitalize">{info.interpretation_type}</Badge>
            <Badge variant={info.status === "active" ? "positive" : "neutral"} className="capitalize">
              {info.status}
            </Badge>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{info.title}</h1>
          {info.description && <p className="mt-2 max-w-2xl text-fg-secondary">{info.description}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          {info.status === "active" && (
            <Button variant="secondary" onClick={() => setSubmitOpen(true)}>
              <Plus className="h-4 w-4" /> Submit interpretation
            </Button>
          )}
          {canAdjudicate && <Button onClick={() => setTheaterOpen(true)}>Run adjudication</Button>}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-fg-muted">
        <span className="flex items-center gap-1.5">
          <Globe className="h-4 w-4" /> {info.sources.length} source{info.sources.length === 1 ? "" : "s"}
        </span>
        <span className="flex items-center gap-1.5">
          <Scale className="h-4 w-4" /> Round {info.current_round}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-4 w-4" /> Opened {timeAgo(info.created_at)}
        </span>
        <span>By {shortenAddress(info.address_creator)}</span>
      </div>

      <div className="mt-10">
        <Tabs defaultValue="live">
          <TabsList>
            <TabsTrigger value="live">Live output</TabsTrigger>
            <TabsTrigger value="round">Current round ({roundInterpretations?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="settlement">Settlement</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="live">
            {live?.has_live && "content" in live.interpretation ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card-surface p-7">
                <div className="flex items-center gap-2 text-coral">
                  <Trophy className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Current live output</span>
                </div>
                <p className="mt-4 text-lg leading-relaxed text-fg">{live.interpretation.content}</p>
                {Object.keys(live.interpretation.structured_claims || {}).length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {Object.entries(live.interpretation.structured_claims).map(([k, v]) => (
                      <span key={k} className="rounded-lg border border-border bg-bg-subtle px-2.5 py-1 text-xs text-fg-secondary">
                        <span className="font-medium text-fg-muted">{k}:</span> {String(v)}
                      </span>
                    ))}
                  </div>
                )}
                {"reasoning" in live.reasoning && (
                  <div className="mt-6 border-t border-border pt-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Adjudicator reasoning</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-fg-secondary">{live.reasoning.reasoning}</p>
                    <p className="mt-2 text-xs text-fg-muted">
                      Confidence {(parseFloat(live.reasoning.confidence) * 100).toFixed(0)}% · round {info.live_round} · {timeAgo(info.live_since)}
                    </p>
                  </div>
                )}
              </motion.div>
            ) : (
              <EmptyState
                title="Not yet adjudicated"
                description="No round has been adjudicated for this Lens yet. Submit an interpretation and run adjudication to produce the first live output."
              />
            )}
          </TabsContent>

          <TabsContent value="round">
            {roundInterpretations && roundInterpretations.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2">
                {roundInterpretations.map((interp) => (
                  <InterpretationCard
                    key={interp.id}
                    interpretation={interp}
                    isLive={interp.id === info.live_interpretation_id}
                    onBack={() => setBackTarget(interp.id)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No interpretations yet this round"
                description="Be the first to stake behind a read of the live evidence."
                action={
                  <Button onClick={() => setSubmitOpen(true)}>
                    <Plus className="h-4 w-4" /> Submit interpretation
                  </Button>
                }
              />
            )}
          </TabsContent>

          <TabsContent value="settlement">
            {log && log.length > 0 ? (
              <div className="flex flex-col gap-4">
                {log.slice(0, 5).map((entry) => (
                  <SettlementPanel key={entry.round} lensAddress={address} round={entry.round} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="Nothing to settle yet"
                description="Settlement panels appear here once at least one round has been adjudicated."
              />
            )}
          </TabsContent>

          <TabsContent value="history">
            {log && log.length > 0 ? (
              <div className="flex flex-col gap-3">
                {log.map((entry) => (
                  <div key={entry.round} className="card-surface flex items-center justify-between gap-4 p-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-coral-soft text-coral">
                        <HistoryIcon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-fg">Round {entry.round} adjudicated</p>
                        <p className="text-xs text-fg-muted">
                          {entry.candidate_count} candidate{entry.candidate_count === 1 ? "" : "s"} · {timeAgo(entry.evaluated_at)}
                        </p>
                      </div>
                    </div>
                    <Badge variant="coral">{(parseFloat(entry.confidence) * 100).toFixed(0)}% confidence</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No adjudications yet" description="This Lens hasn't been adjudicated yet." />
            )}
          </TabsContent>
        </Tabs>
      </div>

      <SubmitInterpretationDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        lensAddress={address}
        onSuccess={refresh}
      />

      {backTarget && (
        <StakeDialog
          open={!!backTarget}
          onOpenChange={(open) => !open && setBackTarget(null)}
          title="Back this interpretation"
          description="Add your stake behind this interpretation. If it wins adjudication, you settle a share of the round's pool."
          actionLabel="Back interpretation"
          onSubmit={(client, wei) => backInterpretation(client, address, backTarget, wei)}
          onSuccess={refresh}
        />
      )}

      {theaterOpen && roundInterpretations && (
        <AdjudicationTheater
          lensAddress={address}
          sources={info.sources}
          candidates={roundInterpretations}
          onClose={() => setTheaterOpen(false)}
          onAdjudicated={refresh}
        />
      )}
    </div>
  );
}
