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
  created_at?: string | null;
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
  createdAt: string;
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
    createdAt: getString(row.created_at),
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
    })
    .select("*")
    .single();

  if (error) throw error;

  return rowToLeadMessage(data as LeadMessageRow);
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
