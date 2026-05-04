import { getSupabaseAdmin } from "./server";

export type LeadMessageChannel = "sms" | "email";
export type LeadMessageDirection = "inbound" | "outbound";
export type LeadMessageStatus = "draft" | "sent" | "failed" | "received";

export type LeadMessageRow = {
  id?: string;
  lead_id?: string | number | null;
  slug: string;
  channel: LeadMessageChannel | string;
  direction?: string | null;
  to_address?: string | null;
  from_address?: string | null;
  subject?: string | null;
  body: string;
  status?: LeadMessageStatus | string | null;
  provider?: string | null;
  provider_message_id?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  read_at?: string | null;
};

export type LeadMessage = {
  id?: string;
  leadId?: string | number | null;
  slug: string;
  channel: LeadMessageChannel;
  direction: LeadMessageDirection;
  toAddress: string;
  fromAddress: string;
  subject: string;
  body: string;
  status: LeadMessageStatus;
  provider: string;
  providerMessageId: string;
  error: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  readAt: string;
};

export type UnreadReplyNotification = {
  id: string;
  lead_id: string | number | null;
  lead_slug: string;
  business_name: string;
  lead_status: string;
  channel: LeadMessageChannel;
  body: string;
  subject: string;
  created_at: string;
};

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getChannel(value: unknown): LeadMessageChannel {
  return value === "email" ? "email" : "sms";
}

function getStatus(value: unknown): LeadMessageStatus {
  if (value === "draft" || value === "failed" || value === "received") {
    return value;
  }

  return "sent";
}

function getDirection(value: unknown): LeadMessageDirection {
  return value === "inbound" ? "inbound" : "outbound";
}

export function rowToLeadMessage(row: LeadMessageRow): LeadMessage {
  return {
    id: row.id,
    leadId: row.lead_id || null,
    slug: getString(row.slug),
    channel: getChannel(row.channel),
    direction: getDirection(row.direction),
    toAddress: getString(row.to_address),
    fromAddress: getString(row.from_address),
    subject: getString(row.subject),
    body: getString(row.body),
    status: getStatus(row.status),
    provider: getString(row.provider),
    providerMessageId: getString(row.provider_message_id),
    error: getString(row.error),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    createdAt: getString(row.created_at),
    readAt: getString(row.read_at),
  };
}

export async function insertLeadMessage(args: {
  leadId?: string | number | null;
  slug: string;
  channel: LeadMessageChannel;
  direction?: LeadMessageDirection;
  toAddress: string;
  fromAddress?: string | null;
  subject?: string | null;
  body: string;
  status: LeadMessageStatus;
  provider?: string | null;
  providerMessageId?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("lead_messages")
    .insert({
      lead_id: args.leadId || null,
      slug: args.slug,
      channel: args.channel,
      direction: args.direction || "outbound",
      to_address: args.toAddress,
      from_address: args.fromAddress || null,
      subject: args.subject || null,
      body: args.body,
      status: args.status,
      provider: args.provider || null,
      provider_message_id: args.providerMessageId || null,
      error: args.error || null,
      metadata: args.metadata || {},
    })
    .select("*")
    .single();

  if (error) throw error;

  return rowToLeadMessage(data as LeadMessageRow);
}

export async function paymentFailedRecoveryMessageExists(args: {
  leadId?: string | number | null;
  slug: string;
  stripeInvoiceId: string;
}) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("lead_messages")
    .select("id")
    .eq("direction", "outbound")
    .eq("metadata->>reason", "payment_failed_recovery")
    .eq("metadata->>stripe_invoice_id", args.stripeInvoiceId)
    .limit(1);

  if (args.leadId) {
    query = query.eq("lead_id", args.leadId);
  } else {
    query = query.eq("slug", args.slug);
  }

  const { data, error } = await query;

  if (error) throw error;

  return Boolean(data?.length);
}

