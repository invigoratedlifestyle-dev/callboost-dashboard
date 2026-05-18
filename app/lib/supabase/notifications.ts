import "server-only";
import { getSupabaseAdmin } from "./server";

type DismissNotificationArgs = {
  notificationKey: string;
  notificationType?: string | null;
  leadSlug?: string | null;
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isMissingTableError(error: { code?: string; message?: string }) {
  return (
    error.code === "42P01" ||
    /notification_dismissals|does not exist/i.test(error.message || "")
  );
}

function getDismissedKeysFromData(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];

  const values = (data as Record<string, unknown>).dismissedNotificationKeys;

  return Array.isArray(values) ? values.map(getString).filter(Boolean) : [];
}

async function listLeadDataDismissedNotificationKeys() {
  const { data, error } = await getSupabaseAdmin()
    .from("leads")
    .select("data");

  if (error) throw error;

  return new Set(
    (data || []).flatMap((row) => getDismissedKeysFromData(row.data))
  );
}

async function dismissNotificationInLeadData(args: DismissNotificationArgs) {
  const notificationKey = getString(args.notificationKey);
  const leadSlug = getString(args.leadSlug);

  if (!notificationKey || !leadSlug) return false;

  const supabase = getSupabaseAdmin();
  const { data: lead, error: selectError } = await supabase
    .from("leads")
    .select("id, data")
    .eq("slug", leadSlug)
    .limit(1)
    .maybeSingle();

  if (selectError) throw selectError;
  if (!lead?.id) return false;

  const leadData =
    lead.data && typeof lead.data === "object" && !Array.isArray(lead.data)
      ? (lead.data as Record<string, unknown>)
      : {};
  const dismissedNotificationKeys = Array.from(
    new Set([...getDismissedKeysFromData(leadData), notificationKey])
  );
  const { error: updateError } = await supabase
    .from("leads")
    .update({
      data: {
        ...leadData,
        dismissedNotificationKeys,
      },
    })
    .eq("id", lead.id);

  if (updateError) throw updateError;

  return true;
}

export async function listDismissedNotificationKeys() {
  const { data, error } = await getSupabaseAdmin()
    .from("notification_dismissals")
    .select("notification_key");

  if (error) {
    if (isMissingTableError(error)) {
      console.warn("notification_dismissals table is not available yet.");
      return listLeadDataDismissedNotificationKeys();
    }

    throw error;
  }

  const dismissedKeys = new Set(
    (data || [])
      .map((row) => getString(row.notification_key))
      .filter(Boolean)
  );
  const leadDataDismissedKeys = await listLeadDataDismissedNotificationKeys();

  for (const key of leadDataDismissedKeys) {
    dismissedKeys.add(key);
  }

  return dismissedKeys;
}

export async function dismissNotification(args: DismissNotificationArgs) {
  const notificationKey = getString(args.notificationKey);

  if (!notificationKey) return false;

  const { error } = await getSupabaseAdmin()
    .from("notification_dismissals")
    .upsert(
      {
        notification_key: notificationKey,
        notification_type: getString(args.notificationType) || null,
        lead_slug: getString(args.leadSlug) || null,
        dismissed_at: new Date().toISOString(),
      },
      { onConflict: "notification_key" }
    );

  if (error) {
    if (isMissingTableError(error)) {
      console.warn("notification_dismissals table is not available yet.");
      return dismissNotificationInLeadData(args);
    }

    throw error;
  }

  return true;
}
