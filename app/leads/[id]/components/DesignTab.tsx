"use client";

import type { ReactNode } from "react";
import { useState } from "react";

type DesignTabProps = {
  isActive: boolean;
  children: ReactNode;
};

type MobilePreviewPreset = "iphone" | "android";

const mobilePreviewViewports: Record<
  MobilePreviewPreset,
  { label: string; width: number; height: number }
> = {
  iphone: { label: "iPhone", width: 390, height: 844 },
  android: { label: "Android", width: 412, height: 915 },
};

type MobilePreviewCardProps = {
  generatedSiteUrl?: string | null;
  isLeadArchived: boolean;
};

export default function DesignTab({ isActive, children }: DesignTabProps) {
  return (
    <div className={isActive ? "mt-8 space-y-6" : "hidden"}>{children}</div>
  );
}

export function MobilePreviewCard({
  generatedSiteUrl,
  isLeadArchived,
}: MobilePreviewCardProps) {
  const [previewPreset, setPreviewPreset] =
    useState<MobilePreviewPreset>("iphone");
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const viewport = mobilePreviewViewports[previewPreset];
  const canPreview = Boolean(generatedSiteUrl) && !isLeadArchived;
  const previewSrc =
    generatedSiteUrl && previewRefreshKey > 0
      ? `${generatedSiteUrl}${
          generatedSiteUrl.includes("?") ? "&" : "?"
        }previewRefresh=${previewRefreshKey}`
      : generatedSiteUrl;

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-slate-950 p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-bold text-white">Mobile Preview</h3>
          <p className="mt-1 text-sm text-slate-400">
            Check the generated site in a phone-sized frame without leaving the
            dashboard.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-300">
            {viewport.width} x {viewport.height}
          </span>
          {(["iphone", "android"] as MobilePreviewPreset[]).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setPreviewPreset(preset)}
              className={`rounded-lg px-3 py-2 text-xs font-bold ${
                previewPreset === preset
                  ? "bg-blue-600 text-white"
                  : "border border-white/10 bg-slate-900 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {mobilePreviewViewports[preset].label}
            </button>
          ))}
          {generatedSiteUrl && !isLeadArchived ? (
            <button
              type="button"
              onClick={() => {
                setIsPreviewLoading(true);
                setPreviewRefreshKey((current) => current + 1);
              }}
              disabled={isPreviewLoading}
              className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPreviewLoading ? "Refreshing..." : "Refresh Preview"}
            </button>
          ) : null}
          {generatedSiteUrl && !isLeadArchived ? (
            <a
              href={generatedSiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800"
            >
              View Desktop Preview
            </a>
          ) : null}
        </div>
      </div>

      {canPreview && previewSrc ? (
        <div className="overflow-x-auto pb-2">
          <div
            className="mx-auto rounded-[2rem] border border-white/15 bg-slate-900 p-3 shadow-2xl shadow-black/40"
            style={{
              width: `min(100%, ${viewport.width + 28}px)`,
              maxWidth: `${viewport.width + 28}px`,
            }}
          >
            <div className="mb-2 mx-auto h-1.5 w-16 rounded-full bg-slate-700" />
            <div
              className="overflow-hidden rounded-[1.5rem] border border-black/60 bg-white"
              style={{
                aspectRatio: `${viewport.width} / ${viewport.height}`,
                height: `min(72vh, ${viewport.height}px)`,
                maxHeight: `${viewport.height}px`,
              }}
            >
              <iframe
                src={previewSrc}
                title="Generated site mobile preview"
                className="h-full w-full border-0"
                onLoad={() => setIsPreviewLoading(false)}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/15 bg-slate-900/70 px-4 py-8 text-center">
          <p className="text-sm font-bold text-slate-200">
            {isLeadArchived
              ? "Generated site previews are disabled for archived leads."
              : "Generate a site first to preview it on mobile."}
          </p>
        </div>
      )}
    </div>
  );
}
