"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AU_STATE_TARGETS,
  CITY_TARGETS,
  type AUStateCode,
} from "../lib/leadTargeting/cities";
import { TRADE_TARGETS } from "../lib/leadTargeting/trades";

const LAST_STATE_STORAGE_KEY = "callboost.generateLeads.lastStateCode";
const DEFAULT_STATE_KEY: AUStateCode = "TAS";

type GenerateBatchTownResult = {
  town: string;
  created: number;
  skipped: number;
  rejected: number;
  totalFound?: number;
  success?: boolean;
  status?:
    | "created"
    | "no_results"
    | "duplicates"
    | "rejected"
    | "empty"
    | "failed";
  message?: string;
  errors: string[];
};

type GenerateBatchSummary = {
  totals: {
    towns: number;
    created: number;
    skipped: number;
    rejected: number;
    totalFound?: number;
    errors: number;
  };
  message?: string;
  results: GenerateBatchTownResult[];
};

function getGenerationResultClass(result: GenerateBatchTownResult) {
  if (result.status === "failed" || result.success === false) {
    return "text-red-300";
  }

  if (result.created > 0 || result.status === "created") {
    return "text-green-300";
  }

  return "text-slate-400";
}

function getGenerationResultMessage(result: GenerateBatchTownResult) {
  if (result.message) return result.message;
  if (result.created > 0) return `${result.created} leads created`;
  if (result.status === "duplicates") return "all results were duplicates";
  if (result.status === "rejected") {
    return "all results rejected by trade validation";
  }
  if (result.status === "failed") {
    return `request failed${
      result.errors.length ? ` (${result.errors.join(", ")})` : ""
    }`;
  }

  return "no matching businesses found";
}

function isSupportedStateKey(value: string): value is AUStateCode {
  return AU_STATE_TARGETS.some((stateTarget) => stateTarget.key === value);
}

function getFirstCityKeyForState(stateKey: AUStateCode) {
  return (
    CITY_TARGETS.find((cityTarget) => cityTarget.stateCode === stateKey)?.key ||
    "hobart"
  );
}

function getInitialTargetStateKey(): AUStateCode {
  if (typeof window === "undefined") return DEFAULT_STATE_KEY;

  try {
    const storedStateKey = window.localStorage.getItem(LAST_STATE_STORAGE_KEY);

    return storedStateKey && isSupportedStateKey(storedStateKey)
      ? storedStateKey
      : DEFAULT_STATE_KEY;
  } catch {
    return DEFAULT_STATE_KEY;
  }
}

function rememberTargetStateKey(stateKey: AUStateCode) {
  try {
    window.localStorage.setItem(LAST_STATE_STORAGE_KEY, stateKey);
  } catch {
    // Ignore storage errors so lead generation still works in private browsing.
  }
}

