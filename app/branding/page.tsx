"use client";

import Link from "next/link";
import { ChangeEvent, ReactNode, useEffect, useMemo, useState } from "react";

type Lead = {
  id?: string;
  slug?: string;
  name?: string;
  businessName?: string;
  displayName?: string;
  trade?: string;
  city?: string;
  town?: string;
  suburb?: string;
  state?: string;
  region?: string;
  address?: string;
  formattedAddress?: string;
  website?: string;
  phone?: string;
  email?: string;
  siteBrandingUrl?: string | null;
  heroImageUrl?: string | null;
  siteIconUrl?: string | null;
  design?: SiteDesignColours;
  generated_site_design?: {
    button_color?: string;
    button_text_color?: string;
    hero_accent_color?: string;
    body_accent_color?: string;
    service_area_card_color?: string;
    footer_background_color?: string;
  };
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type WorkflowKey = "navigation" | "hero" | "icon" | "design";

type SiteDesignColours = {
  buttonColor?: string;
  buttonTextColor?: string;
  heroAccentColor?: string;
  bodyAccentColor?: string;
  serviceAreaCardColor?: string;
  footerBackgroundColor?: string;
};

type WorkflowState = {
  file: File | null;
  imageUrl: string;
  prompt: string;
  outputImageData: string;
  outputSizeBytes: number | null;
  savedUrl: string;
  notice: string;
  error: string;
};

type IconSource =
  | {
      type: "imageData";
      label: string;
      preview: string;
      value: string;
    }
  | {
      type: "imageUrl";
      label: string;
      preview: string;
      value: string;
    }
  | {
      type: "file";
      label: string;
      preview: string;
      file: File;
    };

const emptyWorkflow: WorkflowState = {
  file: null,
  imageUrl: "",
  prompt: "",
  outputImageData: "",
  outputSizeBytes: null,
  savedUrl: "",
  notice: "",
  error: "",
};

const workflowLabels: Record<WorkflowKey, string> = {
  navigation: "Navigation Branding",
  hero: "Hero Image Cleanup",
  icon: "Site Icon",
  design: "Design Colours",
};

const selectableLeadStatuses = new Set(["lead", "contacted", "client"]);

function normalizeLeadStatus(status: unknown) {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase();

  if (!normalized || normalized === "new") return "lead";
  if (normalized === "interested") return "contacted";

  return normalized;
}

function getDisplayStatus(lead?: Lead | null) {
  const status = normalizeLeadStatus(lead?.status);

  if (status === "lead") return "Lead";
  if (status === "contacted") return "Contacted";
  if (status === "client") return "Client";

  return "Unknown";
}

function getLeadSortTime(lead: Lead) {
  const timestamp = Date.parse(String(lead.updatedAt || lead.createdAt || ""));

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getSelectableBrandingLeads(leads: Lead[]) {
  return leads
    .filter((lead) => selectableLeadStatuses.has(normalizeLeadStatus(lead.status)))
    .sort((a, b) => getLeadSortTime(b) - getLeadSortTime(a));
}

function getLeadName(lead?: Lead | null) {
  return lead?.displayName || lead?.businessName || lead?.name || lead?.slug || "";
}

function getLeadSlug(lead?: Lead | null) {
  return String(lead?.slug || lead?.id || "").trim();
}

function getLeadLocation(lead?: Lead | null) {
  return (
    lead?.suburb ||
    lead?.town ||
    lead?.city ||
    lead?.state ||
    lead?.region ||
    lead?.formattedAddress ||
    lead?.address ||
    ""
  );
}

function getLeadDropdownLabel(lead: Lead) {
  return [
    getLeadName(lead),
    getDisplayStatus(lead),
    getLeadLocation(lead),
  ]
    .filter(Boolean)
    .join(" — ");
}

function getWebsiteLabel(value?: string | null) {
  const website = String(value || "").trim();

  if (!website) return "";

  try {
    const url = new URL(website);
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname && url.pathname !== "/" ? url.pathname : "";
    const label = `${host}${path}`;

    return label.length > 42 ? `${label.slice(0, 39)}...` : label;
  } catch {
    return website.length > 42 ? `${website.slice(0, 39)}...` : website;
  }
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "";

  return `${Math.round(bytes / 1024)}KB`;
}

function getFilePreview(file: File | null) {
  return file ? URL.createObjectURL(file) : "";
}

function getSiteIconSource(args: {
  navigationWorkflow: WorkflowState;
  savedNavigationBrandingUrl: string;
}): IconSource | null {
  if (args.navigationWorkflow.outputImageData) {
    return {
      type: "imageData",
      label: "Using current Navigation Branding output",
      preview: args.navigationWorkflow.outputImageData,
      value: args.navigationWorkflow.outputImageData,
    };
  }

  if (args.savedNavigationBrandingUrl) {
    return {
      type: "imageUrl",
      label: "Using saved Navigation Branding",
      preview: args.savedNavigationBrandingUrl,
      value: args.savedNavigationBrandingUrl,
    };
  }

  if (args.navigationWorkflow.imageUrl) {
    return {
      type: "imageUrl",
      label: "Using Navigation Branding source URL",
      preview: args.navigationWorkflow.imageUrl,
      value: args.navigationWorkflow.imageUrl,
    };
  }

  if (args.navigationWorkflow.file) {
    return {
      type: "file",
      label: "Using uploaded Navigation Branding source",
      preview: getFilePreview(args.navigationWorkflow.file),
      file: args.navigationWorkflow.file,
    };
  }

  return null;
}

function isHexColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function getCurrentDesignColours(lead?: Lead | null): Required<SiteDesignColours> {
  const design = lead?.design || {};
  const generatedDesign = lead?.generated_site_design || {};

  return {
    buttonColor:
      design.buttonColor || generatedDesign.button_color || "#14b8a6",
    buttonTextColor:
      design.buttonTextColor || generatedDesign.button_text_color || "#ffffff",
    heroAccentColor:
      design.heroAccentColor || generatedDesign.hero_accent_color || "#a7f3d0",
    bodyAccentColor:
      design.bodyAccentColor || generatedDesign.body_accent_color || "#0f766e",
    serviceAreaCardColor:
      design.serviceAreaCardColor ||
      generatedDesign.service_area_card_color ||
      "#0f766e",
    footerBackgroundColor:
      design.footerBackgroundColor ||
      generatedDesign.footer_background_color ||
      "#0b1220",
  };
}

const designColourLabels: Array<[keyof Required<SiteDesignColours>, string]> = [
  ["buttonColor", "Button"],
  ["buttonTextColor", "Button Text"],
  ["heroAccentColor", "Hero Accent"],
  ["bodyAccentColor", "Body Accent"],
  ["serviceAreaCardColor", "Service Areas Card"],
  ["footerBackgroundColor", "Footer Background"],
];

function FieldLabel({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
      {label}
      {children}
    </label>
  );
}

function PreviewPanel({
  title,
  image,
  sizeBytes,
}: {
  title: string;
  image: string;
  sizeBytes?: number | null;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-white">{title}</h3>
        {sizeBytes ? (
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-slate-300">
            {formatBytes(sizeBytes)}
          </span>
        ) : null}
      </div>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={title}
          className="max-h-72 w-full rounded-lg bg-white object-contain p-4"
        />
      ) : (
        <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/5 px-4 text-center text-sm text-slate-500">
          No image preview yet.
        </div>
      )}
    </div>
  );
}

