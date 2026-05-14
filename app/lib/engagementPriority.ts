import "server-only";
import { getLeadStage, type LeadRecord } from "./leadLifecycle";
import { getSupabaseAdmin } from "./supabase/server";

export type EngagementState = "hot" | "warm" | "none";

export type LeadEngagementSummary = {
  engagement_state: EngagementState;
  engagement_priority: number;
  engagement_reason: string;
  total_open_count: number;
  total_click_count: number;
  last_opened_at: string;
  last_clicked_at: string;
  last_engaged_at: string;
  recommended_action: string;
  recommended_follow_up_type: "follow_up_1" | "follow_up_2" | "none";
};

type EngagementMessageRow = {
  lead_id?: string | number | null;
  slug?: string | null;
  open_count?: number | null;
  click_count?: number | null;
  opened_at?: string | null;
  clicked_at?: string | null;
};

const emptyEngagement: LeadEngagementSummary = {
  engagement_state: "none",
  engagement_priority: 0,
  engagement_reason: "",
  total_open_count: 0,
  total_click_count: 0,
  last_opened_at: "",
  last_clicked_at: "",
  last_engaged_at: "",
  recommended_action: "",
  recommended_follow_up_type: "none",
};

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown) {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

function latestTimestamp(a: string, b: string) {
  const aTime = new Date(a || "").getTime();
  const bTime = new Date(b || "").getTime();

  return (Number.isFinite(bTime) ? bTime : 0) >
    (Number.isFinite(aTime) ? aTime : 0)
    ? b
    : a;
}

function getLeadKey(lead: LeadRecord) {
  const id = lead.id;

  if (id !== null && id !== undefined && String(id).trim()) {
    return `id:${id}`;
  }

  const slug = getString(lead.slug);

  return slug ? `slug:${slug}` : "";
}

function getMessageKeys(message: EngagementMessageRow) {
  return [
    message.lead_id !== null && message.lead_id !== undefined
      ? `id:${message.lead_id}`
      : "",
    getString(message.slug) ? `slug:${getString(message.slug)}` : "",
  ].filter(Boolean);
}

export function classifyLeadEngagement(
  lead: LeadRecord,
  counts: {
    total_open_count: number;
    total_click_count: number;
    last_opened_at?: string | null;
    last_clicked_at?: string | null;
  }
): LeadEngagementSummary {
  const stage = getLeadStage(lead);
  const totalOpenCount = counts.total_open_count;
  const totalClickCount = counts.total_click_count;
  const lastOpenedAt = getString(counts.last_opened_at);
  const lastClickedAt = getString(counts.last_clicked_at);
  const lastEngagedAt = latestTimestamp(lastOpenedAt, lastClickedAt);

  if (stage === "client" || stage === "archived") {
    return {
      ...emptyEngagement,
      total_open_count: totalOpenCount,
      total_click_count: totalClickCount,
      last_opened_at: lastOpenedAt,
      last_clicked_at: lastClickedAt,
      last_engaged_at: lastEngagedAt,
    };
  }

  if (totalClickCount >= 1) {
    return {
      engagement_state: "hot",
      engagement_priority: 100,
      engagement_reason: "Preview viewed",
      total_open_count: totalOpenCount,
      total_click_count: totalClickCount,
      last_opened_at: lastOpenedAt,
      last_clicked_at: lastClickedAt,
      last_engaged_at: lastEngagedAt,
      recommended_action: "Send Follow-up 1",
      recommended_follow_up_type: "follow_up_1",
    };
  }

  if (totalOpenCount >= 3) {
    return {
      engagement_state: "warm",
      engagement_priority: 80,
      engagement_reason: "Repeat engagement",
      total_open_count: totalOpenCount,
      total_click_count: totalClickCount,
      last_opened_at: lastOpenedAt,
      last_clicked_at: lastClickedAt,
      last_engaged_at: lastEngagedAt,
      recommended_action: "Send Follow-up 2",
      recommended_follow_up_type: "follow_up_2",
    };
  }

  return {
    ...emptyEngagement,
    total_open_count: totalOpenCount,
    total_click_count: totalClickCount,
    last_opened_at: lastOpenedAt,
    last_clicked_at: lastClickedAt,
    last_engaged_at: lastEngagedAt,
  };
}

export async function getEngagementCountsByLeadKey() {
  const { data, error } = await getSupabaseAdmin()
    .from("lead_messages")
    .select("lead_id, slug, open_count, click_count, opened_at, clicked_at")
    .eq("direction", "outbound")
    .limit(10000);

  if (error) throw error;

  const counts = new Map<
    string,
    {
      total_open_count: number;
      total_click_count: number;
      last_opened_at: string;
      last_clicked_at: string;
    }
  >();

  for (const message of (data || []) as EngagementMessageRow[]) {
    for (const key of getMessageKeys(message)) {
      const current =
        counts.get(key) || {
          total_open_count: 0,
          total_click_count: 0,
          last_opened_at: "",
          last_clicked_at: "",
        };

      current.total_open_count += getNumber(message.open_count);
      current.total_click_count += getNumber(message.click_count);
      current.last_opened_at = latestTimestamp(
        current.last_opened_at,
        getString(message.opened_at)
      );
      current.last_clicked_at = latestTimestamp(
        current.last_clicked_at,
        getString(message.clicked_at)
      );
      counts.set(key, current);
    }
  }

  return counts;
}

export async function enrichLeadsWithEngagement<T extends LeadRecord>(
  leads: T[]
): Promise<Array<T & LeadEngagementSummary>> {
  const counts = await getEngagementCountsByLeadKey();

  return leads.map((lead) => {
    const key = getLeadKey(lead);
    const slugKey = getString(lead.slug) ? `slug:${getString(lead.slug)}` : "";
    const leadCounts =
      counts.get(key) ||
      (slugKey ? counts.get(slugKey) : undefined) || {
        total_open_count: 0,
        total_click_count: 0,
        last_opened_at: "",
        last_clicked_at: "",
      };

    return {
      ...lead,
      ...classifyLeadEngagement(lead, leadCounts),
    };
  });
}

export async function getLeadEngagementSummary(lead: LeadRecord) {
  const [enriched] = await enrichLeadsWithEngagement([lead]);

  return enriched || { ...lead, ...emptyEngagement };
}
