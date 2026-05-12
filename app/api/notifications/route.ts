import { NextResponse } from "next/server";
import { listNeedsFollowUp } from "../../lib/supabase/followUpQueue";
import { listUnreadReplyNotifications } from "../../lib/supabase/leadMessages";
import { getSupabaseAdmin } from "../../lib/supabase/server";

type PaidLeadNotificationRow = {
  id?: string | number | null;
  slug?: string | null;
  name?: string | null;
  status_updated_at?: string | null;
  last_activity_at?: string | null;
  data?: Record<string, unknown> | null;
};

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function listPaidLeadNotifications(limit = 20) {
  const { data, error } = await getSupabaseAdmin()
    .from("leads")
    .select("id, slug, name, status_updated_at, last_activity_at, data")
    .eq("status", "paid")
    .order("status_updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return ((data || []) as PaidLeadNotificationRow[]).map((lead) => {
    const slug = getString(lead.slug) || getString(lead.data?.slug);
    const businessName =
      getString(lead.name) ||
      getString(lead.data?.businessName) ||
      getString(lead.data?.name) ||
      slug ||
      "Unknown business";

    return {
      type: "payment" as const,
      id: `payment-${lead.id || slug}`,
      leadSlug: slug,
      businessName,
      body: `Payment received from ${businessName}`,
      createdAt:
        getString(lead.status_updated_at) || getString(lead.last_activity_at),
      label: "Payment received",
    };
  });
}

export async function GET() {
  try {
    const [replies, followUps, payments] = await Promise.all([
      listUnreadReplyNotifications(20),
      listNeedsFollowUp(),
      listPaidLeadNotifications(20),
    ]);
    const replyNotifications = replies.map((reply) => ({
      type: "reply" as const,
      id: `reply-${reply.id}`,
      leadSlug: reply.lead_slug,
      businessName: reply.business_name,
      leadStage: reply.lead_status,
      leadStatus: reply.lead_status,
      channel: reply.channel,
      body: reply.body,
      subject: reply.subject,
      createdAt: reply.created_at,
      label: "New reply",
    }));
    const followUpNotifications = followUps.map((followUp) => ({
      type: "follow_up" as const,
      id: `follow-up-${followUp.slug}-${followUp.nextFollowUpStage}`,
      leadSlug: followUp.slug,
      businessName: followUp.businessName,
      city: followUp.city,
      trade: followUp.trade,
      nextFollowUpStage: followUp.nextFollowUpStage,
      nextFollowUpLabel: followUp.nextFollowUpLabel,
      dueAt: followUp.dueAt,
      createdAt: followUp.dueAt,
      label: "Follow-up due",
    }));
    const notifications = [
      ...replyNotifications,
      ...payments,
      ...followUpNotifications,
    ].sort(
      (a, b) => {
        const aTime = new Date(a.createdAt || "").getTime();
        const bTime = new Date(b.createdAt || "").getTime();

        return (Number.isFinite(aTime) ? aTime : 0) -
          (Number.isFinite(bTime) ? bTime : 0);
      }
    );

    return NextResponse.json({
      ok: true,
      count: notifications.length,
      notifications,
    });
  } catch (error) {
    console.error("Failed to load notifications:", error);

    return NextResponse.json(
      {
        error: "Failed to load notifications",
        details: error instanceof Error ? error.message : "Unknown error",
        notifications: [],
      },
      { status: 500 }
    );
  }
}
