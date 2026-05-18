import { getSupabaseAdmin } from "./supabase/server";

export type LeadGenerationRunStatus =
  | "running"
  | "completed"
  | "partial"
  | "failed";

export type LeadGenerationRun = {
  id: string;
  created_at: string;
  started_at: string;
  completed_at: string | null;
  status: LeadGenerationRunStatus;
  trade: string;
  state_code: string | null;
  towns: string[];
  requested_limit: number | null;
  leads_found: number;
  leads_created: number;
  duplicates_skipped: number;
  no_opportunity_skipped: number;
  enrichment_failed: number;
  total_skipped: number;
  duration_ms: number | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
};

type CreateLeadGenerationRunArgs = {
  trade: string;
  stateCode?: string | null;
  towns: string[];
  requestedLimit?: number | null;
  metadata?: Record<string, unknown>;
};

type UpdateLeadGenerationRunArgs = {
  status: LeadGenerationRunStatus;
  startedAt: number;
  leadsFound?: number;
  leadsCreated?: number;
  duplicatesSkipped?: number;
  noOpportunitySkipped?: number;
  enrichmentFailed?: number;
  totalSkipped?: number;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

function getNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

export async function createLeadGenerationRunSafe(
  args: CreateLeadGenerationRunArgs
) {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("lead_generation_runs")
      .insert({
        status: "running",
        trade: args.trade || "unknown",
        state_code: args.stateCode || null,
        towns: args.towns,
        requested_limit:
          typeof args.requestedLimit === "number" ? args.requestedLimit : null,
        metadata: args.metadata || {},
      })
      .select("id")
      .single();

    if (error) throw error;

    return typeof data?.id === "string" ? data.id : null;
  } catch (error) {
    console.warn("[lead-generation-runs] create failed:", error);
    return null;
  }
}

export async function updateLeadGenerationRunSafe(
  runId: string | null,
  args: UpdateLeadGenerationRunArgs
) {
  if (!runId) return;

  try {
    const supabase = getSupabaseAdmin();
    const completedAt = new Date();
    const { error } = await supabase
      .from("lead_generation_runs")
      .update({
        completed_at: completedAt.toISOString(),
        status: args.status,
        leads_found: getNumber(args.leadsFound),
        leads_created: getNumber(args.leadsCreated),
        duplicates_skipped: getNumber(args.duplicatesSkipped),
        no_opportunity_skipped: getNumber(args.noOpportunitySkipped),
        enrichment_failed: getNumber(args.enrichmentFailed),
        total_skipped: getNumber(args.totalSkipped),
        duration_ms: Math.max(0, completedAt.getTime() - args.startedAt),
        error_message: args.errorMessage || null,
        ...(args.metadata ? { metadata: args.metadata } : {}),
      })
      .eq("id", runId);

    if (error) throw error;
  } catch (error) {
    console.warn("[lead-generation-runs] update failed:", error);
  }
}

export async function listRecentLeadGenerationRuns(limit = 20) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("lead_generation_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 50)));

  if (error) throw error;

  return (data || []) as LeadGenerationRun[];
}
