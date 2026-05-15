import { getSupabaseAdmin } from "./server";
import type { LeadRecord } from "../leadLifecycle";
import { formatAustralianPhoneNumber } from "../contactMethods";
import { getRandomHeroImage, SITE_ASSETS_BUCKET } from "../siteAssets";
import {
  buildTradeProfile,
  getServiceModifierLabel,
  type ServiceModifier,
  type TradeProfile,
} from "../leadTargeting/tradeModifiers";

export type GeneratedSiteRow = {
  id?: string | number;
  lead_id?: string | number | null;
  slug: string;
  html: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type Review = {
  author: string;
  rating: number | null;
  text: string;
  relativeTimeDescription: string;
  source: string;
};

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

const generatedSiteReferenceFields = [
  "generatedSiteUrl",
  "generatedSitePublicUrl",
  "generatedSitePreviewUrl",
  "generatedSiteHtml",
  "generatedHtml",
  "siteHtml",
  "heroImageUrl",
  "mobileHeroImageUrl",
  "heroImageMobileUrl",
  "heroImageOverride",
  "generatedHeroImageUrl",
  "generatedHeroImage",
  "siteBrandingUrl",
  "siteLogoUrl",
  "siteIconUrl",
] as const;

function normalizeStorageKey(value: unknown, fallback: string) {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

export function removeGeneratedSiteReferencesFromLead<T extends LeadRecord>(
  lead: T
): T {
  const nextLead = { ...lead } as Record<string, unknown>;

  for (const field of generatedSiteReferenceFields) {
    if (Object.prototype.hasOwnProperty.call(nextLead, field)) {
      nextLead[field] = null;
    }
  }

  return nextLead as T;
}

async function removeStoragePrefix(
  supabase: SupabaseAdminClient,
  prefix: string
) {
  const { data, error } = await supabase.storage
    .from(SITE_ASSETS_BUCKET)
    .list(prefix, { limit: 1000 });

  if (error) throw error;

  const paths = (data || [])
    .filter((item) => item.name)
    .map((item) => `${prefix}/${item.name}`);

  if (!paths.length) return 0;

  const { error: removeError } = await supabase.storage
    .from(SITE_ASSETS_BUCKET)
    .remove(paths);

  if (removeError) throw removeError;

  return paths.length;
}

export type GeneratedSiteCleanupWarning = {
  type: "storage_cleanup_failed";
  leadId: string | number | null;
  slug: string;
  storagePath: string;
  message: string;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function purgeGeneratedSiteForLead(args: {
  supabase?: SupabaseAdminClient;
  lead: LeadRecord;
  leadId?: string | number | null;
}) {
  const supabase = args.supabase || getSupabaseAdmin();
  const slug = getText(args.lead.slug || args.lead.id).trim();
  const rawLeadId = args.leadId ?? args.lead.id ?? null;
  const leadId =
    typeof rawLeadId === "string" || typeof rawLeadId === "number"
      ? rawLeadId
      : null;
  const storageKeys = Array.from(
    new Set(
      [slug, leadId]
        .map((value) => normalizeStorageKey(value, ""))
        .filter(Boolean)
    )
  );

  if (slug) {
    const { error } = await supabase
      .from("generated_sites")
      .delete()
      .eq("slug", slug);

    if (error) throw error;
  }

  if (leadId !== null && leadId !== undefined && String(leadId).trim()) {
    const { error } = await supabase
      .from("generated_sites")
      .delete()
      .eq("lead_id", leadId);

    if (error) throw error;
  }

  for (const key of storageKeys) {
    await removeStoragePrefix(supabase, `hero-images/${key}`);
    await removeStoragePrefix(supabase, `mobile-hero-images/${key}`);
    await removeStoragePrefix(supabase, `site-branding/${key}`);
    await removeStoragePrefix(supabase, `site-icons/${key}`);
  }
}

export async function purgeGeneratedSiteForLeadBestEffort(args: {
  supabase?: SupabaseAdminClient;
  lead: LeadRecord;
  leadId?: string | number | null;
}) {
  const supabase = args.supabase || getSupabaseAdmin();
  const slug = getText(args.lead.slug || args.lead.id).trim();
  const rawLeadId = args.leadId ?? args.lead.id ?? null;
  const leadId =
    typeof rawLeadId === "string" || typeof rawLeadId === "number"
      ? rawLeadId
      : null;
  const storageKeys = Array.from(
    new Set(
      [slug, leadId]
        .map((value) => normalizeStorageKey(value, ""))
        .filter(Boolean)
    )
  );
  const warnings: GeneratedSiteCleanupWarning[] = [];

  if (slug) {
    const { error } = await supabase
      .from("generated_sites")
      .delete()
      .eq("slug", slug);

    if (error) throw error;
  }

  if (leadId !== null && leadId !== undefined && String(leadId).trim()) {
    const { error } = await supabase
      .from("generated_sites")
      .delete()
      .eq("lead_id", leadId);

    if (error) throw error;
  }

  for (const key of storageKeys) {
    for (const storagePath of [
      `hero-images/${key}`,
      `mobile-hero-images/${key}`,
      `site-branding/${key}`,
      `site-icons/${key}`,
    ]) {
      try {
        await removeStoragePrefix(supabase, storagePath);
      } catch (error) {
        const message = getErrorMessage(error);

        console.warn("[bulk-delete] storage cleanup failed", {
          leadId,
          slug,
          storagePath,
          error: message,
        });
        warnings.push({
          type: "storage_cleanup_failed",
          leadId,
          slug,
          storagePath,
          message,
        });
      }
    }
  }

  return warnings;
}

export async function saveGeneratedSite(args: {
  leadId?: string | number | null;
  slug: string;
  html: string;
}) {
  const supabase = getSupabaseAdmin();
  const existing = await supabase
    .from("generated_sites")
    .select("id")
    .eq("slug", args.slug)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  const row = {
    lead_id: args.leadId || null,
    slug: args.slug,
    html: args.html,
  };

  if (existing.data?.id) {
    const { data, error } = await supabase
      .from("generated_sites")
      .update(row)
      .eq("id", existing.data.id)
      .select("*")
      .single();

    if (error) throw error;

    return data as GeneratedSiteRow;
  }

  const { data, error } = await supabase
    .from("generated_sites")
    .insert(row)
    .select("*")
    .single();

  if (error) throw error;

  return data as GeneratedSiteRow;
}

export async function getGeneratedSiteBySlug(slug: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("generated_sites")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;

  return data as GeneratedSiteRow | null;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: unknown) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function appendUrlVersion(value: string, version: string) {
  if (!version) return value;

  try {
    const url = new URL(value);

    url.searchParams.set("v", version);
    return url.toString();
  } catch {
    const [withoutHash, hash = ""] = value.split("#", 2);
    const separator = withoutHash.includes("?") ? "&" : "?";
    const nextUrl = `${withoutHash}${separator}v=${encodeURIComponent(version)}`;

    return hash ? `${nextUrl}#${hash}` : nextUrl;
  }
}

function slugify(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (typeof record.text === "string") return record.text;
    if (typeof record.name === "string") return record.name;
    if (typeof record.displayName === "string") return record.displayName;
  }

  return "";
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.map((item) => getText(item).trim()).filter(Boolean);
}

function titleCase(value: unknown) {
  return String(value ?? "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function cleanBusinessName(value: unknown) {
  return getText(value)
    .replace(/#+/g, "")
    .replace(/\s*[-–—]+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function phoneToTel(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

function hashString(value: unknown) {
  const text = String(value ?? "");
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function pickStable<T>(items: T[], seed: string, offset = 0) {
  return items[(hashString(seed) + offset) % items.length];
}

const plumbingGasFittingTradeKey = "plumbing-gas-fitting";

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function getNestedValue(record: Record<string, unknown>, path: string[]) {
  let current: unknown = record;

  for (const key of path) {
    const currentRecord = getRecord(current);

    if (!currentRecord) return undefined;

    current = currentRecord[key];
  }

  return current;
}

function getImageUrl(value: unknown): string {
  if (typeof value === "string") return value.trim();

  const record = getRecord(value);

  if (!record) return "";

  return getText(
    record.url ||
      record.src ||
      record.image ||
      record.imageUrl ||
      record.photoUrl ||
      record.href ||
      record.contentUrl
  ).trim();
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isHexColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

type Rgb = {
  r: number;
  g: number;
  b: number;
};

function hexToRgb(hex: string): Rgb {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function luminance(color: Rgb) {
  const channels = [color.r, color.g, color.b].map((value) => {
    const normalized = value / 255;

    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: Rgb, b: Rgb) {
  const lighter = Math.max(luminance(a), luminance(b));
  const darker = Math.min(luminance(a), luminance(b));

  return (lighter + 0.05) / (darker + 0.05);
}

function getReadableTextColor(backgroundColor: string) {
  const rgb = hexToRgb(backgroundColor);

  return contrastRatio(rgb, { r: 255, g: 255, b: 255 }) >=
    contrastRatio(rgb, { r: 15, g: 23, b: 42 })
    ? "#ffffff"
    : "#0f172a";
}

const designColorKeys = {
  buttonColor: "button_color",
  buttonTextColor: "button_text_color",
  heroAccentColor: "hero_accent_color",
  bodyAccentColor: "body_accent_color",
  serviceAreaCardColor: "service_area_card_color",
  footerBackgroundColor: "footer_background_color",
} as const;

function getDesignColor(
  lead: LeadRecord,
  key: keyof typeof designColorKeys,
  fallback: string
) {
  const design = getRecord(lead.design);
  const generatedSiteDesign = getRecord(lead.generated_site_design);
  const value = design?.[key] || generatedSiteDesign?.[designColorKeys[key]];
  const legacyAccent = design?.accentTextColor || generatedSiteDesign?.accent_text_color;

  if (isHexColor(value)) return String(value);
  if (
    (key === "heroAccentColor" || key === "bodyAccentColor") &&
    isHexColor(legacyAccent)
  ) {
    return String(legacyAccent);
  }

  return fallback;
}

function getImageDimension(value: unknown, key: "width" | "height") {
  const record = getRecord(value);
  const nested = getRecord(record?.dimensions);
  const size = getRecord(record?.size);
  const parsed = Number(record?.[key] ?? nested?.[key] ?? size?.[key]);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function looksLikeLogoOrThumbnail(url: string, source: string, value: unknown) {
  const record = getRecord(value);
  const text = [
    url,
    source,
    getText(record?.type),
    getText(record?.kind),
    getText(record?.alt),
    getText(record?.title),
    getText(record?.label),
  ]
    .join(" ")
    .toLowerCase();

  return /logo|icon|favicon|avatar|profile|thumbnail|thumb|badge/.test(text);
}

function scoreBusinessHeroImageCandidate(args: {
  source: string;
  url: string;
  value: unknown;
}) {
  const { source, url, value } = args;

  if (!isValidHttpUrl(url)) return null;
  if (looksLikeLogoOrThumbnail(url, source, value)) return null;

  const width = getImageDimension(value, "width");
  const height = getImageDimension(value, "height");

  if ((width && width < 600) || (height && height < 300)) return null;

  const ratio = width && height ? width / height : null;

  if (ratio && ratio < 1.15) return null;

  let score = 10;

  if (/hero|cover|banner|og|social/i.test(source)) score += 40;
  if (/image|photo/i.test(source)) score += 10;
  if (width && width >= 1000) score += 10;
  if (height && height >= 500) score += 8;
  if (ratio && ratio >= 1.4) score += 10;

  return score;
}

function addBusinessHeroImageCandidate(
  candidates: Array<{ score: number; source: string; url: string }>,
  source: string,
  value: unknown,
  scoreBoost = 0
) {
  const url = getImageUrl(value);
  const score = scoreBusinessHeroImageCandidate({ source, url, value });

  if (score === null) return;

  candidates.push({ score: score + scoreBoost, source, url });
}

function addBusinessHeroImageCandidatesFromArray(
  candidates: Array<{ score: number; source: string; url: string }>,
  source: string,
  value: unknown
) {
  if (!Array.isArray(value)) return;

  value.forEach((item, index) => {
    addBusinessHeroImageCandidate(candidates, `${source}[${index}]`, item);
  });
}

function getBusinessHeroImage(lead: LeadRecord) {
  const leadRecord = getRecord(lead) || {};
  const candidates: Array<{ score: number; source: string; url: string }> = [];
  const explicitPaths = [
    ["heroImageOverride"],
    ["heroImageUrl"],
    ["heroImage"],
    ["generatedHeroImageUrl"],
    ["generatedHeroImage"],
    ["data", "heroImageOverride"],
    ["data", "heroImageUrl"],
    ["data", "heroImage"],
  ];
  const imagePaths = [
    ["coverImage"],
    ["coverPhoto"],
    ["facebookCoverImage"],
    ["socialImage"],
    ["ogImage"],
    ["openGraphImage"],
    ["websiteImage"],
    ["metadata", "image"],
    ["metadata", "ogImage"],
    ["websiteMetadata", "image"],
    ["websiteMetadata", "ogImage"],
    ["socialMetadata", "image"],
    ["socialMetadata", "ogImage"],
    ["facebook", "coverImage"],
    ["facebook", "coverPhoto"],
    ["data", "coverImage"],
    ["data", "coverPhoto"],
    ["data", "facebookCoverImage"],
    ["data", "socialImage"],
    ["data", "ogImage"],
    ["data", "openGraphImage"],
    ["data", "websiteMetadata", "image"],
    ["data", "websiteMetadata", "ogImage"],
    ["data", "socialMetadata", "image"],
    ["data", "facebook", "coverImage"],
    ["data", "facebook", "coverPhoto"],
  ];
  const imageArrayPaths = [
    ["images"],
    ["photos"],
    ["websiteImages"],
    ["socialImages"],
    ["data", "images"],
    ["data", "photos"],
    ["data", "websiteImages"],
    ["data", "socialImages"],
  ];

  for (const path of explicitPaths) {
    addBusinessHeroImageCandidate(
      candidates,
      path.join("."),
      getNestedValue(leadRecord, path),
      100
    );
  }

  for (const path of imagePaths) {
    addBusinessHeroImageCandidate(
      candidates,
      path.join("."),
      getNestedValue(leadRecord, path)
    );
  }

  for (const path of imageArrayPaths) {
    addBusinessHeroImageCandidatesFromArray(
      candidates,
      path.join("."),
      getNestedValue(leadRecord, path)
    );
  }

  const bestCandidate = candidates.sort((a, b) => b.score - a.score)[0];

  return bestCandidate ? { source: bestCandidate.source, url: bestCandidate.url } : null;
}

function getBusinessMobileHeroImage(lead: LeadRecord) {
  const leadRecord = getRecord(lead) || {};
  const explicitPaths = [
    ["mobileHeroImageUrl"],
    ["mobileHeroImage"],
    ["heroImageMobileUrl"],
    ["hero_image_mobile_url"],
    ["mobile_hero_image_url"],
    ["data", "mobileHeroImageUrl"],
    ["data", "mobileHeroImage"],
    ["data", "heroImageMobileUrl"],
    ["data", "hero_image_mobile_url"],
    ["data", "mobile_hero_image_url"],
  ];

  for (const path of explicitPaths) {
    const url = getImageUrl(getNestedValue(leadRecord, path));

    if (url) return url;
  }

  return "";
}

function isPlumberTrade(trade: unknown) {
  return String(trade ?? "").toLowerCase().includes("plumb");
}

function isPlumbingGasFittingTrade(trade: unknown) {
  const text = String(trade ?? "").toLowerCase();
  const slug = slugify(text);

  return (
    slug === plumbingGasFittingTradeKey ||
    (text.includes("plumb") && (text.includes("gas") || text.includes("fitting")))
  );
}

function isServiceTrade(trade: unknown) {
  const text = String(trade ?? "").toLowerCase();

  return [
    "plumb",
    "electric",
    "roof",
    "locksmith",
    "hvac",
    "air conditioning",
    "handyman",
    "gas",
    "pest",
    "clean",
    "garage",
    "glass",
    "tree",
    "landscap",
  ].some((keyword) => text.includes(keyword));
}

function normalizeTrade(trade: unknown) {
  const text = String(trade ?? "").toLowerCase();

  if (isPlumbingGasFittingTrade(text)) return plumbingGasFittingTradeKey;
  if (text.includes("plumb")) return "plumber";
  if (text.includes("electric")) return "electrician";
  if (text.includes("roof")) return "roofer";

  return slugify(trade || "tradie");
}

function getTradeLabel(trade: unknown) {
  if (isPlumbingGasFittingTrade(trade)) return "Plumbing and Gas Fitting";

  return titleCase(trade);
}

function getTradeHelpLabel(trade: unknown) {
  if (isPlumbingGasFittingTrade(trade)) return "plumbing or gas fitting";
  if (isPlumberTrade(trade)) return "plumbing";

  return getTradeLabel(trade).toLowerCase();
}

function getServicePlaceholder(trade: unknown) {
  if (isPlumbingGasFittingTrade(trade)) {
    return "Leak, blocked drain, hot water, gas fitting...";
  }

  return isPlumberTrade(trade)
    ? "Blocked drain, leak, hot water..."
    : "Repairs, maintenance, quote...";
}

function hasModifier(profile: TradeProfile, modifier: ServiceModifier) {
  return profile.service_modifiers.includes(modifier);
}

function hasRoofSheetmetalModifier(profile: TradeProfile) {
  return (
    hasModifier(profile, "sheetmetal") ||
    hasModifier(profile, "roof_plumbing") ||
    hasModifier(profile, "guttering") ||
    hasModifier(profile, "flashing")
  );
}

function getModifierServices(profile: TradeProfile) {
  const services: string[] = [];

  if (hasRoofSheetmetalModifier(profile)) {
    services.push(
      "General Plumbing",
      "Roof Plumbing",
      "Guttering & Downpipes",
      "Sheetmetal Work",
      "Flashings",
      "Repairs & Maintenance"
    );
  }

  if (hasModifier(profile, "gas_fitting")) {
    services.push("Gas Fitting", "Gas Appliance Connections");
  }

  if (hasModifier(profile, "drainage")) {
    services.push("Blocked Drains", "Drainage Repairs");
  }

  if (hasModifier(profile, "bathrooms")) {
    services.push("Bathroom Plumbing", "Bathroom Renovation Plumbing");
  }

  if (hasModifier(profile, "renovations")) {
    services.push("Renovation Plumbing");
  }

  if (hasModifier(profile, "hot_water")) {
    services.push("Hot Water Systems");
  }

  if (hasModifier(profile, "emergency_plumbing")) {
    services.push("Emergency Plumbing");
  }

  if (hasModifier(profile, "excavation")) {
    services.push("Drainage & Excavation");
  }

  if (hasModifier(profile, "maintenance")) {
    services.push("Maintenance Plumbing");
  }

  return services;
}

const modifierServiceCards: Record<
  ServiceModifier,
  { title: string; description: string; patterns: RegExp[] }
> = {
  gas_fitting: {
    title: "Gas Fitting",
    description:
      "Licensed gas fitting support for local homes and businesses, including safe installations, repairs and appliance connections.",
    patterns: [/\bgas fitting\b/i],
  },
  sheetmetal: {
    title: "Sheetmetal Services",
    description:
      "Custom sheetmetal work and related plumbing support for local residential and commercial jobs.",
    patterns: [/\bsheetmetal\b/i, /\bsheet metal\b/i],
  },
  roof_plumbing: {
    title: "Roof Plumbing",
    description:
      "Roof plumbing support including gutters, flashings, downpipes and rainwater drainage.",
    patterns: [/\broof plumbing\b/i],
  },
  guttering: {
    title: "Guttering & Downpipes",
    description:
      "Gutter and downpipe repairs, replacements and maintenance to help manage roof water safely.",
    patterns: [/\bguttering\b/i, /\bgutters?\b/i, /\bdownpipes?\b/i],
  },
  flashing: {
    title: "Flashings",
    description:
      "Flashing repairs and installation to help protect roof edges, joins and penetrations from water ingress.",
    patterns: [/\bflashings?\b/i],
  },
  excavation: {
    title: "Excavation Support",
    description:
      "Excavation support for plumbing-related works where access, trenching or site preparation is needed.",
    patterns: [/\bexcavation\b/i, /\btrenching\b/i],
  },
  drainage: {
    title: "Drainage Repairs",
    description:
      "Drainage support for blocked, damaged or poorly performing stormwater and waste lines.",
    patterns: [/\bdrainage\b/i, /\bdrain\b/i],
  },
  bathrooms: {
    title: "Bathroom Plumbing",
    description:
      "Bathroom plumbing support for fixtures, wet areas, upgrades and renovation work.",
    patterns: [/\bbathroom\b/i],
  },
  renovations: {
    title: "Renovation Plumbing",
    description:
      "Plumbing support for renovation projects, upgrades and practical changes around the property.",
    patterns: [/\brenovation\b/i],
  },
  maintenance: {
    title: "Maintenance Plumbing",
    description:
      "Routine repairs and maintenance to keep taps, fixtures, pipes and wet areas working properly.",
    patterns: [/\bmaintenance\b/i, /\brepairs?\b/i],
  },
  emergency_plumbing: {
    title: "Emergency Plumbing",
    description:
      "Prompt help for urgent plumbing issues, leaks, overflows and jobs that cannot wait.",
    patterns: [/\bemergency\b/i, /\burgent\b/i],
  },
  hot_water: {
    title: "Hot Water Systems",
    description:
      "Hot water repairs, replacements and servicing for common local systems.",
    patterns: [/\bhot water\b/i],
  },
};

function getRequiredModifierServiceCards(profile: TradeProfile) {
  return profile.service_modifiers
    .map((modifier) => modifierServiceCards[modifier])
    .filter((card): card is { title: string; description: string; patterns: RegExp[] } =>
      Boolean(card)
    );
}

function hasServiceConcept(services: string[], patterns: RegExp[]) {
  return services.some((service) => patterns.some((pattern) => pattern.test(service)));
}

function getServicePhrase(trade: string, profile: TradeProfile) {
  if (isPlumberTrade(trade) && hasRoofSheetmetalModifier(profile)) {
    return "plumbing, roof plumbing, guttering and sheetmetal services";
  }

  if (isPlumbingGasFittingTrade(trade) || hasModifier(profile, "gas_fitting")) {
    return "plumbing and gas fitting services";
  }

  if (isPlumberTrade(trade) && hasModifier(profile, "bathrooms")) {
    return "plumbing and bathroom renovation services";
  }

  if (isPlumberTrade(trade) && hasModifier(profile, "drainage")) {
    return "plumbing and drainage services";
  }

  return `${getTradeHelpLabel(trade)} services`;
}

function getProfileTradeLabel(trade: string, profile: TradeProfile) {
  if (isPlumberTrade(trade) && hasRoofSheetmetalModifier(profile)) {
    return "Plumbing & Sheetmetal";
  }

  if (isPlumbingGasFittingTrade(trade) || hasModifier(profile, "gas_fitting")) {
    return "Plumbing and Gas Fitting";
  }

  if (isPlumberTrade(trade) && hasModifier(profile, "bathrooms")) {
    return "Plumbing and Bathrooms";
  }

  if (isPlumberTrade(trade) && hasModifier(profile, "drainage")) {
    return "Plumbing and Drainage";
  }

  return getTradeLabel(trade);
}

function buildServicesHeading() {
  return "Our Services";
}

function buildQuickQuoteHeading() {
  return "Need a fast quote?";
}

function getDefaultServices(trade: string) {
  if (isPlumbingGasFittingTrade(trade)) {
    return [
      "General Plumbing Repairs",
      "Burst Pipes and Leaks",
      "Blocked Drains",
      "Hot Water Systems",
      "Gas Fitting and Appliance Connections",
      "Gas Leak Checks and Safety",
      "Bathroom, Kitchen and Laundry Plumbing",
      "Maintenance Plumbing",
      "Emergency Plumbing",
    ];
  }

  if (isPlumberTrade(trade)) {
    return [
      "Emergency Plumbing",
      "Blocked Drains",
      "Hot Water Systems",
      "Leak Detection & Repairs",
      "General Plumbing",
      "Bathroom & Kitchen Plumbing",
      "Gas Fitting",
      "Commercial Plumbing",
    ];
  }

  return [
    `Emergency ${titleCase(trade)}`,
    "Repairs & Maintenance",
    "Residential Service",
    "Commercial Service",
    "Local Call Outs",
    "Quotes & Advice",
  ];
}

function getServiceDescription(serviceName: string, trade: string) {
  const lower = serviceName.toLowerCase();
  const modifierCard = Object.values(modifierServiceCards).find(
    (card) => card.title.toLowerCase() === lower
  );

  if (modifierCard) {
    return modifierCard.description;
  }

  if (lower.includes("sheetmetal") || lower.includes("sheet metal")) {
    return "Practical sheetmetal work for local roofing, plumbing and building details.";
  }

  if (lower.includes("roof plumbing")) {
    return "Roof plumbing support for water flow, flashing details and weather protection.";
  }

  if (lower.includes("gutter") || lower.includes("downpipe")) {
    return "Guttering and downpipe work to move water away from roofs, walls and foundations.";
  }

  if (lower.includes("flashing")) {
    return "Flashing repairs and installation to help protect roof edges, joins and penetrations.";
  }

  if (lower.includes("excavation")) {
    return "Drainage and excavation support for practical underground plumbing access and repairs.";
  }

  if (lower.includes("emergency") || lower.includes("urgent")) {
    return "Fast help for urgent issues, leaks, overflows and jobs that cannot wait.";
  }

  if (lower.includes("blocked") || lower.includes("drain")) {
    return "Clear blocked sinks, toilets, showers and stormwater drains with practical repair advice.";
  }

  if (lower.includes("hot water")) {
    return "Repair, replacement and servicing for electric, gas and common hot water systems.";
  }

  if (lower.includes("appliance") || lower.includes("connection")) {
    return "Safe gas appliance connection support with clear scope and practical advice.";
  }

  if (lower.includes("leak")) {
    if (lower.includes("gas") || lower.includes("safety")) {
      return "Prompt gas leak checks and safety-minded support when something does not seem right.";
    }

    return "Find the source of leaks and arrange repairs before water damage gets worse.";
  }

  if (lower.includes("bathroom") || lower.includes("kitchen")) {
    return "Support for renovations, upgrades, taps, toilets, sinks and fixtures.";
  }

  if (lower.includes("gas")) {
    return "Gas fitting support where suitable, with clear scope and safety-minded workmanship.";
  }

  if (lower.includes("maintenance")) {
    return "Routine plumbing maintenance to keep taps, fixtures, pipes and wet areas working properly.";
  }

  if (lower.includes("general plumbing")) {
    return "Practical help for everyday plumbing faults, repairs and fixture issues around the property.";
  }

  if (lower.includes("commercial")) {
    return "Reliable support for shops, offices, rentals and local business premises.";
  }

  return `Straightforward ${trade.toLowerCase()} repairs, maintenance and installation help for local properties.`;
}

function getServices(lead: LeadRecord, trade: string, profile: TradeProfile) {
  const leadServices = getStringArray(lead.services);
  const modifierServices = getModifierServices(profile);
  const defaults = getDefaultServices(trade);
  const requiredModifierCards = getRequiredModifierServiceCards(profile);
  const seen = new Set<string>();
  const services: string[] = [];
  const maxServices = Math.max(6, requiredModifierCards.length);

  for (const service of [...leadServices, ...modifierServices, ...defaults]) {
    const clean = service.length > 80 ? `${service.slice(0, 77)}...` : service;
    const key = clean.toLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      services.push(clean);
    }
  }

  for (const card of requiredModifierCards) {
    if (!hasServiceConcept(services, card.patterns)) {
      services.push(card.title);
      seen.add(card.title.toLowerCase());
    }
  }

  const requiredTitles = new Set(
    requiredModifierCards
      .filter((card) => hasServiceConcept(services, card.patterns))
      .map((card) => {
        const representedService = services.find((service) =>
          card.patterns.some((pattern) => pattern.test(service))
        );

        return representedService?.toLowerCase() || card.title.toLowerCase();
      })
  );
  const visibleServices = services.slice(0, maxServices);

  for (const service of services.slice(maxServices)) {
    if (visibleServices.length >= Math.max(maxServices, requiredTitles.size)) {
      break;
    }

    if (requiredTitles.has(service.toLowerCase())) {
      visibleServices.push(service);
    }
  }

  for (const card of requiredModifierCards) {
    if (!hasServiceConcept(visibleServices, card.patterns)) {
      const existingIndex = services.findIndex((service) =>
        card.patterns.some((pattern) => pattern.test(service))
      );

      visibleServices.push(existingIndex >= 0 ? services[existingIndex] : card.title);
    }
  }

  return Array.from(new Set(visibleServices));
}

function getTopServices(services: string[], trade: string) {
  if (services.length > 0) return services.slice(0, 3).join(", ");

  if (isPlumbingGasFittingTrade(trade)) {
    return "plumbing repairs, hot water and gas fitting";
  }
  if (isPlumberTrade(trade)) return "leaks, blocked drains and hot water issues";

  return "repairs, maintenance and urgent jobs";
}

const legacyPlumberUnderSinkHeroImage =
  // Deprecated for new generations; keep the URL documented so saved site HTML using it remains understandable.
  "https://commons.wikimedia.org/wiki/Special:Redirect/file/Plumber_under_kitchen_sink.jpg";

function getHeroImages(trade: string, seed: string) {
  const plumberImages = [
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/Sink_unclogging_repair.jpg",
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/Plumber_at_work.jpg",
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/Plumber_soldering_pipe_above_new_water_heater.JPG",
  ];
  const genericTradeImages = [
    "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1800&q=80",
    "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1800&q=80",
  ];

  void legacyPlumberUnderSinkHeroImage;

  return pickStable(isPlumberTrade(trade) ? plumberImages : genericTradeImages, seed);
}

async function getGeneratedHeroImage(args: {
  lead: LeadRecord;
  trade: string;
  seed: string;
}) {
  const businessHeroImage = getBusinessHeroImage(args.lead);

  if (businessHeroImage?.url) return businessHeroImage.url;

  try {
    const assetTrade = isPlumbingGasFittingTrade(args.trade) ? "plumber" : args.trade;

    return await getRandomHeroImage(assetTrade);
  } catch (error) {
    console.warn("Generated site asset lookup failed; using stock hero image.", error);
    return getHeroImages(args.trade, args.seed);
  }
}

function getLocationCoords(location: unknown) {
  if (!location || typeof location !== "object") return null;

  const record = location as Record<string, unknown>;
  const lat = record.lat ?? record.latitude;
  const lng = record.lng ?? record.longitude;
  const latNumber = Number(lat);
  const lngNumber = Number(lng);

  if (!Number.isFinite(latNumber) || !Number.isFinite(lngNumber)) return null;

  return { lat: latNumber, lng: lngNumber };
}

function getLeadAddress(lead: LeadRecord) {
  return (
    getText(lead.address).trim() ||
    getText(lead.formattedAddress).trim()
  );
}

function getMapEmbedUrl(lead: LeadRecord, businessName: string, city: string) {
  const address = getLeadAddress(lead);

  if (address) {
    return `https://www.google.com/maps?q=${encodeURIComponent(address)}&z=14&output=embed`;
  }

  const coords = getLocationCoords(lead.location);

  if (coords) {
    return `https://www.google.com/maps?q=${coords.lat},${coords.lng}&z=14&output=embed`;
  }

  const fallbackQuery = [businessName, city].filter(Boolean).join(" ");

  return fallbackQuery
    ? `https://www.google.com/maps?q=${encodeURIComponent(fallbackQuery)}&z=14&output=embed`
    : "";
}

function formatHours(hours: unknown) {
  if (!hours) return [];
  if (Array.isArray(hours)) return hours.map(getText).filter(Boolean);
  if (typeof hours === "string") return [hours];

  if (typeof hours === "object") {
    const record = hours as Record<string, unknown>;

    if (Array.isArray(record.weekdayDescriptions)) {
      return record.weekdayDescriptions.map(getText).filter(Boolean);
    }

    if (Array.isArray(record.weekdayText)) {
      return record.weekdayText.map(getText).filter(Boolean);
    }
  }

  return [];
}

function formatReviewText(review: unknown) {
  const text = getText(review).trim();

  return text.length > 190 ? `${text.slice(0, 187)}...` : text;
}

function normalizeReview(review: unknown): Review | null {
  if (!review) return null;

  if (typeof review === "string") {
    return {
      author: "Local Customer",
      rating: 5,
      text: formatReviewText(review),
      relativeTimeDescription: "",
      source: "",
    };
  }

  if (typeof review !== "object") return null;

  const record = review as Record<string, unknown>;
  const rating = Number(record.rating);
  const normalized = {
    author:
      getText(record.author || record.author_name || record.name).trim() ||
      "Local Customer",
    rating: Number.isFinite(rating) ? rating : null,
    text: formatReviewText(record.text || review),
    relativeTimeDescription: getText(
      record.relativeTimeDescription || record.relative_time_description
    ).trim(),
    source: getText(record.source).trim().toLowerCase(),
  };

  if (!normalized.author && !normalized.rating && !normalized.text) return null;

  return normalized;
}

function getReviews(lead: LeadRecord) {
  return Array.isArray(lead.reviews)
    ? lead.reviews
        .map(normalizeReview)
        .filter(
          (review): review is Review =>
            Boolean(review?.text) && Number(review?.rating || 0) >= 4
        )
        .sort((a, b) => {
          const ratingDiff = Number(b.rating || 0) - Number(a.rating || 0);

          if (ratingDiff !== 0) return ratingDiff;

          return getReviewAgeDays(a) - getReviewAgeDays(b);
        })
        .slice(0, 3)
    : [];
}

function getReviewAgeDays(review: Review) {
  const text = review.relativeTimeDescription || "";
  const numberMatch = text.match(/\d+/);
  const amount = numberMatch ? Number(numberMatch[0]) : 0;

  if (/day/i.test(text)) return amount;
  if (/week/i.test(text)) return amount * 7;
  if (/month/i.test(text)) return amount * 30;
  if (/year/i.test(text)) return amount * 365;

  return Number.MAX_SAFE_INTEGER;
}

function isGoogleReviewSource(lead: LeadRecord, reviews: Review[]) {
  const reviewsSource = getText(lead.reviewsSource).toLowerCase();

  return reviewsSource === "google" || reviews.some((review) => review.source === "google");
}

function renderStars(rating: number | null) {
  if (!rating || !Number.isFinite(rating) || rating <= 0) return "";

  const count = Math.max(1, Math.min(5, Math.round(rating)));

  return "&#9733;".repeat(count);
}

function getTrustItems(args: {
  city: string;
  lead: LeadRecord;
  profile: TradeProfile;
  services: string[];
  trade: string;
}) {
  const { city, lead, profile, services, trade } = args;
  const label = getTradeHelpLabel(trade);
  const items: [string, string][] = [
    [
      "Licensed & insured",
      `Professional ${label} help with safety-minded workmanship.`,
    ],
    [
      `Local ${city} service`,
      `Support from a local business focused on ${city} and nearby areas.`,
    ],
    [
      "Fast response",
      `Quick contact for ${getTopServices(services, trade).toLowerCase()} and urgent jobs.`,
    ],
    ["Clear quotes", "Straightforward communication before work begins."],
    [
      "Quality workmanship",
      "Neat, practical repairs and installations for homes and businesses.",
    ],
    [
      "Residential & commercial",
      "Help for households, rentals, offices and local business premises.",
    ],
  ];

  if (isPlumbingGasFittingTrade(trade)) {
    items.splice(
      2,
      0,
      [
        "Safe gas fitting work",
        "Support for gas fitting, appliance connections and gas safety checks with careful workmanship.",
      ],
      [
        "Practical repairs",
        "Straightforward help for leaks, blocked drains, hot water systems and maintenance plumbing.",
      ]
    );
  }

  if (
    hasModifier(profile, "sheetmetal") ||
    hasModifier(profile, "roof_plumbing") ||
    hasModifier(profile, "guttering")
  ) {
    items.splice(
      2,
      0,
      [
        "Roof & gutter detail",
        "Support for roof plumbing, gutters, downpipes, flashings and sheetmetal work.",
      ],
      [
        "Practical maintenance",
        "Straightforward repairs for leaks, water flow issues and weather-exposed fittings.",
      ]
    );
  }

  const years =
    getText(lead.yearsExperience) ||
    getText(lead.yearsInBusiness) ||
    getText(lead.experienceYears);

  if (years) {
    items.push([
      `${years} years of experience`,
      "Experienced help for common and complex local jobs.",
    ]);
  }

  return items.slice(0, 6);
}

function getServiceAreas(lead: LeadRecord, city: string) {
  const areas = getStringArray(lead.serviceAreas);

  if (areas.length > 0) return areas.join(", ");

  const suburbs = getStringArray(lead.nearbySuburbs);

  if (suburbs.length > 0) return [city, ...suburbs].filter(Boolean).join(", ");

  return city ? `${city} and surrounding areas` : "Local service area";
}

function buildFaqs(args: {
  city: string;
  businessName: string;
  profile: TradeProfile;
  trade: string;
}) {
  const { city, businessName, profile, trade } = args;
  const tradeLower = getTradeHelpLabel(trade);

  if (
    isPlumberTrade(trade) &&
    hasRoofSheetmetalModifier(profile)
  ) {
    return [
      [
        `Do you service ${city}?`,
        `Yes. ${businessName} provides plumbing, roof plumbing, guttering and sheetmetal services across ${city} and surrounding areas.`,
      ],
      [
        "Can you help with roof plumbing and gutters?",
        "Yes. Roof plumbing, guttering, downpipes and flashing enquiries can be discussed when you call or request a callback.",
      ],
      [
        "Do you still handle general plumbing?",
        "Yes. General plumbing repairs, maintenance, leaks, fixtures and common property plumbing jobs can be discussed.",
      ],
      [
        "Can you help with urgent leaks?",
        "Call directly for urgent water leaks, roof water issues, blocked drains or other problems that need prompt attention.",
      ],
      [
        "Do you provide quotes before starting?",
        "Yes. You can talk through the job first and get a clear next step before work begins.",
      ],
      [
        "Do you work with homes and businesses?",
        "Yes. The site supports enquiries for homes, rentals, shops, offices and light commercial premises.",
      ],
    ];
  }

  if (isPlumbingGasFittingTrade(trade)) {
    return [
      [
        `Do you service ${city}?`,
        `Yes. ${businessName} provides plumbing and gas fitting help across ${city} and surrounding areas.`,
      ],
      [
        "Can you help with urgent plumbing issues?",
        "Call directly for urgent leaks, burst pipes, blocked drains, hot water problems and other plumbing issues that need prompt attention.",
      ],
      [
        "Do you handle gas fitting work?",
        "Yes. Gas fitting and gas appliance connection enquiries can be discussed, with safe, practical next steps arranged where suitable.",
      ],
      [
        "Can you help with hot water systems?",
        "Yes. Hot water repairs, replacements and servicing can be discussed when you call or request a callback.",
      ],
      [
        "Do you work with homes and businesses?",
        "Yes. The site supports enquiries for residential properties, rentals, shops, offices and light commercial premises.",
      ],
      [
        "Do you provide quotes before starting?",
        "Yes. You can talk through the job first and get a clear next step before work begins.",
      ],
    ];
  }

  if (isPlumberTrade(trade)) {
    return [
      [
        `Do you service ${city}?`,
        `Yes. ${businessName} provides plumbing help across ${city} and surrounding areas.`,
      ],
      [
        "Can you help with urgent plumbing issues?",
        "Call directly for urgent leaks, blocked drains, hot water problems and other plumbing issues that need prompt attention.",
      ],
      [
        "Do you provide quotes before starting?",
        "Yes. You can talk through the job first and get a clear next step before work begins.",
      ],
      [
        "Can you fix blocked drains?",
        "Yes. Blocked sinks, toilets, showers and drains are common plumbing jobs that can be assessed and cleared.",
      ],
      [
        "Do you repair hot water systems?",
        "Yes. Hot water repairs, replacements and servicing can be discussed when you call or request a callback.",
      ],
      [
        "Do you handle residential and commercial plumbing?",
        "Yes. The site can support plumbing enquiries for homes, rentals, shops, offices and local businesses.",
      ],
    ];
  }

  return [
    [
      `Do you service ${city}?`,
      `Yes. ${businessName} provides ${tradeLower} help across ${city} and surrounding areas.`,
    ],
    [
      "Can I request a quote?",
      "Yes. Send a short description of the job and the team can call back with the next step.",
    ],
    [
      "Do you handle urgent jobs?",
      "Call directly for time-sensitive local jobs and practical advice about availability.",
    ],
    [
      "Do you work with homes and businesses?",
      "Yes. The site supports enquiries from residential and commercial customers.",
    ],
  ];
}

function buildHeroHeadline(trade: string, city: string, profile: TradeProfile) {
  if (isPlumberTrade(trade) && hasRoofSheetmetalModifier(profile)) {
    return `Local Plumbing & Sheetmetal Services in ${city}`;
  }

  if (isPlumbingGasFittingTrade(trade)) {
    return `Local Plumbing & Gas Fitting in ${city}`;
  }

  if (isPlumberTrade(trade)) return `Trusted Plumbing Services in ${city}`;

  return `Trusted ${titleCase(trade)} Services in ${city}`;
}

function buildHeroSubheading(
  trade: string,
  city: string,
  topServices: string,
  profile: TradeProfile
) {
  if (
    isPlumberTrade(trade) &&
    hasRoofSheetmetalModifier(profile)
  ) {
    const gasNote = hasModifier(profile, "gas_fitting")
      ? " Gas fitting enquiries can also be discussed."
      : "";

    return `Local plumbing support with roof plumbing, guttering and sheetmetal work across ${city} and surrounding areas. Call for help with ${topServices}.${gasNote}`;
  }

  if (isPlumbingGasFittingTrade(trade)) {
    return `From leaking taps and blocked drains to hot water systems and gas appliance connections, get professional plumbing and gas fitting support across ${city}.`;
  }

  const label = isPlumberTrade(trade) ? "plumbing" : trade.toLowerCase();

  return `Fast, reliable ${label} for homes and businesses across ${city}. Call today for help with ${topServices}.`;
}

function buildNeutralHeroBadge(trade: string, city: string) {
  const label = getTradeHelpLabel(trade);

  if (isServiceTrade(trade)) {
    return `Available for urgent ${label || "local"} issues`;
  }

  if (city) {
    return `Local ${city} service`;
  }

  return "Fast local response";
}

function normalizeGeneratedTemplateType(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function buildGeneratedSiteHtml(lead: LeadRecord) {
  const slugSource =
    getText(lead.slug) ||
    getText(lead.id) ||
    getText(lead.googlePlaceId) ||
    getText(lead.businessName) ||
    getText(lead.name) ||
    "local-business";
  const businessName =
    cleanBusinessName(lead.displayName || lead.businessName || lead.name) ||
    titleCase(slugSource);
  const tradeProfile = buildTradeProfile(lead);
  console.log("[GENERATED_SITE_RENDER_MODIFIERS]", {
    slug: getText(lead.slug).trim() || getText(lead.id).trim(),
    serviceModifiers: tradeProfile.service_modifiers.map(getServiceModifierLabel),
  });
  const trade = tradeProfile.template_profile || getText(lead.trade).trim() || "plumber";
  const primaryTrade = tradeProfile.primary_trade || trade;
  const tradeLabel = getProfileTradeLabel(trade, tradeProfile);
  const tradeHelpLabel = getTradeHelpLabel(trade);
  const servicePlaceholder = getServicePlaceholder(trade);
  const city = getText(lead.city).trim() || "Hobart";
  const citySlug = slugify(city || "local");
  const tradeSlug = normalizeTrade(trade);
  const businessSlug = slugify(slugSource);
  const seed = `${businessSlug}-${citySlug}-${tradeSlug}`;
  // Business-specific and library imagery can improve trust and conversion. Stock trade imagery remains the safe fallback.
  const desktopHeroImage = await getGeneratedHeroImage({
    lead,
    trade: primaryTrade || trade,
    seed,
  });
  const uploadedMobileHeroImage = getBusinessMobileHeroImage(lead);
  const mobileHeroImage = uploadedMobileHeroImage || desktopHeroImage;
  const siteBrandingUrl = getText(lead.siteBrandingUrl).trim();
  const hasSiteBranding = isValidHttpUrl(siteBrandingUrl);
  const siteIconUrl = getText(lead.siteIconUrl).trim();
  const siteIconVersion =
    getText(lead.updatedAt).trim() ||
    getText(lead.aiGeneratedAt).trim() ||
    getText(lead.createdAt).trim();
  const siteIconHref = isValidHttpUrl(siteIconUrl)
    ? appendUrlVersion(siteIconUrl, siteIconVersion)
    : "";
  const iconLinkHtml = siteIconHref
    ? `  <link rel="icon" href="${escapeAttribute(siteIconHref)}" />
  <link rel="shortcut icon" href="${escapeAttribute(siteIconHref)}" />
  <link rel="apple-touch-icon" href="${escapeAttribute(siteIconHref)}" />
`
    : "";
  const buttonColor = getDesignColor(lead, "buttonColor", "#14b8a6");
  const buttonTextColor = getDesignColor(lead, "buttonTextColor", "#ffffff");
  const heroAccentColor = getDesignColor(lead, "heroAccentColor", "#a7f3d0");
  const bodyAccentColor = getDesignColor(lead, "bodyAccentColor", "#0f766e");
  const serviceAreaCardColor = getDesignColor(
    lead,
    "serviceAreaCardColor",
    "#0f766e"
  );
  const footerBackgroundColor = getDesignColor(
    lead,
    "footerBackgroundColor",
    "#0b1220"
  );
  const serviceAreaCardTextColor = getReadableTextColor(serviceAreaCardColor);
  const footerTextColor = getReadableTextColor(footerBackgroundColor);
  const phone = getText(lead.phone).trim();
  const phoneRaw = phoneToTel(phone);
  const phoneDisplay = formatAustralianPhoneNumber(phone);
  const hasPhone = Boolean(phoneRaw);
  const email = getText(lead.email).trim();
  const emailHref = email ? `mailto:${encodeURIComponent(email)}` : "";
  const formattedAddress = getLeadAddress(lead);
  const footerLocation = formattedAddress || city;
  const rating = getText(lead.rating).trim();
  const reviewCount =
    getText(lead.user_ratings_total).trim() ||
    getText(lead.reviewCount).trim() ||
    getText(lead.userRatingCount).trim();
  const hasRating = Boolean(rating && reviewCount);
  const ratingNumber = Number(rating);
  const hasStrongHeroRating = hasRating && Number.isFinite(ratingNumber) && ratingNumber >= 3.5;
  const services = getServices(lead, trade, tradeProfile);
  const topServices = getTopServices(services, trade);
  const serviceAreas = getServiceAreas(lead, city);
  const trustItems = getTrustItems({ city, lead, profile: tradeProfile, services, trade });
  const faqs = buildFaqs({ city, businessName, profile: tradeProfile, trade });
  const reviews = getReviews(lead);
  const hasReviews = reviews.length > 0;
  const usingGoogleReviews = hasReviews && isGoogleReviewSource(lead, reviews);
  const mapEmbedUrl = getMapEmbedUrl(lead, businessName, city);
  const hoursLines = formatHours(lead.hours);
  const variant = isPlumberTrade(trade) ? "plumber-classic" : "tradie-classic";
  const templateType = normalizeGeneratedTemplateType(lead.templateType);
  const isHeroImageLedTemplate = templateType === "hero-image-led";
  const templateClassName = isHeroImageLedTemplate ? "template-hero-image-led" : "";
  const heroHeadline = buildHeroHeadline(trade, city, tradeProfile);
  const heroSubheading = buildHeroSubheading(trade, city, topServices, tradeProfile);
  const servicePhrase = getServicePhrase(trade, tradeProfile);
  const servicesHeading = buildServicesHeading();
  const quickQuoteHeading = buildQuickQuoteHeading();
  const modifierSummary = tradeProfile.service_modifiers
    .map(getServiceModifierLabel)
    .join(", ");
  const description =
    getText(lead.description).trim() ||
    `${businessName} provides local ${servicePhrase} in ${city}. Call directly or request a callback.`;

  const navCallHtml = hasPhone
    ? `<a class="nav-call" href="tel:${escapeAttribute(phoneRaw)}">${escapeHtml(phoneDisplay)}</a>`
    : "";
  const brandClassName = hasSiteBranding ? "brand has-logo" : "brand";
  const brandHtml = hasSiteBranding
    ? `<img class="brand-logo" src="${escapeAttribute(siteBrandingUrl)}" alt="${escapeAttribute(businessName)}" loading="eager" />`
    : `<strong>${escapeHtml(businessName)}</strong>
        <span>${escapeHtml(tradeLabel)} in ${escapeHtml(city)}</span>`;
  const callButtonHtml = hasPhone
    ? `<a class="button accent" href="tel:${escapeAttribute(phoneRaw)}">Call Now: ${escapeHtml(phoneDisplay)}</a>`
    : `<a class="button accent" href="#quote">Call Now</a>`;
  const ratingBadgeHtml = hasStrongHeroRating
    ? `<div class="hero-rating">Rated ${escapeHtml(rating)}&#9733; from ${escapeHtml(reviewCount)} local reviews</div>`
    : `<div class="hero-rating">${escapeHtml(buildNeutralHeroBadge(trade, city))}</div>`;
  const reviewSummaryHtml = hasStrongHeroRating
    ? `<p class="review-summary">Rated ${escapeHtml(rating)}&#9733; from ${escapeHtml(reviewCount)} local reviews</p>`
    : "";
  const heroUrgencyHtml = isServiceTrade(trade)
    ? `<p class="hero-urgency">Available today for urgent ${escapeHtml(tradeHelpLabel)} issues</p>`
    : "";
  const heroContentHtml = isHeroImageLedTemplate
    ? ""
    : `<div class="hero-content">
        ${ratingBadgeHtml}
        <div class="hero-label">${escapeHtml(businessName)}</div>
        <h1>${escapeHtml(heroHeadline)}</h1>
        <p class="hero-subtitle">${escapeHtml(heroSubheading)}</p>
        <div class="cta-row">
          ${callButtonHtml}
          <a class="button secondary" href="#quote">Request Quote</a>
        </div>
        <div class="hero-bullets">
          <span>Local ${escapeHtml(city)} service</span>
          <span>Fast response</span>
          <span>Clear quotes</span>
          <span>Direct contact</span>
        </div>
        ${heroUrgencyHtml}
      </div>`;
  const contactPhoneHtml = hasPhone
    ? `<p><span>Phone</span><a href="tel:${escapeAttribute(phoneRaw)}">${escapeHtml(phoneDisplay)}</a></p>`
    : "";
  const emailHtml = email
    ? `<p><span>Email</span><a href="${escapeAttribute(emailHref)}">${escapeHtml(email)}</a></p>`
    : "";
  const addressHtml = formattedAddress
    ? `<p><span>Address</span>${escapeHtml(formattedAddress)}</p>`
    : "";
  const mobileCallHtml = hasPhone
    ? `<div class="mobile-call-bar"><a href="tel:${escapeAttribute(phoneRaw)}">Call ${escapeHtml(phoneDisplay)}</a></div>`
    : "";
  const servicesHtml = services
    .map(
      (service) => `
        <article class="service-card">
          <h3>${escapeHtml(service)}</h3>
          <p>${escapeHtml(getServiceDescription(service, tradeLabel))}</p>
          ${hasPhone ? `<a href="tel:${escapeAttribute(phoneRaw)}">Call for ${escapeHtml(service)}</a>` : `<a href="#quote">Ask about ${escapeHtml(service)}</a>`}
        </article>`
    )
    .join("");
  const trustHtml = trustItems
    .map(
      ([title, text]) => `
        <div class="trust-card">
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(text)}</p>
        </div>`
    )
    .join("");
  const showReviewsSection = hasReviews && (hasStrongHeroRating || reviews.length > 0);
  const reviewsHeading = usingGoogleReviews
    ? "Google reviews from local customers"
    : "Customer reviews";
  const reviewsIntro =
    usingGoogleReviews && hasStrongHeroRating
      ? "Real Google reviews from recent local customers."
      : "Recent customer feedback from local jobs.";
  const reviewsHtml = reviews
    .map((review) => {
      const stars = renderStars(review.rating);

      return `
        <article class="review-card">
          ${stars ? `<div class="stars">${stars}</div>` : ""}
          <p>"${escapeHtml(review.text)}"</p>
          <small>${escapeHtml(review.author)}</small>
        </article>`;
    })
    .join("");
  const reviewsSectionHtml = showReviewsSection
    ? `
    <section id="reviews" class="section review-section">
      <div class="container">
        <div class="section-header center">
          <div class="section-kicker">Reviews</div>
          <h2>${escapeHtml(reviewsHeading)}</h2>
          ${reviewSummaryHtml}
          <p class="muted">${escapeHtml(reviewsIntro)}</p>
        </div>
        <div class="review-grid">${reviewsHtml}</div>
      </div>
    </section>`
    : "";
  const faqHtml = faqs
    .map(
      ([question, answer]) => `
        <details class="faq-item">
          <summary>${escapeHtml(question)}</summary>
          <p>${escapeHtml(answer)}</p>
        </details>`
    )
    .join("");
  const hoursHtml =
    hoursLines.length > 0
      ? `<div class="hours-card"><h3>Opening hours</h3><ul>${hoursLines
          .map((line) => `<li>${escapeHtml(line)}</li>`)
          .join("")}</ul></div>`
      : isServiceTrade(trade)
        ? `<div class="hours-card"><h3>Opening hours</h3><p>Open 24 hours / 7 days</p></div>`
        : "";
  const footerHoursHtml =
    hoursLines.length > 0
      ? `<ul>${hoursLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
      : isServiceTrade(trade)
        ? "<p>Open 24 hours / 7 days</p>"
        : "";
  const mapHtml = mapEmbedUrl
    ? `<div class="map-panel">
        <h3>${escapeHtml(formattedAddress ? "Find us" : `Find us in ${city}`)}</h3>
        <iframe src="${escapeAttribute(mapEmbedUrl)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map showing ${escapeAttribute(businessName)} in ${escapeAttribute(city)}"></iframe>
      </div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(businessName)} | ${escapeHtml(tradeLabel)} in ${escapeHtml(city)}</title>
  <meta name="description" content="${escapeAttribute(description)}" />
  ${modifierSummary ? `<meta name="keywords" content="${escapeAttribute([tradeLabel, city, modifierSummary].filter(Boolean).join(", "))}" />` : ""}
${iconLinkHtml}
  <script>
    (() => {
      try {
        const params = new URLSearchParams(window.location.search);
        let viewport = params.get("previewViewport");

        if (!viewport && window.parent && window.parent !== window) {
          try {
            viewport = new URLSearchParams(window.parent.location.search).get("previewViewport");
          } catch (error) {}
        }

        if (viewport === "mobile" || viewport === "tablet") {
          document.documentElement.setAttribute("data-cb-preview-viewport", viewport);
          const forcePreviewHeroAsset = () => {
            document.querySelectorAll(".hero").forEach((hero) => {
              hero.style.setProperty("--hero-img-desktop", "var(--hero-img-mobile)", "important");
              hero.style.setProperty("--hero-img", "var(--hero-img-mobile)", "important");
            });
          };
          if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", forcePreviewHeroAsset, { once: true });
          } else {
            forcePreviewHeroAsset();
          }
        }
      } catch (error) {}
    })();
  </script>
  <style>
    :root { --cta-color: ${escapeAttribute(buttonColor)}; --cta-text-color: ${escapeAttribute(buttonTextColor)}; --hero-accent-color: ${escapeAttribute(heroAccentColor)}; --body-accent-color: ${escapeAttribute(bodyAccentColor)}; --service-area-card-color: ${escapeAttribute(serviceAreaCardColor)}; --service-area-card-text-color: ${escapeAttribute(serviceAreaCardTextColor)}; --footer-background-color: ${escapeAttribute(footerBackgroundColor)}; --footer-text-color: ${escapeAttribute(footerTextColor)}; --cb-button-color: var(--cta-color); --cb-accent-text-color: var(--body-accent-color); }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #172033; background: #ffffff; line-height: 1.55; }
    a { color: inherit; }
    h1, h2, h3, p { margin: 0; }
    h1 { max-width: 680px; margin: 0; color: white; font-size: clamp(64px, 9vw, 118px); font-weight: 900; line-height: 0.86; letter-spacing: -0.066em; text-wrap: balance; text-shadow: 0 18px 52px rgba(0, 0, 0, 0.34); }
    h2 { color: #111827; font-size: clamp(30px, 4vw, 46px); line-height: 1.08; letter-spacing: 0; }
    h3 { color: #111827; font-size: 20px; line-height: 1.2; letter-spacing: 0; }
    p { font-size: 17px; }
    .container { width: min(100% - 40px, 1120px); margin: 0 auto; }
    .site-header { position: sticky; top: 0; z-index: 50; background: rgba(255, 255, 255, 0.98); border-bottom: 1px solid #e6eaf0; backdrop-filter: blur(14px); }
    .nav { min-height: 132px; display: grid; grid-template-columns: minmax(420px, 1.5fr) auto minmax(220px, 1fr); align-items: center; gap: 30px; }
    .brand { min-width: 0; display: flex; flex-direction: column; justify-content: center; justify-self: start; color: #111827; text-decoration: none; }
    .brand.has-logo { min-width: 420px; max-width: min(920px, 100%); flex-shrink: 0; align-items: flex-start; }
    .brand strong { display: block; max-width: 360px; color: #111827; font-size: 19px; line-height: 1.18; white-space: normal; overflow-wrap: anywhere; }
    .brand span { display: block; margin-top: 4px; color: #667085; font-size: 13px; font-weight: 800; }
    .brand-logo { display: block; width: auto; height: auto; max-width: min(920px, 100%); max-height: 104px; object-fit: contain; }
    .nav-links { display: flex; align-items: center; justify-self: center; gap: 24px; color: #344054; font-size: 14px; font-weight: 800; }
    .nav-links a { text-decoration: none; }
    .nav-call { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; justify-self: end; padding: 10px 17px; border-radius: 10px; background: var(--cta-color); color: var(--cta-text-color); text-decoration: none; font-size: 14px; font-weight: 900; white-space: nowrap; }
    .hero { min-height: 650px; display: flex; align-items: center; padding: 82px 0 96px; color: white; background: linear-gradient(90deg, rgba(2, 6, 23, 0.74) 0%, rgba(2, 6, 23, 0.52) 42%, rgba(2, 6, 23, 0.16) 76%), var(--hero-img); background-position: center; background-size: cover; }
    .hero-content { max-width: 700px; margin: 0; text-align: left; }
    .hero-rating { display: inline-flex; width: fit-content; margin-bottom: 12px; padding: 6px 10px; border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 999px; background: rgba(15, 23, 42, 0.2); color: rgba(255, 255, 255, 0.86); font-size: 12px; font-weight: 900; letter-spacing: 0.04em; backdrop-filter: blur(10px); }
    .hero-label { margin-bottom: 9px; color: rgba(255, 255, 255, 0.72); font-size: 11px; font-weight: 950; letter-spacing: 0.24em; text-transform: uppercase; }
    .hero-subtitle { max-width: 520px; margin: 16px 0 0; color: rgba(241, 245, 249, 0.82); font-size: 18px; line-height: 1.48; }
    .hero-bullets { display: flex; justify-content: flex-start; flex-wrap: wrap; gap: 9px; margin-top: 22px; color: white; font-weight: 900; }
    .hero-bullets span { padding: 10px 14px; border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 999px; background: rgba(255, 255, 255, 0.12); backdrop-filter: blur(10px); }
    .cta-row { display: flex; flex-wrap: wrap; justify-content: flex-start; gap: 11px; margin-top: 24px; }
    .button { min-height: 56px; display: inline-flex; align-items: center; justify-content: center; padding: 15px 24px; border-radius: 12px; border: 1px solid transparent; font-size: 17px; font-weight: 950; letter-spacing: -0.018em; text-decoration: none; cursor: pointer; }
    .button.accent { background: var(--cta-color); color: var(--cta-text-color); box-shadow: 0 20px 42px rgba(20, 184, 166, 0.32); }
    .button.primary { background: var(--cta-color); color: var(--cta-text-color); box-shadow: 0 16px 34px rgba(15, 118, 110, 0.22); }
    .button.secondary { background: var(--cta-color); color: var(--cta-text-color); border-color: transparent; }
    .hero .button.secondary { background: var(--cta-color); color: var(--cta-text-color); }
    .hero-urgency { margin-top: 14px; color: rgba(255, 255, 255, 0.76); font-size: 14px; font-weight: 900; letter-spacing: 0.01em; }
    .template-hero-image-led .site-header { position: absolute; left: 0; right: 0; background: rgba(2, 6, 23, 0.12); border-bottom: 0; box-shadow: none; backdrop-filter: blur(3px); }
    .template-hero-image-led .brand strong, .template-hero-image-led .brand span, .template-hero-image-led .nav-links { color: white; text-shadow: 0 2px 18px rgba(0, 0, 0, 0.5); }
    .template-hero-image-led .brand-logo { filter: drop-shadow(0 10px 24px rgba(0, 0, 0, 0.42)); }
    .template-hero-image-led .nav-call { border: 1px solid rgba(255, 255, 255, 0.28); background: var(--cta-color); color: var(--cta-text-color); box-shadow: 0 14px 34px rgba(0, 0, 0, 0.22); backdrop-filter: blur(4px); }
    .template-hero-image-led .hero { min-height: clamp(720px, 92vh, 980px); align-items: stretch; padding: 0; background: linear-gradient(180deg, rgba(2, 6, 23, 0.26) 0%, rgba(2, 6, 23, 0.04) 22%, rgba(2, 6, 23, 0.02) 100%), var(--hero-img); background-position: center; background-size: cover; }
    body.template-hero-image-led { background: #f4f7f6; color: #111827; }
    .template-hero-image-led main { background: linear-gradient(180deg, #f5f7f5 0%, #e8f0ed 44%, #f7f8f6 100%); }
    .template-hero-image-led .quote-strip { margin-top: 0; padding: 48px 0 42px; background: linear-gradient(180deg, #f5f7f5, #e8f0ed); }
    .template-hero-image-led .quote-card { gap: 34px; padding: 34px; border: 1px solid rgba(15, 23, 42, 0.12); border-radius: 28px; background: linear-gradient(135deg, #ffffff, #eef8f5); box-shadow: 0 26px 64px rgba(15, 23, 42, 0.16); }
    .template-hero-image-led .section { padding: 90px 0; background: transparent; }
    .template-hero-image-led .section.soft { background: linear-gradient(180deg, #eef4f2, #e4eeeb); border-top: 1px solid rgba(15, 23, 42, 0.1); border-bottom: 1px solid rgba(15, 23, 42, 0.1); }
    .template-hero-image-led .section-header { max-width: 680px; margin-bottom: 34px; }
    .template-hero-image-led .section-header.center { max-width: 760px; }
    .template-hero-image-led .section-kicker { margin-bottom: 12px; color: var(--body-accent-color); font-size: 12px; letter-spacing: 0.18em; }
    .template-hero-image-led h2 { color: #07111f; font-size: clamp(34px, 4.8vw, 58px); line-height: 0.98; letter-spacing: -0.044em; }
    .template-hero-image-led .muted { max-width: 620px; color: #334155; font-size: 16px; line-height: 1.65; }
    .template-hero-image-led .services-grid, .template-hero-image-led .trust-grid, .template-hero-image-led .review-grid, .template-hero-image-led .faq-grid { gap: 22px; }
    .template-hero-image-led .service-card, .template-hero-image-led .trust-card, .template-hero-image-led .review-card, .template-hero-image-led .faq-item, .template-hero-image-led .contact-panel, .template-hero-image-led .callback-form, .template-hero-image-led .map-panel { border: 1px solid rgba(15, 23, 42, 0.12); border-radius: 24px; background: linear-gradient(145deg, #ffffff, #f4f8f7); box-shadow: 0 18px 42px rgba(15, 23, 42, 0.1); }
    .template-hero-image-led .service-card { position: relative; overflow: hidden; padding: 30px; gap: 14px; }
    .template-hero-image-led .service-card::before { content: ""; position: absolute; inset: 0 0 auto; height: 4px; background: linear-gradient(90deg, var(--body-accent-color), color-mix(in srgb, var(--body-accent-color) 18%, transparent)); }
    .template-hero-image-led .service-card h3 { font-size: 22px; font-weight: 950; letter-spacing: -0.018em; }
    .template-hero-image-led .service-card p, .template-hero-image-led .trust-card p, .template-hero-image-led .review-card p, .template-hero-image-led .faq-item p { color: #334155; line-height: 1.62; }
    .template-hero-image-led .service-card a { margin-top: 6px; color: var(--body-accent-color); font-size: 14px; letter-spacing: 0.04em; text-transform: uppercase; }
    .template-hero-image-led .trust-section { background: radial-gradient(circle at 16% 0%, color-mix(in srgb, var(--body-accent-color) 16%, transparent), transparent 28%), linear-gradient(135deg, #06101d, #0b1e2f 58%, #082f2f); color: white; }
    .template-hero-image-led .section.soft.trust-section { background: radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--body-accent-color) 14%, transparent), transparent 30%), linear-gradient(180deg, #eef4f2, #e2ece9); color: #07111f; }
    .template-hero-image-led .trust-section h2, .template-hero-image-led .trust-section h3 { color: white; }
    .template-hero-image-led .section.soft.trust-section h2 { color: #07111f; }
    .template-hero-image-led .trust-section .muted { margin-left: auto; margin-right: auto; color: #334155; }
    .template-hero-image-led .trust-section .section-kicker { color: var(--body-accent-color); }
    .template-hero-image-led .trust-card { padding: 28px; border-color: rgba(15, 23, 42, 0.18); background: linear-gradient(145deg, #102235, #0d1b2b); box-shadow: 0 20px 44px rgba(15, 23, 42, 0.2); }
    .template-hero-image-led .trust-card h3 { color: white; }
    .template-hero-image-led .trust-card p { color: #d7e1ea; }
    .template-hero-image-led .review-section .section-header { margin-left: auto; margin-right: auto; text-align: center; }
    .template-hero-image-led .review-grid { max-width: 940px; margin: 0 auto; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .template-hero-image-led .review-card { padding: 30px; background: linear-gradient(145deg, #ffffff, #f3fbf9); }
    .template-hero-image-led .review-card p { color: #223044; font-size: 17px; }
    .template-hero-image-led .areas-panel { gap: 34px; align-items: center; padding: 32px; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 28px; background: radial-gradient(circle at 85% 0%, color-mix(in srgb, var(--body-accent-color) 20%, transparent), transparent 34%), linear-gradient(135deg, #07111f, #0b1d2b 58%, #0f3030); box-shadow: 0 26px 70px rgba(15, 23, 42, 0.18); }
    .template-hero-image-led .areas-list { justify-self: end; max-width: 520px; padding: 18px 22px; border-color: rgba(255, 255, 255, 0.2); border-radius: 18px; background: var(--service-area-card-color); color: var(--service-area-card-text-color); font-size: 17px; line-height: 1.45; box-shadow: 0 16px 34px rgba(0, 0, 0, 0.16); }
    .template-hero-image-led .faq-item { overflow: hidden; background: #ffffff; }
    .template-hero-image-led .faq-item summary { padding: 22px 24px; font-size: 18px; letter-spacing: -0.012em; }
    .template-hero-image-led .faq-item p { padding: 0 24px 24px; }
    .template-hero-image-led .contact-section { background: linear-gradient(180deg, #edf5f3, #f8faf9); }
    .template-hero-image-led .contact-layout { gap: 24px; }
    .template-hero-image-led .contact-panel, .template-hero-image-led .callback-form { padding: 30px; }
    .template-hero-image-led .callback-form { gap: 16px; }
    .template-hero-image-led input, .template-hero-image-led textarea { border-color: rgba(15, 23, 42, 0.16); border-radius: 14px; background: #ffffff; box-shadow: inset 0 1px 0 rgba(15, 23, 42, 0.03); }
    .template-hero-image-led .map-wrap { margin-top: 28px; }
    .template-hero-image-led .map-panel { border-color: rgba(15, 23, 42, 0.1); border-radius: 24px; background: #ffffff; box-shadow: 0 20px 52px rgba(15, 23, 42, 0.11); }
    .template-hero-image-led .map-panel h3 { padding: 16px 22px; border-bottom: 1px solid rgba(15, 23, 42, 0.08); background: linear-gradient(135deg, #ffffff, #f1f7f5); color: #0f172a; font-size: 16px; letter-spacing: -0.01em; }
    .template-hero-image-led .map-panel iframe { min-height: 360px; }
    .template-hero-image-led .footer { padding: 58px 0 28px; background: var(--footer-background-color); color: var(--footer-text-color); }
    .template-hero-image-led .footer-grid { gap: 34px; }
    .template-hero-image-led .footer h3 { margin-bottom: 12px; color: var(--footer-text-color); font-size: 22px; letter-spacing: -0.02em; }
    .template-hero-image-led .footer h4 { margin-bottom: 12px; color: color-mix(in srgb, var(--footer-text-color) 76%, transparent); font-size: 12px; font-weight: 850; letter-spacing: 0.14em; text-transform: uppercase; }
    .template-hero-image-led .footer p, .template-hero-image-led .footer-links, .template-hero-image-led .footer-links a { color: color-mix(in srgb, var(--footer-text-color) 86%, transparent); }
    .template-hero-image-led .footer-bottom { margin-top: 30px; color: color-mix(in srgb, var(--footer-text-color) 72%, transparent); }
    .quote-strip { position: relative; z-index: 5; margin-top: -54px; padding-bottom: 34px; }
    .quote-card { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 28px; align-items: center; padding: 28px; border: 1px solid #e6eaf0; border-radius: 18px; background: white; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.16); }
    .quote-card h2 { font-size: clamp(28px, 3.5vw, 38px); }
    .muted { color: #556070; }
    .mini-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .mini-form label, .callback-form label { display: grid; gap: 7px; color: #344054; font-size: 13px; font-weight: 900; }
    input, textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; padding: 13px 14px; color: #111827; font: inherit; background: white; }
    textarea { min-height: 112px; resize: vertical; }
    .mini-form .full { grid-column: 1 / -1; }
    .form-success { display: none; color: var(--body-accent-color); font-size: 14px; font-weight: 900; }
    .callback-form.is-sent .form-success, .mini-form.is-sent .form-success { display: block; }
    .section { padding: 78px 0; }
    .section.soft { background: #f7fafc; }
    .section-header { max-width: 720px; margin-bottom: 30px; }
    .section-header.center { margin-left: auto; margin-right: auto; text-align: center; }
    .section-kicker { margin-bottom: 10px; color: var(--body-accent-color); font-size: 13px; font-weight: 950; letter-spacing: 0.12em; text-transform: uppercase; }
    .services-grid, .trust-grid, .review-grid, .faq-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
    .service-card, .trust-card, .review-card, .faq-item, .contact-panel, .callback-form, .map-panel { border: 1px solid #e6eaf0; border-radius: 16px; background: white; box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06); }
    .service-card, .trust-card, .review-card { padding: 24px; }
    .service-card { display: grid; gap: 12px; }
    .service-card p, .trust-card p, .review-card p, .faq-item p { color: #556070; font-size: 16px; }
    .service-card a { width: fit-content; margin-top: 4px; color: var(--body-accent-color); font-weight: 950; text-decoration: none; }
    .trust-card h3 { color: var(--body-accent-color); }
    .review-summary { margin-bottom: 16px; color: var(--body-accent-color); font-weight: 950; text-align: center; }
    .stars { margin-bottom: 10px; color: #f59e0b; font-size: 17px; letter-spacing: 0; }
    .review-card small { display: block; margin-top: 12px; color: #667085; font-weight: 900; }
    .faq-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .faq-item { padding: 0; overflow: hidden; }
    .faq-item summary { cursor: pointer; padding: 19px 20px; color: #111827; font-size: 17px; font-weight: 950; list-style: none; }
    .faq-item summary::-webkit-details-marker { display: none; }
    .faq-item p { padding: 0 20px 20px; }
    .areas-panel { display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 28px; align-items: center; padding: 34px; border-radius: 18px; background: #0b1220; color: white; }
    .areas-panel h2 { color: white; }
    .areas-panel p { color: #cbd5e1; }
    .areas-list { padding: 22px; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 14px; background: var(--service-area-card-color); color: white; font-size: 18px; font-weight: 900; }
    .contact-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; align-items: start; }
    .contact-panel, .callback-form { display: grid; gap: 18px; padding: 26px; }
    .contact-actions { display: grid; gap: 12px; }
    .contact-actions p { display: grid; gap: 4px; padding: 14px 0; border-bottom: 1px solid #eef2f7; }
    .contact-actions span { color: #667085; font-size: 12px; font-weight: 950; letter-spacing: 0.08em; text-transform: uppercase; }
    .contact-actions a { color: var(--body-accent-color); font-size: 20px; font-weight: 950; text-decoration: none; overflow-wrap: anywhere; }
    .hours-card { padding: 18px; border-radius: 14px; background: #f7fafc; }
    .hours-card ul, .footer ul { margin: 10px 0 0; padding: 0; list-style: none; }
    .hours-card li, .footer li { margin-top: 5px; color: inherit; font-size: 15px; }
    .map-wrap { margin-top: 22px; }
    .map-panel { overflow: hidden; }
    .map-panel h3 { padding: 18px 20px; border-bottom: 1px solid #e6eaf0; }
    .map-panel iframe { width: 100%; min-height: 320px; display: block; border: 0; }
    .footer { background: var(--footer-background-color); color: var(--footer-text-color); padding: 50px 0 28px; }
    .footer-grid { display: grid; grid-template-columns: 1.25fr 1fr 1fr 1fr; gap: 30px; }
    .footer h3, .footer h4 { margin: 0 0 10px; color: var(--footer-text-color); }
    .footer p { color: rgba(255, 255, 255, 0.92); font-size: 15px; }
    .footer-links { display: grid; gap: 8px; color: rgba(255, 255, 255, 0.92); font-size: 15px; }
    .footer-links a { color: rgba(255, 255, 255, 0.9); text-decoration: none; overflow-wrap: anywhere; }
    .footer-links a:hover { color: var(--footer-text-color); }
    .footer-bottom { display: flex; justify-content: space-between; gap: 18px; margin-top: 34px; padding-top: 22px; border-top: 1px solid rgba(255, 255, 255, 0.16); color: rgba(255, 255, 255, 0.9); font-size: 14px; }
    .mobile-call-bar { display: none; }
    @media (max-width: 980px) { .nav { min-height: 110px; display: flex; justify-content: space-between; } .brand.has-logo { min-width: 0; max-width: min(620px, calc(100% - 190px)); } .brand-logo { max-width: min(620px, 100%); max-height: 82px; } .nav-links { display: none; } .template-hero-image-led .visual-hero-content { justify-content: flex-start; } .template-hero-image-led .visual-hero-cta { justify-content: flex-start; } .quote-card, .areas-panel, .contact-layout { grid-template-columns: 1fr; } .services-grid, .trust-grid, .review-grid, .faq-grid, .footer-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 700px) { body { padding-bottom: 82px; } .container { width: min(100% - 28px, 1120px); } .nav { min-height: 88px; gap: 12px; } .brand.has-logo { min-width: 0; max-width: 100%; } .brand strong { max-width: 230px; font-size: 16px; line-height: 1.2; } .brand span { font-size: 12px; } .brand-logo { width: auto; height: auto; max-width: min(340px, 100%); max-height: 58px; object-fit: contain; } .nav-call { display: none; } .hero { min-height: auto; padding: 52px 0 82px; background-image: linear-gradient(90deg, rgba(2, 6, 23, 0.78), rgba(2, 6, 23, 0.48)), var(--hero-img-mobile); } .hero-content { max-width: 100%; } .template-hero-image-led .site-header { position: absolute; top: 0; left: 0; right: 0; z-index: 60; background: transparent; border: 0; box-shadow: none; backdrop-filter: none; pointer-events: none; } .template-hero-image-led .nav { min-height: 0; width: 100%; display: block; padding: 0; } .template-hero-image-led .brand, .template-hero-image-led .brand.has-logo, .template-hero-image-led .nav-links { display: none; } .template-hero-image-led .nav-call { position: absolute; top: calc(16px + env(safe-area-inset-top)); right: 18px; min-height: 42px; max-width: min(46vw, 168px); display: inline-flex; padding: 9px 13px; border: 1px solid rgba(255, 255, 255, 0.22); border-radius: 999px; background: rgba(2, 6, 23, 0.42); color: #ffffff; box-shadow: 0 14px 30px rgba(2, 6, 23, 0.26); backdrop-filter: blur(16px); font-size: 12px; overflow: hidden; text-overflow: ellipsis; pointer-events: auto; } .template-hero-image-led .hero { min-height: clamp(560px, 82vh, 720px); padding: 0 0 88px; align-items: flex-end; background-image: linear-gradient(180deg, rgba(2, 6, 23, 0.04) 0%, rgba(2, 6, 23, 0.1) 34%, rgba(2, 6, 23, 0.52) 100%), var(--hero-img-mobile); background-position: center center; background-size: cover; } .template-hero-image-led .visual-hero-content { max-width: 92%; margin: 0; } .template-hero-image-led .hero h1 { max-width: 100%; font-size: clamp(42px, 12.8vw, 62px); line-height: 0.92; letter-spacing: -0.056em; overflow-wrap: anywhere; } .template-hero-image-led .hero-subtitle { max-width: 28rem; margin-top: 13px; font-size: 15px; line-height: 1.46; } .template-hero-image-led .hero-label { margin-bottom: 8px; font-size: 10px; letter-spacing: 0.2em; } .template-hero-image-led .visual-hero-cta { width: auto; margin-top: 20px; justify-content: flex-start; } .template-hero-image-led .visual-hero-cta a { width: auto; min-width: min(100%, 190px); } .template-hero-image-led .hero .button { min-height: 50px; padding: 12px 16px; font-size: 14px; border-radius: 14px; } .template-hero-image-led .hero .button.accent { width: auto; box-shadow: 0 16px 34px rgba(2, 6, 23, 0.3), 0 0 24px rgba(20, 184, 166, 0.18); } h1 { max-width: 100%; font-size: clamp(44px, 14.2vw, 66px); line-height: 0.92; letter-spacing: -0.058em; overflow-wrap: anywhere; } .hero-subtitle { max-width: 30rem; margin-top: 14px; font-size: 16px; line-height: 1.48; } .hero-label { margin-bottom: 8px; font-size: 11px; letter-spacing: 0.2em; } .cta-row { margin-top: 21px; gap: 10px; } .button { min-height: 55px; font-size: 16px; } .hero-bullets { display: grid; grid-template-columns: 1fr 1fr; margin-top: 18px; } .hero-bullets span { border-radius: 12px; } .button, .cta-row, .cta-row a { width: 100%; } .template-hero-image-led .visual-hero-cta, .template-hero-image-led .visual-hero-cta a { width: auto; } .quote-strip { margin-top: -44px; } .template-hero-image-led .quote-strip { margin-top: 0; padding-top: 24px; } .quote-card, .contact-panel, .callback-form, .areas-panel { padding: 22px; } .mini-form, .services-grid, .trust-grid, .review-grid, .faq-grid, .footer-grid { grid-template-columns: 1fr; } .section { padding: 58px 0; } .footer { padding-bottom: 32px; } .footer-bottom { display: grid; } .mobile-call-bar { display: block; position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 80; } .mobile-call-bar a { min-height: 58px; display: flex; align-items: center; justify-content: center; border-radius: 12px; background: var(--cta-color); color: var(--cta-text-color); box-shadow: 0 18px 38px rgba(2, 6, 23, 0.24); font-size: 17px; font-weight: 950; text-decoration: none; } }
    @media (max-width: 700px) { .template-hero-image-led .nav-call { background: var(--cta-color); color: var(--cta-text-color); backdrop-filter: blur(4px); } .template-hero-image-led .hero { min-height: clamp(560px, 82vh, 720px); padding: 0; background-image: linear-gradient(180deg, rgba(2, 6, 23, 0.1) 0%, rgba(2, 6, 23, 0.02) 42%, rgba(2, 6, 23, 0.12) 100%), var(--hero-img-mobile); background-position: center center; background-size: cover; } .template-hero-image-led .quote-strip { padding: 30px 0 28px; } .template-hero-image-led .quote-card { gap: 22px; padding: 24px; border-radius: 22px; } .template-hero-image-led .section { padding: 64px 0; } .template-hero-image-led h2 { font-size: clamp(31px, 10vw, 44px); line-height: 1; } .template-hero-image-led .section-header, .template-hero-image-led .section-header.center { margin-bottom: 24px; text-align: left; } .template-hero-image-led .trust-section .section-header.center, .template-hero-image-led .review-section .section-header { text-align: left; } .template-hero-image-led .service-card, .template-hero-image-led .trust-card, .template-hero-image-led .review-card, .template-hero-image-led .contact-panel, .template-hero-image-led .callback-form { padding: 24px; border-radius: 20px; } .template-hero-image-led .areas-panel { gap: 20px; padding: 24px; border-radius: 22px; } .template-hero-image-led .areas-list { justify-self: stretch; max-width: none; padding: 16px 18px; font-size: 16px; } .template-hero-image-led .map-wrap { margin-top: 22px; } .template-hero-image-led .map-panel h3 { padding: 14px 18px; } .template-hero-image-led .map-panel iframe { min-height: 300px; } .template-hero-image-led .faq-item summary { padding: 19px 20px; font-size: 17px; } .template-hero-image-led .faq-item p { padding: 0 20px 20px; } .template-hero-image-led .footer { padding-top: 46px; } .template-hero-image-led .footer h4 { margin-top: 8px; } }
    html[data-cb-preview-viewport="mobile"], html[data-cb-preview-viewport="tablet"] { --hero-img-desktop: var(--hero-img-mobile) !important; --hero-img: var(--hero-img-mobile) !important; }
    html[data-cb-preview-viewport="mobile"] body.template-hero-image-led .site-header, html[data-cb-preview-viewport="tablet"] body.template-hero-image-led .site-header { position: absolute; top: 0; left: 0; right: 0; z-index: 60; background: transparent; border: 0; box-shadow: none; backdrop-filter: none; pointer-events: none; }
    html[data-cb-preview-viewport="mobile"] body.template-hero-image-led .nav, html[data-cb-preview-viewport="tablet"] body.template-hero-image-led .nav { min-height: 0; width: 100%; display: block; padding: 0; }
    html[data-cb-preview-viewport="mobile"] body.template-hero-image-led .brand, html[data-cb-preview-viewport="mobile"] body.template-hero-image-led .brand.has-logo, html[data-cb-preview-viewport="mobile"] body.template-hero-image-led .nav-links, html[data-cb-preview-viewport="tablet"] body.template-hero-image-led .brand, html[data-cb-preview-viewport="tablet"] body.template-hero-image-led .brand.has-logo, html[data-cb-preview-viewport="tablet"] body.template-hero-image-led .nav-links { display: none; }
    html[data-cb-preview-viewport="mobile"] body.template-hero-image-led .nav-call, html[data-cb-preview-viewport="tablet"] body.template-hero-image-led .nav-call { position: absolute; top: calc(16px + env(safe-area-inset-top)); right: 18px; min-height: 42px; max-width: min(46vw, 168px); display: inline-flex; padding: 9px 13px; border: 1px solid rgba(255, 255, 255, 0.22); border-radius: 999px; background: var(--cta-color); color: var(--cta-text-color); box-shadow: 0 14px 30px rgba(2, 6, 23, 0.26); backdrop-filter: blur(4px); font-size: 12px; overflow: hidden; text-overflow: ellipsis; pointer-events: auto; }
    html[data-cb-preview-viewport="mobile"] body.template-hero-image-led .hero, html[data-cb-preview-viewport="tablet"] body.template-hero-image-led .hero { --hero-img-desktop: var(--hero-img-mobile) !important; --hero-img: var(--hero-img-mobile) !important; min-height: clamp(580px, 86vh, 760px); padding: 0; background: linear-gradient(180deg, rgba(2, 6, 23, 0.1) 0%, rgba(2, 6, 23, 0.02) 42%, rgba(2, 6, 23, 0.12) 100%), var(--hero-img-mobile) !important; background-image: linear-gradient(180deg, rgba(2, 6, 23, 0.1) 0%, rgba(2, 6, 23, 0.02) 42%, rgba(2, 6, 23, 0.12) 100%), var(--hero-img-mobile) !important; background-position: center center !important; background-size: cover !important; }
    html[data-cb-preview-viewport="mobile"] body.template-hero-image-led .hero { background-position: left center !important; }
    html[data-cb-preview-viewport="tablet"] body.template-hero-image-led .hero { min-height: 92vh; background-position: center 45% !important; }
    html[data-cb-preview-viewport="mobile"] body.template-hero-image-led .hero::before, html[data-cb-preview-viewport="mobile"] body.template-hero-image-led .hero::after, html[data-cb-preview-viewport="tablet"] body.template-hero-image-led .hero::before, html[data-cb-preview-viewport="tablet"] body.template-hero-image-led .hero::after { --hero-img-desktop: var(--hero-img-mobile) !important; --hero-img: var(--hero-img-mobile) !important; background: linear-gradient(180deg, rgba(2, 6, 23, 0.1) 0%, rgba(2, 6, 23, 0.02) 42%, rgba(2, 6, 23, 0.12) 100%), var(--hero-img-mobile) !important; background-image: linear-gradient(180deg, rgba(2, 6, 23, 0.1) 0%, rgba(2, 6, 23, 0.02) 42%, rgba(2, 6, 23, 0.12) 100%), var(--hero-img-mobile) !important; background-position: center center !important; background-size: cover !important; }
    html[data-cb-preview-viewport="mobile"] body.template-hero-image-led .hero::before, html[data-cb-preview-viewport="mobile"] body.template-hero-image-led .hero::after { background-position: left center !important; }
    html[data-cb-preview-viewport="tablet"] body.template-hero-image-led .hero::before, html[data-cb-preview-viewport="tablet"] body.template-hero-image-led .hero::after { background-position: center 45% !important; }
    html[data-cb-preview-viewport="mobile"] body.template-hero-image-led .quote-strip, html[data-cb-preview-viewport="tablet"] body.template-hero-image-led .quote-strip { margin-top: 0; }
  </style>
</head>
<body class="${escapeAttribute([variant, templateClassName].filter(Boolean).join(" "))}">
  <header class="site-header">
    <div class="container nav">
      <a class="${escapeAttribute(brandClassName)}" href="#">
        ${brandHtml}
      </a>
      <nav class="nav-links">
        <a href="#services">Services</a>
        <a href="#reviews">Reviews</a>
        <a href="#faq">FAQ</a>
        <a href="#quote">Contact</a>
      </nav>
      ${navCallHtml}
    </div>
  </header>

  <!-- DESKTOP HERO: ${escapeHtml(desktopHeroImage || "missing")} -->
  <!-- MOBILE HERO: ${escapeHtml(uploadedMobileHeroImage || "missing")} -->
  <section class="hero" style="--hero-img-desktop: url('${escapeAttribute(desktopHeroImage)}'); --hero-img: var(--hero-img-desktop); --hero-img-mobile: url('${escapeAttribute(mobileHeroImage)}');">
    <div class="container">
      ${heroContentHtml}
    </div>
  </section>

  <main>
    <section id="quote" class="quote-strip">
      <div class="container">
        <div class="quote-card">
          <div>
            <div class="section-kicker">Quick quote</div>
            <h2>${escapeHtml(quickQuoteHeading)}</h2>
            <p class="muted">Send the basics through and ${escapeHtml(businessName)} can call back with the next step.</p>
          </div>
          <form class="mini-form" data-slug="${escapeAttribute(businessSlug)}">
            <label>Name<input name="name" type="text" autocomplete="name" required /></label>
            <label>Phone<input name="phone" type="tel" autocomplete="tel" required /></label>
            <label>Service needed<input name="service" type="text" placeholder="${escapeAttribute(servicePlaceholder)}" /></label>
            <label>Message<input name="message" type="text" placeholder="Where is the issue?" /></label>
            <div class="full">
              <button class="button primary" type="submit">Request a Call Back</button>
              <p class="form-success">Thanks - we'll call you shortly.</p>
            </div>
          </form>
        </div>
      </div>
    </section>

    <section id="services" class="section">
      <div class="container">
        <div class="section-header">
          <div class="section-kicker">Services</div>
          <h2>${escapeHtml(servicesHeading)}</h2>
          <p class="muted">Practical ${escapeHtml(servicePhrase)} for homes, rentals, shops and commercial properties across ${escapeHtml(city)}.</p>
        </div>
        <div class="services-grid">${servicesHtml}</div>
      </div>
    </section>

    <section class="section soft trust-section">
      <div class="container">
        <div class="section-header center">
          <div class="section-kicker">Why choose us</div>
          <h2>Trusted local service</h2>
          <p class="muted">A simple, contact-first site for people who need clear help without hunting around.</p>
        </div>
        <div class="trust-grid">${trustHtml}</div>
      </div>
    </section>

    ${reviewsSectionHtml}

    <section id="areas" class="section soft">
      <div class="container">
        <div class="areas-panel">
          <div>
            <div class="section-kicker">Service areas</div>
            <h2>Service areas</h2>
            <p>Local ${escapeHtml(servicePhrase)} for homes and businesses across the area.</p>
          </div>
          <div class="areas-list">${escapeHtml(serviceAreas)}</div>
        </div>
      </div>
    </section>

    <section id="faq" class="section">
      <div class="container">
        <div class="section-header">
          <div class="section-kicker">FAQ</div>
          <h2>Common questions</h2>
          <p class="muted">Straight answers before you pick up the phone.</p>
        </div>
        <div class="faq-grid">${faqHtml}</div>
      </div>
    </section>

    <section class="section soft contact-section">
      <div class="container">
        <div class="section-header">
          <div class="section-kicker">Contact</div>
          <h2>Get in touch</h2>
          <p class="muted">Call directly for fast plumbing help or request a callback anytime.</p>
        </div>
        <div class="contact-layout">
          <div class="contact-panel">
            <h3>${escapeHtml(businessName)}</h3>
            <div class="contact-actions">
              ${contactPhoneHtml}
              ${emailHtml}
              ${addressHtml}
            </div>
            ${hoursHtml}
            ${callButtonHtml}
          </div>
          <form class="callback-form" data-slug="${escapeAttribute(businessSlug)}">
            <h3>Request a callback</h3>
            <p class="muted">Leave your details and a short description of the job.</p>
            <label>Name<input name="name" type="text" autocomplete="name" required /></label>
            <label>Phone<input name="phone" type="tel" autocomplete="tel" required /></label>
            <label>Message<textarea name="message" placeholder="Briefly describe the job"></textarea></label>
            <button class="button primary" type="submit">Request a Call Back</button>
            <p class="form-success">Thanks - we'll call you shortly.</p>
          </form>
        </div>
        <div class="map-wrap">${mapHtml}</div>
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          <h3>${escapeHtml(businessName)}</h3>
          <p>Local ${escapeHtml(servicePhrase)} for homes and businesses in ${escapeHtml(city)}.</p>
        </div>
        <div>
          <h4>Contact</h4>
          <div class="footer-links">
            ${hasPhone ? `<a href="tel:${escapeAttribute(phoneRaw)}">${escapeHtml(phoneDisplay)}</a>` : ""}
            ${email ? `<a href="${escapeAttribute(emailHref)}">${escapeHtml(email)}</a>` : ""}
            <span>${escapeHtml(footerLocation)}</span>
          </div>
        </div>
        <div>
          <h4>Hours</h4>
          <div class="footer-links">${footerHoursHtml}</div>
        </div>
        <div>
          <h4>Quick links</h4>
          <div class="footer-links">
            <a href="#services">Services</a>
            <a href="#reviews">Reviews</a>
            <a href="#areas">Service areas</a>
            <a href="#quote">Request callback</a>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        <span>&copy; ${escapeHtml(businessName)}</span>
        <span>Serving ${escapeHtml(city)} and surrounding areas</span>
      </div>
    </div>
  </footer>

  ${mobileCallHtml}

  <script>
    document.querySelectorAll(".callback-form, .mini-form").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const submitButton = form.querySelector("button[type='submit']");

        if (submitButton) {
          submitButton.disabled = true;
          submitButton.textContent = "Sending...";
        }

        try {
          const response = await fetch("/api/callback", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              slug: form.getAttribute("data-slug"),
              name: formData.get("name") || "",
              phone: formData.get("phone") || "",
              message: ["service", "message"]
                .map((key) => {
                  const value = formData.get(key);
                  return value ? key + ": " + value : "";
                })
                .filter(Boolean)
                .join("\\n"),
            }),
          });

          if (!response.ok) {
            throw new Error("Callback request failed");
          }

          form.classList.add("is-sent");
          form.reset();
        } catch (error) {
          alert("Sorry, we could not send that request. Please call instead.");
        } finally {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Request a Call Back";
          }
        }
      });
    });
  </script>
</body>
</html>`;
}
