"use client";

import type { ReactNode } from "react";

type CommunicationChannel = "sms" | "email";

type CommunicationTabProps = {
  isActive: boolean;
  children: ReactNode;
  previewUrl?: string;
  communicationChannel: CommunicationChannel;
  onCommunicationChannelChange: (channel: CommunicationChannel) => void;
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
  communicationChannel,
  onCommunicationChannelChange,
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

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-300">
              Communication channel
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Prepared replies will use this channel.
            </p>
          </div>

          <div className="flex self-start rounded-lg border border-white/10 bg-slate-900 p-1 sm:self-auto">
            {(["sms", "email"] as CommunicationChannel[]).map((channel) => (
              <button
                key={channel}
                type="button"
                onClick={() => onCommunicationChannelChange(channel)}
                className={`rounded-md px-4 py-2 text-sm font-bold ${
                  communicationChannel === channel
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {channel === "sms" ? "SMS" : "Email"}
              </button>
            ))}
          </div>
        </div>
      </section>

      {children}
    </div>
  );
}
