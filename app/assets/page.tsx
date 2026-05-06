"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type SiteAsset = {
  id: string;
  trade: string;
  assetType: string;
  imageUrl: string;
  storagePath: string;
  altText: string;
  isActive: boolean;
  createdAt: string;
};

const tradeOptions = [
  "generic",
  "plumber",
  "electrician",
  "builder",
  "cleaner",
  "landscaper",
  "roofer",
  "painter",
  "mechanic",
];

function titleCase(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function groupAssetsByTrade(assets: SiteAsset[]) {
  return assets.reduce<Record<string, SiteAsset[]>>((groups, asset) => {
    const trade = asset.trade || "generic";

    return {
      ...groups,
      [trade]: [...(groups[trade] || []), asset],
    };
  }, {});
}

export default function AssetsPage() {
  const [assets, setAssets] = useState<SiteAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [trade, setTrade] = useState("plumber");
  const [assetType, setAssetType] = useState("hero");
  const [altText, setAltText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const heroAssets = useMemo(
    () => assets.filter((asset) => asset.assetType === "hero"),
    [assets]
  );
  const groupedAssets = useMemo(() => groupAssetsByTrade(heroAssets), [heroAssets]);
  const groupedEntries = useMemo(
    () => Object.entries(groupedAssets).sort(([a], [b]) => a.localeCompare(b)),
    [groupedAssets]
  );

  async function loadAssets() {
    try {
      const res = await fetch("/api/site-assets", {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load assets");
      }

      setAssets(data.assets || []);
      setError("");
    } catch (loadError) {
      setAssets([]);
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load assets"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Initial asset library load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAssets();
  }, []);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError("Choose an image before uploading.");
      return;
    }

    setUploading(true);
    setNotice("");
    setError("");

    try {
      const formData = new FormData();

      formData.append("trade", trade);
      formData.append("assetType", assetType || "hero");
      formData.append("altText", altText);
      formData.append("file", file);

      const res = await fetch("/api/site-assets", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to upload asset");
      }

      setAssets((current) => [data.asset, ...current]);
      setAltText("");
      setFile(null);
      setNotice("Asset uploaded.");
      event.currentTarget.reset();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Failed to upload asset"
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(asset: SiteAsset) {
    setDeletingId(asset.id);
    setNotice("");
    setError("");
    setAssets((current) => current.filter((item) => item.id !== asset.id));

    try {
      const res = await fetch(`/api/site-assets/${asset.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to delete asset");
      }

      setNotice("Asset deleted.");
    } catch (deleteError) {
      setAssets((current) => [asset, ...current]);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete asset"
      );
    } finally {
      setDeletingId("");
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link href="/" className="text-sm font-bold text-blue-400">
              &larr; Back to dashboard
            </Link>
            <p className="mt-8 mb-2 text-sm font-bold uppercase tracking-[0.2em] text-blue-400">
              CallBoost
            </p>
            <h1 className="text-4xl font-black tracking-tight">
              Asset Library
            </h1>
            <p className="mt-3 max-w-2xl text-slate-400">
              Manage reusable hero images for generated local business websites.
            </p>
          </div>
        </div>

        <section className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-white">Upload Asset</h2>
          </div>

          <form
            onSubmit={handleUpload}
            className="grid gap-4 lg:grid-cols-[1fr_1fr_2fr_2fr_auto] lg:items-end"
          >
            <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              Trade
              <select
                value={trade}
                onChange={(event) => setTrade(event.target.value)}
                disabled={uploading}
                className="rounded-lg border border-white/10 bg-slate-900 px-3 py-3 text-sm font-bold normal-case tracking-normal text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {tradeOptions.map((option) => (
                  <option key={option} value={option}>
                    {titleCase(option)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              Asset Type
              <input
                value={assetType}
                onChange={(event) => setAssetType(event.target.value)}
                disabled={uploading}
                className="rounded-lg border border-white/10 bg-slate-900 px-3 py-3 text-sm font-bold normal-case tracking-normal text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="hero"
              />
            </label>

            <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              Image
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                disabled={uploading}
                className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm font-bold normal-case tracking-normal text-white file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
              Alt Text
              <input
                value={altText}
                onChange={(event) => setAltText(event.target.value)}
                disabled={uploading}
                className="rounded-lg border border-white/10 bg-slate-900 px-3 py-3 text-sm font-bold normal-case tracking-normal text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Plumber working on a local job"
              />
            </label>

            <button
              disabled={uploading}
              className="h-11 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
          </form>

          {notice ? (
            <p className="mt-4 rounded-lg bg-green-500/10 px-3 py-2 text-sm font-bold text-green-300">
              {notice}
            </p>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : null}
        </section>

        {loading ? (
          <p className="rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-slate-400">
            Loading assets...
          </p>
        ) : groupedEntries.length ? (
          <div className="space-y-8">
            {groupedEntries.map(([groupTrade, groupAssets]) => (
              <section key={groupTrade}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-xl font-bold text-white">
                    {titleCase(groupTrade)}
                  </h2>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-300">
                    {groupAssets.length} asset
                    {groupAssets.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {groupAssets.map((asset) => (
                    <article
                      key={asset.id}
                      className="overflow-hidden rounded-xl border border-white/10 bg-white/5"
                    >
                      <div className="relative aspect-[16/10] bg-slate-900">
                        <Image
                          src={asset.imageUrl}
                          alt={asset.altText || `${titleCase(asset.trade)} hero image`}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                          className="object-cover"
                        />
                      </div>

                      <div className="space-y-3 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-300">
                            {titleCase(asset.trade)}
                          </span>
                          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-300">
                            {asset.assetType}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${
                              asset.isActive
                                ? "bg-green-500/15 text-green-300"
                                : "bg-slate-500/15 text-slate-300"
                            }`}
                          >
                            {asset.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>

                        <p className="line-clamp-2 min-h-10 text-sm text-slate-300">
                          {asset.altText || "No alt text set."}
                        </p>

                        <button
                          onClick={() => handleDelete(asset)}
                          disabled={deletingId === asset.id}
                          className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingId === asset.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-slate-400">
            No assets yet. Upload a hero image to start building the library.
          </p>
        )}
      </div>
    </main>
  );
}
