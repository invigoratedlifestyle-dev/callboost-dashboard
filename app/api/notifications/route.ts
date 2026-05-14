import { NextResponse } from "next/server";
import { listNeedsFollowUp } from "../../lib/supabase/followUpQueue";
import {
  listBouncedEmailNotifications,
  listUnreadReplyNotifications,
} from "../../lib/supabase/leadMessages";
import { enrichLeadsWithEngagement } from "../../lib/engagementPriority";
import { listLeads } from "../../lib/supabase/leads";
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

async function listEngagedLeadNotifications(limit = 20) {
  const leads = await enrichLeadsWithEngagement(await listLeads());

  return leads
    .filter((lead) => lead.engagement_state === "hot" || lead.engagement_state === "warm")
    .sort((a, b) => {
      if (a.engagement_state !== b.engagement_state) {
        return a.engagement_state === "hot" ? -1 : 1;
      }

      return (
        new Date(b.last_engaged_at || "").getTime() -
        new Date(a.last_engaged_at || "").getTime()
      );
    })
    .slice(0, limit)
    .map((lead) => {
      const slug = getString(lead.slug);
      const businessName =
        getString(lead.businessName) ||
        getString(lead.name) ||
        slug ||
        "Unknown business";
      const isHot = lead.engagement_state === "hot";

      return {
        type: isHot ? ("hot_lead_engaged" as const) : ("warm_lead_engaged" as const),
        id: `${isHot ? "hot" : "warm"}-lead-${lead.id || slug}`,
        leadSlug: slug,
        businessName,
        body: isHot
          ? `${businessName} viewed their preview. Send Follow-up 1.`
          : `${businessName} has repeat engagement. Send Follow-up 2.`,
        engagementState: lead.engagement_state,
        recommendedAction: lead.recommended_action,
        createdAt: lead.last_engaged_at,
        label: isHot ? "Hot lead" : "Warm lead",
      };
    });
}

export async function GET() {
  try {
    const [replies, bouncedEmails, engagedLeads, followUps, payments] = await Promise.all([
      listUnreadReplyNotifications(20),
      listBouncedEmailNotifications(20),
      listEngagedLeadNotifications(20),
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
    const bouncedEmailNotifications = bouncedEmails.map((bounce) => ({
      type: "email_bounce" as const,
      id: `email-bounce-${bounce.id || bounce.provider_message_id}`,
      leadSlug: bounce.lead_slug,
      businessName: bounce.business_name,
      bouncedEmail: bounce.bounced_email,
      mobileAvailable: bounce.mobile_available,
      providerMessageId: bounce.provider_message_id,
      body: `Email bounced for ${bounce.business_name}. ${
        bounce.mobile_available
          ? "Mobile follow-up available."
          : "Check contact details before following up."
      }`,
      reason: bounce.bounce_reason,
      createdAt: bounce.created_at,
      label: "Email bounced",
    }));
    const notifications = [
      ...engagedLeads,
      ...replyNotifications,
      ...bouncedEmailNotifications,
      ...payments,
      ...followUpNotifications,
    ].sort(
      (a, b) => {
        const priority = (notification: { type: string }) => {
          if (notification.type === "hot_lead_engaged") return 30;
          if (notification.type === "warm_lead_engaged") return 20;
          return 0;
        };
        const priorityDiff = priority(b) - priority(a);

        if (priorityDiff !== 0) return priorityDiff;

        const aTime = new Date(a.createdAt || "").getTime();
        const bTime = new Date(b.createdAt || "").getTime();

        return (Number.isFinite(bTime) ? bTime : 0) -
          (Number.isFinite(aTime) ? aTime : 0);
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