function SavedAssetPanel({
  title,
  url,
}: {
  title: string;
  url?: string | null;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-white">{title}</h3>
      </div>
      {url ? (
        <div className="grid gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={title}
            className="max-h-40 w-full rounded-lg bg-white object-contain p-3"
          />
          <a
            href={url}
            target="_blank"
            className="block truncate text-sm font-bold text-blue-300 hover:text-blue-200"
            title={url}
          >
            {getWebsiteLabel(url) || "Open saved asset"}
          </a>
        </div>
      ) : (
        <p className="rounded-lg bg-white/5 px-3 py-3 text-sm text-slate-500">
          Nothing saved for this lead yet.
        </p>
      )}
    </div>
  );
}

function DesignColoursPanel({ colours }: { colours: Required<SiteDesignColours> }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-white">Current Design Colours</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {designColourLabels.map(([key, label]) => {
          const value = colours[key];

          return (
            <div
              key={key}
              className="flex items-center gap-3 rounded-lg bg-white/5 p-3"
            >
              <span
                className="h-10 w-10 shrink-0 rounded-lg border border-white/10"
                style={{ backgroundColor: isHexColor(value) ? value : "#0f172a" }}
              />
              <span className="min-w-0">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                  {label}
                </span>
                <span className="block font-mono text-sm text-slate-200">
                  {value}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function BrandingPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [selectedLeadSlug, setSelectedLeadSlug] = useState("");
  const [activeTab, setActiveTab] = useState<WorkflowKey>("navigation");
  const [transparentBackground, setTransparentBackground] = useState(true);
  const [cropWhitespace, setCropWhitespace] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [workflows, setWorkflows] = useState<Record<WorkflowKey, WorkflowState>>({
    navigation: { ...emptyWorkflow },
    hero: { ...emptyWorkflow },
    icon: { ...emptyWorkflow },
    design: { ...emptyWorkflow },
  });
  const selectedLead = useMemo(
    () => leads.find((lead) => getLeadSlug(lead) === selectedLeadSlug) || null,
    [leads, selectedLeadSlug]
  );
  const activeWorkflow = workflows[activeTab];
  const selectedLeadWebsiteLabel = getWebsiteLabel(selectedLead?.website);
  const currentNavigationBrandingUrl = selectedLead?.siteBrandingUrl || "";
  const currentHeroImageUrl = selectedLead?.heroImageUrl || "";
  const currentDesignColours = getCurrentDesignColours(selectedLead);
  const siteIconSource = getSiteIconSource({
    navigationWorkflow: workflows.navigation,
    savedNavigationBrandingUrl: currentNavigationBrandingUrl,
  });
  const sourcePreview =
    activeTab === "design"
      ? currentNavigationBrandingUrl
      :
    activeTab === "icon"
      ? siteIconSource?.preview || ""
      : getFilePreview(activeWorkflow.file) || activeWorkflow.imageUrl || "";
  const sourcePreviewTitle =
    activeTab === "design"
      ? "Navigation Branding source"
      : activeTab === "icon" && siteIconSource
      ? `Source preview - ${siteIconSource.label}`
      : "Source preview";

  useEffect(() => {
    async function loadLeads() {
      try {
        const requestedLeadSlug =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("lead") || ""
            : "";
        const res = await fetch("/api/leads", { cache: "no-store" });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to load leads");
        }

        const nextLeads = getSelectableBrandingLeads((data.leads || []) as Lead[]);

        setLeads(nextLeads);
        setSelectedLeadSlug((current) => {
          if (current) return current;

          const requestedLead = nextLeads.find(
            (lead) => getLeadSlug(lead) === requestedLeadSlug
          );

          return getLeadSlug(requestedLead || nextLeads[0]);
        });
      } catch (error) {
        setWorkflows((current) => ({
          ...current,
          navigation: {
            ...current.navigation,
            error:
              error instanceof Error ? error.message : "Failed to load leads",
          },
        }));
      } finally {
        setLoadingLeads(false);
      }
    }

    void loadLeads();
  }, []);

  useEffect(() => {
    if (!selectedLeadSlug || !selectedLead) return;

    setWorkflows((current) => ({
      ...current,
      navigation: {
        ...current.navigation,
        file: null,
        imageUrl: selectedLead.siteBrandingUrl || "",
        outputImageData: "",
        outputSizeBytes: null,
        savedUrl: selectedLead.siteBrandingUrl || "",
        notice: "",
        error: "",
      },
      hero: {
        ...current.hero,
        file: null,
        imageUrl: selectedLead.heroImageUrl || "",
        outputImageData: "",
        outputSizeBytes: null,
        savedUrl: selectedLead.heroImageUrl || "",
        notice: "",
        error: "",
      },
      icon: {
        ...current.icon,
        savedUrl: selectedLead.siteIconUrl || "",
      },
      design: {
        ...current.design,
        notice: "",
        error: "",
      },
    }));
  }, [selectedLeadSlug, selectedLead]);

  function updateWorkflow(tab: WorkflowKey, patch: Partial<WorkflowState>) {
    setWorkflows((current) => ({
      ...current,
      [tab]: {
        ...current[tab],
        ...patch,
      },
    }));
  }

  function handleFileChange(tab: WorkflowKey, event: ChangeEvent<HTMLInputElement>) {
    updateWorkflow(tab, {
      file: event.target.files?.[0] || null,
      outputImageData: "",
      outputSizeBytes: null,
      savedUrl: "",
      notice: "",
      error: "",
    });
  }

  function buildFormData(tab: WorkflowKey, includeSource = true) {
    const state = workflows[tab];
    const formData = new FormData();

    formData.append("leadSlug", selectedLeadSlug);
    formData.append(
      "mode",
      tab === "navigation" ? "navigation-branding" : tab
    );
    formData.append("prompt", state.prompt);
    formData.append("transparent", String(transparentBackground));
    formData.append("cropWhitespace", String(cropWhitespace));

    if (includeSource) {
      if (state.file) formData.append("file", state.file);
      else if (state.outputImageData) formData.append("imageData", state.outputImageData);
      else if (state.imageUrl) formData.append("imageUrl", state.imageUrl);
    }

    return formData;
  }

  function buildSiteIconFormData(source: IconSource) {
    const state = workflows.icon;
    const formData = buildFormData("icon", false);
    const prompt =
      state.prompt.trim() ||
      "Create a clean square favicon-style site icon based on this navigation branding. Use the same colours and visual style. Prefer a simple lettermark or symbol. Transparent background. No full business name text.";

    formData.set("prompt", prompt);

    if (source.type === "imageData") {
      formData.append("imageData", source.value);
    } else if (source.type === "imageUrl") {
      formData.append("imageUrl", source.value);
    } else {
      formData.append("file", source.file);
    }

    return formData;
  }

  async function callImageRoute(tab: WorkflowKey, path: string, formData: FormData) {
    setBusyAction(`${tab}:${path}`);
    updateWorkflow(tab, { notice: "", error: "" });

    try {
      const res = await fetch(path, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.details || "Image action failed");
      }

      updateWorkflow(tab, {
        outputImageData: data.imageData || workflows[tab].outputImageData,
        outputSizeBytes:
          typeof data.sizeBytes === "number"
            ? data.sizeBytes
            : workflows[tab].outputSizeBytes,
        savedUrl: data.imageUrl || data.asset?.imageUrl || workflows[tab].savedUrl,
        notice: data.imageUrl ? "Asset saved." : "Image updated.",
      });

      if (data.lead) {
        setLeads((current) =>
          getSelectableBrandingLeads(
            current.map((lead) =>
              getLeadSlug(lead) === getLeadSlug(data.lead)
                ? { ...lead, ...data.lead }
                : lead
            )
          )
        );
      }
    } catch (error) {
      updateWorkflow(tab, {
        error: error instanceof Error ? error.message : "Image action failed",
      });
    } finally {
      setBusyAction("");
    }
  }

  function generateFromLeadName() {
    const leadName = getLeadName(selectedLead);
    const trade = selectedLead?.trade || "local trade";
    const city = selectedLead?.city || "local area";
    const prompt = `Create clean professional navigation branding for ${leadName}, a ${trade} business in ${city}. Transparent background. Horizontal layout. Premium local trade business style. Strong readable text. No mockup, no background, no border, no extra symbols unless tasteful.`;
    const formData = new FormData();

    formData.append("leadSlug", selectedLeadSlug);
    formData.append("mode", "navigation-branding");
    formData.append("prompt", prompt);
    formData.append("transparent", String(transparentBackground));
    formData.append("cropWhitespace", String(cropWhitespace));

    updateWorkflow("navigation", {
      prompt,
      file: null,
      imageUrl: "",
    });
    setActiveTab("navigation");
    void callImageRoute("navigation", "/api/branding/generate", formData);
  }

  function saveAsset(tab: WorkflowKey, assetType: string) {
    const formData = buildFormData(tab);

    formData.set("assetType", assetType);
    formData.set(
      "altText",
      `${getLeadName(selectedLead) || "Lead"} ${workflowLabels[tab]}`
    );

    void callImageRoute(tab, "/api/branding/save", formData);
  }

  async function generateDesignColours() {
    if (!selectedLeadSlug) {
      updateWorkflow("design", { error: "Select a lead first.", notice: "" });
      return;
    }

    if (!currentNavigationBrandingUrl) {
      updateWorkflow("design", {
        error: "Add navigation branding first, then generate design colours.",
        notice: "",
      });
      return;
    }

    setBusyAction("design:/api/branding/design-colours");
    updateWorkflow("design", { error: "", notice: "" });

    try {
      const res = await fetch("/api/branding/design-colours", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ leadSlug: selectedLeadSlug }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error || data.details || "Failed to generate design colours"
        );
      }

      if (data.lead) {
        setLeads((current) =>
          getSelectableBrandingLeads(
            current.map((lead) =>
              getLeadSlug(lead) === getLeadSlug(data.lead)
                ? { ...lead, ...data.lead }
                : lead
            )
          )
        );
      }

      updateWorkflow("design", {
        notice: "Design colours generated and saved.",
        error: "",
      });
    } catch (error) {
      updateWorkflow("design", {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate design colours",
        notice: "",
      });
    } finally {
      setBusyAction("");
    }
  }

  const isBusy = Boolean(busyAction);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link href="/" className="text-sm font-bold text-blue-400">
              &larr; Back to dashboard
            </Link>
            <p className="mt-8 mb-2 text-sm font-bold uppercase tracking-[0.2em] text-blue-400">
              CallBoost
            </p>
            <h1 className="text-4xl font-black tracking-tight">
              Branding Workspace
            </h1>
            <p className="mt-3 max-w-3xl text-slate-400">
              Generate, edit, crop, compress and save generated-site branding
              assets for local business previews.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            {selectedLeadSlug ? (
              <Link
                href={`/leads/${encodeURIComponent(selectedLeadSlug)}`}
                className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500"
              >
                Back to Lead
              </Link>
            ) : null}
            <Link
              href="/assets"
              className="rounded-lg bg-white/10 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-white/15"
            >
              Asset Library
            </Link>
          </div>
        </div>

        <section className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr] lg:items-start">
            <FieldLabel label="Lead">
              <select
                value={selectedLeadSlug}
                onChange={(event) => setSelectedLeadSlug(event.target.value)}
                disabled={loadingLeads}
                className="rounded-lg border border-white/10 bg-slate-900 px-3 py-3 text-sm font-bold normal-case tracking-normal text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {leads.map((lead) => (
                  <option key={getLeadSlug(lead)} value={getLeadSlug(lead)}>
                    {getLeadDropdownLabel(lead)}
                  </option>
                ))}
              </select>
            </FieldLabel>

            <div className="grid gap-3 rounded-xl border border-white/10 bg-slate-950 p-4 text-sm text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
              <p className="min-w-0 overflow-hidden">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Name
                </span>
                <span className="block truncate">
                  {getLeadName(selectedLead) || "No lead selected"}
                </span>
              </p>
              <p className="min-w-0 overflow-hidden">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Status
                </span>
                <span className="block truncate">{getDisplayStatus(selectedLead)}</span>
              </p>
              <p className="min-w-0 overflow-hidden">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Trade
                </span>
                <span className="block truncate">{selectedLead?.trade || "-"}</span>
              </p>
              <p className="min-w-0 overflow-hidden">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Location
                </span>
                <span className="block truncate">{getLeadLocation(selectedLead) || "-"}</span>
              </p>
              <p className="min-w-0 overflow-hidden">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Website
                </span>
                {selectedLead?.website ? (
                  <a
                    href={selectedLead.website}
                    target="_blank"
                    className="block truncate text-blue-300 hover:text-blue-200"
                    title={selectedLead.website}
                  >
                    {selectedLeadWebsiteLabel || "Open website"}
                  </a>
                ) : (
                  <span className="text-slate-500">Not found yet</span>
                )}
              </p>
              <p className="min-w-0 overflow-hidden">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Phone
                </span>
                <span className="block break-words">{selectedLead?.phone || "-"}</span>
              </p>
              <p className="min-w-0 overflow-hidden">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Email
                </span>
                {selectedLead?.email ? (
                  <a
                    href={`mailto:${selectedLead.email}`}
                    className="block truncate text-blue-300 hover:text-blue-200"
                    title={selectedLead.email}
                  >
                    {selectedLead.email}
                  </a>
                ) : (
                  <span className="text-slate-500">Not found yet</span>
                )}
              </p>
            </div>
          </div>
        </section>

        <div className="mb-6 flex flex-wrap gap-3">
          {(["navigation", "hero", "icon", "design"] as WorkflowKey[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-4 py-3 text-sm font-black ${
                activeTab === tab
                  ? "bg-blue-600 text-white"
                  : "bg-white/10 text-slate-300 hover:bg-white/15"
              }`}
            >
              {workflowLabels[tab]}
            </button>
          ))}
        </div>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-2xl font-black">{workflowLabels[activeTab]}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                {activeTab === "navigation"
                  ? "Create transparent horizontal branding for the generated-site navigation area."
                  : activeTab === "hero"
                    ? "Clean up hero images by removing visible text, banners, labels and overlays."
                    : activeTab === "icon"
                      ? "Create a square favicon-style mark from the current branding output."
                      : "Generate generated-site design colours from the saved navigation branding image."}
              </p>
            </div>

            {activeTab === "navigation" ? (
              <button
                type="button"
                onClick={generateFromLeadName}
                disabled={isBusy || !selectedLeadSlug}
                className="rounded-lg bg-green-600 px-4 py-3 text-sm font-bold text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Generate Branding From Lead Name
              </button>
            ) : null}
          </div>

          <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-4">
              {activeTab !== "icon" && activeTab !== "design" ? (
                <>
                  <FieldLabel label="Upload Image">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => handleFileChange(activeTab, event)}
                      className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm font-bold normal-case tracking-normal text-white file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
                    />
                  </FieldLabel>

                  <FieldLabel label="Image URL">
                    <input
                      value={activeWorkflow.imageUrl}
                      onChange={(event) =>
                        updateWorkflow(activeTab, {
                          imageUrl: event.target.value,
                          file: null,
                          notice: "",
                          error: "",
                        })
                      }
                      className="rounded-lg border border-white/10 bg-slate-900 px-3 py-3 text-sm normal-case tracking-normal text-white outline-none"
                      placeholder="https://example.com/image.png"
                    />
                  </FieldLabel>
                </>
              ) : activeTab === "icon" ? (
                <p className="rounded-xl border border-white/10 bg-slate-950 p-4 text-sm text-slate-400">
                  Site icon generation uses the current Navigation Branding
                  output first, then the saved Navigation Branding URL for this
                  lead.
                </p>
              ) : (
                <div className="grid gap-4">
                  <p className="rounded-xl border border-white/10 bg-slate-950 p-4 text-sm text-slate-400">
                    Design Colours uses the saved Navigation Branding image for
                    this lead and applies the generated palette to the same
                    generated-site design fields used by Lead Detail.
                  </p>
                  <div className="rounded-xl border border-white/10 bg-slate-950 p-4 text-sm text-slate-300">
                    <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                      Selected Lead
                    </span>
                    <span className="mt-1 block font-bold">
                      {getLeadName(selectedLead) || "No lead selected"}
                    </span>
                  </div>
                </div>
              )}

              {activeTab !== "design" ? (
                <FieldLabel label="Prompt / Instructions">
                  <textarea
                    value={activeWorkflow.prompt}
                    onChange={(event) =>
                      updateWorkflow(activeTab, {
                        prompt: event.target.value,
                        notice: "",
                        error: "",
                      })
                    }
                    className="min-h-32 rounded-lg border border-white/10 bg-slate-900 px-3 py-3 text-sm normal-case tracking-normal text-white outline-none"
                    placeholder="Describe the desired cleanup, logo style, colours or icon direction..."
                  />
                </FieldLabel>
              ) : null}

              {activeTab === "navigation" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-lg bg-slate-950 px-3 py-3 text-sm font-bold text-slate-300">
                    <input
                      type="checkbox"
                      checked={transparentBackground}
                      onChange={(event) =>
                        setTransparentBackground(event.target.checked)
                      }
                    />
                    Transparent background
                  </label>
                  <label className="flex items-center gap-3 rounded-lg bg-slate-950 px-3 py-3 text-sm font-bold text-slate-300">
                    <input
                      type="checkbox"
                      checked={cropWhitespace}
                      onChange={(event) => setCropWhitespace(event.target.checked)}
                    />
                    Crop whitespace
                  </label>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                {activeTab === "navigation" ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        void callImageRoute(
                          "navigation",
                          "/api/branding/generate",
                          buildFormData("navigation")
                        )
                      }
                      disabled={isBusy || !selectedLeadSlug}
                      className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Generate / Edit Navigation Branding
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void callImageRoute(
                          "navigation",
                          "/api/branding/crop",
                          buildFormData("navigation")
                        )
                      }
                      disabled={isBusy}
                      className="rounded-lg bg-white/10 px-4 py-3 text-sm font-bold text-slate-200 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Crop Whitespace
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void callImageRoute(
                          "navigation",
                          "/api/branding/compress",
                          buildFormData("navigation")
                        )
                      }
                      disabled={isBusy}
                      className="rounded-lg bg-white/10 px-4 py-3 text-sm font-bold text-slate-200 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Compress Under 2000KB
                    </button>
                    <button
                      type="button"
                      onClick={() => saveAsset("navigation", "navigation-branding")}
                      disabled={isBusy || !activeWorkflow.outputImageData}
                      className="rounded-lg bg-green-600 px-4 py-3 text-sm font-bold text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Save as Navigation Branding
                    </button>
                  </>
                ) : activeTab === "hero" ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        void callImageRoute(
                          "hero",
                          "/api/branding/generate",
                          buildFormData("hero")
                        )
                      }
                      disabled={isBusy || !selectedLeadSlug}
                      className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Remove Text / Clean Hero Image
                    </button>
                    <button
                      type="button"
                      onClick={() => saveAsset("hero", "hero")}
                      disabled={isBusy || !activeWorkflow.outputImageData}
                      className="rounded-lg bg-green-600 px-4 py-3 text-sm font-bold text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Save as Hero Image
                    </button>
                  </>
                ) : activeTab === "icon" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (!siteIconSource) {
                          updateWorkflow("icon", {
                            error:
                              "Generate or save navigation branding before creating a site icon.",
                          });
                          return;
                        }

                        updateWorkflow("icon", {
                          outputImageData: "",
                          outputSizeBytes: null,
                        });
                        const formData = buildSiteIconFormData(siteIconSource);

                        void callImageRoute("icon", "/api/branding/generate", formData);
                      }}
                      disabled={isBusy || !selectedLeadSlug}
                      className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Generate Site Icon From Branding
                    </button>
                    <button
                      type="button"
                      onClick={() => saveAsset("icon", "icon")}
                      disabled={isBusy || !activeWorkflow.outputImageData}
                      className="rounded-lg bg-green-600 px-4 py-3 text-sm font-bold text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Save as Site Icon
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void generateDesignColours()}
                    disabled={isBusy || !selectedLeadSlug || !currentNavigationBrandingUrl}
                    className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Generate Design Colours
                  </button>
                )}
              </div>

              {isBusy ? (
                <p className="rounded-lg bg-blue-500/10 px-3 py-2 text-sm font-bold text-blue-300">
                  {activeTab === "design"
                    ? "Generating design colours..."
                    : "Working on image..."}
                </p>
              ) : null}

              {activeWorkflow.notice ? (
                <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm font-bold text-green-300">
                  {activeWorkflow.notice}
                </p>
              ) : null}

              {activeWorkflow.error ? (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {activeWorkflow.error}
                </p>
              ) : null}

              {activeTab === "design" && !currentNavigationBrandingUrl ? (
                <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm font-bold text-amber-200">
                  Add navigation branding first, then generate design colours.
                </p>
              ) : null}

              {activeWorkflow.savedUrl ? (
                <p className="break-all rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-300">
                  Saved URL:{" "}
                  <a
                    href={activeWorkflow.savedUrl}
                    target="_blank"
                    className="font-bold text-blue-300"
                  >
                    {activeWorkflow.savedUrl}
                  </a>
                </p>
              ) : null}
            </div>

            <div className="grid gap-4">
              {activeTab === "navigation" ? (
                <SavedAssetPanel
                  title="Current saved Navigation Branding"
                  url={currentNavigationBrandingUrl}
                />
              ) : null}
              {activeTab === "hero" ? (
                <SavedAssetPanel
                  title="Current saved Hero Image"
                  url={currentHeroImageUrl}
                />
              ) : null}
              {activeTab === "design" ? (
                <>
                  <SavedAssetPanel
                    title="Current Navigation Branding"
                    url={currentNavigationBrandingUrl}
                  />
                  <DesignColoursPanel colours={currentDesignColours} />
                </>
              ) : null}
              <PreviewPanel title={sourcePreviewTitle} image={sourcePreview} />
              {activeTab !== "design" ? (
                <PreviewPanel
                  title="Output preview"
                  image={activeWorkflow.outputImageData}
                  sizeBytes={activeWorkflow.outputSizeBytes}
                />
              ) : null}
              {activeTab === "navigation" ? (
                <div className="rounded-xl border border-white/10 bg-slate-950 p-4 text-sm text-slate-400">
                  Nav fit target: desktop around 460px x 62px, mobile around
                  230px x 40px. Keep transparent branding compact and avoid
                  heavy whitespace.
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
