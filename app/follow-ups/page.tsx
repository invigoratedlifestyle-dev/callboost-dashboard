"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type FollowUpQueueItem = {
  id: string;
  slug: string;
  businessName: string;
  city: string;
  trade: string;
  lastOutboundAt: string | null;
  latestOutboundAt: string | null;
  nextFollowUpStage: 1 | 2 | 3;
  nextFollowUpLabel: string;
  dueAt: string | null;
  dueSince: string | null;
};

function formatFollowUpTime(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function getOverdueLabel(value?: string | null) {
  const dueTime = new Date(value || "").getTime();

  if (!Number.isFinite(dueTime)) return "";

  const elapsedMs = Date.now() - dueTime;

  if (elapsedMs < 0) return "";

  const elapsedHours = Math.floor(elapsedMs / (60 * 60 * 1000));

  if (elapsedHours < 1) return "Due now";
  if (elapsedHours < 24) return `${elapsedHours}h overdue`;

  const elapsedDays = Math.floor(elapsedHours / 24);

  return `${elapsedDays}d overdue`;
}

export default function FollowUpsPage() {
  const [followUpQueue, setFollowUpQueue] = useState<FollowUpQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadFollowUps() {
      try {
        const res = await fetch("/api/follow-ups/needs", {
          cache: "no-store",
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to load follow-up queue");
        }

        if (!active) return;

        setFollowUpQueue(data.needsFollowUp || []);
        setError("");
      } catch (loadError) {
        if (!active) return;

        setFollowUpQueue([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load follow-up queue"
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadFollowUps();

    const interval = window.setInterval(() => {
      void loadFollowUps();
    }, 60000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link href="/" className="text-sm font-bold text-blue-400">
              &larr; Back to dashboard
            </Link>
            <p className="mt-8 mb-2 text-sm font-bold uppercase tracking-[0.2em] text-blue-400">
              CallBoost
            </p>
            <h1 className="text-4xl font-black tracking-tight">Follow-ups</h1>
            <p className="mt-3 max-w-2xl text-slate-400">
              Contacted leads due for the next manual follow-up.
            </p>
          </div>

          <div className="rounded-xl border border-blue-400/20 bg-blue-500/10 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-300">
              Due
            </p>
            <p className="mt-1 text-2xl font-black">{followUpQueue.length}</p>
          </div>
        </div>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Needs Follow-up</h2>
              <p className="mt-1 text-sm text-slate-400">
                Sorted oldest due first. Open a lead to review and prepare the
                next follow-up.
              </p>
            </div>

            {followUpQueue.length ? (
              <span className="self-start rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-300 sm:self-auto">
                {followUpQueue.length} due
              </span>
            ) : null}
          </div>

          {loading ? (
            <p className="rounded-lg bg-white/5 p-3 text-sm text-slate-400">
              Loading follow-ups...
            </p>
          ) : error ? (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : followUpQueue.length ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/10 text-sm text-slate-400">
                    <th className="px-3 py-3">Lead</th>
                    <th className="px-3 py-3">Next Step</th>
                    <th className="px-3 py-3">Last Outbound</th>
                    <th className="px-3 py-3">Due</th>
                    <th className="px-3 py-3">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {followUpQueue.map((item) => {
                    const overdueLabel = getOverdueLabel(item.dueAt);

                    return (
                      <tr
                        key={item.slug || item.id}
                        className="border-b border-white/10"
                      >
                        <td className="px-3 py-3">
                          <p className="text-sm font-bold text-white">
                            {item.businessName || "Unnamed business"}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {item.trade || "Unknown trade"} -{" "}
                            {item.city || "Unknown town/suburb"}
                          </p>
                        </td>

                        <td className="px-3 py-3">
                          <span className="whitespace-nowrap rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-300">
                            {item.nextFollowUpLabel}
                          </span>
                        </td>

                        <td className="px-3 py-3 text-sm text-slate-300">
                          {formatFollowUpTime(item.lastOutboundAt)}
                        </td>

                        <td className="px-3 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <span className="text-sm text-slate-300">
                              {formatFollowUpTime(item.dueAt)}
                            </span>
                            {overdueLabel ? (
                              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-300">
                                {overdueLabel}
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <Link
                            href={`/leads/${item.slug}`}
                            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-lg bg-white/5 p-3 text-sm text-slate-400">
              No contacted leads are due for manual follow-up right now.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
