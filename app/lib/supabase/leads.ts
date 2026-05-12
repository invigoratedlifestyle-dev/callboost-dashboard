import { getSupabaseAdmin } from "./server";
import {
  type GeneratedSiteCleanupWarning,
  purgeGeneratedSiteForLeadBestEffort,
  purgeGeneratedSiteForLead,
  removeGeneratedSiteReferencesFromLead,
} from "./generatedSites";
import {
  getLeadStage,
  normalizeLeadIdentity,
  withLifecycleDefaults,
  type LifecycleStage,
  type LifecycleStatus,
  type LeadRecord,
} from "../leadLifecycle";

export type LeadRow = {
  id?: string | number;
  slug: string;
  place_id?: string | null;
  name?: string | null;
  trade?: string | null;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  email?: string | null;
  rating?: string | number | null;
  user_ratings_total?: string | number | null;
  stage?: LifecycleStage | string | null;
  status?: LifecycleStatus | string | null;
  opportunity_score?: number | null;
  data?: LeadRecord | null;
  created_at?: string | null;
  updated_at?: string | null;
  stripe_customer_id?: string | null;
  stripe_checkout_session_id?: string | null;
  stripe_subscription_id?: string | null;
  payment_status?: string | null;
  paid_at?: string | null;
  client_started_at?: string | null;
};

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function getBusinessPresenceType(url: string) {
  try {
    const parsedUrl = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const host = parsedUrl.hostname.replace(/^www\./i, "").toLowerCase();

    if (host.includes("facebook.com") || host.includes("instagram.com")) {
      return "social";
    }

    if (host.includes("google.com") || host.includes("maps.app.goo.gl")) {
      return "google_business";
    }

    if (
      [
        "linkedin.com",
        "yelp",
        "yellowpages",
        "truelocal",
        "wordofmouth",
        "hipages",
        "oneflare",
        "tripadvisor",
      ].some((domain) => host.includes(domain) || parsedUrl.href.includes(domain))
    ) {
      return "directory";
    }

    return "website";
  } catch {
    return "unknown";
  }
}

