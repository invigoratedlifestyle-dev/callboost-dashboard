import "server-only";
import { getLeadStage } from "./leadLifecycle";
import { getSupabaseAdmin } from "./supabase/server";

export type ReportRange = "today" | "7d" | "30d" | "all";

export type ReportLeadMessage = {
  id?: string;
  lead_id?: string | number | null;
  slug?: string | null;
  channel?: string | null;
  direction?: string | null;
  body?: string | null;
  open_count?: number | null;
  click_count?: number | null;
  created_at?: string | null;
};

type ReportLeadRow = {
  id?: string | number | null;
  slug?: string | null;
  name?: string | null;
  trade?: string | null;
  city?: string | null;
  stage?: string | null;
  status?: string | null;
  data?: Record<string, unknown> | null;
};

export type ReportKpis = {
  leadsContactedToday: number;
  totalLeadsContacted: number;
  totalOutboundSms: number;
  totalOutboundEmails: number;
  totalInboundReplies: number;
  stopReplies: number;
  interestedReplies: number;
  notInterestedReplies: number;
  contactToReplyRate: number;
  contactToInterestRate: number;
  stopRate: number;
  clientsWon: number;
  openRate: number;
  previewClickRate: number;
  totalOpens: number;
  totalPreviewClicks: number;
};

export type DailyActivityRow = {
  date: string;
  contacted: number;
  replies: number;
  interested: number;
  stops: number;
};

export type ChannelPerformanceRow = {
  channel: "sms" | "email";
  outbound: number;
  replies: number;
  interested: number;
  replyRate: number;
  interestRate: number;
};

export type RecentInterestedReply = {
  id: string;
  slug: string;
  businessName: string;
  city: string;
  trade: string;
  snippet: string;
  receivedAt: string;
};

export type CallBoostReport = {
  range: ReportRange;
  rangeLabel: string;
  startDate: string | null;
  endDate: string;
  kpis: ReportKpis;
  dailyActivity: DailyActivityRow[];
  channelPerformance: ChannelPerformanceRow[];
  recentInterestedReplies: RecentInterestedReply[];
};

const validRanges = new Set<ReportRange>(["today", "7d", "30d", "all"]);

