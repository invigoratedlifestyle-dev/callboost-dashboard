import "server-only";
import { getLeadStage } from "./leadLifecycle";
import { getSupabaseAdmin } from "./supabase/server";

type AnalyticsMessageRow = {
  id?: string | null;
  lead_id?: string | number | null;
  slug?: string | null;
  channel?: string | null;
  subject?: string | null;
  status?: string | null;
  direction?: string | null;
  open_count?: number | null;
  click_count?: number | null;
  opened_at?: string | null;
  clicked_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type AnalyticsLeadRow = {
  id?: string | number | null;
  slug?: string | null;
  name?: string | null;
  trade?: string | null;
  city?: string | null;
  stage?: string | null;
  status?: string | null;
  data?: Record<string, unknown> | null;
};

export type AnalyticsHotLead = {
  leadKey: string;
  slug: string;
  businessName: string;
  trade: string;
  city: string;
  status: string;
  opens: number;
  clicks: number;
  lastEngagement: string;
};

export type AnalyticsRecentEngagement = {
  id: string;
  time: string;
  slug: string;
  businessName: string;
  eventType: "open" | "click";
  channel: string;
};

export type AnalyticsChannelBreakdown = {
  channel: string;
  sent: number;
  opened: number;
  clicked: number;
  openRate: number;
  clickRate: number;
};

export type AnalyticsSubjectPerformance = {
  subject: string;
  sent: number;
  opened: number;
  clicked: number;
  openRate: number;
  clickRate: number;
};

export type CallBoostAnalytics = {
  totalOutboundMessages: number;
  totalOpenedMessages: number;
  totalClickedMessages: number;
  openRate: number;
  clickRate: number;
  clickThroughFromOpenRate: number;
  totalOpens: number;
  totalClicks: number;
  hotLeadCount: number;
  hotLeads: AnalyticsHotLead[];
  recentEngagement: AnalyticsRecentEngagement[];
  channelBreakdown: AnalyticsChannelBreakdown[];
  subjectPerformance: AnalyticsSubjectPerformance[];
};

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown) {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function getLeadKeyFromMessage(message: AnalyticsMessageRow) {
  if (message.lead_id !== null && message.lead_id !== undefined) {
    return `id:${message.lead_id}`;
  }

  const slug = getString(message.slug);

  return slug ? `slug:${slug}` : "";
}

function getLeadName(lead?: AnalyticsLeadRow | null, fallback = "") {
  return (
    getString(lead?.data?.businessName) ||
    getString(lead?.data?.displayName) ||
    getString(lead?.data?.name) ||
    getString(lead?.name) ||
    fallback ||
    "Unknown business"
  );
}

function getLeadSlug(lead?: AnalyticsLeadRow | null, fallback = "") {
  return getString(lead?.slug) || getString(lead?.data?.slug) || fallback;
}

function getLeadTrade(lead?: AnalyticsLeadRow | null) {
  return getString(lead?.data?.trade) || getString(lead?.trade);
}

function getLeadCity(lead?: AnalyticsLeadRow | null) {
  return getString(lead?.data?.city) || getString(lead?.city);
}

function getLastEngagement(message: AnalyticsMessageRow) {
  const opened = new Date(message.opened_at || "").getTime();
  const clicked = new Date(message.clicked_at || "").getTime();
  const latest = Math.max(
    Number.isFinite(opened) ? opened : 0,
    Number.isFinite(clicked) ? clicked : 0
  );

  return latest ? new Date(latest).toISOString() : "";
}

async function fetchAnalyticsMessages() {
  const { data, error } = await getSupabaseAdmin()
    .from("lead_messages")
    .select(
      "id, lead_id, slug, channel, subject, status, direction, open_count, click_count, opened_at, clicked_at, created_at, metadata"
    )
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(10000);

  if (error) throw error;

  return (data || []) as AnalyticsMessageRow[];
}

async function fetchAnalyticsLeads() {
  const { data, error } = await getSupabaseAdmin()
    .from("leads")
    .select("id, slug, name, trade, city, stage, status, data")
    .limit(10000);

  if (error) throw error;

  return (data || []) as AnalyticsLeadRow[];
}

export async function getCallBoostAnalytics(): Promise<CallBoostAnalytics> {
  const [messages, leads] = await Promise.all([
    fetchAnalyticsMessages(),
    fetchAnalyticsLeads(),
  ]);
  const leadsById = new Map<string, AnalyticsLeadRow>();
  const leadsBySlug = new Map<string, AnalyticsLeadRow>();

  leads.forEach((lead) => {
    if (lead.id !== null && lead.id !== undefined) {
      leadsById.set(String(lead.id), lead);
    }
    const slug = getLeadSlug(lead);
    if (slug) leadsBySlug.set(slug, lead);
  });

  const totalOutboundMessages = messages.length;
  const openedMessages = messages.filter((message) => getNumber(message.open_count) > 0);
  const clickedMessages = messages.filter((message) => getNumber(message.click_count) > 0);
  const totalOpens = messages.reduce(
    (sum, message) => sum + getNumber(message.open_count),
    0
  );
  const totalClicks = messages.reduce(
    (sum, message) => sum + getNumber(message.click_count),
    0
  );
  const leadStats = new Map<string, AnalyticsHotLead>();

  messages.forEach((message) => {
    const key = getLeadKeyFromMessage(message);
    const opens = getNumber(message.open_count);
    const clicks = getNumber(message.click_count);

    if (!key || (!opens && !clicks)) return;

    const lead =
      (message.lead_id !== null && message.lead_id !== undefined
        ? leadsById.get(String(message.lead_id))
        : undefined) || leadsBySlug.get(getString(message.slug));
    const existing = leadStats.get(key);
    const lastEngagement = getLastEngagement(message);
    const currentLast = existing?.lastEngagement || "";

    leadStats.set(key, {
      leadKey: key,
      slug: getLeadSlug(lead, getString(message.slug)),
      businessName: getLeadName(lead, getString(message.slug)),
      trade: getLeadTrade(lead),
      city: getLeadCity(lead),
      status: lead ? getLeadStage(lead as Record<string, unknown>) : "",
      opens: (existing?.opens || 0) + opens,
      clicks: (existing?.clicks || 0) + clicks,
      lastEngagement:
        new Date(lastEngagement).getTime() > new Date(currentLast).getTime()
          ? lastEngagement
          : currentLast || lastEngagement,
    });
  });

  const hotLeads = [...leadStats.values()]
    .filter((lead) => lead.clicks > 0 || lead.opens >= 3)
    .sort((a, b) => {
      const engagementDiff = b.clicks * 10 + b.opens - (a.clicks * 10 + a.opens);
      if (engagementDiff !== 0) return engagementDiff;

      return (
        new Date(b.lastEngagement || "").getTime() -
        new Date(a.lastEngagement || "").getTime()
      );
    })
    .slice(0, 20);

  const recentEngagement = messages
    .flatMap((message) => {
      const lead =
        (message.lead_id !== null && message.lead_id !== undefined
          ? leadsById.get(String(message.lead_id))
          : undefined) || leadsBySlug.get(getString(message.slug));
      const base = {
        slug: getLeadSlug(lead, getString(message.slug)),
        businessName: getLeadName(lead, getString(message.slug)),
        channel: getString(message.channel) || "unknown",
      };
      const events: AnalyticsRecentEngagement[] = [];

      if (message.clicked_at) {
        events.push({
          ...base,
          id: `${message.id}-click`,
          time: getString(message.clicked_at),
          eventType: "click",
        });
      }
      if (message.opened_at) {
        events.push({
          ...base,
          id: `${message.id}-open`,
          time: getString(message.opened_at),
          eventType: "open",
        });
      }

      return events;
    })
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 30);

  const channels = Array.from(
    new Set(messages.map((message) => getString(message.channel) || "unknown"))
  );
  const channelBreakdown = channels.map((channel) => {
    const channelMessages = messages.filter(
      (message) => (getString(message.channel) || "unknown") === channel
    );
    const opened = channelMessages.filter(
      (message) => getNumber(message.open_count) > 0
    ).length;
    const clicked = channelMessages.filter(
      (message) => getNumber(message.click_count) > 0
    ).length;

    return {
      channel,
      sent: channelMessages.length,
      opened,
      clicked,
      openRate: percent(opened, channelMessages.length),
      clickRate: percent(clicked, channelMessages.length),
    };
  });

  const subjectMap = new Map<string, AnalyticsSubjectPerformance>();
  messages
    .filter((message) => getString(message.channel) === "email")
    .forEach((message) => {
      const subject = getString(message.subject) || "(No subject)";
      const current =
        subjectMap.get(subject) ||
        ({
          subject,
          sent: 0,
          opened: 0,
          clicked: 0,
          openRate: 0,
          clickRate: 0,
        } satisfies AnalyticsSubjectPerformance);

      current.sent += 1;
      if (getNumber(message.open_count) > 0) current.opened += 1;
      if (getNumber(message.click_count) > 0) current.clicked += 1;
      subjectMap.set(subject, current);
    });

  const subjectPerformance = [...subjectMap.values()]
    .map((subject) => ({
      ...subject,
      openRate: percent(subject.opened, subject.sent),
      clickRate: percent(subject.clicked, subject.sent),
    }))
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 12);

  return {
    totalOutboundMessages,
    totalOpenedMessages: openedMessages.length,
    totalClickedMessages: clickedMessages.length,
    openRate: percent(openedMessages.length, totalOutboundMessages),
    clickRate: percent(clickedMessages.length, totalOutboundMessages),
    clickThroughFromOpenRate: percent(clickedMessages.length, openedMessages.length),
    totalOpens,
    totalClicks,
    hotLeadCount: hotLeads.length,
    hotLeads,
    recentEngagement,
    channelBreakdown,
    subjectPerformance,
  };
}

export function formatAnalyticsPercent(value: number) {
  return `${value.toFixed(1)}%`;
}
