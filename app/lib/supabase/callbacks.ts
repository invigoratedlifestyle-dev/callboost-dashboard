import { getSupabaseAdmin } from "./server";

export type CallbackRequestRow = {
  id?: string;
  lead_id?: string | number | null;
  source_slug: string;
  visitor_name: string;
  visitor_phone: string;
  visitor_message: string;
  forwarded?: boolean | null;
  forwarded_to?: string | null;
  created_at?: string | null;
};

export type CallbackRequest = {
  id?: string;
  leadId?: string | number | null;
  sourceSlug: string;
  visitorName: string;
  visitorPhone: string;
  visitorMessage: string;
  forwarded: boolean;
  forwardedTo: string;
  createdAt: string;
};

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function rowToCallback(row: CallbackRequestRow): CallbackRequest {
  return {
    id: row.id,
    leadId: row.lead_id || null,
    sourceSlug: getString(row.source_slug),
    visitorName: getString(row.visitor_name),
    visitorPhone: getString(row.visitor_phone),
    visitorMessage: getString(row.visitor_message),
    forwarded: Boolean(row.forwarded),
    forwardedTo: getString(row.forwarded_to),
    createdAt: getString(row.created_at),
  };
}

export async function insertCallbackRequest(args: {
  leadId?: string | number | null;
  sourceSlug: string;
  visitorName: string;
  visitorPhone: string;
  visitorMessage: string;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("callbacks")
    .insert({
      lead_id: args.leadId || null,
      source_slug: args.sourceSlug,
      visitor_name: args.visitorName,
      visitor_phone: args.visitorPhone,
      visitor_message: args.visitorMessage,
      forwarded: false,
      forwarded_to: null,
    })
    .select("*")
    .single();

  if (error) throw error;

  return rowToCallback(data as CallbackRequestRow);
}

export async function markCallbackForwarded(id: string, forwardedTo: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("callbacks")
    .update({
      forwarded: true,
      forwarded_to: forwardedTo,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;

  return rowToCallback(data as CallbackRequestRow);
}

export async function listCallbacksForLead(args: {
  leadId?: string | number | null;
  slug: string;
}) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("callbacks")
    .select("*")
    .order("created_at", { ascending: false });

  if (args.leadId) {
    query = query.or(`lead_id.eq.${args.leadId},source_slug.eq.${args.slug}`);
  } else {
    query = query.eq("source_slug", args.slug);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map((row) => rowToCallback(row as CallbackRequestRow));
}
