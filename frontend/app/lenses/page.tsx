"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { LensCard } from "@/components/LensCard";
import { getReadOnlyClient } from "@/lib/genlayer-client";
import { fetchLenses, fetchLensMeta } from "@/lib/lens-calls";
import { getLensFactoryAddress, isLensFactoryDeployed } from "@/lib/contracts";
import { INTERPRETATION_TYPES } from "@/lib/lens-abi";
import type { LensMeta } from "@/lib/lens-abi";

export default function ExplorerPage() {
  const [lenses, setLenses] = useState<LensMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!isLensFactoryDeployed()) {
      setLenses([]);
      return;
    }
    const address = getLensFactoryAddress()!;
    const client = getReadOnlyClient();
    let cancelled = false;

    fetchLenses(client, address)
      .then(async (addresses) => {
        const metas = await Promise.all(
          addresses.map((a) => fetchLensMeta(client, address, a).catch(() => null))
        );
        if (!cancelled) setLenses(metas.filter((m): m is LensMeta => m !== null).reverse());
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load Lenses.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!lenses) return null;
    return lenses.filter((lens) => {
      const matchesQuery =
        !query ||
        lens.title.toLowerCase().includes(query.toLowerCase()) ||
        lens.description.toLowerCase().includes(query.toLowerCase());
      const matchesType = !typeFilter || lens.interpretation_type === typeFilter;
      return matchesQuery && matchesType;
    });
  }, [lenses, query, typeFilter]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-16">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-coral">Explorer</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            Every Lens, live
          </h1>
          <p className="mt-2 max-w-xl text-fg-secondary">
            Browse open interpretation engines across every source and domain.
          </p>
        </div>
        <Button asChild>
          <Link href="/create">
            <Plus className="h-4 w-4" /> Open a Lens
          </Link>
        </Button>
      </div>

      <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Lenses by title or description…"
            className="pl-11"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setTypeFilter(null)}>
            <Badge variant={typeFilter === null ? "coral" : "outline"} className="cursor-pointer">
              All
            </Badge>
          </button>
          {INTERPRETATION_TYPES.map((type) => (
            <button key={type} onClick={() => setTypeFilter(type)}>
              <Badge variant={typeFilter === type ? "coral" : "outline"} className="cursor-pointer capitalize">
                {type}
              </Badge>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10">
        {error && (
          <EmptyState
            title="Couldn't load Lenses"
            description={error}
          />
        )}

        {!error && !isLensFactoryDeployed() && (
          <EmptyState
            title="LensFactory not deployed yet"
            description="This deployment of the app isn't pointed at a live LensFactory contract yet. Once deployed, every open Lens will appear here automatically."
            action={
              <Button variant="secondary" asChild>
                <Link href="/agents">Read the Agent SDK docs</Link>
              </Button>
            }
          />
        )}

        {!error && isLensFactoryDeployed() && lenses === null && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-52 rounded-2xl" />
            ))}
          </div>
        )}

        {!error && isLensFactoryDeployed() && lenses !== null && lenses.length === 0 && (
          <EmptyState
            title="No Lenses opened yet"
            description="Be the first to open a Lens on a source that deserves shared, capital-backed interpretation."
            action={
              <Button asChild>
                <Link href="/create">
                  <Plus className="h-4 w-4" /> Open the first Lens
                </Link>
              </Button>
            }
          />
        )}

        {!error && filtered && filtered.length > 0 && (
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.05 } } }}
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {filtered.map((meta) => (
              <motion.div
                key={meta.address}
                variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
              >
                <LensCard meta={meta} />
              </motion.div>
            ))}
          </motion.div>
        )}

        {!error && filtered && filtered.length === 0 && lenses && lenses.length > 0 && (
          <EmptyState title="No matches" description="Try a different search term or filter." />
        )}
      </div>
    </div>
  );
}
