import { getSupabaseAdmin } from "./server";
import {
  getLeadStatus,
  normalizeLeadIdentity,
  withLifecycleDefaults,
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
  phone?: string | null;
  website?: string | null;
  email?: string | null;
  rating?: string | number | null;
  user_ratings_total?: string | number | null;
  status?: LifecycleStatus | string | null;
  opportunity_score?: number | null;
  data?: LeadRecord | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export function rowToLead(row: LeadRow): LeadRecord {
  const data = row.data && typeof row.data === "object" ? row.data : {};
  const slug = getString(row.slug) || getString(data.slug);
  const status = getLeadStatus({
    ...data,
    status: row.status || data.status,
  });

  return withLifecycleDefaults({
    ...data,
    id: getString(data.id) || slug,
    slug,
    googlePlaceId: getString(data.googlePlaceId) || getString(row.place_id),
    placeId: getString(data.placeId) || getString(row.place_id),
    businessName: getString(data.businessName) || getString(row.name),
    trade: getString(row.trade) || getString(data.trade),
    city: getString(row.city) || getString(data.city),
    phone: getString(row.phone) || getString(data.phone),
    website: getString(row.website) || getString(data.website),
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
    status,
    createdAt: getString(data.createdAt) || getString(row.created_at),
    updatedAt: getString(data.updatedAt) || getString(row.updated_at),
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
    phone: getString(leadWithDefaults.phone) || null,
    website: getString(leadWithDefaults.website) || null,
    email: getString(leadWithDefaults.email) || null,
    rating: getString(leadWithDefaults.rating) || null,
    user_ratings_total: getString(leadWithDefaults.reviewCount) || null,
    status: getLeadStatus(leadWithDefaults),
    opportunity_score: opportunityScore,
    data: leadWithDefaults,
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

export async function listLeadsByStatus(status: LifecycleStatus) {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  if (status === "lead") {
    query = query.or("status.eq.lead,status.is.null");
  } else {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map((row) => rowToLead(row as LeadRow));
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
  const row = leadToRow({
    ...lead,
    slug,
    id: getString(lead.id) || slug,
  });
  const { data, error } = await supabase
    .from("leads")
    .update(row)
    .eq("slug", slug)
    .select("*")
    .single();

  if (error) throw error;

  return rowToLead(data as LeadRow);
}

export async function updateLeadStatusBySlug(
  slug: string,
  status: LifecycleStatus,
  reviewNotes?: string
) {
  const existingLead = await getLeadBySlug(slug);

  if (!existingLead) return null;

  const now = new Date().toISOString();
  const updatedLead = withLifecycleDefaults({
    ...existingLead,
    status,
    reviewNotes:
      typeof reviewNotes === "string"
        ? reviewNotes
        : typeof existingLead.reviewNotes === "string"
          ? existingLead.reviewNotes
          : "",
  } as LeadRecord);

  if (status === "contacted") {
    updatedLead.contactedAt = now;
  }

  if (status === "client") {
    updatedLead.clientAt = now;
  }

  if (status === "archived") {
    updatedLead.archivedAt = now;
  }

  return updateLeadBySlug(slug, updatedLead);
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