export default function LeadGenerationPanel() {
  const [initialTargetStateKey] = useState(getInitialTargetStateKey);
  const [generating, setGenerating] = useState(false);
  const [targetStateKey, setTargetStateKey] = useState(initialTargetStateKey);
  const [targetCityKeys, setTargetCityKeys] = useState<string[]>(() => [
    getFirstCityKeyForState(initialTargetStateKey),
  ]);
  const [townSearch, setTownSearch] = useState("");
  const [targetTradeKey, setTargetTradeKey] = useState("plumber");
  const [generationLimit, setGenerationLimit] = useState(50);
  const [generationProgress, setGenerationProgress] = useState("");
  const [generationSummary, setGenerationSummary] =
    useState<GenerateBatchSummary | null>(null);
  const cityOptions = useMemo(
    () =>
      CITY_TARGETS.filter((cityTarget) => cityTarget.stateCode === targetStateKey),
    [targetStateKey]
  );
  const firstCityOptionKey = cityOptions[0]?.key || "hobart";
  const selectedCityOptions = useMemo(
    () =>
      targetCityKeys
        .map((cityKey) => cityOptions.find((cityTarget) => cityTarget.key === cityKey))
        .filter((cityTarget): cityTarget is (typeof cityOptions)[number] =>
          Boolean(cityTarget)
        ),
    [cityOptions, targetCityKeys]
  );
  const filteredCityOptions = useMemo(() => {
    const normalizedSearch = townSearch.trim().toLowerCase();

    if (!normalizedSearch) return cityOptions;

    return cityOptions.filter((cityTarget) =>
      cityTarget.city.toLowerCase().includes(normalizedSearch)
    );
  }, [cityOptions, townSearch]);

  async function handleGenerateLeads() {
    const selectedTownKeys =
      selectedCityOptions.length > 0
        ? selectedCityOptions.map((cityTarget) => cityTarget.key)
        : [firstCityOptionKey];
    const selectedTownNames = selectedTownKeys
      .map((cityKey) => cityOptions.find((cityTarget) => cityTarget.key === cityKey))
      .filter((cityTarget): cityTarget is (typeof cityOptions)[number] =>
        Boolean(cityTarget)
      )
      .map((cityTarget) => cityTarget.city);

    if (!selectedTownNames.length) {
      alert("Select at least one town/suburb.");
      return;
    }

    setGenerating(true);
    setGenerationSummary(null);
    setGenerationProgress(
      selectedTownNames.length === 1
        ? `Generating 1 of 1: ${selectedTownNames[0]}`
        : `Generating 1 of ${selectedTownNames.length}: ${selectedTownNames[0]}`
    );

    try {
      const res = await fetch(
        selectedTownNames.length === 1
          ? "/api/leads/generate"
          : "/api/leads/generate-batch",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            selectedTownNames.length === 1
              ? {
                  stateKey: targetStateKey,
                  cityKey: selectedTownKeys[0],
                  tradeKey: targetTradeKey,
                  limit: generationLimit,
                }
              : {
                  state: targetStateKey,
                  towns: selectedTownKeys,
                  trade: targetTradeKey,
                  limit: generationLimit,
                }
          ),
        }
      );
      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("Generate leads failed:", result);
        alert(result.message || result.error || "Lead generation failed");
        return;
      }

      if (selectedTownNames.length === 1) {
        const rejected = Number(result.skippedWrongTrade) || 0;
        const skipped =
          (Number(result.existingSkipped) || 0) +
          (Number(result.skippedDuplicates) || 0) +
          (Number(result.skippedInvalidLocation) || 0) +
          (Number(result.skippedInvalidPhone) || 0);

        setGenerationSummary({
          totals: {
            towns: 1,
            created: Number(result.saved) || 0,
            skipped,
            rejected,
            totalFound: Number(result.totalFound ?? result.rawResults) || 0,
            errors: 0,
          },
          message:
            typeof result.message === "string" && result.message
              ? result.message
              : undefined,
          results: [
            {
              town: selectedTownNames[0],
              created: Number(result.saved) || 0,
              skipped,
              rejected,
              totalFound: Number(result.totalFound ?? result.rawResults) || 0,
              success: true,
              status:
                Number(result.saved) > 0
                  ? "created"
                  : Number(result.totalFound ?? result.rawResults) === 0
                    ? "no_results"
                    : skipped > 0 && rejected === 0
                      ? "duplicates"
                      : rejected > 0 && skipped === 0
                        ? "rejected"
                        : "empty",
              message:
                typeof result.message === "string" && result.message
                  ? result.message
                  : undefined,
              errors: [],
            },
          ],
        });
      } else {
        setGenerationSummary(result as GenerateBatchSummary);
      }
    } catch (error) {
      console.error("Generate leads failed:", error);
      alert("Lead generation failed");
    } finally {
      setGenerating(false);
      setGenerationProgress("");
    }
  }

  function toggleTargetCity(cityKey: string) {
    setTargetCityKeys((current) => {
      if (current.includes(cityKey)) {
        const next = current.filter((key) => key !== cityKey);

        return next.length ? next : current;
      }

      return [...current, cityKey];
    });
  }

  function removeTargetCity(cityKey: string) {
    setTargetCityKeys((current) =>
      current.length > 1 ? current.filter((key) => key !== cityKey) : current
    );
  }

  function selectAllVisibleTowns() {
    setTargetCityKeys((current) =>
      Array.from(
        new Set([
          ...current,
          ...filteredCityOptions.map((cityTarget) => cityTarget.key),
        ])
      )
    );
  }

  function clearSelectedTowns() {
    setTargetCityKeys([firstCityOptionKey]);
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Lead generation</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:items-end">
          <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            State
            <select
              value={targetStateKey}
              onChange={(event) => {
                const nextStateKey = event.target.value;

                if (!isSupportedStateKey(nextStateKey)) return;

                const nextFirstCityKey =
                  CITY_TARGETS.find(
                    (cityTarget) => cityTarget.stateCode === nextStateKey
                  )?.key || "hobart";

                setTargetStateKey(nextStateKey);
                rememberTargetStateKey(nextStateKey);
                setTargetCityKeys([nextFirstCityKey]);
                setTownSearch("");
              }}
              disabled={generating}
              className="min-w-32 rounded-lg border border-white/10 bg-slate-900 px-3 py-3 text-sm font-bold normal-case tracking-normal text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {AU_STATE_TARGETS.map((stateTarget) => (
                <option key={stateTarget.key} value={stateTarget.key}>
                  {stateTarget.key}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            Town/Suburb
            <div className="min-w-72 rounded-lg border border-white/10 bg-slate-900 p-3 normal-case tracking-normal">
              <div className="mb-2 flex flex-wrap gap-2">
                {selectedCityOptions.map((cityTarget) => (
                  <button
                    key={cityTarget.key}
                    type="button"
                    onClick={() => removeTargetCity(cityTarget.key)}
                    disabled={generating || selectedCityOptions.length === 1}
                    className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-200 hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                    title="Remove town"
                  >
                    {cityTarget.city} x
                  </button>
                ))}
              </div>

              <input
                value={townSearch}
                onChange={(event) => setTownSearch(event.target.value)}
                disabled={generating}
                placeholder="Search towns"
                className="mb-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm font-bold text-white outline-none placeholder:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
              />

              <div className="mb-2 flex gap-2">
                <button
                  type="button"
                  onClick={selectAllVisibleTowns}
                  disabled={generating || filteredCityOptions.length === 0}
                  className="rounded-md bg-white/10 px-2 py-1 text-xs font-bold text-slate-200 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Select all visible
                </button>
                <button
                  type="button"
                  onClick={clearSelectedTowns}
                  disabled={generating}
                  className="rounded-md bg-white/10 px-2 py-1 text-xs font-bold text-slate-200 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Clear selected
                </button>
              </div>

              <div className="max-h-36 overflow-y-auto rounded-md border border-white/10 bg-slate-950/60 p-2">
                {filteredCityOptions.map((cityTarget) => (
                  <label
                    key={cityTarget.key}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm font-bold text-slate-200 hover:bg-white/5"
                  >
                    <input
                      type="checkbox"
                      checked={targetCityKeys.includes(cityTarget.key)}
                      onChange={() => toggleTargetCity(cityTarget.key)}
                      disabled={
                        generating ||
                        (targetCityKeys.includes(cityTarget.key) &&
                          targetCityKeys.length === 1)
                      }
                      className="h-4 w-4 accent-blue-500 disabled:cursor-not-allowed"
                    />
                    <span>{cityTarget.city}</span>
                  </label>
                ))}

                {filteredCityOptions.length === 0 ? (
                  <p className="px-2 py-1 text-sm font-bold text-slate-500">
                    No towns found
                  </p>
                ) : null}
              </div>
            </div>
          </label>

          <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            Trade
            <select
              value={targetTradeKey}
              onChange={(event) => setTargetTradeKey(event.target.value)}
              disabled={generating}
              className="min-w-44 rounded-lg border border-white/10 bg-slate-900 px-3 py-3 text-sm font-bold normal-case tracking-normal text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {TRADE_TARGETS.map((tradeTarget) => (
                <option key={tradeTarget.key} value={tradeTarget.key}>
                  {tradeTarget.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            Limit
            <input
              type="number"
              min={1}
              max={200}
              value={generationLimit}
              onChange={(event) =>
                setGenerationLimit(Number(event.target.value) || 1)
              }
              disabled={generating}
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-3 text-sm font-bold normal-case tracking-normal text-white outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:w-28"
              aria-label="Max results"
            />
          </label>

          <button
            onClick={handleGenerateLeads}
            disabled={generating}
            className="h-11 rounded-lg bg-green-600 px-5 text-sm font-bold text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60 sm:self-end"
          >
            {generating ? "Generating..." : "+ Generate Leads"}
          </button>
        </div>
      </div>

      {generationProgress ? (
        <p className="mt-4 rounded-lg bg-blue-500/10 px-3 py-2 text-sm font-bold text-blue-200">
          {generationProgress}
        </p>
      ) : null}

      {generationSummary ? (
        <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-300">
          <p className="font-bold text-white">
            Completed {generationSummary.totals.towns}{" "}
            {generationSummary.totals.towns === 1 ? "town" : "towns"}.{" "}
            {generationSummary.totals.created} leads created,{" "}
            {generationSummary.totals.skipped} skipped,{" "}
            {generationSummary.totals.rejected} rejected.
          </p>
          {generationSummary.message ? (
            <p className="mt-1 text-slate-400">{generationSummary.message}</p>
          ) : null}

          {generationSummary.results.length ? (
            <div className="mt-2 grid gap-1">
              {generationSummary.results.map((result) => (
                <p key={result.town} className={getGenerationResultClass(result)}>
                  {result.town}: {getGenerationResultMessage(result)}
                </p>
              ))}
            </div>
          ) : null}

          <Link
            href="/"
            className="mt-4 inline-flex rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/15"
          >
            View Dashboard
          </Link>
        </div>
      ) : null}
    </section>
  );
}