export function rowToLead(row: LeadRow): LeadRecord {
  const data = row.data && typeof row.data === "object" ? row.data : {};
  const businessPresence =
    data.business_presence && typeof data.business_presence === "object"
      ? (data.business_presence as Record<string, unknown>)
      : {};
  const slug = getString(row.slug) || getString(data.slug);
  const stage = getLeadStage({
    ...data,
    stage: row.stage || data.stage || row.status || data.status,
    status: row.status || data.status,
  });
  const rowWebsite = getString(row.website) || getString(data.website);
  const canonicalWebsite = getString(businessPresence.canonicalWebsiteUrl);
  const rowWebsitePresenceType = getBusinessPresenceType(rowWebsite);
  const displayWebsite =
    canonicalWebsite ||
    (rowWebsitePresenceType === "website" ? rowWebsite : "");
  const nextBusinessPresence =
    rowWebsitePresenceType !== "website" && rowWebsite
      ? {
          ...businessPresence,
          originalWebsiteUrl: getString(businessPresence.originalWebsiteUrl) || rowWebsite,
          primaryBusinessPresenceUrl:
            getString(businessPresence.primaryBusinessPresenceUrl) || rowWebsite,
          primaryBusinessPresenceType:
            getString(businessPresence.primaryBusinessPresenceType) ||
            (rowWebsitePresenceType === "social"
              ? rowWebsite.toLowerCase().includes("instagram.com")
                ? "instagram"
                : "facebook"
              : rowWebsitePresenceType),
          sourceUrl: getString(businessPresence.sourceUrl) || rowWebsite,
          sourceType:
            getString(businessPresence.sourceType) ||
            (rowWebsitePresenceType === "social"
              ? rowWebsite.toLowerCase().includes("instagram.com")
                ? "instagram"
                : "facebook"
              : rowWebsitePresenceType),
        }
      : {
          ...businessPresence,
          ...(rowWebsite && rowWebsitePresenceType === "website"
            ? { canonicalWebsiteUrl: canonicalWebsite || rowWebsite }
            : {}),
        };

  return withLifecycleDefaults({
    ...data,
    id: getString(data.id) || slug,
    name: getString(row.name) || getString(data.name) || getString(data.businessName),
    slug,
    googlePlaceId: getString(data.googlePlaceId) || getString(row.place_id),
    placeId: getString(data.placeId) || getString(row.place_id),
    businessName: getString(data.businessName) || getString(row.name),
    trade: getString(row.trade) || getString(data.trade),
    city: getString(row.city) || getString(data.city),
    address:
      getString(row.address) ||
      getString(data.address) ||
      getString(data.formattedAddress),
    formattedAddress:
      getString(row.address) ||
      getString(data.formattedAddress) ||
      getString(data.address),
    phone: getString(row.phone) || getString(data.phone),
    website: displayWebsite,
    business_presence: nextBusinessPresence,
    email: getString(row.email) || getString(data.email),
    rating:
      row.rating !== null && row.rating !== undefined
        ? String(row.rating)
        : getString(data.rating),
    reviewCount:
      row.user_ratings_total !== null && row.user_ratings_total !== undefined
        ? String(row.user_ratings_total)
        : getString(data.reviewCount),
    leadScore:
      typeof data.leadScore === "number"
        ? data.leadScore
        : typeof row.opportunity_score === "number"
          ? row.opportunity_score
          : data.leadScore,
    stage,
    status: stage,
    createdAt: getString(row.created_at) || getString(data.createdAt),
    updatedAt: getString(row.updated_at) || getString(data.updatedAt),
    stripeCustomerId:
      getString(row.stripe_customer_id) || getString(data.stripeCustomerId),
    stripeCheckoutSessionId:
      getString(row.stripe_checkout_session_id) ||
      getString(data.stripeCheckoutSessionId),
    stripeSubscriptionId:
      getString(row.stripe_subscription_id) ||
      getString(data.stripeSubscriptionId),
    paymentStatus: getString(row.payment_status) || getString(data.paymentStatus),
    paidAt: getString(row.paid_at) || getString(data.paidAt),
    clientStartedAt:
      getString(row.client_started_at) || getString(data.clientStartedAt),
    siteBrandingUrl: getString(data.siteBrandingUrl),
    heroImageUrl: getString(data.heroImageUrl),
    siteIconUrl: getString(data.siteIconUrl),
  });
}

export function leadToRow(lead: LeadRecord) {
  const leadWithDefaults = withLifecycleDefaults(lead);
  const websiteEvaluation = leadWithDefaults.websiteEvaluation as
    | Record<string, unknown>
    | undefined;
  const opportunityScore =
    getNumber(websiteEvaluation?.score) ?? getNumber(leadWithDefaults.leadScore);

  return {
    slug: getString(leadWithDefaults.slug) || getString(leadWithDefaults.id),
    place_id:
      getString(leadWithDefaults.googlePlaceId) ||
      getString(leadWithDefaults.placeId) ||
      null,
    name:
      getString(leadWithDefaults.businessName) ||
      getString(leadWithDefaults.name) ||
      null,
    trade: getString(leadWithDefaults.trade) || null,
    city: getString(leadWithDefaults.city) || null,
    address:
      getString(leadWithDefaults.address) ||
      getString(leadWithDefaults.formattedAddress) ||
      null,
    phone: getString(leadWithDefaults.phone) || null,
    website: getString(leadWithDefaults.website) || null,
    email: getString(leadWithDefaults.email) || null,
    rating: getString(leadWithDefaults.rating) || null,
    user_ratings_total: getString(leadWithDefaults.reviewCount) || null,
    stage: getLeadStage(leadWithDefaults),
    opportunity_score: opportunityScore,
    data: {
      ...leadWithDefaults,
      stage: getLeadStage(leadWithDefaults),
    },
  };
}

export async function listLeadRows() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data || [];
}

export async function listLeads() {
  const rows = await listLeadRows();

  return rows.map((row) => rowToLead(row as LeadRow));
}

export async function listLeadsByStage(stage: LifecycleStage) {
  const rows = await listLeadRows();

  return rows
    .map((row) => rowToLead(row as LeadRow))
    .filter((lead) => getLeadStage(lead) === stage);
}