export async function listLeadMessages(args: {
  leadId?: string | number | null;
  slug: string;
}) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("lead_messages")
    .select("*")
    .order("created_at", { ascending: false });

  if (args.leadId) {
    query = query.or(`lead_id.eq.${args.leadId},slug.eq.${args.slug}`);
  } else {
    query = query.eq("slug", args.slug);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map((row) => rowToLeadMessage(row as LeadMessageRow));
}

export async function listRecentOutboundSmsMessages(limit = 1000) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("lead_messages")
    .select("*")
    .eq("channel", "sms")
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data || []).map((row) => rowToLeadMessage(row as LeadMessageRow));
}

export async function listRecentOutboundEmailMessages(limit = 1000) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("lead_messages")
    .select("*")
    .eq("channel", "email")
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data || []).map((row) => rowToLeadMessage(row as LeadMessageRow));
}

type LeadLookupRow = {
  id?: string | number | null;
  slug?: string | null;
  name?: string | null;
  status?: string | null;
  data?: Record<string, unknown> | null;
};

function getLeadName(row?: LeadLookupRow | null) {
  if (!row) return "";

  return getString(row.name);
}

export async function listUnreadReplyNotifications(limit = 20) {
  const supabase = getSupabaseAdmin();
  const { data: messages, error } = await supabase
    .from("lead_messages")
    .select("id, lead_id, slug, channel, body, subject, created_at")
    .eq("direction", "inbound")
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const messageRows = (messages || []) as LeadMessageRow[];
  const leadIds = Array.from(
    new Set(
      messageRows
        .map((message) => message.lead_id)
        .filter((leadId): leadId is string | number => Boolean(leadId))
        .map((leadId) => String(leadId))
    )
  );
  const slugs = Array.from(
    new Set(messageRows.map((message) => getString(message.slug)).filter(Boolean))
  );
  const leadRows: LeadLookupRow[] = [];

  if (leadIds.length) {
    const { data, error: leadsError } = await supabase
      .from("leads")
      .select("id, slug, name, status, data")
      .in("id", leadIds);

    if (leadsError) throw leadsError;
    leadRows.push(...((data || []) as LeadLookupRow[]));
  }

  if (slugs.length) {
    const { data, error: leadsError } = await supabase
      .from("leads")
      .select("id, slug, name, status, data")
      .in("slug", slugs);

    if (leadsError) throw leadsError;
    leadRows.push(...((data || []) as LeadLookupRow[]));
  }

  const leadsById = new Map(
    leadRows
      .filter((lead) => lead.id !== null && lead.id !== undefined)
      .map((lead) => [String(lead.id), lead])
  );
  const leadsBySlug = new Map(
    leadRows.filter((lead) => lead.slug).map((lead) => [getString(lead.slug), lead])
  );

  return messageRows.map((message): UnreadReplyNotification => {
    const leadById =
      message.lead_id !== null && message.lead_id !== undefined
        ? leadsById.get(String(message.lead_id))
        : null;
    const lead = leadById || leadsBySlug.get(getString(message.slug)) || null;
    const leadSlug = getString(lead?.slug) || getString(message.slug);

    return {
      id: getString(message.id),
      lead_id: message.lead_id || lead?.id || null,
      lead_slug: leadSlug,
      business_name: getLeadName(lead) || leadSlug || "Unknown business",
      lead_status: getString(lead?.status) || "lead",
      channel: getChannel(message.channel),
      body: getString(message.body),
      subject: getString(message.subject),
      created_at: getString(message.created_at),
    };
  });
}

export async function markLeadInboundMessagesRead(args: {
  leadId?: string | number | null;
  slug: string;
}) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  let query = supabase
    .from("lead_messages")
    .update({ read_at: now })
    .eq("direction", "inbound")
    .is("read_at", null);

  if (args.leadId) {
    query = query.eq("lead_id", args.leadId);
  } else {
    query = query.eq("slug", args.slug);
  }

  const { data, error } = await query.select("id");

  if (error) throw error;

  return data?.length || 0;
}
