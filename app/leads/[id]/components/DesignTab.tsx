"use client";

import type { ReactNode } from "react";
import { useState } from "react";

type DesignTabProps = {
  isActive: boolean;
  children: ReactNode;
};

type PreviewPreset = "iphone" | "android" | "tablet" | "desktop";

const previewViewports: Record<
  PreviewPreset,
  { label: string; width: number; height: number }
> = {
  iphone: { label: "iPhone", width: 390, height: 844 },
  android: { label: "Android", width: 412, height: 915 },
  tablet: { label: "Tablet", width: 744, height: 1024 },
  desktop: { label: "Desktop", width: 1440, height: 900 },
};

type PreviewCardProps = {
  generatedSiteUrl?: string | null;
  isLeadArchived: boolean;
  refreshSignal?: number;
};

function buildPreviewUrl(
  generatedSiteUrl: string | null | undefined,
  viewport: PreviewPreset,
  refreshValue: number
) {
  if (!generatedSiteUrl) return generatedSiteUrl;

  const [urlWithoutHash, hash = ""] = generatedSiteUrl.split("#");
  const params = new URLSearchParams();

  if (viewport === "tablet") {
    params.set("previewViewport", "tablet");
  } else if (viewport !== "desktop") {
    params.set("previewViewport", "mobile");
  }

  if (refreshValue > 0) {
    params.set("previewRefresh", String(refreshValue));
  }

  if (!params.toString()) return generatedSiteUrl;

  const separator = urlWithoutHash.includes("?") ? "&" : "?";
  const nextUrl = `${urlWithoutHash}${separator}${params.toString()}`;

  return hash ? `${nextUrl}#${hash}` : nextUrl;
}

export default function DesignTab({ isActive, children }: DesignTabProps) {
  return (
    <div className={isActive ? "mt-8 space-y-6" : "hidden"}>{children}</div>
  );
}

export function PreviewCard({
  generatedSiteUrl,
  isLeadArchived,
  refreshSignal = 0,
}: PreviewCardProps) {
  const [previewPreset, setPreviewPreset] = useState<PreviewPreset>("iphone");
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const viewport = previewViewports[previewPreset];
  const canPreview = Boolean(generatedSiteUrl) && !isLeadArchived;
  const iframeRefreshValue = refreshSignal + previewRefreshKey;
  const previewSrc = buildPreviewUrl(
    generatedSiteUrl,
    previewPreset,
    iframeRefreshValue
  );
  const isTabletPreview = previewPreset === "tablet";
  const isDesktopPreview = previewPreset === "desktop";

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-slate-950 p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-bold text-white">Preview</h3>
          <p className="mt-1 text-sm text-slate-400">
            Preview the generated site across mobile, tablet, and desktop
            viewports without leaving the dashboard.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-300">
            {viewport.width} x {viewport.height}
          </span>
          {(["iphone", "android", "tablet", "desktop"] as PreviewPreset[]).map((preset) => (
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
              {previewViewports[preset].label}
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
        </div>
      </div>

      {canPreview && previewSrc ? (
        <div className="overflow-x-auto pb-2">
          <div
            className={`mx-auto border border-white/15 bg-slate-900 shadow-2xl shadow-black/40 ${
              isDesktopPreview
                ? "rounded-xl p-2"
                : isTabletPreview
                  ? "rounded-[1.75rem] p-3"
                  : "rounded-[2rem] p-3"
            }`}
            style={{
              width: `${viewport.width + (isDesktopPreview ? 18 : 28)}px`,
              maxWidth: `${viewport.width + (isDesktopPreview ? 18 : 28)}px`,
            }}
          >
            {isDesktopPreview ? (
              <div className="mb-2 flex items-center gap-2 rounded-t-lg bg-slate-800 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="ml-2 truncate rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-slate-400">
                  {generatedSiteUrl}
                </span>
              </div>
            ) : (
              <div className="mb-2 mx-auto h-1.5 w-16 rounded-full bg-slate-700" />
            )}
            <div
              className={`overflow-auto border border-black/60 bg-white ${
                isDesktopPreview ? "rounded-b-lg" : ""
              }`}
              style={{
                boxSizing: "content-box",
                width: `${viewport.width}px`,
                minWidth: `${viewport.width}px`,
                height: `${viewport.height}px`,
                minHeight: `${viewport.height}px`,
              }}
            >
              <iframe
                src={previewSrc}
                title="Generated site responsive preview"
                className="block border-0"
                style={{
                  boxSizing: "border-box",
                  display: "block",
                  width: `${viewport.width}px`,
                  minWidth: `${viewport.width}px`,
                  height: `${viewport.height}px`,
                  minHeight: `${viewport.height}px`,
                }}
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
              : "Generate a site first to preview it."}
          </p>
        </div>
      )}
    </div>
  );
}