export async function listLeadsByStatus(status: LifecycleStatus) {
  return listLeadsByStage(status);
}

export async function getLeadRowBySlug(slug: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;

  return data as LeadRow | null;
}

export async function getLeadBySlug(slug: string) {
  const row = await getLeadRowBySlug(slug);

  return row ? rowToLead(row) : null;
}

export async function getLeadRowById(id: string | number) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;

  return data as LeadRow | null;
}

export async function getLeadById(id: string | number) {
  const row = await getLeadRowById(id);

  return row ? rowToLead(row) : null;
}

export async function insertLead(lead: LeadRecord) {
  const supabase = getSupabaseAdmin();
  const row = leadToRow(lead);
  const { data, error } = await supabase
    .from("leads")
    .insert(row)
    .select("*")
    .single();

  if (error) throw error;

  return rowToLead(data as LeadRow);
}

export async function updateLeadBySlug(slug: string, lead: LeadRecord) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const row = leadToRow({
    ...lead,
    slug,
    id: getString(lead.id) || slug,
    updatedAt: now,
  });
  const { data, error } = await supabase
    .from("leads")
    .update({
      ...row,
      updated_at: now,
    })
    .eq("slug", slug)
    .select("*")
    .single();

  if (error) throw error;

  return rowToLead(data as LeadRow);
}

export async function updateLeadBrandingAssets(
  slug: string,
  assets: {
    siteBrandingUrl?: string;
    heroImageUrl?: string;
    siteIconUrl?: string;
  }
) {
  const existingLeadRow = await getLeadRowBySlug(slug);

  if (!existingLeadRow) return null;

  const now = new Date().toISOString();
  const nextLead = withLifecycleDefaults({
    ...rowToLead(existingLeadRow),
    ...(assets.siteBrandingUrl ? { siteBrandingUrl: assets.siteBrandingUrl } : {}),
    ...(assets.heroImageUrl ? { heroImageUrl: assets.heroImageUrl } : {}),
    ...(assets.siteIconUrl ? { siteIconUrl: assets.siteIconUrl } : {}),
    updatedAt: now,
  });
  const row = {
    ...leadToRow({
      ...nextLead,
      slug,
      id: getString((nextLead as LeadRecord).id) || slug,
    }),
    updated_at: now,
  };
  const { data, error } = await getSupabaseAdmin()
    .from("leads")
    .update(row)
    .eq("slug", slug)
    .select("*")
    .single();

  if (error) throw error;

  return rowToLead(data as LeadRow);
}