function getText(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function isStopReply(body: unknown) {
  return /\b(stop|unsubscribe|opt\s*out|do not contact|remove me)\b/i.test(
    getText(body)
  );
}

export function isInterestedReply(body: unknown) {
  if (isStopReply(body)) return false;

  return /\b(yes|interested|send|call me|website|preview|looks good|how much|price|pricing|sounds good)\b/i.test(
    getText(body)
  );
}

export function isNotInterestedReply(body: unknown) {
  if (isStopReply(body)) return false;

  return /\b(no thanks|not interested|already have|don'?t need|do not contact)\b/i.test(
    getText(body)
  );
}

export function normalizeReportRange(value: unknown): ReportRange {
  const range = getText(Array.isArray(value) ? value[0] : value);

  return validRanges.has(range as ReportRange) ? (range as ReportRange) : "30d";
}

function getRangeStart(range: ReportRange) {
  const now = new Date();

  if (range === "all") return null;

  if (range === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  const days = range === "7d" ? 7 : 30;
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  return start;
}

function getRangeLabel(range: ReportRange) {
  if (range === "today") return "Today";
  if (range === "7d") return "Last 7 days";
  if (range === "30d") return "Last 30 days";

  return "All time";
}

function getDateKey(value?: string | null) {
  const date = new Date(value || "");

  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toISOString().slice(0, 10);
}

function getMessageTime(value?: string | null) {
  const time = new Date(value || "").getTime();

  return Number.isFinite(time) ? time : 0;
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function getNumber(value: unknown) {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

function getLeadKey(message: ReportLeadMessage) {
  const leadId = message.lead_id;

  if (leadId !== null && leadId !== undefined && String(leadId).trim()) {
    return `id:${leadId}`;
  }

  const slug = getText(message.slug).trim();

  return slug ? `slug:${slug}` : "";
}

function getLeadName(row?: ReportLeadRow) {
  return (
    getText(row?.data?.businessName) ||
    getText(row?.data?.name) ||
    getText(row?.name) ||
    "Unknown business"
  );
}

function getLeadCity(row?: ReportLeadRow) {
  return getText(row?.data?.city) || getText(row?.city);
}

function getLeadTrade(row?: ReportLeadRow) {
  return getText(row?.data?.trade) || getText(row?.trade);
}

function getLeadSlug(row?: ReportLeadRow, fallback = "") {
  return getText(row?.slug) || getText(row?.data?.slug) || fallback;
}

function getSnippet(body: unknown) {
  return getText(body).replace(/\s+/g, " ").trim().slice(0, 160);
}

async function fetchLeadMessages(startDate: Date | null) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("lead_messages")
    .select("id, lead_id, slug, channel, direction, body, open_count, click_count, created_at")
    .order("created_at", { ascending: false })
    .limit(10000);

  if (startDate) {
    query = query.gte("created_at", startDate.toISOString());
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []) as ReportLeadMessage[];
}

async function fetchTodayOutboundMessages() {
  const supabase = getSupabaseAdmin();
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("lead_messages")
    .select("id, lead_id, slug, direction")
    .eq("direction", "outbound")
    .gte("created_at", start.toISOString())
    .limit(10000);

  if (error) throw error;

  return (data || []) as ReportLeadMessage[];
}

async function fetchLeads() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("leads")
    .select("id, slug, name, trade, city, stage, data")
    .limit(10000);

  if (error) throw error;

  return (data || []) as ReportLeadRow[];
}

export async function getCallBoostReport(range: ReportRange) {
  const start = getRangeStart(range);
  const [messages, todayMessages, leads] = await Promise.all([
    fetchLeadMessages(start),
    fetchTodayOutboundMessages(),
    fetchLeads(),
  ]);
  const leadById = new Map<string, ReportLeadRow>();
  const leadBySlug = new Map<string, ReportLeadRow>();

  for (const lead of leads) {
    if (lead.id !== null && lead.id !== undefined) {
      leadById.set(String(lead.id), lead);
    }
    if (lead.slug) {
      leadBySlug.set(lead.slug, lead);
    }
  }

  const outboundMessages = messages.filter(
    (message) => message.direction === "outbound"
  );
  const inboundMessages = messages.filter(
    (message) => message.direction === "inbound"
  );
  const contactedLeadKeys = new Set(
    outboundMessages.map(getLeadKey).filter(Boolean)
  );
  const contactedTodayKeys = new Set(
    todayMessages.map(getLeadKey).filter(Boolean)
  );
  const stopReplies = inboundMessages.filter((message) =>
    isStopReply(message.body)
  );
  const interestedReplies = inboundMessages.filter((message) =>
    isInterestedReply(message.body)
  );
  const notInterestedReplies = inboundMessages.filter((message) =>
    isNotInterestedReply(message.body)
  );
  const outboundSms = outboundMessages.filter(
    (message) => message.channel === "sms"
  );
  const outboundEmails = outboundMessages.filter(
    (message) => message.channel === "email"
  );
  const openedMessages = outboundMessages.filter(
    (message) => getNumber(message.open_count) > 0
  );
  const clickedMessages = outboundMessages.filter(
    (message) => getNumber(message.click_count) > 0
  );
  const totalOpens = outboundMessages.reduce(
    (sum, message) => sum + getNumber(message.open_count),
    0
  );
  const totalPreviewClicks = outboundMessages.reduce(
    (sum, message) => sum + getNumber(message.click_count),
    0
  );
  const clientsWon = leads.filter((lead) => {
    return getLeadStage(lead as Record<string, unknown>) === "client";
  }).length;
  const dailyMap = new Map<string, DailyActivityRow>();

  function dailyRow(date: string) {
    const existing = dailyMap.get(date);
    if (existing) return existing;

    const next = {
      date,
      contacted: 0,
      replies: 0,
      interested: 0,
      stops: 0,
    };

    dailyMap.set(date, next);
    return next;
  }

  const contactedByDate = new Map<string, Set<string>>();

  for (const message of outboundMessages) {
    const date = getDateKey(message.created_at);
    const key = getLeadKey(message);
    const keys = contactedByDate.get(date) || new Set<string>();

    if (key) keys.add(key);
    contactedByDate.set(date, keys);
    dailyRow(date).contacted = keys.size;
  }

  for (const message of inboundMessages) {
    const row = dailyRow(getDateKey(message.created_at));

    row.replies += 1;
    if (isInterestedReply(message.body)) row.interested += 1;
    if (isStopReply(message.body)) row.stops += 1;
  }

  const channelPerformance: ChannelPerformanceRow[] = (["sms", "email"] as const).map(
    (channel) => {
      const channelOutbound = outboundMessages.filter(
        (message) => message.channel === channel
      ).length;
      const channelReplies = inboundMessages.filter(
        (message) => message.channel === channel
      ).length;
      const channelInterested = inboundMessages.filter(
        (message) =>
          message.channel === channel && isInterestedReply(message.body)
      ).length;

      return {
        channel,
        outbound: channelOutbound,
        replies: channelReplies,
        interested: channelInterested,
        replyRate: percent(channelReplies, channelOutbound),
        interestRate: percent(channelInterested, channelOutbound),
      };
    }
  );
  const recentInterestedReplies = interestedReplies
    .sort((a, b) => getMessageTime(b.created_at) - getMessageTime(a.created_at))
    .slice(0, 12)
    .map((message) => {
      const lead =
        (message.lead_id !== null && message.lead_id !== undefined
          ? leadById.get(String(message.lead_id))
          : undefined) || leadBySlug.get(getText(message.slug));

      return {
        id: getText(message.id) || `${message.slug}-${message.created_at}`,
        slug: getLeadSlug(lead, getText(message.slug)),
        businessName: getLeadName(lead),
        city: getLeadCity(lead),
        trade: getLeadTrade(lead),
        snippet: getSnippet(message.body),
        receivedAt: getText(message.created_at),
      };
    });
  const kpis: ReportKpis = {
    leadsContactedToday: contactedTodayKeys.size,
    totalLeadsContacted: contactedLeadKeys.size,
    totalOutboundSms: outboundSms.length,
    totalOutboundEmails: outboundEmails.length,
    totalInboundReplies: inboundMessages.length,
    stopReplies: stopReplies.length,
    interestedReplies: interestedReplies.length,
    notInterestedReplies: notInterestedReplies.length,
    contactToReplyRate: percent(inboundMessages.length, contactedLeadKeys.size),
    contactToInterestRate: percent(
      interestedReplies.length,
      contactedLeadKeys.size
    ),
    stopRate: percent(stopReplies.length, outboundSms.length),
    clientsWon,
    openRate: percent(openedMessages.length, outboundMessages.length),
    previewClickRate: percent(clickedMessages.length, outboundMessages.length),
    totalOpens,
    totalPreviewClicks,
  };

  return {
    range,
    rangeLabel: getRangeLabel(range),
    startDate: start ? start.toISOString() : null,
    endDate: new Date().toISOString(),
    kpis,
    dailyActivity: [...dailyMap.values()].sort((a, b) =>
      a.date.localeCompare(b.date)
    ),
    channelPerformance,
    recentInterestedReplies,
  } satisfies CallBoostReport;
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}
