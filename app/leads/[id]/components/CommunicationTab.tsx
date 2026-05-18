"use client";

import type { ReactNode } from "react";

type CommunicationTabProps = {
  isActive: boolean;
  children: ReactNode;
  previewUrl?: string;
  stageLabel: string;
  stageBadgeClass: string;
  statusLabel: string;
  statusBadgeClass: string;
  opportunityLabel: string;
  opportunityBadgeClass: string;
};

export default function CommunicationTab({
  isActive,
  children,
  previewUrl,
  stageLabel,
  stageBadgeClass,
  statusLabel,
  statusBadgeClass,
  opportunityLabel,
  opportunityBadgeClass,
}: CommunicationTabProps) {
  return (
    <div className={isActive ? "mt-8 space-y-6" : "hidden"}>
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Preview link
            </p>
            {previewUrl ? (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block truncate text-sm font-semibold text-blue-300 hover:text-blue-200 hover:underline"
              >
                {previewUrl}
              </a>
            ) : (
              <p className="mt-1 text-sm font-semibold text-slate-400">
                No preview generated yet
              </p>
            )}
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Stage
            </p>
            <span
              className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${stageBadgeClass}`}
            >
              {stageLabel}
            </span>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Status
            </p>
            <span
              className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass}`}
            >
              {statusLabel}
            </span>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Opportunity
            </p>
            <span
              className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${opportunityBadgeClass}`}
            >
              {opportunityLabel}
            </span>
          </div>
        </div>
      </section>

      {children}
    </div>
  );
}