export async function updateLeadStageBySlug(
  slug: string,
  stage: LifecycleStage,
  reviewNotes?: string
) {
  const existingLeadRow = await getLeadRowBySlug(slug);

  if (!existingLeadRow) return null;

  const existingLead = rowToLead(existingLeadRow);

  const now = new Date().toISOString();
  let updatedLead = withLifecycleDefaults({
    ...existingLead,
    stage,
    status: stage,
    reviewNotes:
      typeof reviewNotes === "string"
        ? reviewNotes
        : typeof existingLead.reviewNotes === "string"
          ? existingLead.reviewNotes
          : "",
  } as LeadRecord);

  if (stage === "contacted") {
    updatedLead.contactedAt = now;
  }

  if (stage === "client") {
    updatedLead.clientAt = now;
  }

  if (stage === "archived") {
    updatedLead.archivedAt = now;
    updatedLead = removeGeneratedSiteReferencesFromLead(updatedLead);
  }

  const savedLead = await updateLeadBySlug(slug, updatedLead);

  if (stage === "archived") {
    try {
      await purgeGeneratedSiteForLead({
        lead: savedLead,
        leadId: existingLeadRow.id || null,
      });
    } catch (error) {
      console.error("GENERATED_SITE_PURGE_FAILED", {
        slug,
        leadId: existingLeadRow.id || null,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  return savedLead;
}

export async function updateLeadStatusBySlug(
  slug: string,
  status: LifecycleStatus,
  reviewNotes?: string
) {
  return updateLeadStageBySlug(slug, status, reviewNotes);
}

export async function deleteLeadsBySlugs(slugs: string[]) {
  const uniqueSlugs = Array.from(
    new Set(slugs.map((slug) => slug.trim()).filter(Boolean))
  );

  if (!uniqueSlugs.length) {
    return {
      deleted: 0,
      warnings: [] as GeneratedSiteCleanupWarning[],
    };
  }

  const supabase = getSupabaseAdmin();
  const { data: rows, error: fetchError } = await supabase
    .from("leads")
    .select("*")
    .in("slug", uniqueSlugs);

  if (fetchError) throw fetchError;

  const leadRows = (rows || []) as LeadRow[];
  const warnings: GeneratedSiteCleanupWarning[] = [];

  for (const row of leadRows) {
    const rowWarnings = await purgeGeneratedSiteForLeadBestEffort({
      supabase,
      lead: rowToLead(row),
      leadId: row.id || null,
    });

    warnings.push(...rowWarnings);
  }

  const { error: callbackSlugError } = await supabase
    .from("callbacks")
    .delete()
    .in("source_slug", uniqueSlugs);

  if (callbackSlugError) throw callbackSlugError;

  const { error: messageSlugError } = await supabase
    .from("lead_messages")
    .delete()
    .in("slug", uniqueSlugs);

  if (messageSlugError) throw messageSlugError;

  const { error: deleteError } = await supabase
    .from("leads")
    .delete()
    .in("slug", uniqueSlugs);

  if (deleteError) throw deleteError;

  return {
    deleted: leadRows.length,
    warnings,
  };
}

export async function duplicateLeadExists(lead: LeadRecord) {
  const supabase = getSupabaseAdmin();
  const slug = getString(lead.slug);
  const placeId = getString(lead.googlePlaceId) || getString(lead.placeId);
  const identity = normalizeLeadIdentity(lead);

  if (placeId) {
    const { data, error } = await supabase
      .from("leads")
      .select("slug")
      .eq("place_id", placeId)
      .limit(1);

    if (error) throw error;
    if (data?.length) return "place_id";

    const ignored = await supabase
      .from("ignored_leads")
      .select("slug")
      .eq("place_id", placeId)
      .limit(1);

    if (ignored.error) throw ignored.error;
    if (ignored.data?.length) return "ignored_place_id";
  }

  if (slug) {
    const { data, error } = await supabase
      .from("leads")
      .select("slug")
      .eq("slug", slug)
      .limit(1);

    if (error) throw error;
    if (data?.length) return "slug";

    const ignored = await supabase
      .from("ignored_leads")
      .select("slug")
      .eq("slug", slug)
      .limit(1);

    if (ignored.error) throw ignored.error;
    if (ignored.data?.length) return "ignored_slug";
  }

  if (identity.identityKey) {
    const rows = await listLeadRows();
    const match = rows.some((row) => {
      const existingLead = rowToLead(row as LeadRow);

      return normalizeLeadIdentity(existingLead).identityKey === identity.identityKey;
    });

    if (match) return "identity";

    const { data, error } = await supabase
      .from("ignored_leads")
      .select("data")
      .limit(1000);

    if (error) throw error;

    const ignoredMatch = (data || []).some((row) => {
      const ignoredLead =
        row.data && typeof row.data === "object"
          ? (row.data as LeadRecord)
          : {};

      return normalizeLeadIdentity(ignoredLead).identityKey === identity.identityKey;
    });

    if (ignoredMatch) return "ignored_identity";
  }

  return "";
}

export async function insertIgnoredLead(lead: LeadRecord) {
  const supabase = getSupabaseAdmin();
  const row = {
    slug: getString(lead.slug),
    place_id: getString(lead.placeId) || getString(lead.googlePlaceId) || null,
    name: getString(lead.name) || getString(lead.businessName) || null,
    phone: getString(lead.phone) || null,
    city: getString(lead.city) || null,
    trade: getString(lead.trade) || null,
    reason: getString(lead.reason) || "wrong_trade",
    data: lead,
  };
  const { error } = await supabase.from("ignored_leads").insert(row);

  if (error) throw error;
}

