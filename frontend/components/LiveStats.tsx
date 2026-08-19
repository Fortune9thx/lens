"use client";

import { useEffect, useState } from "react";
import { getReadOnlyClient } from "@/lib/genlayer-client";
import { fetchLenses } from "@/lib/lens-calls";
import { getLensFactoryAddress, isLensFactoryDeployed } from "@/lib/contracts";

interface Stats {
  lensCount: number;
}

export function LiveStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!isLensFactoryDeployed()) return;
    const address = getLensFactoryAddress();
    if (!address) return;
    let cancelled = false;
    fetchLenses(getReadOnlyClient(), address)
      .then((lenses) => {
        if (!cancelled) setStats({ lensCount: lenses.length });
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = [
    {
      label: "Lenses open",
      value: !isLensFactoryDeployed() || errored ? "—" : stats ? stats.lensCount.toString() : null,
    },
    { label: "Adjudicated by", value: "GenLayer consensus" },
    { label: "Settlement", value: "On-chain, pull-based" },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-border/70 bg-surface/60 px-6 py-5 backdrop-blur-sm">
          <p className="text-2xl font-semibold tracking-tight text-fg">
            {item.value === null ? (
              <span className="inline-block h-7 w-12 animate-pulse-soft rounded bg-bg-subtle align-middle" />
            ) : (
              item.value
            )}
          </p>
          <p className="mt-1 text-sm text-fg-secondary">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
